import { expect, jest } from '@jest/globals';
import { SignTypedDataVersion } from '@metamask/eth-sig-util';
import { Buffer } from 'buffer';
import { randomBytes } from 'crypto';
import { encrypt } from 'ecies-geth';

import {
  createPersonalSignDataDigest,
  createSignTypedDataDigest,
  decryptData,
  EC_GROUP_ORDER,
  generateEciesKeyPair,
  getAdjustedSignature,
  wrapKeyPairOperation,
} from './cryptography';
import type { EciesKeyPair } from './types';

const mockGenerateEntropy = jest.fn();
jest.mock('./snapApi', () => {
  return { generateEntropy: (...args: any) => mockGenerateEntropy(...args) };
});

describe('Cryptography utils', () => {
  describe('ECIES encryption', () => {
    it('generates a key-pair that can encrypt and decrypt a message', async () => {
      const entropy = randomBytes(32);
      const keyPair = await generateEciesKeyPair(entropy);
      const keyPair2 = await generateEciesKeyPair(entropy);
      expect(keyPair.privateKey.toString('hex')).toBe(
        keyPair2.privateKey.toString('hex'),
      );
      expect(keyPair.publicKey).toBe(keyPair2.publicKey);

      const message = 'secret_message';
      const pub = Buffer.from(keyPair.publicKey, 'hex');
      const encrypted = await encrypt(pub, Buffer.from(message, 'utf-8'));
      const encryptedHex = encrypted.toString('hex');
      const decrypted = await decryptData(keyPair.privateKey, encryptedHex);
      expect(decrypted.toString('utf-8')).toBe(message);
    });
  });

  describe('wrapKeyPairOperation', () => {
    it('generates a key-pair and executes the provided operation, then empty entropy', async () => {
      const salt = 'salt';
      const entropy = randomBytes(32);
      let privateKey: Buffer = Buffer.alloc(32);
      mockGenerateEntropy.mockImplementation(async () => entropy);
      const callback = jest.fn(async (keyPair: EciesKeyPair) => {
        privateKey = keyPair.privateKey;
        expect(privateKey).not.toStrictEqual(Buffer.alloc(32));
        return 'output';
      });
      const output = await wrapKeyPairOperation(salt, callback);
      expect(output).toBe('output');
      expect(callback).toHaveBeenCalledTimes(1);
      expect(entropy).toStrictEqual(Buffer.alloc(32));
      expect(privateKey).toStrictEqual(Buffer.alloc(32));
    });
  });

  describe('createPersonalSignDataDigest', () => {
    it('generates a keccak256 digest of the message', () => {
      const message = 'secret_message';
      const digest = createPersonalSignDataDigest(message);
      expect(digest).toHaveLength(32);
    });
  });

  describe('createSignTypedDataDigest', () => {
    it('generates a digest of the V3 message', () => {
      const messageV3 =
        '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Person":[{"name":"name","type":"string"},{"name":"wallet","type":"address"}],"Mail":[{"name":"from","type":"Person"},{"name":"to","type":"Person"},{"name":"contents","type":"string"}]},"primaryType":"Mail","domain":{"name":"Ether Mail","version":"1","chainId":17000,"verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"},"message":{"from":{"name":"Cow","wallet":"0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"},"to":{"name":"Bob","wallet":"0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"},"contents":"Hello, Bob!"}}';
      const digest = createSignTypedDataDigest(
        JSON.parse(messageV3),
        SignTypedDataVersion.V3,
      );
      expect(digest).toHaveLength(32);
    });

    it('generates a digest of the V4 message', () => {
      const messageV4 =
        '{"domain":{"chainId":"17000","name":"Ether Mail","verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC","version":"1"},"message":{"isContract":true,"contents":"Hello, Bob!","from":{"name":"Cow","wallets":["0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826","0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF"]},"to":[{"name":"Bob","wallets":["0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB","0xB0BdaBea57B0BDABeA57b0bdABEA57b0BDabEa57","0xB0B0b0b0b0b0B000000000000000000000000000"]}]},"primaryType":"Mail","types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Group":[{"name":"name","type":"string"},{"name":"members","type":"Person[]"}],"Mail":[{"name":"from","type":"Person"},{"name":"to","type":"Person[]"},{"name":"contents","type":"string"},{"name":"isContract","type":"bool"}],"Person":[{"name":"name","type":"string"},{"name":"wallets","type":"address[]"}]}}';
      const digest = createSignTypedDataDigest(
        JSON.parse(messageV4),
        SignTypedDataVersion.V4,
      );
      expect(digest).toHaveLength(32);
    });

    it('generates the digest of a message with an array of bytes', () => {
      const message = {
        domain: {
          chainId: 17000,
          name: 'Ether Mail',
          verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
          version: '1',
        },
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          OrderCancellations: [{ name: 'orderUids', type: 'bytes[]' }],
        },
        primaryType: 'OrderCancellations',
        message: {
          orderUids: [
            '0xe1dce83b0cdd983994ae6b6b2238a28a106bc3f0154da898638451a814cc3ee8316be293c8f2380769e7b7e7382679fe5a3b660064d60dbe', // hex string
            'normalString', // normal string
            '0xdead', // normal string with hex prefix, should be treated as string
            '0x123', // hex string that needs padding
          ],
        },
      };

      const digest = createSignTypedDataDigest(
        message,
        SignTypedDataVersion.V4,
      ).toString('hex');
      expect(digest).toBe(
        'd337eb71e73a5f0f0171964b19bdb5527494e6755d168ad7520cc92c96efd03c',
      );
    });
  });

  describe('getAdjustedSignature', () => {
    const rValue =
      'ecd18717a895f58386cb13b9bd98e90ec753bffbec4e4d6ac28d25a256f28d17';
    const sValue =
      '751d382500fbee06e1028d481cf14c2e46a0fc2a86db9bb10274c8faef2a75d9';
    const vValue = '1c';
    const digest =
      'af1dee894786c304604a039b041463c9ab8defb393403ea03cf2c85b1eb8cbfd';
    const digestBytes = Buffer.from(digest, 'hex');
    const address = '0xDE6dB0d4814965Ee8aC35d9b28B055Ee36925535';

    it('throws an error if the signature has incorrect length', () => {
      const fakeSig = randomBytes(100);
      expect(() => getAdjustedSignature(digestBytes, fakeSig, address)).toThrow(
        `Signature has invalid length: 100`,
      );
    });

    it('returns a signature string with correct v value', () => {
      const signature = `${rValue}${sValue}`;
      const signatureBytes = Buffer.from(signature, 'hex');
      const signatureString = getAdjustedSignature(
        digestBytes,
        signatureBytes,
        address,
      );
      expect(signatureString.startsWith('0x')).toBe(true);
      expect(signatureString.slice(2, 66)).toBe(rValue);
      expect(signatureString.slice(66, 130)).toBe(sValue);
      expect(signatureString.slice(130, 132)).toBe(vValue);
    });

    it('returns a signature string with adjusted s value', () => {
      const groupOrder = BigInt(EC_GROUP_ORDER);
      const sValueBigInt = BigInt(`0x${sValue}`);
      const bigSValue = (groupOrder - sValueBigInt).toString(16);
      const signature = `${rValue}${bigSValue}`;
      const signatureBytes = Buffer.from(signature, 'hex');
      const signatureString = getAdjustedSignature(
        digestBytes,
        signatureBytes,
        address,
      );
      expect(signatureString.slice(66, 130)).toBe(sValue);
    });

    it('throws an error if signature is wrong', () => {
      const wrongSValue =
        '851d382500fbee06e1028d481cf14c2e46a0fc2a86db9bb10274c8faef2a75d9';
      const signature = `${rValue}${wrongSValue}`;
      const signatureBytes = Buffer.from(signature, 'hex');
      expect(() =>
        getAdjustedSignature(digestBytes, signatureBytes, address),
      ).toThrow(`cannot retrieve v signature value`);
    });

    it('throws an error if the address is wrong', () => {
      const wrongAddress = '0x0c54FcCd2e384b4BB6f2E405Bf5Cbc15a017AaFb';
      const signature = `${rValue}${sValue}`;
      const signatureBytes = Buffer.from(signature, 'hex');
      expect(() =>
        getAdjustedSignature(digestBytes, signatureBytes, wrongAddress),
      ).toThrow(`cannot retrieve v signature value`);
    });
  });
});
