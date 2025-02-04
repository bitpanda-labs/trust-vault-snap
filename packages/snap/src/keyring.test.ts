import { beforeEach, describe, expect, jest } from '@jest/globals';
import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';
import { EthAccountType, EthMethod } from '@metamask/keyring-api';
import { randomBytes } from 'crypto';
import { v4 as uuid, validate as validateUUID } from 'uuid';

import { TrustVaultKeyring } from './keyring';
import type {
  KeyringState,
  TrustApiConfiguration,
  TrustVaultRequest,
} from './types';
import { RequestStatus, SnapMode, TrustVaultRequestStatus } from './types';

jest.mock('./events');
const mockIsUsingRpcProxy = jest.fn();
const mockDisplayProxyDialog = jest.fn();
jest.mock('./snapApi', () => {
  return {
    getState: jest.fn(),
    saveState: jest.fn(),
    generateEntropy: jest.fn(),
    getMetamaskVersion: jest.fn(async () => '10.0.0'),
    isUsingRpcProxy: () => mockIsUsingRpcProxy(),
    displayProxyDialog: () => mockDisplayProxyDialog(),
  };
});
jest.mock('./cryptography', () => {
  return {
    generateEciesKeyPair: jest.fn(async () => {
      return {
        privateKey: randomBytes(32),
        publicKey: randomBytes(32).toString('hex'),
      };
    }),
    decryptData: jest.fn(async () => randomBytes(64)),
    createPersonalSignDataDigest: jest.fn(() => randomBytes(32)),
    createSignTypedDataDigest: jest.fn(() => randomBytes(32)),
    getAdjustedSignature: jest.fn(
      () =>
        '0xecd18717a895f58386cb13b9bd98e90ec753bffbec4e4d6ac28d25a256f28d17',
    ),
  };
});
const mockCreateEip1559Transaction = jest.fn();
const mockCreateLegacyTransaction = jest.fn();
const mockCreatePersonalSign = jest.fn();
const mockFetchTransactionInfo = jest.fn();
const mockGetRequest = jest.fn();
jest.mock('./graphql/client', () => {
  return {
    createEip1559Transaction: (...args: any) => {
      mockCreateEip1559Transaction.mockImplementation(async () => {
        return { requestId: 'requestId' };
      });
      return mockCreateEip1559Transaction(...args);
    },
    createLegacyTransaction: (...args: any) => {
      mockCreateLegacyTransaction.mockImplementation(async () => {
        return { requestId: 'requestId' };
      });
      return mockCreateLegacyTransaction(...args);
    },
    createPersonalSign: (...args: any) => {
      mockCreatePersonalSign.mockImplementation(async () => {
        return { requestId: 'requestId' };
      });
      return mockCreatePersonalSign(...args);
    },
    fetchTransactionInfo: (...args: any) => mockFetchTransactionInfo(...args),
    getRequest: (...args: any) => mockGetRequest(...args),
  };
});

