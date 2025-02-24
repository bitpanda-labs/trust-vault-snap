import { Buffer } from 'buffer';

/**
 * Throws an error with the specified message.
 *
 * @param message - The error message.
 */
export function throwError(message: string): never {
  throw new Error(message);
}

/**
 * Converts a number to a Buffer with the appropriate padding.
 *
 * @param input - The number.
 * @returns The Buffer.
 */
export function numToHexBuffer(input: number): Buffer {
  const hexStr = input.toString(16);
  const paddedStr = hexStr.padStart(hexStr.length + (hexStr.length % 2), '0');
  return Buffer.from(paddedStr, 'hex');
}
