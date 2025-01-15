import { beforeEach, describe, expect, jest } from '@jest/globals';

import type { TrustApiToken } from '../types';
import { TrustVaultRequestStatus } from '../types';
import type { UpdateConfig } from './client';
import {
  createEip1559Transaction,
  createLegacyTransaction,
  createPersonalSign,
  createSignTypedData,
  fetchTransactionInfo,
  getRequest,
  graphQLRequest,
} from './client';

const config = {
  url: 'url',
  apiKey: 'apiKey',
  trustId: 'trustId',
  token: {
    enc: 'enc',
    iv: 'iv',
    tag: 'tag',
  },
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

// eslint-disable-next-line no-restricted-globals
let mockFetch = jest.spyOn(global, 'fetch');
const createQuery = jest.fn((token: TrustApiToken) => `${token.iv} query`);

describe('GraphQL client', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    createQuery.mockClear();
  });

  describe('graphQLRequest', () => {
    it('returns the response object on a successful request', async () => {
      const responseData = { status: 'ok' };
      mockFetchImpl(mockFetch, responseData);
      const updateConfig = jest.fn() as UpdateConfig;
      const response = await graphQLRequest(createQuery, config, updateConfig);
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
      const updateConfig = jest.fn() as UpdateConfig;
      await expect(
        async () => await graphQLRequest(createQuery, config, updateConfig),
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
      const updateConfig = jest.fn() as UpdateConfig;
      await expect(
        async () => await graphQLRequest(createQuery, config, updateConfig),
      ).rejects.toThrow('TrustApi returned a non-successful status code: 404');
    });

    it('throws an error on a TrustVault error response', async () => {
      const responseData = { errors: ['error'] };
      mockFetchImpl(mockFetch, responseData);
      const updateConfig = jest.fn() as UpdateConfig;
      await expect(
        async () => await graphQLRequest(createQuery, config, updateConfig),
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
      const updateConfig = jest.fn() as UpdateConfig;
      const response = await graphQLRequest(createQuery, config, updateConfig);
      expect(response).toMatchObject(responseData);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(updateConfig).toHaveBeenCalled();
      expect(createQuery).toHaveBeenCalledTimes(2);
      expect(createQuery.mock.calls[0]?.[0]).toMatchObject(config.token);
      expect(createQuery.mock.calls[1]?.[0]).toMatchObject(
        tokenData.data.refreshAuthenticationTokens,
      );
      const bodyFirstRequest =
        mockFetch.mock.calls[0]?.[1]?.body?.toString() as string;
      const bodyThirdRequest =
        mockFetch.mock.calls[2]?.[1]?.body?.toString() as string;
      expect(bodyFirstRequest).toContain(config.token.iv);
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
      const updateConfig = jest.fn() as UpdateConfig;
      const response = await createEip1559Transaction(
        config,
        transaction,
        false,
        updateConfig,
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
      const updateConfig = jest.fn() as UpdateConfig;
      const response = await createLegacyTransaction(
        config,
        transaction,
        false,
        updateConfig,
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
      const updateConfig = jest.fn() as UpdateConfig;
      const response = await createPersonalSign(
        config,
        'address',
        'message',
        'publicKey',
        updateConfig,
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
      const updateConfig = jest.fn() as UpdateConfig;
      const response = await createSignTypedData(
        config,
        'address',
        'message',
        'V4',
        'publicKey',
        updateConfig,
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
      const updateConfig = jest.fn() as UpdateConfig;
      const response = await fetchTransactionInfo(
        config,
        'requestId',
        updateConfig,
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
      const updateConfig = jest.fn() as UpdateConfig;
      const response = await getRequest(config, 'requestId', updateConfig);
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