describe('TrustVaultKeyring', () => {
  describe('listAccounts', () => {
    it('returns empty array when there are no accounts', async () => {
      const keyring = new TrustVaultKeyring(createState({}, {}));
      const retrievedAccounts = await keyring.listAccounts();
      expect(retrievedAccounts).toStrictEqual([]);
    });

    it('returns accounts array when there are multiple accounts', async () => {
      const account1 = createAccount('name1', 'address1');
      const account2 = createAccount('name2', 'address2');
      const accounts = { name1: account1, name2: account2 };
      const keyring = new TrustVaultKeyring(createState(accounts, {}));
      const retrievedAccounts = await keyring.listAccounts();
      const addresses = retrievedAccounts.map((account) => account.address);
      expect(addresses.sort()).toStrictEqual(['address1', 'address2']);
    });
  });

  describe('getAccount', () => {
    it('returns account if existent', async () => {
      const accounts = { name: createAccount('name', 'address') };
      const keyring = new TrustVaultKeyring(createState(accounts, {}));
      const account = await keyring.getAccount('name');
      expect(account.address).toBe('address');
    });

    it('throws an error if the account does not exist', async () => {
      const keyring = new TrustVaultKeyring(createState({}, {}));
      await expect(
        async () => await keyring.getAccount('unknown'),
      ).rejects.toThrow('Account unknown does not exist');
    });
  });

  describe('createAccount', () => {
    it.each([
      [{}, 'Provided account name must be a string'],
      [{ name: 1 }, 'Provided account name must be a string'],
      [{ name: 'name' }, 'Provided address must be a string'],
      [{ name: 'name', address: 1 }, 'Provided address must be a string'],
      [
        { name: 'name', address: 'address' },
        'Address address is not a valid EVM address',
      ],
    ])(
      'throws an error if the input is not valid',
      async (options, message) => {
        const keyring = new TrustVaultKeyring(createState({}, {}));
        await expect(
          async () => await keyring.createAccount(options),
        ).rejects.toThrow(message);
      },
    );

    it('throws an error if the address is already in use', async () => {
      const address = '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5';
      const accounts = { name: createAccount('name', address) };
      const keyring = new TrustVaultKeyring(createState(accounts, {}));
      const options = { name: 'name', address };
      await expect(
        async () => await keyring.createAccount(options),
      ).rejects.toThrow(`Address ${address} already in use`);
    });

    it('creates an account', async () => {
      const keyring = new TrustVaultKeyring(createState({}, {}));
      const address = '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5';
      const account = await keyring.createAccount({ name: 'name', address });
      expect(validateUUID(account.id)).toBe(true);
      expect(account.address).toBe(address);
      expect(await keyring.listAccounts()).toHaveLength(1);
    });
  });

  describe('deleteAccount', () => {
    it('deletes account if existent', async () => {
      const accounts = { name: createAccount('name', 'address') };
      const keyring = new TrustVaultKeyring(createState(accounts, {}));
      await keyring.deleteAccount('name');
      expect(await keyring.listAccounts()).toHaveLength(0);
    });

    it('throws an error if the account does not exist', async () => {
      const keyring = new TrustVaultKeyring(createState({}, {}));
      await expect(
        async () => await keyring.deleteAccount('unknown'),
      ).rejects.toThrow('Account unknown does not exist');
    });
  });

  describe('listRequests', () => {
    it('returns empty array when there are no requests', async () => {
      const keyring = new TrustVaultKeyring(createState({}, {}));
      const retrievedAccounts = await keyring.listRequests();
      expect(retrievedAccounts).toStrictEqual([]);
    });

    it('returns requests array when there are multiple requests', async () => {
      const request1 = createTrustVaultRequest(EthMethod.SignTransaction);
      const request2 = createTrustVaultRequest(EthMethod.SignTransaction);
      const requests: Record<string, TrustVaultRequest> = {};
      requests[request1.id] = request1;
      requests[request2.id] = request2;
      const keyring = new TrustVaultKeyring(createState({}, requests));
      const keyringRequests = await keyring.listRequests();
      expect(keyringRequests).toHaveLength(2);
    });
  });

  describe('getRequest', () => {
    it('returns request if existent', async () => {
      const request = createTrustVaultRequest(EthMethod.SignTransaction);
      const requests: Record<string, TrustVaultRequest> = {};
      requests[request.id] = request;
      const keyring = new TrustVaultKeyring(createState({}, requests));
      const keyringRequest = await keyring.getRequest(request.id);
      expect(keyringRequest).toBe(request);
    });

    it('throws an error if the request does not exist', async () => {
      const keyring = new TrustVaultKeyring(createState({}, {}));
      await expect(
        async () => await keyring.getRequest('unknown'),
      ).rejects.toThrow('Request unknown does not exist');
    });
  });

  describe('submitRequest', () => {
    beforeEach(() => {
      mockCreateEip1559Transaction.mockClear();
      mockCreateLegacyTransaction.mockClear();
    });

    it('throws an error if trust api configuration is not loaded', async () => {
      const state: KeyringState = {
        accounts: {},
        requests: {},
        rpcUrls: {},
        mode: SnapMode.Basic,
      };
      const keyring = new TrustVaultKeyring(state);
      const request = createRequest(EthMethod.SignTransaction);
      await expect(
        async () => await keyring.submitRequest(request),
      ).rejects.toThrow(
        'Cannot submit transaction requests without TrustApi configuration',
      );
    });

    it('throws an error if the evm method is not supported', async () => {
      const state = createState({}, {});
      const keyring = new TrustVaultKeyring(state);
      const request = createRequest(EthMethod.SignTypedDataV1);
      await expect(
        async () => await keyring.submitRequest(request),
      ).rejects.toThrow(
        `EVM method '${EthMethod.SignTypedDataV1}' not supported`,
      );
    });

    it('creates an eip1559 transaction request', async () => {
      const state = createState({}, {});
      const keyring = new TrustVaultKeyring(state);
      const params = [
        { type: '0x02', maxFeePerGas: '0x01', maxPriorityFeePerGas: '0x02' },
      ];
      const request = createRequest(EthMethod.SignTransaction, params);
      const response = await keyring.submitRequest(request);
      expect(response).toMatchObject({ pending: true });
      expect(mockCreateEip1559Transaction).toHaveBeenCalled();
      const createdRequest = state.requests[request.id];
      expect(createdRequest?.status).toBe(RequestStatus.Pending);
      expect(createdRequest?.trustVaultRequestId).toBe('requestId');
    });

    it('creates a legacy transaction request', async () => {
      const state = createState({}, {});
      const keyring = new TrustVaultKeyring(state);
      const params = [{ type: '0x0', gasLimit: '0x01', gasPrice: '0x02' }];
      const request = createRequest(EthMethod.SignTransaction, params);
      const response = await keyring.submitRequest(request);
      expect(response).toMatchObject({ pending: true });
      expect(mockCreateLegacyTransaction).toHaveBeenCalled();
      const createdRequest = state.requests[request.id];
      expect(createdRequest?.status).toBe(RequestStatus.Pending);
      expect(createdRequest?.trustVaultRequestId).toBe('requestId');
    });

    it('throws an error if enhanced mode is used without proxy', async () => {
      mockIsUsingRpcProxy.mockImplementation(async () => false);
      const state = createState({}, {}, SnapMode.Enhanced);
      const keyring = new TrustVaultKeyring(state);
      const params = [{ type: '0x0', gasLimit: '0x01', gasPrice: '0x02' }];
      const request = createRequest(EthMethod.SignTransaction, params);
      await expect(
        async () => await keyring.submitRequest(request),
      ).rejects.toThrow(
        'Snap is in enhanced mode but TrustVault proxy is not configured',
      );
      expect(mockDisplayProxyDialog).toHaveBeenCalled();
    });

    it('throws an error if enhanced mode is and rpc url is not found', async () => {
      mockIsUsingRpcProxy.mockImplementation(async () => true);
      const state = createState({}, {}, SnapMode.Enhanced);
      const keyring = new TrustVaultKeyring(state);
      const params = [
        { chainId: 'unknown', type: '0x0', gasLimit: '0x01', gasPrice: '0x02' },
      ];
      const request = createRequest(EthMethod.SignTransaction, params);
      await expect(
        async () => await keyring.submitRequest(request),
      ).rejects.toThrow('ChainId unknown does not correspond to an rpc url');
      expect(mockDisplayProxyDialog).toHaveBeenCalled();
    });

    it('uses the rpc url and submits tx if enhanced mode', async () => {
      mockIsUsingRpcProxy.mockImplementation(async () => true);
      const state = createState({}, {}, SnapMode.Enhanced);
      const keyring = new TrustVaultKeyring(state);
      await keyring.addRpcUrl({ chainId: 'chain', rpcUrl: 'http://rpc' });
      const params = [
        { chainId: 'chain', type: '0x0', gasLimit: '0x01', gasPrice: '0x02' },
      ];
      const request = createRequest(EthMethod.SignTransaction, params);
      const response = await keyring.submitRequest(request);
      expect(response).toMatchObject({ pending: true });
      expect(mockCreateLegacyTransaction.mock?.calls?.[0]?.[2]).toBe(true);
      expect(mockCreateLegacyTransaction.mock?.calls?.[0]?.[4]).toBe(
        'http://rpc',
      );
    });

    it('creates a personal sign request', async () => {
      const state = createState({}, {});
      const keyring = new TrustVaultKeyring(state);
      const params = ['message', '0x0c54FcCd2e384b4BB6f2E405Bf5Cbc15a017AaFb'];
      const request = createRequest(EthMethod.PersonalSign, params);
      const response = await keyring.submitRequest(request);
      expect(response).toMatchObject({ pending: true });
      expect(mockCreatePersonalSign).toHaveBeenCalled();
      const createdRequest = state.requests[request.id];
      expect(createdRequest?.status).toBe(RequestStatus.Pending);
      expect(createdRequest?.trustVaultRequestId).toBe('requestId');
    });

    it('throws an error for an unsupported transaction type', async () => {
      const state = createState({}, {});
      const keyring = new TrustVaultKeyring(state);
      const params = [{ type: '0x01' }];
      const request = createRequest(EthMethod.SignTransaction, params);
      await expect(
        async () => await keyring.submitRequest(request),
      ).rejects.toThrow('Transaction type 0x01 is not supported');
    });
  });

  describe('checkPendingRequests', () => {
    beforeEach(() => {
      mockFetchTransactionInfo.mockClear();
      mockGetRequest.mockClear();
      mockIsUsingRpcProxy.mockClear();
      mockDisplayProxyDialog.mockClear();
    });

    const pendingTransactionInfoResponse = {
      signedTransaction: null,
      status: TrustVaultRequestStatus.Pending,
    };
    const cancelledTransactionInfoResponse = {
      signedTransaction: null,
      status: TrustVaultRequestStatus.Cancelled,
    };
    const signedTransactionInfoResponse = {
      signedTransaction: {
        transactionDigest: '0x12345',
        transaction: {
          r: '1',
          s: '2',
          v: '3',
        },
      },
      status: TrustVaultRequestStatus.Signed,
    };
    const signedGetRequestResponse = {
      signatures: {
        raw: '0xecd18717a895f58386cb13b9bd98e90ec753bffbec4e4d6ac28d25a256f28d17',
      },
      status: TrustVaultRequestStatus.Signed,
    };

    it('will not check already signed requests', async () => {
      const requests: Record<string, TrustVaultRequest> = {};
      const request = createTrustVaultRequest(EthMethod.SignTransaction);
      request.status = RequestStatus.Signed;
      requests[request.id] = request;
      const state = createState({}, requests);
      const keyring = new TrustVaultKeyring(state);
      await keyring.checkPendingRequests();
      expect(mockFetchTransactionInfo).toHaveBeenCalledTimes(0);
    });

    it('will not check requests if enhanced mode is on by not using proxy', async () => {
      mockIsUsingRpcProxy.mockImplementation(async () => false);
      const requests: Record<string, TrustVaultRequest> = {};
      const request = createTrustVaultRequest(EthMethod.SignTransaction);
      requests[request.id] = request;
      const state = createState({}, requests, SnapMode.Enhanced);
      const keyring = new TrustVaultKeyring(state);
      await keyring.checkPendingRequests();
      expect(mockFetchTransactionInfo).toHaveBeenCalledTimes(0);
      expect(mockDisplayProxyDialog).toHaveBeenCalled();
    });

    it('will check multiple pending requests', async () => {
      mockFetchTransactionInfo.mockImplementation(
        async () => pendingTransactionInfoResponse,
      );
      const requests: Record<string, TrustVaultRequest> = {};
      const request1 = createTrustVaultRequest(EthMethod.SignTransaction);
      const request2 = createTrustVaultRequest(EthMethod.SignTransaction);
      requests[request1.id] = request1;
      requests[request2.id] = request2;
      const state = createState({}, requests);
      const keyring = new TrustVaultKeyring(state);
      await keyring.checkPendingRequests();
      expect(mockFetchTransactionInfo).toHaveBeenCalledTimes(2);
      expect((await keyring.getRequest(request1.id)).status).toBe(
        RequestStatus.Pending,
      );
      expect((await keyring.getRequest(request2.id)).status).toBe(
        RequestStatus.Pending,
      );
    });

    it('will check and approve a signed request', async () => {
      mockFetchTransactionInfo.mockImplementation(
        async () => signedTransactionInfoResponse,
      );
      const requests: Record<string, TrustVaultRequest> = {};
      const request = createTrustVaultRequest(EthMethod.SignTransaction);
      requests[request.id] = request;
      const state = createState({}, requests);
      const keyring = new TrustVaultKeyring(state);
      await keyring.checkPendingRequests();
      expect(mockFetchTransactionInfo).toHaveBeenCalledTimes(1);
      expect((await keyring.getRequest(request.id)).status).toBe(
        RequestStatus.Signed,
      );
    });

    it('will reject a cancelled request', async () => {
      mockFetchTransactionInfo.mockImplementation(
        async () => cancelledTransactionInfoResponse,
      );
      const requests: Record<string, TrustVaultRequest> = {};
      const request = createTrustVaultRequest(EthMethod.SignTransaction);
      requests[request.id] = request;
      const state = createState({}, requests);
      const keyring = new TrustVaultKeyring(state);
      await keyring.checkPendingRequests();
      expect(mockFetchTransactionInfo).toHaveBeenCalledTimes(1);
      expect((await keyring.getRequest(request.id)).status).toBe(
        RequestStatus.Rejected,
      );
    });

    it('will check and approve a signed personal sign request', async () => {
      mockGetRequest.mockImplementation(async () => signedGetRequestResponse);
      const requests: Record<string, TrustVaultRequest> = {};
      const params = ['message', 'address'];
      const request = createTrustVaultRequest(EthMethod.PersonalSign, params);
      requests[request.id] = request;
      const state = createState({}, requests);
      const keyring = new TrustVaultKeyring(state);
      await keyring.checkPendingRequests();
      expect(mockGetRequest).toHaveBeenCalledTimes(1);
      expect((await keyring.getRequest(request.id)).status).toBe(
        RequestStatus.Signed,
      );
    });

    it('will check and approve a signed signTypedData request', async () => {
      mockGetRequest.mockImplementation(async () => signedGetRequestResponse);
      const requests: Record<string, TrustVaultRequest> = {};
      const params = ['address', { key: 'value' }];
      const request = createTrustVaultRequest(
        EthMethod.SignTypedDataV4,
        params,
      );
      requests[request.id] = request;
      const state = createState({}, requests);
      const keyring = new TrustVaultKeyring(state);
      await keyring.checkPendingRequests();
      expect(mockGetRequest).toHaveBeenCalledTimes(1);
      expect((await keyring.getRequest(request.id)).status).toBe(
        RequestStatus.Signed,
      );
    });

    it('will skip the request in case of error', async () => {
      mockFetchTransactionInfo.mockImplementation(async () => {
        throw new Error('network error');
      });
      const requests: Record<string, TrustVaultRequest> = {};
      const request = createTrustVaultRequest(EthMethod.SignTransaction);
      requests[request.id] = request;
      const state = createState({}, requests);
      const keyring = new TrustVaultKeyring(state);
      await keyring.checkPendingRequests();
      expect((await keyring.getRequest(request.id)).status).toBe(
        RequestStatus.Pending,
      );
    });
  });

  describe('addTrustApiConfiguration', () => {
    it('saves the TrustApiConfiguration to the state', async () => {
      const state: KeyringState = {
        accounts: {},
        requests: {},
        rpcUrls: {},
        mode: SnapMode.Basic,
      };
      const keyring = new TrustVaultKeyring(state);
      const config = createState({}, {}).trustApiConfiguration;
      await keyring.addTrustApiConfiguration(config as TrustApiConfiguration);
      expect(state.trustApiConfiguration).toBe(config);
    });
  });
});

