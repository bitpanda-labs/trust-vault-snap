import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';
import type { Buffer } from 'buffer';

export type TrustApiConfiguration = {
  url: string;
  apiKey: string;
  trustId: string;
  token: TrustApiToken;
};

export type TrustApiToken = {
  enc: string;
  iv: string;
  tag: string;
};

export type TrustVaultRequest = KeyringRequest & {
  trustVaultRequestId: string;
  status: RequestStatus;
};

export enum RequestStatus {
  Pending = 'pending',
  Signed = 'signed',
}

export type KeyringState = {
  trustApiConfiguration?: TrustApiConfiguration;
  accounts: Record<string, KeyringAccount>;
  requests: Record<string, TrustVaultRequest>;
};

export type EvmTransaction = {
  nonce: string;
  chainId: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasLimit: string;
  gasPrice?: string;
  from: string;
  to: string;
  value: string;
  data: string;
  type: string;
};

export type CreateTransactionResponse = {
  requestId: string;
};

export enum TrustVaultRequestStatus {
  Pending = 'PENDING',
  Queued = 'QUEUED',
  Signed = 'SIGNED',
  Submitted = 'SUBMITTED',
}

export type SignedTransaction = {
  transactionDigest: string;
  transaction: {
    r: string;
    s: string;
    v: string;
  };
};

export type TransactionInfoResponse = {
  signedTransaction: SignedTransaction;
  status: TrustVaultRequestStatus;
};

export type GetRequestResponse = {
  signatures: {
    raw: string;
  };
  status: TrustVaultRequestStatus;
};

export type EciesKeyPair = {
  privateKey: Buffer;
  publicKey: string;
};
