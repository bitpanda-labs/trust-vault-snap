import { expect } from '@jest/globals';
import { installSnap } from '@metamask/snaps-jest';

import { SnapMode } from './types';

describe('onRpcRequest', () => {
  it('gets the snap mode', async () => {
    const { request } = await installSnap();

    const origin = 'Jest';
    const response = await request({
      method: 'getSnapMode',
      origin,
    });
    expect(response.response).toMatchObject({ result: SnapMode.Basic });
  });

  it('updates the snap mode', async () => {
    const { request } = await installSnap();
    const origin = 'Jest';

    const getErrorMessage = (response: any): string => {
      return response.response.error.message;
    };

    let response = await request({
      method: 'updateSnapMode',
      params: [{ mode: SnapMode.Enhanced }],
      origin,
    });
    expect(getErrorMessage(response)).toBe(
      'Input validation failed: Expected object, received array;',
    );
    response = await request({
      method: 'updateSnapMode',
      params: { unknown: SnapMode.Enhanced },
      origin,
    });
    expect(getErrorMessage(response)).toBe(
      'Input validation failed: mode: Required;',
    );
    response = await request({
      method: 'updateSnapMode',
      params: { mode: 'unknown' },
      origin,
    });
    expect(getErrorMessage(response)).toBe(
      "Input validation failed: mode: Invalid enum value. Expected 'basic' | 'enhanced', received 'unknown';",
    );

    await request({
      method: 'updateSnapMode',
      params: { mode: SnapMode.Enhanced },
      origin,
    });
    response = await request({
      method: 'getSnapMode',
      origin,
    });
    expect(response.response).toMatchObject({ result: SnapMode.Enhanced });
  });

  it('sets an rpc url', async () => {
    const { request } = await installSnap();

    const origin = 'Jest';
    const response = await request({
      method: 'addRpcUrl',
      params: { chainId: 'chain', rpcUrl: 'http://rpc' },
      origin,
    });
    expect(response.response).toMatchObject({ result: {} });
  });

  it('throws an error if the requested method does not exist', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'foo',
    });

    expect(response.response).toMatchObject({
      error: {
        code: -32603,
        message: 'Method not found.',
        stack: expect.any(String),
      },
    });
  });
});
