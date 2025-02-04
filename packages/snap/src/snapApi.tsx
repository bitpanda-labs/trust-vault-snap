import { DialogType } from '@metamask/snaps-sdk';
import { remove0x } from '@metamask/utils';
import { Buffer } from 'buffer';

import type { EthFeeHistoryResponse, KeyringState } from './types';
import { SnapMode } from './types';
import { ProxyDialog } from './ui';

/**
 * Default keyring state.
 */
const defaultState: KeyringState = {
  accounts: {},
  requests: {},
  rpcUrls: {},
  mode: SnapMode.Basic,
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

/**
 * Gets the currently used Metamask version.
 *
 * @returns A string representing the version.
 */
export async function getMetamaskVersion(): Promise<string> {
  const fullVersion = (await ethereum.request({
    method: 'web3_clientVersion',
    params: [],
  })) as string;
  return fullVersion.split('/')[1] as string;
}

/**
 * Checks if rpc requests are going through the TrustVault proxy.
 *
 * @returns A boolean.
 */
export async function isUsingRpcProxy(): Promise<boolean> {
  const params = ['0x1', 'latest', []];
  const response = await callEvmRpc<EthFeeHistoryResponse>(
    'eth_feeHistory',
    params,
  );
  if (typeof response !== 'object' || Array.isArray(response)) {
    throw new Error(
      `Unexpected, non-object response while trying to check RPC Proxy usage: ${JSON.stringify(
        response,
      )}`,
    );
  }
  return 'proxy' in response && response.proxy;
}

/**
 * Calls the EVM node rpc method.
 *
 * @param method - The RPC method to call.
 * @param params - The params to provide to the RPC method.
 * @returns The response.
 */
async function callEvmRpc<Type>(method: string, params: any[]): Promise<Type> {
  try {
    return (await ethereum.request<Type>({ method, params })) as Type;
  } catch (error) {
    throw new Error(
      `Unexpected problem while trying to call ${method}, ${
        (error as Error).message
      }`,
    );
  }
}

/**
 * Displays a dialog informing the user about a proxy problem.
 */
export async function displayProxyDialog() {
  await snap.request({
    method: 'snap_dialog',
    params: {
      content: <ProxyDialog />,
      type: DialogType.Alert,
    },
  });
}

// eslint-disable-next-line no-restricted-globals
export const snapVersion = process.env.version as string;
