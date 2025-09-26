import {
  EthAccountType,
  EthMethod,
  EthScope,
  KeyringAccount,
  KeyringRequest,
} from '@metamask/keyring-api';
import { v4 as uuid } from 'uuid';
import {
  KeyringState,
  RequestStatus,
  SnapMode,
  TrustVaultRequest,
} from './types';

export const mockValues = {
  trustId: '0ag5a3ed-81cc-49f7-hec0-595a9f51b84b',
  address1: '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5',
  address2: '0x0c54FcCd2e384b4BB6f2E405Bf5Cbc15a017AaFb',
  address3: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  account1id: '1',
  account2id: '2',
  token: {
    enc: 'enc',
    iv: 'iv',
    tag: 'tag',
  },
};

export const mockRequest = {
  requestId: 'requestId',
  account: mockValues.account1id,
};

export const mockAccounts: Record<string, KeyringAccount> = {
  '1': {
    type: 'eip155:eoa',
    id: mockValues.account1id,
    options: {
      trustId: mockValues.trustId,
    },
    address: mockValues.address1,
    methods: [''],
    scopes: ['scope:scope'],
  },
  '2': {
    type: 'eip155:eoa',
    id: mockValues.account2id,
    options: {
      trustId: mockValues.trustId,
    },
    address: mockValues.address2,
    methods: [''],
    scopes: ['scope:scope'],
  },
};

/**
 * Creates a mock KeyringAccount.
 *
 * @param name - The account name.
 * @param address - The account address.
 * @returns The mock account.
 */
export function createAccount(
  name: string,
  address: string,
  id?: string,
): KeyringAccount {
  return {
    id: id || uuid(),
    options: { name, address, trustId: mockValues.trustId },
    scopes: [EthScope.Eoa],
    address,
    methods: [
      EthMethod.PersonalSign,
      EthMethod.Sign,
      EthMethod.SignTransaction,
      EthMethod.SignTypedDataV1,
      EthMethod.SignTypedDataV3,
      EthMethod.SignTypedDataV4,
    ],
    type: EthAccountType.Eoa,
  };
}

/**
 * Creates a mock TrustVaultKeyringRequest.
 *
 * @param method - The EVM method.
 * @param params - The EVM params.
 * @returns The mock request.
 */
export function createTrustVaultRequest(
  method: EthMethod,
  params?: any,
): TrustVaultRequest {
  return {
    ...createRequest(method, params),
    trustVaultRequestId: 'requestId',
    status: RequestStatus.Pending,
    account: mockValues.account1id,
  };
}

/**
 * Creates a mock KeyringRequest.
 *
 * @param method - The EVM method.
 * @param params - The EVM params.
 * @returns The mock request.
 */
export function createRequest(method: EthMethod, params?: any): KeyringRequest {
  return {
    id: uuid(),
    scope: 'scope',
    account: mockValues.account1id,
    request: {
      method,
      params: params || [],
    },
  };
}

/**
 * Creates a mock KeyringState.
 *
 * @param accounts - The mock accounts.
 * @param requests - The mock requests.
 * @param mode - The mock snap mode.
 * @returns The mock KeyringState.
 */
export function createState(
  accounts: Record<string, KeyringAccount>,
  requests: Record<string, TrustVaultRequest>,
  mode: SnapMode = SnapMode.Basic,
): KeyringState {
  return {
    accounts,
    requests,
    trustApiConfiguration: {
      url: 'url',
      apiKey: 'apiKey',
      trustId: 'trustId',
      token: mockValues.token,
    },
    rpcUrls: {},
    trustIdToToken: { [mockValues.trustId]: mockValues.token },
    mode,
  };
}
