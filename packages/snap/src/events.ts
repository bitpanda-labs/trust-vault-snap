import { KeyringEvent, KeyringEventPayload } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';

/**
 * Emits an AccountCreated keyring event.
 *
 * @param data - The payload of the event.
 */
export async function accountCreated(
  data: KeyringEventPayload<KeyringEvent>,
): Promise<void> {
  await emitEvent(KeyringEvent.AccountCreated, data);
}

/**
 * Emits an AccountDeleted keyring event.
 *
 * @param data - The payload of the event.
 */
export async function accountDeleted(
  data: KeyringEventPayload<KeyringEvent>,
): Promise<void> {
  await emitEvent(KeyringEvent.AccountDeleted, data);
}

/**
 * Emits an RequestApproved keyring event.
 *
 * @param data - The payload of the event.
 */
export async function requestApproved(
  data: KeyringEventPayload<KeyringEvent>,
): Promise<void> {
  await emitEvent(KeyringEvent.RequestApproved, data);
}

/**
 * Emits an RequestRejected keyring event.
 *
 * @param data - The payload of the event.
 */
export async function requestRejected(
  data: KeyringEventPayload<KeyringEvent>,
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
  data: KeyringEventPayload<KeyringEvent>,
): Promise<void> {
  await emitSnapKeyringEvent(snap, event, data);
}
