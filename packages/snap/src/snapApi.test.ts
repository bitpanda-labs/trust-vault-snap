import { expect, jest } from '@jest/globals';

import { isUsingRpcProxy } from './snapApi';

const mockRequest = jest.fn();
jest.mock('@metamask/snaps-sdk', () => {
  return {
    DialogType: jest.fn(),
  };
});

type Global = { ethereum: any; snap: any };

// eslint-disable-next-line no-restricted-globals
(global as unknown as Global).ethereum = {
  request: async (...args: any) => mockRequest(...args),
};

describe('snapApi', () => {
  describe('isUsingRpcProxy', () => {
    it('returns true if proxy is in response', async () => {
      const response = { proxy: true };
      mockRequest.mockImplementation(async () => response);
      const isUsingProxy = await isUsingRpcProxy();
      expect(isUsingProxy).toBe(true);
    });

    it('returns false if proxy is not in response or is false', async () => {
      let response = {};
      mockRequest.mockImplementation(async () => response);
      expect(await isUsingRpcProxy()).toBe(false);

      response = { proxy: false };
      mockRequest.mockImplementation(async () => response);
      expect(await isUsingRpcProxy()).toBe(false);
    });

    it('throws an Error if the response is not expected', async () => {
      const response = ['hello'];
      mockRequest.mockImplementation(async () => response);
      await expect(async () => await isUsingRpcProxy()).rejects.toThrow(
        `Unexpected, non-object response while trying to check RPC Proxy usage: ${JSON.stringify(
          response,
        )}`,
      );
    });

    it('throws an Error if the rpc request fails', async () => {
      mockRequest.mockImplementation(async () => {
        throw new Error('errored');
      });
      await expect(async () => await isUsingRpcProxy()).rejects.toThrow(
        `Unexpected problem while trying to call eth_feeHistory, errored`,
      );
    });
  });
});
