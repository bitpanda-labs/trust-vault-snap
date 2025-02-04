import { emitSnapKeyringEvent, KeyringEvent } from '@metamask/keyring-api';
import type { Json } from '@metamask/utils';

/**
 * Emits an AccountCreated keyring event.
 *
 * @param data - The payload of the event.
 */
export async function accountCreated(
  data: Record<string, Json>,
): Promise<void> {
  await emitEvent(KeyringEvent.AccountCreated, data);
}

/**
 * Emits an AccountDeleted keyring event.
 *
 * @param data - The payload of the event.
 */
export async function accountDeleted(
  data: Record<string, Json>,
): Promise<void> {
  await emitEvent(KeyringEvent.AccountDeleted, data);
}

/**
 * Emits an RequestApproved keyring event.
 *
 * @param data - The payload of the event.
 */
export async function requestApproved(
  data: Record<string, Json>,
): Promise<void> {
  await emitEvent(KeyringEvent.RequestApproved, data);
}

/**
 * Emits an RequestRejected keyring event.
 *
 * @param data - The payload of the event.
 */
export async function requestRejected(
  data: Record<string, Json>,
): Promise<void> {
  await emitEvent(KeyringEvent.RequestRejected, data);
}

/**
 * Emits a keyring event of the provided type.
 *
 * @param event - The event type.
 * @param data - The payload of the event.
 */
async function emitEvent(
  event: KeyringEvent,
  data: Record<string, Json>,
): Promise<void> {
  await emitSnapKeyringEvent(snap, event, data);
}
