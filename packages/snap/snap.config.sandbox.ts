import type { SnapConfig } from '@metamask/snaps-cli';
import { resolve } from 'path';

const config: SnapConfig = {
  bundler: 'webpack',
  input: resolve(__dirname, 'src/index.ts'),
  server: {
    port: 8092,
  },
  polyfills: {
    buffer: true,
    crypto: true,
    console: true,
    process: true,
    assert: true,
    events: true,
    util: true,
    http: true,
    https: true,
    zlib: true,
    url: true,
    stream: true,
    string_decoder: true,
    punycode: true,
  },
  environment: {
    allowedOrigins: [
      'https://tvw-sandbox.bitpandacustody-test.com',
      'https://tvw-sandbox.trustology-test.com',
    ],
  },
};

export default config;
