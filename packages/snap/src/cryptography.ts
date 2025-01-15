import type { MessageTypes, TypedMessage } from '@metamask/eth-sig-util';
import { TypedDataUtils } from '@metamask/eth-sig-util';
import type { SignTypedDataVersion } from '@metamask/eth-sig-util/dist/sign-typed-data';
import { add0x, remove0x } from '@metamask/utils';
import { Buffer } from 'buffer';
import { decrypt } from 'ecies-geth';
import { ec as EC } from 'elliptic';
import { ecrecover, keccak256, pubToAddress } from 'ethereumjs-util';

import type { EciesKeyPair } from './types';
import { numToHexBuffer } from './util';

export const EC_GROUP_ORDER =
  '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';

const ec = new EC('secp256k1');

/**
 * Generates an ECIES key-pair.
 *
 * @param entropy - Secret seed to generate repeatable keys.
 * @returns The key-pair.
 */
export async function generateEciesKeyPair(
  entropy: Buffer,
): Promise<EciesKeyPair> {
  const keyPair = ec.genKeyPair({ entropy });
  const privateString = keyPair.getPrivate().toString('hex', 64);
  const privateKey = Buffer.from(privateString, 'hex');
  const publicKey = keyPair.getPublic().encode('hex', false);
  return { privateKey, publicKey };
}

/**
 * Decrypt an ECIES encrypted message.
 *
 * @param privateKey - The ECIES private key corresponding to the public key that encrypted the message.
 * @param data - The encrypted message.
 * @returns The decrypted message as a buffer.
 */
export async function decryptData(
  privateKey: Buffer,
  data: string,
): Promise<Buffer> {
  return decrypt(privateKey, Buffer.from(data, 'hex'));
}

/**
 * Creates digest of an EVM PersonalSign message to be signed.
 *
 * @param message - The EVM PersonalSign message.
 * @returns The digest of the personal sign message as a Buffer.
 */
export function createPersonalSignDataDigest(message: string): Buffer {
  const encoding = message.startsWith('0x') ? 'hex' : 'utf-8';
  const messageToEncode = remove0x(message);
  const encodedMessage = Buffer.from(messageToEncode, encoding);
  const prefix = Buffer.from(
    `\u0019Ethereum Signed Message:\n${encodedMessage.length.toString()}`,
    'utf-8',
  );
  return keccak256(Buffer.concat([prefix, encodedMessage]));
}

/**
 * Creates digest of an EVM SignTypedData message to be signed.
 *
 * @param message - The EVM SignTypedData message.
 * @param version - The SignTypedData version.
 * @returns The digest of the personal sign message as a Buffer.
 */
export function createSignTypedDataDigest(
  message: TypedMessage<MessageTypes>,
  version: SignTypedDataVersion.V3 | SignTypedDataVersion.V4,
): Buffer {
  return TypedDataUtils.eip712Hash(message, version);
}

/**
 * Calculates adjusted and completed signature value as a hex string.
 *
 * @param digest - The digest that produced the signature.
 * @param signature - The signature value in bytes.
 * @param address - The address corresponding to the private key that produced the signature.
 * @returns The adjusted signature value as a hex string.
 */
export function getAdjustedSignature(
  digest: Buffer,
  signature: Buffer,
  address: string,
): string {
  if (signature.length !== 64) {
    throw new Error(`Signature has invalid length: ${signature.length}`);
  }
  const rValue = signature.slice(0, 32);
  const sValue = adjustSignatureSValue(signature.slice(32, 64));
  const vValue = retrieveV(digest, rValue, sValue, address);
  return `0x${rValue.toString('hex')}${sValue.toString('hex')}${vValue.toString(
    'hex',
  )}`;
}

/**
 * Adjusts signature s value to low-s if necessary.
 *
 * @param sValue - The signature s value.
 * @returns The adjusted s value.
 */
function adjustSignatureSValue(sValue: Buffer) {
  if (sValue.length < 32) {
    return sValue;
  }

  const sValueHex = sValue.toString('hex');
  const bigIntSValue = BigInt(`0x${sValueHex}`);
  const groupOrder = BigInt(EC_GROUP_ORDER);
  const groupOrderDiv2 = groupOrder / 2n;

  if (bigIntSValue - groupOrderDiv2 <= 0) {
    return sValue;
  }
  const adjustedSValue = groupOrder - bigIntSValue;
  const paddedSValue = adjustedSValue.toString(16).padStart(64, '0');
  return Buffer.from(paddedSValue, 'hex');
}

/**
 * Deduces the v value used to produce the signature based on the address.
 *
 * @param digest - The digest that produced the signature.
 * @param rValue - The signature r value.
 * @param sValue - The signature s value.
 * @param address - The address corresponding to the private key that produced the signature.
 * @returns The signature v value.
 */
function retrieveV(
  digest: Buffer,
  rValue: Buffer,
  sValue: Buffer,
  address: string,
): Buffer {
  const recovered27pub = ecrecover(digest, 27, rValue, sValue);
  const recovered28pub = ecrecover(digest, 28, rValue, sValue);
  const recovered27address = add0x(
    pubToAddress(recovered27pub).toString('hex').toLowerCase(),
  );
  const recovered28address = add0x(
    pubToAddress(recovered28pub).toString('hex').toLowerCase(),
  );

  if (recovered27address === address.toLowerCase()) {
    return numToHexBuffer(27);
  } else if (recovered28address === address.toLowerCase()) {
    return numToHexBuffer(28);
  }
  throw new Error('cannot retrieve v signature value');
}
