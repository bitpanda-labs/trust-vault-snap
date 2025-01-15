import { expect } from '@jest/globals';
import { installSnap } from '@metamask/snaps-jest';

describe('onRpcRequest', () => {
  describe('hello', () => {
    it('returns hello with correct origin', async () => {
      const { request } = await installSnap();

      const origin = 'Jest';
      const response = await request({
        method: 'hello',
        origin,
      });
      expect(response.response).toMatchObject({ result: `hello ${origin}` });
    });
  });

  it('throws an error if the requested method does not exist', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'foo',
    });

    expect(response).toRespondWithError({
      code: -32603,
      message: 'Method not found.',
      stack: expect.any(String),
    });
  });
});
