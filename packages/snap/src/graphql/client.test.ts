import { beforeEach, describe, expect, jest } from '@jest/globals';
import { mockValues } from '../testHelpers';
import type { TrustApiToken } from '../types';
import { TrustVaultRequestStatus } from '../types';
import {
  createEip1559Transaction,
  createLegacyTransaction,
  createPersonalSign,
  createSignTypedData,
  fetchTransactionInfo,
  getRequest,
  graphQLRequest,
} from './client';

const apiConfig = {
  url: 'url',
  apiKey: 'apiKey',
  trustId: 'trustId',
  token: {
    enc: 'enc',
    iv: 'iv',
    tag: 'tag',
  },
};
const config = {
  trustApiConfiguration: apiConfig,
  clientInfo: 'mm:0.0.0/snap:0.0.1/mode:basic',
};

const transaction = {
  nonce: '0x0',
  chainId: '0x0',
  maxFeePerGas: '0x02',
  maxPriorityFeePerGas: '0x04',
  gasLimit: '0x03',
  gasPrice: '0x05',
  from: 'from',
  to: 'to',
  value: '0x012',
  data: '',
  type: '0x2',
};

const mockCredentials = {
  trustId: mockValues.trustId,
  token: mockValues.token,
};

// eslint-disable-next-line no-restricted-globals
let mockFetch = jest.spyOn(global, 'fetch');
const createQuery = jest.fn((token: TrustApiToken) => `${token.iv} query`);

jest.mock('../snapApi', () => {
  const { SnapMode } = require('../types');
  let internalState: import('../types').KeyringState = {
    accounts: {},
    requests: {},
    rpcUrls: {},
    trustIdToToken: {},
    mode: SnapMode.Basic,
  };
  return {
    getState: jest
      .fn<() => Promise<import('../types').KeyringState>>()
      .mockImplementation(async () => internalState),
    saveState: jest
      .fn<(s: import('../types').KeyringState) => Promise<void>>()
      .mockImplementation(async (s) => {
        internalState = s;
      }),
  };
});

