import type { MessageTypes, TypedMessage } from '@metamask/eth-sig-util';
import { SignTypedDataVersion } from '@metamask/eth-sig-util';
import type {
  Keyring,
  KeyringAccount,
  KeyringRequest,
  SubmitRequestResponse,
} from '@metamask/keyring-api';
import { EthAccountType, EthMethod, EthScope } from '@metamask/keyring-api';
import { add0x, isValidHexAddress, type Json } from '@metamask/utils';
import type { Buffer } from 'buffer';
import { v4 as uuid } from 'uuid';

import {
  createPersonalSignDataDigest,
  createSignTypedDataDigest,
  decryptData,
  getAdjustedSignature,
  wrapKeyPairOperation,
} from './cryptography';
import {
  accountCreated,
  accountDeleted,
  requestApproved,
  requestRejected,
} from './events';
import {
  createEip1559Transaction,
  createLegacyTransaction,
  createPersonalSign,
  createSignTypedData,
  fetchTransactionInfo,
  getRequest,
} from './graphql/client';
import {
  displayProxyDialog,
  getMetamaskVersion,
  isUsingRpcProxy,
  saveState,
  snapVersion,
} from './snapApi';
import type {
  AddRpcUrlInput,
  Credentials,
  EciesKeyPair,
  EvmTransaction,
  GetRequestResponse,
  KeyringState,
  RequestConfiguration,
  TransactionInfoResponse,
  TrustApiConfiguration,
  TrustApiToken,
  TrustVaultRequest,
} from './types';
import { RequestStatus, SnapMode, TrustVaultRequestStatus } from './types';
import { throwError } from './util';

export class TrustVaultKeyring implements Keyring {
  readonly #state: KeyringState;

  constructor(state: KeyringState) {
    this.#state = state;
  }

