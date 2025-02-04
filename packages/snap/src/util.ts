import { Buffer } from 'buffer';

import { SnapMode } from './types';

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

/**
 * Validates input for updateSnapMode and returns the provided mode.
 *
 * @param params - The updateSnapMode input.
 * @returns The updated mode.
 */
export function getUpdatedMode(params: any): SnapMode {
  if (typeof params !== 'object' || Array.isArray(params) || params === null) {
    throw new Error('Update snap mode input must be an object');
  }
  if (!('mode' in params)) {
    throw new Error('Update snap mode input must contain a mode field');
  }
  if (!Object.values(SnapMode).includes(params.mode)) {
    throw new Error('Snap mode can only be "basic" or "enhanced"');
  }
  return params.mode;
}