describe('GraphQL client', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    createQuery.mockClear();
  });

  describe('graphQLRequest', () => {
    it('returns the response object on a successful request', async () => {
      const responseData = { status: 'ok' };
      mockFetchImpl(mockFetch, responseData);
      const response = await graphQLRequest(
        createQuery,
        config,
        mockCredentials,
      );
      expect(mockFetch).toHaveBeenCalled();
      expect(response).toMatchObject(responseData);
    });

    it('throws an error on a failed request', async () => {
      mockFetch.mockImplementationOnce(
        async (
          _input: RequestInfo | URL,
          _init?: RequestInit | undefined,
        ): Promise<any> => {
          throw new Error('fail');
        },
      );
      await expect(
        async () => await graphQLRequest(createQuery, config, mockCredentials),
      ).rejects.toThrow('Failed to reach TrustApi, error: fail');
    });

    it('throws an error on a non-successful status code', async () => {
      mockFetch.mockImplementationOnce(
        async (
          _input: RequestInfo | URL,
          _init?: RequestInit | undefined,
        ): Promise<any> => {
          return Promise.resolve({
            status: 404,
            ok: false,
          });
        },
      );
      await expect(
        async () => await graphQLRequest(createQuery, config, mockCredentials),
      ).rejects.toThrow('TrustApi returned a non-successful status code: 404');
    });

    it('throws an error on a TrustVault error response', async () => {
      const responseData = { errors: ['error'] };
      mockFetchImpl(mockFetch, responseData);
      await expect(
        async () => await graphQLRequest(createQuery, config, mockCredentials),
      ).rejects.toThrow(
        `TrustApi returned an error response: ${JSON.stringify(
          responseData.errors,
        )}`,
      );
    });

    it('refreshes the token on a invalid session response', async () => {
      const errorData = { errors: [{ errorType: 'INVALID_SESSION_TOKEN' }] };
      const refreshedIv = 'refreshed';
      const tokenData = {
        data: {
          refreshAuthenticationTokens: {
            enc: 'n_enc',
            iv: refreshedIv,
            tag: 'n_tag',
          },
        },
      };
      const responseData = { status: 'ok' };
      mockFetch = mockFetchImpl(mockFetch, errorData);
      mockFetch = mockFetchImpl(mockFetch, tokenData);
      mockFetch = mockFetchImpl(mockFetch, responseData);
      const response = await graphQLRequest(
        createQuery,
        config,
        mockCredentials,
      );
      expect(response).toMatchObject(responseData);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(createQuery).toHaveBeenCalledTimes(2);
      expect(createQuery.mock.calls[0]?.[0]).toMatchObject(
        config.trustApiConfiguration.token,
      );
      expect(createQuery.mock.calls[1]?.[0]).toMatchObject(
        tokenData.data.refreshAuthenticationTokens,
      );
      const bodyFirstRequest =
        mockFetch.mock.calls[0]?.[1]?.body?.toString() as string;
      const bodyThirdRequest =
        mockFetch.mock.calls[2]?.[1]?.body?.toString() as string;
      expect(bodyFirstRequest).toContain(config.trustApiConfiguration.token.iv);
      expect(bodyThirdRequest).toContain(refreshedIv);
    });
  });

  describe('createEip1559Transaction', () => {
    it('returns the response object on a successful request', async () => {
      const responseData = {
        data: {
          createEIP1559Transaction: {
            requestId: 'requestId',
          },
        },
      };
      mockFetchImpl(mockFetch, responseData);
      const response = await createEip1559Transaction(
        config,
        mockCredentials,
        transaction,
        false,
      );
      expect(mockFetch).toHaveBeenCalled();
      expect(response.requestId).toBe('requestId');
    });
  });

  describe('createLegacyTransaction', () => {
    it('returns the response object on a successful request', async () => {
      const responseData = {
        data: {
          createEthereumTransaction: {
            requestId: 'requestId',
          },
        },
      };
      mockFetchImpl(mockFetch, responseData);
      const response = await createLegacyTransaction(
        config,
        mockCredentials,
        transaction,
        false,
      );
      expect(mockFetch).toHaveBeenCalled();
      expect(response.requestId).toBe('requestId');
    });
  });

  describe('createPersonalSign', () => {
    it('returns the response object on a successful request', async () => {
      const responseData = {
        data: {
          createEthPersonalSign: {
            requestId: 'requestId',
          },
        },
      };
      mockFetchImpl(mockFetch, responseData);
      const response = await createPersonalSign(
        config,
        mockCredentials,
        'address',
        'message',
        'publicKey',
      );
      expect(mockFetch).toHaveBeenCalled();
      expect(response.requestId).toBe('requestId');
    });
  });

  describe('createSignTypedData', () => {
    it('returns the response object on a successful request', async () => {
      const responseData = {
        data: {
          createEthSignTypedData: {
            requestId: 'requestId',
          },
        },
      };
      mockFetchImpl(mockFetch, responseData);
      const response = await createSignTypedData(
        config,
        mockCredentials,
        'address',
        'message',
        'V4',
        'publicKey',
      );
      expect(mockFetch).toHaveBeenCalled();
      expect(response.requestId).toBe('requestId');
    });
  });

  describe('fetchTransactionInfo', () => {
    it('returns the response object on a successful request', async () => {
      const responseData = {
        data: {
          transactionInfo: {
            signedTransaction: {
              transactionDigest: '0x12345',
              transaction: {
                r: '1',
                s: '2',
                v: '3',
              },
            },
            status: TrustVaultRequestStatus.Signed,
          },
        },
      };
      mockFetchImpl(mockFetch, responseData);
      const response = await fetchTransactionInfo(
        config,
        mockCredentials,
        'requestId',
      );
      expect(mockFetch).toHaveBeenCalled();
      expect(response.signedTransaction.transactionDigest).toBe('0x12345');
    });
  });

  describe('getRequest', () => {
    it('returns the response object on a successful request', async () => {
      const responseData = {
        data: {
          getRequest: {
            signatures: {
              raw: '0x12345',
            },
            status: TrustVaultRequestStatus.Signed,
          },
        },
      };
      mockFetchImpl(mockFetch, responseData);
      const response = await getRequest(config, mockCredentials, 'requestId');
      expect(mockFetch).toHaveBeenCalled();
      expect(response.signatures.raw).toBe('0x12345');
    });
  });
});

/**
 * Mocks the implementation of fetch with a custom json response.
 *
 * @param mock - The mock fetch instance.
 * @param responseData - The data to be returned in the response.
 * @returns The updated mock fetch instance.
 */
function mockFetchImpl(mock: jest.Spied<typeof fetch>, responseData: any) {
  return mock.mockImplementationOnce(
    async (
      _input: RequestInfo | URL,
      _init?: RequestInit | undefined,
    ): Promise<any> => {
      return Promise.resolve({
        json: async () => Promise.resolve(responseData),
        ok: true,
      });
    },
  );
}
