import type { Json } from '@metamask/utils';

import type {
  CreateTransactionResponse,
  EvmTransaction,
  TrustApiConfiguration,
  TrustApiToken,
  TransactionInfoResponse,
  GetRequestResponse,
  RequestConfiguration,
} from '../types';
import {
  createEip1559TransactionMutation,
  createEthereumTransactionMutation,
  createEthPersonalSignMutation,
  createEthSignTypedDataMutation,
  getRequestQuery,
  getTransactionInfoQuery,
  refreshAuthTokenQuery,
} from './queries';

export type UpdateConfig = (config: TrustApiConfiguration) => Promise<void>;
export type CreateQuery = (token: TrustApiToken) => string;

/**
 * Makes an authenticated post request to the TrustApi.
 *
 * @param config - The GQL request configuration object.
 * @param body - The stringified body of the request.
 * @returns The response.
 */
export async function post(config: RequestConfiguration, body: string) {
  const options = {
    method: 'POST',
    headers: {
      'x-api-key': config.trustApiConfiguration.apiKey,
      'x-source': config.clientInfo,
    },
    body,
  };
  let response;
  try {
    response = await fetch(config.trustApiConfiguration.url, options);
  } catch (error) {
    const { message } = error as Error;
    throw new Error(`Failed to reach TrustApi, error: ${message}`);
  }
  if (!response.ok) {
    throw new Error(
      `TrustApi returned a non-successful status code: ${response.status}`,
    );
  }
  return response;
}

/**
 * Makes an authenticated GraphQL request.
 *
 * @param createQuery - A function that produces a GraphQl query.
 * @param config - The GQL request configuration object.
 * @param updateConfig - Callback to be called when the token has been updated.
 * @returns The GraphQL query.
 */
export async function graphQLRequest(
  createQuery: CreateQuery,
  config: RequestConfiguration,
  updateConfig: UpdateConfig,
): Promise<any> {
  const query = createQuery(config.trustApiConfiguration.token);
  const body = JSON.stringify({ query });
  const result = await post(config, body);
  const response = await result.json();
  const { errors } = response;

  if (errors) {
    if (errors[0]?.errorType?.includes('INVALID_SESSION_TOKEN')) {
      const refreshedToken = await refreshAuthToken(config);
      const { enc, iv, tag } = refreshedToken;
      if (!enc || !iv || !tag) {
        throw new Error('Failed to refresh auth token');
      }
      const refreshedApiConfig = {
        ...config.trustApiConfiguration,
        token: refreshedToken,
      };
      await updateConfig(refreshedApiConfig);
      const refreshedConfig = {
        ...config,
        trustApiConfiguration: refreshedApiConfig,
      };
      return graphQLRequest(createQuery, refreshedConfig, updateConfig);
    }

    throw new Error(
      `TrustApi returned an error response: ${JSON.stringify(errors)}`,
    );
  }

  return response;
}

/**
 * Makes a request to refresh the TrustApi token.
 *
 * @param config - The GQL request configuration object.
 * @returns The updated TrustApi token.
 */
export async function refreshAuthToken(
  config: RequestConfiguration,
): Promise<TrustApiToken> {
  const body = JSON.stringify({
    query: refreshAuthTokenQuery(config.trustApiConfiguration.token),
  });
  const result = await post(config, body);
  const { data, errors } = await result.json();
  if (errors) {
    throw new Error(
      `Failed to refresh token, error: ${JSON.stringify(errors)}`,
    );
  }
  return data.refreshAuthenticationTokens;
}

/**
 * Creates an eip-1559 transaction request in TrustVault.
 *
 * @param config - The GQL request configuration object.
 * @param transaction - The eip-1559 transaction body.
 * @param submit - Whether TrustVault should submit the transaction after signing.
 * @param updateConfig - Callback to be called when the token has been updated.
 * @param rpcUrl - EVM Node to be used, if provided, for submitting the tx.
 * @returns The TrustVault created transaction response.
 */
export async function createEip1559Transaction(
  config: RequestConfiguration,
  transaction: EvmTransaction,
  submit: boolean,
  updateConfig: UpdateConfig,
  rpcUrl?: string,
): Promise<CreateTransactionResponse> {
  const createQuery = (token: TrustApiToken) =>
    createEip1559TransactionMutation(token, transaction, submit, rpcUrl);
  const response = await graphQLRequest(createQuery, config, updateConfig);
  return response.data.createEIP1559Transaction;
}

