/* eslint-disable no-restricted-syntax */

import { KeyringRpcMethod } from '@metamask/keyring-api';
import type {
  Json,
  OnCronjobHandler,
  OnKeyringRequestHandler,
} from '@metamask/snaps-sdk';
import { type OnRpcRequestHandler } from '@metamask/snaps-sdk';
import { ZodError } from 'zod';

import { handleKeyringRequest } from '@metamask/keyring-snap-sdk';
import { TrustVaultKeyring } from './keyring';
import { getState } from './snapApi';
import {
  AddRpcUrlInputSchema,
  TrustApiConfigurationSchema,
  UpdateSnapModeInputSchema,
} from './types';

/**
 * Handle incoming JSON-RPC requests, sent through `wallet_invokeSnap`.
 *
 * @param args - The request handler args as object.
 * @param args.origin - The origin of the request, e.g., the website that
 * invoked the snap.
 * @param args.request - A validated JSON-RPC request object.
 * @returns The result of `snap_dialog`.
 * @throws If the request method is not valid for this snap.
 */
export const onRpcRequest: OnRpcRequestHandler = async ({
  origin,
  request,
}) => {
  const keyring = await getKeyring();
  let response: Json = {};

  try {
    switch (request.method) {
      case 'hello':
        response = `hello ${origin}`;
        break;
      case 'addTrustApiConfiguration':
        await keyring.addTrustApiConfiguration(
          TrustApiConfigurationSchema.parse(request.params),
        );
        break;
      case 'getSnapMode':
        response = keyring.getSnapMode();
        break;
      case 'updateSnapMode':
        await keyring.updateSnapMode(
          UpdateSnapModeInputSchema.parse(request.params).mode,
        );
        break;
      case 'addRpcUrl':
        await keyring.addRpcUrl(AddRpcUrlInputSchema.parse(request.params));
        break;
      default:
        throw new Error('Method not found.');
    }
    return response;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(formatZodErrors(error));
    }
    throw error;
  }
};

let _keyring: TrustVaultKeyring;

/**
 * Singleton TrustVaultKeyring factory.
 *
 * @returns The TrustVaultKeyring instance.
 */
async function getKeyring(): Promise<TrustVaultKeyring> {
  if (!_keyring) {
    const state = await getState();
    if (!_keyring) {
      _keyring = new TrustVaultKeyring(state);
    }
  }
  return _keyring;
}

const metamaskKeyringMethods = [
  KeyringRpcMethod.ListAccounts,
  KeyringRpcMethod.GetAccount,
  KeyringRpcMethod.FilterAccountChains,
  KeyringRpcMethod.DeleteAccount,
  KeyringRpcMethod.ListRequests,
  KeyringRpcMethod.GetRequest,
  KeyringRpcMethod.SubmitRequest,
  KeyringRpcMethod.RejectRequest,
];
const dappKeyringMethods = [
  KeyringRpcMethod.ListAccounts,
  KeyringRpcMethod.ListRequests,
  KeyringRpcMethod.GetAccount,
  KeyringRpcMethod.CreateAccount,
  KeyringRpcMethod.DeleteAccount,
  KeyringRpcMethod.GetRequest,
];

// eslint-disable-next-line no-restricted-globals
const allowedOrigins = process.env.allowedOrigins as unknown as string[];
const dappPermissions: [string, string[]][] = allowedOrigins.map((url) => {
  return [url, dappKeyringMethods];
});
export const originPermissions = new Map<string, string[]>([
  ['metamask', metamaskKeyringMethods],
  ...dappPermissions,
]);

/**
 * Verify if the caller can call the requested method.
 *
 * @param origin - Caller origin.
 * @param method - Method being called.
 * @returns True if the caller is allowed to call the method, false otherwise.
 */
function hasPermission(origin: string, method: string): boolean {
  return originPermissions.get(origin)?.includes(method) ?? false;
}

/**
 * Handle metamask incoming JSON-RPC requests, sent through `wallet_invokeSnap`.
 *
 * @param args - The request handler args as object.
 * @param args.origin - Caller origin.
 * @param args.request - A validated JSON-RPC request object.
 * @returns The result of the keyring method execution.
 * @throws If the origin doesn't have permission to call this method.
 */
export const onKeyringRequest: OnKeyringRequestHandler = async ({
  origin,
  request,
}): Promise<Json> => {
  if (!hasPermission(origin, request.method)) {
    throw new Error(
      `Origin '${origin}' is not allowed to call '${request.method}'`,
    );
  }

  return (await handleKeyringRequest(await getKeyring(), request)) ?? {};
};

/**
 * Handle metamask incoming Cronjob requests.
 *
 * @param args - The request handler args as object.
 * @param args.request - The request information object.
 */
export const onCronjob: OnCronjobHandler = async ({
  request,
}): Promise<void> => {
  const keyring = await getKeyring();

  switch (request.method) {
    case 'checkPendingRequests':
      await keyring.checkPendingRequests();
      break;
    default:
      throw new Error('Method not found.');
  }
};

/**
 * Format ZodError into an error string.
 *
 * @param zodError - The handled validation Error.
 * @returns The formatted error string.
 */
function formatZodErrors(zodError: ZodError): string {
  const baseMessage = 'Input validation failed:';
  let validationErrors = '';
  zodError.errors.forEach((error) => {
    const path = error.path.length ? ` ${error.path.join('.')}: ` : ' ';
    validationErrors += `${path}${error.message};`;
  });
  return `${baseMessage}${validationErrors}`;
}