  async listAccounts(): Promise<KeyringAccount[]> {
    return Object.values(this.#state.accounts);
  }

  async getAccount(id: string): Promise<KeyringAccount> {
    return (
      this.#state.accounts[id] ?? throwError(`Account ${id} does not exist`)
    );
  }

  async createAccount(
    options: Record<string, Json> = {},
  ): Promise<KeyringAccount> {
    const { address, name, trustId, token } = options;
    if (typeof name !== 'string') {
      throw new Error('Provided account name must be a string');
    }
    if (typeof address !== 'string') {
      throw new Error('Provided address must be a string');
    }
    if (!isValidHexAddress(add0x(address))) {
      throw new Error(`Address ${address} is not a valid EVM address`);
    }
    if (this.#addressesInUse().includes(address)) {
      throw new Error(`Address ${address} already in use`);
    }
    if (typeof trustId !== 'string') {
      throw new Error(`Provided Trust ID ${trustId} is not a string`);
    }

    this.mapTrustIdToToken(trustId, token as TrustApiToken);

    try {
      const account: KeyringAccount = {
        id: uuid(),
        options,
        scopes: [EthScope.Eoa],
        address,
        methods: [
          EthMethod.PersonalSign,
          EthMethod.SignTransaction,
          EthMethod.SignTypedDataV3,
          EthMethod.SignTypedDataV4,
        ],
        type: EthAccountType.Eoa,
      };
      const data = {
        account,
        accountNameSuggestion: name,
      };
      await accountCreated(data);
      this.#state.accounts[account.id] = account;
      await this.#saveState();
      return account;
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }

  async filterAccountChains(_id: string, chains: string[]): Promise<string[]> {
    return chains.filter((chain: string) => chain.startsWith('eip155:'));
  }

  async updateAccount(_account: KeyringAccount): Promise<void> {
    throw new Error('not implemented');
  }

  async deleteAccount(id: string): Promise<void> {
    if (!this.#state.accounts[id]) {
      throw new Error(`Account ${id} does not exist`);
    }
    try {
      await accountDeleted({ id });
      delete this.#state.accounts[id];
      await this.#saveState();
    } catch (error) {
      throwError((error as Error).message);
    }
  }

  async listRequests(): Promise<TrustVaultRequest[]> {
    return Object.values(this.#state.requests);
  }

  async getRequest(id: string): Promise<TrustVaultRequest> {
    return (
      this.#state.requests[id] ?? throwError(`Request ${id} does not exist`)
    );
  }

  async submitRequest(request: KeyringRequest): Promise<SubmitRequestResponse> {
    if (!this.#state.trustApiConfiguration) {
      throw new Error(
        'Cannot submit transaction requests without TrustApi configuration',
      );
    }
    const { method, params = [] } = request.request;
    const trustVaultId = await this.#handleSigningRequest(
      request.id,
      method,
      params,
    );
    const trustVaultRequest = {
      ...request,
      trustVaultRequestId: trustVaultId,
      status: RequestStatus.Pending,
    };
    await this.#addRequest(trustVaultRequest);
    return { pending: true };
  }

  async checkPendingRequests(): Promise<void> {
    if (!(await this.checkProxyUsage())) {
      console.warn(
        'Snap is in enhanced mode but TrustVault proxy is not configured',
      );
      return;
    }
    const requests = await this.listRequests();
    const pending = requests.filter(
      (request) => request.status === RequestStatus.Pending,
    );
    await Promise.all(
      pending.map(async (request) => this.approveRequest(request.id)),
    );
  }

  async approveRequest(id: string): Promise<void> {
    const request = await this.getRequest(id);
    try {
      await this.#checkAndFinaliseRequest(request);
    } catch (error) {
      const message = `Failed to retrieve transaction info for ${request.trustVaultRequestId}`;
      console.error(`${message}, error: ${(error as Error).message}`);
    }
  }

  async #checkAndFinaliseRequest(request: TrustVaultRequest): Promise<void> {
    if (!this.#state.trustApiConfiguration) {
      return;
    }
    switch (request.request.method) {
      case EthMethod.SignTransaction:
        await this.#checkAndFinaliseTransaction(request);
        break;
      case EthMethod.PersonalSign:
        await this.#checkAndFinalisePersonalSign(request);
        break;
      case EthMethod.SignTypedDataV3:
        await this.#checkAndFinaliseSignTypedData(
          request,
          SignTypedDataVersion.V3,
        );
        break;
      case EthMethod.SignTypedDataV4:
        await this.#checkAndFinaliseSignTypedData(
          request,
          SignTypedDataVersion.V4,
        );
        break;
      default:
        throw new Error(`EVM method '${request.request.method}' not supported`);
    }
  }

  async #checkAndFinaliseTransaction(
    request: TrustVaultRequest,
  ): Promise<void> {
    const transactionInfo = await this.#getTransactionInfo(request);

    if (this.#isFailedStatus(transactionInfo.status)) {
      await this.#updateRequestStatus(request.id, RequestStatus.Rejected);
      await requestRejected({ id: request.id });
      return;
    }
    if (!this.#isFinalStatus(transactionInfo.status)) {
      return;
    }

    const { v, r, s } = transactionInfo.signedTransaction.transaction;
    const result = {
      v: add0x(v),
      r: add0x(r),
      s: add0x(s),
    };
    await this.#updateRequestStatus(request.id, RequestStatus.Signed);
    await requestApproved({ id: request.id, result });
  }

  async #checkAndFinalisePersonalSign(
    request: TrustVaultRequest,
  ): Promise<void> {
    const requestInfo = await this.#getRequest(request);
    if (!this.#isFinalStatus(requestInfo.status)) {
      return;
    }
    const signature = await this.#getPersonalSignature(
      request,
      requestInfo.signatures.raw,
    );
    await this.#updateRequestStatus(request.id, RequestStatus.Signed);
    await requestApproved({ id: request.id, result: signature });
  }

  async #checkAndFinaliseSignTypedData(
    request: TrustVaultRequest,
    version: SignTypedDataVersion.V3 | SignTypedDataVersion.V4,
  ): Promise<void> {
    const requestInfo = await this.#getRequest(request);
    if (!this.#isFinalStatus(requestInfo.status)) {
      return;
    }
    const signature = await this.#getSignTypedDataSignature(
      request,
      requestInfo.signatures.raw,
      version,
    );
    await this.#updateRequestStatus(request.id, RequestStatus.Signed);
    await requestApproved({ id: request.id, result: signature });
  }

  #isFinalStatus(status: TrustVaultRequestStatus): boolean {
    return (
      status === TrustVaultRequestStatus.Signed ||
      status === TrustVaultRequestStatus.Submitted
    );
  }

  #isFailedStatus(status: TrustVaultRequestStatus): boolean {
    return (
      status === TrustVaultRequestStatus.Blocked ||
      status === TrustVaultRequestStatus.Cancelled ||
      status === TrustVaultRequestStatus.Errored
    );
  }

  async #getTransactionInfo(
    request: TrustVaultRequest,
  ): Promise<TransactionInfoResponse> {
    if (!this.#state.trustApiConfiguration) {
      throw new Error('Missing trust api configuration');
    }

    const accountId = request.account;

    return await fetchTransactionInfo(
      await this.#getRequestConfiguration(),
      this.#resolveCredentials(this.#getAccountFromId(accountId)),
      request.trustVaultRequestId,
    );
  }

  async #getRequest(request: TrustVaultRequest): Promise<GetRequestResponse> {
    if (!this.#state.trustApiConfiguration) {
      throw new Error('Missing trust api configuration');
    }

    const accountId = request.account;

    return getRequest(
      await this.#getRequestConfiguration(),
      this.#resolveCredentials(this.#getAccountFromId(accountId)),
      request.trustVaultRequestId,
    );
  }

  async #getPersonalSignature(
    request: TrustVaultRequest,
    encryptedSignature: string,
  ): Promise<string> {
    const decrypted = await this.#decryptSignature(
      request.id,
      encryptedSignature,
    );
    const [message, address] = request.request.params as [string, string];
    const digest = createPersonalSignDataDigest(message);

    return getAdjustedSignature(digest, decrypted, address);
  }

  async #getSignTypedDataSignature(
    request: TrustVaultRequest,
    encryptedSignature: string,
    version: SignTypedDataVersion.V3 | SignTypedDataVersion.V4,
  ): Promise<string> {
    const decrypted = await this.#decryptSignature(
      request.id,
      encryptedSignature,
    );
    const [address, message] = request.request.params as [
      string,
      TypedMessage<MessageTypes>,
    ];
    const digest = createSignTypedDataDigest(message, version);

    return getAdjustedSignature(digest, decrypted, address);
  }

  async #decryptSignature(
    requestId: string,
    signature: string,
  ): Promise<Buffer> {
    const callback = async (keyPair: EciesKeyPair): Promise<Buffer> => {
      return await decryptData(keyPair.privateKey, signature);
    };

    return wrapKeyPairOperation(requestId, callback);
  }

  async rejectRequest(_id: string): Promise<void> {
    throw new Error('not implemented');
  }

  async addTrustApiConfiguration(config: TrustApiConfiguration): Promise<void> {
    this.#state.trustApiConfiguration = config;
    await this.#saveState();
  }

  getSnapMode(): SnapMode {
    return this.#state.mode;
  }

  async updateSnapMode(mode: SnapMode): Promise<void> {
    this.#state.mode = mode;
    await this.#saveState();
  }

  async #handleSigningRequest(
    requestId: string,
    method: string,
    params: Json,
  ): Promise<string> {
    switch (method) {
      case EthMethod.SignTransaction: {
        const [transaction] = params as [EvmTransaction];
        return this.#signTransaction(transaction);
      }
      case EthMethod.PersonalSign: {
        const [message, address] = params as [string, string];
        return this.#signPersonalSign(requestId, address, message);
      }
      case EthMethod.SignTypedDataV3: {
        const [address, message] = params as [string, Json];
        return this.#signTypedData(
          requestId,
          address,
          message,
          SignTypedDataVersion.V3,
        );
      }
      case EthMethod.SignTypedDataV4: {
        const [address, message] = params as [string, Json];
        return this.#signTypedData(
          requestId,
          address,
          message,
          SignTypedDataVersion.V4,
        );
      }
      default: {
        throw new Error(`EVM method '${method}' not supported`);
      }
    }
  }

  async #signTransaction(transaction: EvmTransaction): Promise<string> {
    if (!(await this.checkProxyUsage())) {
      await displayProxyDialog();
      throw new Error(
        'Snap is in enhanced mode but TrustVault proxy is not configured',
      );
    }
    const type = parseInt(transaction.type, 16);
    const rpcUrl = this.#getRpcUrl(transaction.chainId);
    switch (type) {
      case 0:
        return this.#signLegacyTransaction(transaction, rpcUrl);
      case 2:
        return this.#signEip1559Transaction(transaction, rpcUrl);
      default:
        throw new Error(
          `Transaction type ${transaction.type} is not supported`,
        );
    }
  }

  async #signEip1559Transaction(
    transaction: EvmTransaction,
    rpcUrl?: string,
  ): Promise<string> {
    const response = await createEip1559Transaction(
      await this.#getRequestConfiguration(),
      this.#resolveCredentials(this.#getAccountFromAddress(transaction.from)),
      transaction,
      this.#state.mode === SnapMode.Enhanced,
      rpcUrl,
    );

    return response.requestId;
  }

  async #signLegacyTransaction(
    transaction: EvmTransaction,
    rpcUrl?: string,
  ): Promise<string> {
    const response = await createLegacyTransaction(
      await this.#getRequestConfiguration(),
      this.#resolveCredentials(this.#getAccountFromAddress(transaction.from)),
      transaction,
      this.#state.mode === SnapMode.Enhanced,
      rpcUrl,
    );

    return response.requestId;
  }

  async #signPersonalSign(
    requestId: string,
    address: string,
    message: string,
  ): Promise<string> {
    const callback = async (keyPair: EciesKeyPair): Promise<string> =>
      keyPair.publicKey;
    const publicKey = await wrapKeyPairOperation(requestId, callback);
    const response = await createPersonalSign(
      await this.#getRequestConfiguration(),
      this.#resolveCredentials(this.#getAccountFromAddress(address)),
      address,
      message,
      publicKey,
    );

    return response.requestId;
  }

  async #signTypedData(
    requestId: string,
    address: string,
    message: Json,
    version: SignTypedDataVersion.V3 | SignTypedDataVersion.V4,
  ): Promise<string> {
    const callback = async (keyPair: EciesKeyPair): Promise<string> =>
      keyPair.publicKey;
    const publicKey = await wrapKeyPairOperation(requestId, callback);
    const response = await createSignTypedData(
      await this.#getRequestConfiguration(),
      this.#resolveCredentials(this.#getAccountFromAddress(address)),
      address,
      message,
      version,
      publicKey,
    );

    return response.requestId;
  }

  async #updateRequestStatus(id: string, status: RequestStatus): Promise<void> {
    const request = await this.getRequest(id);
    this.#state.requests[request.id] = { ...request, status };
    await this.#saveState();
  }

  async #addRequest(request: TrustVaultRequest): Promise<void> {
    this.#state.requests[request.id] = request;
    await this.#saveState();
  }

  #addressesInUse(): string[] {
    return Object.values(this.#state.accounts).map(
      (account) => account.address,
    );
  }

  async #getRequestConfiguration(): Promise<RequestConfiguration> {
    const metamaskVersion = await getMetamaskVersion();
    const { mode } = this.#state;
    const clientInfo = `mm:${metamaskVersion}/snap:${snapVersion}/mode:${mode}`;

    return {
      trustApiConfiguration: this.#state
        .trustApiConfiguration as TrustApiConfiguration,
      clientInfo,
    };
  }

  async checkProxyUsage(): Promise<boolean> {
    if (this.#state.mode !== SnapMode.Enhanced) {
      return true;
    }
    const isUsingProxy = await isUsingRpcProxy();

    return isUsingProxy;
  }

  async addRpcUrl(input: AddRpcUrlInput): Promise<void> {
    this.#state.rpcUrls[input.chainId] = input.rpcUrl;
    await this.#saveState();
  }

  #getRpcUrl(chainId: string): string | undefined {
    if (this.#state.mode !== SnapMode.Enhanced) {
      return undefined;
    }
    if (!(chainId in this.#state.rpcUrls)) {
      throw new Error(`ChainId ${chainId} does not correspond to an rpc url`);
    }

    return this.#state.rpcUrls[chainId];
  }

  async mapTrustIdToToken(trustId: string, token: TrustApiToken) {
    this.#state.trustIdToToken[trustId] = token;
    await this.#saveState();
  }

  #getAccountFromId(id: string): KeyringAccount {
    const account = this.#state.accounts[id];
    if (!account) {
      throw new Error(`Account with id ${id} not found`);
    }

    return account;
  }

  #getAccountFromAddress(address: string): KeyringAccount {
    const lowercaseAddress = this.lowercaseHexAddress(address);
    const account = Object.values(this.#state.accounts).find(
      (acc) => this.lowercaseHexAddress(acc.address) === lowercaseAddress,
    );
    if (!account) {
      throw new Error(`Account with address ${lowercaseAddress} not found`);
    }

    return account;
  }

  /**
   * Gets the JWT for the address
   * @param address
   */
  #resolveCredentials(account: KeyringAccount): Credentials {
    const trustId = account.options.trustId;
    if (!trustId) {
      throw new Error(
        `Trust ID not found ${trustId}, provided address: ${account.address} and address in state: ${this.#state.accounts[0]?.address}`,
      );
    }
    if (typeof trustId !== 'string') {
      throw new Error(`Trust ID: ${trustId} is not a string`);
    }

    const token = this.#state.trustIdToToken[trustId];
    if (!token) {
      throw new Error(`Token not found for trustId: ${trustId}`);
    }

    return { trustId, token };
  }

  lowercaseHexAddress(address: string): string {
    return add0x(address).toLowerCase();
  }

  async #saveState(): Promise<void> {
    await saveState(this.#state);
  }
}
