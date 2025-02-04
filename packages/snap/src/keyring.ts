import type { MessageTypes, TypedMessage } from '@metamask/eth-sig-util';
import { SignTypedDataVersion } from '@metamask/eth-sig-util';
import type {
  Keyring,
  KeyringAccount,
  KeyringRequest,
  SubmitRequestResponse,
} from '@metamask/keyring-api';
import { EthAccountType, EthMethod } from '@metamask/keyring-api';
import { add0x, isValidHexAddress, type Json } from '@metamask/utils';
import type { Buffer } from 'buffer';
import { v4 as uuid } from 'uuid';

import {
  createPersonalSignDataDigest,
  createSignTypedDataDigest,
  decryptData,
  generateEciesKeyPair,
  getAdjustedSignature,
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
  generateEntropy,
  getMetamaskVersion,
  isUsingRpcProxy,
  saveState,
  snapVersion,
} from './snapApi';
import type {
  AddRpcUrlInput,
  EvmTransaction,
  GetRequestResponse,
  KeyringState,
  RequestConfiguration,
  TransactionInfoResponse,
  TrustApiConfiguration,
  TrustVaultRequest,
} from './types';
import { RequestStatus, SnapMode, TrustVaultRequestStatus } from './types';
import { throwError } from './util';

export class TrustVaultKeyring implements Keyring {
  #state: KeyringState;

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
    const { address, name } = options;
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

    try {
      const account: KeyringAccount = {
        id: uuid(),
        options,
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
      console.log(
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
      console.log(`${message}, error: ${(error as Error).message}`);
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

  async #checkAndFinaliseTransaction(request: TrustVaultRequest) {
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

  async #checkAndFinalisePersonalSign(request: TrustVaultRequest) {
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
  ) {
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
    return await fetchTransactionInfo(
      await this.#getRequestConfiguration(),
      request.trustVaultRequestId,
      async (config: TrustApiConfiguration) =>
        await this.addTrustApiConfiguration(config),
    );
  }

  async #getRequest(request: TrustVaultRequest): Promise<GetRequestResponse> {
    return getRequest(
      await this.#getRequestConfiguration(),
      request.trustVaultRequestId,
      async (config: TrustApiConfiguration) =>
        await this.addTrustApiConfiguration(config),
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
    const entropy = await generateEntropy(requestId);
    const { privateKey } = await generateEciesKeyPair(entropy);
    return await decryptData(privateKey, signature);
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
      transaction,
      this.#state.mode === SnapMode.Enhanced,
      async (config: TrustApiConfiguration) =>
        await this.addTrustApiConfiguration(config),
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
      transaction,
      this.#state.mode === SnapMode.Enhanced,
      async (config: TrustApiConfiguration) =>
        await this.addTrustApiConfiguration(config),
      rpcUrl,
    );
    return response.requestId;
  }

  async #signPersonalSign(requestId: string, address: string, message: string) {
    const entropy = await generateEntropy(requestId);
    const { publicKey } = await generateEciesKeyPair(entropy);
    const response = await createPersonalSign(
      await this.#getRequestConfiguration(),
      address,
      message,
      publicKey,
      async (config: TrustApiConfiguration) =>
        await this.addTrustApiConfiguration(config),
    );
    return response.requestId;
  }

  async #signTypedData(
    requestId: string,
    address: string,
    message: Json,
    version: SignTypedDataVersion.V3 | SignTypedDataVersion.V4,
  ) {
    const entropy = await generateEntropy(requestId);
    const { publicKey } = await generateEciesKeyPair(entropy);
    const response = await createSignTypedData(
      await this.#getRequestConfiguration(),
      address,
      message,
      version,
      publicKey,
      async (config: TrustApiConfiguration) =>
        await this.addTrustApiConfiguration(config),
    );
    return response.requestId;
  }

  async #updateRequestStatus(id: string, status: RequestStatus) {
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
    if (!isUsingProxy) {
      await displayProxyDialog();
    }
    return isUsingProxy;
  }

  async addRpcUrl(input: AddRpcUrlInput) {
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

  async #saveState(): Promise<void> {
    await saveState(this.#state);
  }
}
