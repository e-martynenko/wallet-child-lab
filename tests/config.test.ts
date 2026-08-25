import { describe, expect, it } from 'vitest';

import {
  parseWalletChildConfig,
  WalletChildConfigError,
} from '../src/config/env.js';

describe('parseWalletChildConfig', () => {
  it('accepts an explicit Devnet configuration', () => {
    const config = parseWalletChildConfig({
      WALLET_CHILD_NETWORK: 'devnet',
      WALLET_CHILD_RPC_URL:
        'https://rpc.example.test/secret-path?api-key=not-for-logs',
    });

    expect(config).toEqual({
      network: 'devnet',
      rpcUrl:
        'https://rpc.example.test/secret-path?api-key=not-for-logs',
      rpcOrigin: 'https://rpc.example.test',
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('fails when configuration is missing', () => {
    expect(() => parseWalletChildConfig({})).toThrow(
      WalletChildConfigError,
    );
  });

  it('refuses Mainnet as a configuration value', () => {
    expect(() =>
      parseWalletChildConfig({
        WALLET_CHILD_NETWORK: 'mainnet',
        WALLET_CHILD_RPC_URL: 'https://api.mainnet-beta.solana.com',
      }),
    ).toThrow(WalletChildConfigError);
  });

  it('refuses non-http RPC schemes', () => {
    expect(() =>
      parseWalletChildConfig({
        WALLET_CHILD_NETWORK: 'devnet',
        WALLET_CHILD_RPC_URL: 'file:///tmp/fake-rpc',
      }),
    ).toThrow(WalletChildConfigError);
  });

  it('fails closed on unknown namespaced variables', () => {
    expect(() =>
      parseWalletChildConfig({
        WALLET_CHILD_NETWORK: 'devnet',
        WALLET_CHILD_RPC_URL: 'https://api.devnet.solana.com',
        WALLET_CHILD_NETWROK: 'devnet',
      }),
    ).toThrow(/WALLET_CHILD_NETWROK/);
  });
});