/**
 * Creates a legacy EVM transaction request in TrustVault.
 *
 * @param config - The GQL request configuration object.
 * @param transaction - The transaction body.
 * @param submit - Whether TrustVault should submit the transaction after signing.
 * @param updateConfig - Callback to be called when the token has been updated.
 * @param rpcUrl - EVM Node to be used, if provided, for submitting the tx.
 * @returns The TrustVault created transaction response.
 */
export async function createLegacyTransaction(
  config: RequestConfiguration,
  transaction: EvmTransaction,
  submit: boolean,
  updateConfig: UpdateConfig,
  rpcUrl?: string,
): Promise<CreateTransactionResponse> {
  const createQuery = (token: TrustApiToken) =>
    createEthereumTransactionMutation(token, transaction, submit, rpcUrl);
  const response = await graphQLRequest(createQuery, config, updateConfig);
  return response.data.createEthereumTransaction;
}

/**
 * Creates a SignTypedData EVM request in TrustVault.
 *
 * @param config - The GQL request configuration object.
 * @param address - The invoking address.
 * @param message - The typed data message.
 * @param version - The SignTypedData version.
 * @param eciesPublicKey - The ECIES public key to encrypt the signature with.
 * @param updateConfig - Callback to be called when the token has been updated.
 * @returns The TrustVault created transaction response.
 */
export async function createSignTypedData(
  config: RequestConfiguration,
  address: string,
  message: Json,
  version: string,
  eciesPublicKey: string,
  updateConfig: UpdateConfig,
): Promise<CreateTransactionResponse> {
  const createQuery = (token: TrustApiToken) =>
    createEthSignTypedDataMutation(
      token,
      address,
      message,
      version,
      eciesPublicKey,
    );
  const response = await graphQLRequest(createQuery, config, updateConfig);
  return response.data.createEthSignTypedData;
}

/**
 * Creates a PersonalSign EVM request in TrustVault.
 *
 * @param config - The GQL request configuration object.
 * @param address - The invoking address.
 * @param message - The personal sign message.
 * @param eciesPublicKey - The ECIES public key to encrypt the signature with.
 * @param updateConfig - Callback to be called when the token has been updated.
 * @returns The TrustVault created transaction response.
 */
export async function createPersonalSign(
  config: RequestConfiguration,
  address: string,
  message: string,
  eciesPublicKey: string,
  updateConfig: UpdateConfig,
): Promise<CreateTransactionResponse> {
  const createQuery = (token: TrustApiToken) =>
    createEthPersonalSignMutation(token, address, message, eciesPublicKey);
  const response = await graphQLRequest(createQuery, config, updateConfig);
  return response.data.createEthPersonalSign;
}

/**
 * Fetches transaction information for a TrustVault request.
 *
 * @param config - The GQL request configuration object.
 * @param trustVaultRequestId - The TrustVault request identifier.
 * @param updateConfig - Callback to be called when the token has been updated.
 * @returns The transaction information.
 */
export async function fetchTransactionInfo(
  config: RequestConfiguration,
  trustVaultRequestId: string,
  updateConfig: UpdateConfig,
): Promise<TransactionInfoResponse> {
  const createQuery = (token: TrustApiToken) =>
    getTransactionInfoQuery(token, trustVaultRequestId);
  const response = await graphQLRequest(createQuery, config, updateConfig);
  return response.data.transactionInfo;
}

/**
 * Gets a TrustVault request.
 *
 * @param config - The GQL request configuration object.
 * @param trustVaultRequestId - The TrustVault request identifier.
 * @param updateConfig - Callback to be called when the token has been updated.
 * @returns The transaction information.
 */
export async function getRequest(
  config: RequestConfiguration,
  trustVaultRequestId: string,
  updateConfig: UpdateConfig,
): Promise<GetRequestResponse> {
  const createQuery = (token: TrustApiToken) =>
    getRequestQuery(token, trustVaultRequestId);
  const response = await graphQLRequest(createQuery, config, updateConfig);
  return response.data.getRequest;
}
