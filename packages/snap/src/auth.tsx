import { DialogType } from '@metamask/snaps-sdk';
import { getState, saveState } from './snapApi';
import type { TrustApiToken } from './types';
import { InvalidSessionDialog } from './ui';

/**
 * Refreshes token in state
 */
export async function refreshCredentials(
  trustId: string,
  token: TrustApiToken,
) {
  const state = await getState();
  state.trustIdToToken[trustId] = token;
  await saveState(state);
}

/**
 * Warn user that a refresh token is invalid.
 */
export async function notifyInvalidSession(trustId: string) {
  await snap.request({
    method: 'snap_dialog',
    params: {
      type: DialogType.Alert,
      content: <InvalidSessionDialog trustId={trustId} />,
    },
  });

  const message = `Organisation with TrustId ${trustId} and all associated accounts have been logged out. Please log in again by adding the snap to the organisation through Trust Vault Web.`;

  await snap.request({
    method: 'snap_notify',
    params: {
      type: 'inApp',
      message,
    },
  });

  await snap.request({
    method: 'snap_notify',
    params: {
      type: 'native',
      message,
    },
  });
}