/**
 * Creates a mock KeyringAccount.
 *
 * @param name - The account name.
 * @param address - The account address.
 * @returns The mock account.
 */
function createAccount(name: string, address: string): KeyringAccount {
  return {
    id: uuid(),
    options: { name, address },
    address,
    methods: [
      EthMethod.PersonalSign,
      EthMethod.Sign,
      EthMethod.SignTransaction,
      EthMethod.SignTypedDataV1,
      EthMethod.SignTypedDataV3,
      EthMethod.SignTypedDataV4,
    ],
    type: EthAccountType.Eoa,
  };
}

/**
 * Creates a mock TrustVaultKeyringRequest.
 *
 * @param method - The EVM method.
 * @param params - The EVM params.
 * @returns The mock request.
 */
function createTrustVaultRequest(
  method: EthMethod,
  params?: any,
): TrustVaultRequest {
  return {
    ...createRequest(method, params),
    trustVaultRequestId: 'requestId',
    status: RequestStatus.Pending,
  };
}

/**
 * Creates a mock KeyringRequest.
 *
 * @param method - The EVM method.
 * @param params - The EVM params.
 * @returns The mock request.
 */
function createRequest(method: EthMethod, params?: any): KeyringRequest {
  return {
    id: uuid(),
    scope: 'scope',
    account: 'account',
    request: {
      method,
      params: params || [],
    },
  };
}

/**
 * Creates a mock KeyringState.
 *
 * @param accounts - The mock accounts.
 * @param requests - The mock requests.
 * @param mode - The mock snap mode.
 * @returns The mock KeyringState.
 */
function createState(
  accounts: Record<string, KeyringAccount>,
  requests: Record<string, TrustVaultRequest>,
  mode: SnapMode = SnapMode.Basic,
): KeyringState {
  return {
    accounts,
    requests,
    trustApiConfiguration: {
      url: 'url',
      apiKey: 'apiKey',
      trustId: 'trustId',
      token: {
        enc: 'enc',
        iv: 'iv',
        tag: 'tag',
      },
    },
    rpcUrls: {},
    mode,
  };
}
