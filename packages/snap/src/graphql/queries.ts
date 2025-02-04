import type { Json } from '@metamask/utils';

import type { EvmTransaction, TrustApiToken } from '../types';

/**
 * Creates the mutation body for createEip1559Transaction.
 *
 * @param token - The TrustApi token.
 * @param transaction - The eip-1559 transaction body.
 * @param submit - Whether TrustVault should submit the transaction after signing.
 * @param rpcUrl - The EVM node that TrustVault will relay the transaction to.
 * @returns The GraphQL query.
 */
export function createEip1559TransactionMutation(
  token: TrustApiToken,
  transaction: EvmTransaction,
  submit: boolean,
  rpcUrl?: string,
): string {
  const rpcUrlField = rpcUrl ? `rpcUrl: "${rpcUrl}",` : '';
  const dataField =
    transaction && transaction.data !== '0x'
      ? `data: "${transaction.data}"`
      : '';
  return `mutation {
    createEIP1559Transaction(
      createEIP1559TransactionInput: {
        ${authBody(token)},
        transaction: {
          nonce: "${transaction.nonce}",
          chainId: "${transaction.chainId}",
          maxFeePerGas: "${transaction.maxFeePerGas as string}",
          maxPriorityFeePerGas: "${transaction.maxPriorityFeePerGas as string}",
          gasLimit: "${transaction.gasLimit}",
          from: "${transaction.from}",
          ${transaction.to ? `to: "${transaction.to}",` : ''}
          ${transaction.value ? `value: "${transaction.value}",` : ''}
          ${dataField}
        }
        source: "Metamask",
        sendToNetworkWhenSigned: ${submit},
        ${rpcUrlField}
        currency: "GBP"
      }
    )
    {
      ... on CreateEvmTransactionResponse {
        requestId
      }
    }
  }`;
}

/**
 * Creates the mutation body for createEthereumTransaction.
 *
 * @param token - The TrustApi token.
 * @param transaction - The eip-1559 transaction body.
 * @param submit - Whether TrustVault should submit the transaction after signing.
 * @param rpcUrl - The EVM node that TrustVault will relay the transaction to.
 * @returns The GraphQL query.
 */
export function createEthereumTransactionMutation(
  token: TrustApiToken,
  transaction: EvmTransaction,
  submit: boolean,
  rpcUrl?: string,
): string {
  const rpcUrlField = rpcUrl ? `rpcUrl: "${rpcUrl}",` : '';
  const dataField =
    transaction && transaction.data !== '0x'
      ? `data: "${transaction.data}"`
      : '';
  return `mutation {
    createEthereumTransaction(
      createTransactionInput: {
        ${authBody(token)},
        ethereumTransaction: {
          nonce: ${parseInt(transaction.nonce, 16)},
          chainId: ${parseInt(transaction.chainId, 16)},
          gasPrice: "${parseInt(transaction.gasPrice as string, 16)}",
          gasLimit: "${parseInt(transaction.gasLimit, 16)}",
          value: "${parseInt(transaction.value, 16)}",
          fromAddress: "${transaction.from}",
          to: "${transaction.to}",
          ${dataField}
        }
        source: "Metamask",
        sendToNetworkWhenSigned: ${submit},
        ${rpcUrlField}
        sendToDevicesForSigning: true,
        currency: "GBP"
      }
    )
    {
      ... on CreateEthereumTransactionResponse {
        requestId
      }
    }
  }`;
}

/**
 * Creates the mutation body for createEthSignTypedData.
 *
 * @param token - The TrustApi token.
 * @param address - The invoking address.
 * @param message - The typed data message.
 * @param version - The SignTypedData version.
 * @param eciesPublicKey - The ECIES public key to encrypt the signature with.
 * @returns The GraphQL query.
 */
export function createEthSignTypedDataMutation(
  token: TrustApiToken,
  address: string,
  message: Json,
  version: string,
  eciesPublicKey: string,
): string {
  return `mutation{
    createEthSignTypedData(createEthSignTypedDataInput: {
      ${authBody(token)},
      messageAddress: {
        message: """${JSON.stringify(message)}""",
        address: "${address}",
        version: "${version}"
      },
      source: "MetaMask",
      sendToDevicesForSigning: true,
      signatureEncryptionPublicKey: "${eciesPublicKey}"
    }){
      requestId
    }
  }`;
}

/**
 * Creates the mutation body for createEthPersonalSign.
 *
 * @param token - The TrustApi token.
 * @param address - The invoking address.
 * @param message - The typed data message.
 * @param eciesPublicKey - The ECIES public key to encrypt the signature with.
 * @returns The GraphQL query.
 */
export function createEthPersonalSignMutation(
  token: TrustApiToken,
  address: string,
  message: string,
  eciesPublicKey: string,
): string {
  return `mutation{
    createEthPersonalSign(createEthPersonalSignInput: {
      ${authBody(token)},
      messageAddress: {
        message: """${message}""",
        address: "${address}"
      },
      source: "MetaMask",
      sendToDevicesForSigning: true,
      signatureEncryptionPublicKey: "${eciesPublicKey}"
    }){
      requestId
    }
  }`;
}

/**
 * Creates the query body for getTransactionInfo.
 *
 * @param token - The TrustApi token.
 * @param trustVaultRequestId - The TrustVault request identifier.
 * @returns The GraphQL query.
 */
export function getTransactionInfoQuery(
  token: TrustApiToken,
  trustVaultRequestId: string,
): string {
  return `query {
    transactionInfo(
      ${authBody(token)},
      transactionId: "${trustVaultRequestId}"
    ) {
      signedTransaction {
        transactionDigest,
        transaction {
          r
          s
          v
        }
      }
      status
    }
  }`;
}

/**
 * Creates the query body for getRequest.
 *
 * @param token - The TrustApi token.
 * @param trustVaultRequestId - The TrustVault request identifier.
 * @returns The GraphQL query.
 */
export function getRequestQuery(
  token: TrustApiToken,
  trustVaultRequestId: string,
): string {
  return `query {
    getRequest(
      ${authBody(token)},
      requestId: "${trustVaultRequestId}"
    ) {
        requestId
        status
        type
        transactionHash
        signatures {
          raw
        }
      }
    }`;
}

/**
 * Creates the query body for refreshAuthenticationTokens.
 *
 * @param token - The TrustApi token.
 * @returns The GraphQL query.
 */
export function refreshAuthTokenQuery(token: TrustApiToken) {
  return `query {
    refreshAuthenticationTokens(
      ${authBody(token)}
    ) {
      enc,
      iv,
      tag
    }
  }`;
}

/**
 * Creates the authentication part of the query.
 *
 * @param token - The TrustApi token.
 * @returns The GraphQL query.
 */
function authBody(token: TrustApiToken): string {
  return `authentication: {
    enc: "${token.enc}",
    iv: "${token.iv}",
    tag: "${token.tag}",
  }`;
}
