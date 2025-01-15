import { remove0x } from '@metamask/utils';
import { Buffer } from 'buffer';

import type { KeyringState } from './types';

/**
 * Default keyring state.
 */
const defaultState: KeyringState = {
  accounts: {},
  requests: {},
};

/**
 * Retrieves the current state of the keyring.
 *
 * @returns The current state of the keyring.
 */
export async function getState(): Promise<KeyringState> {
  const state = (await snap.request({
    method: 'snap_manageState',
    params: { operation: 'get' },
  })) as any;
  return {
    ...defaultState,
    ...state,
  };
}

/**
 * Persists the given snap state.
 *
 * @param state - New snap state.
 */
export async function saveState(state: KeyringState) {
  await snap.request({
    method: 'snap_manageState',
    params: { operation: 'update', newState: state },
  });
}

/**
 * Generates a wallet-specific deterministic value.
 *
 * @param salt - Use-case specific extra input used to generate the value.
 * @returns A 32-bytes Buffer value.
 */
export async function generateEntropy(salt: string): Promise<Buffer> {
  try {
    const entropyString = await snap.request({
      method: 'snap_getEntropy',
      params: { version: 1, salt },
    });
    return Buffer.from(remove0x(entropyString), 'hex');
  } catch (error) {
    console.log(
      `Failed to generate entropy, error ${(error as Error).message}`,
    );
    throw error;
  }
}
