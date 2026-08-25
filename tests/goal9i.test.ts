import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  assertNoMainnetDelegates,
  MainnetDelegateAuditError,
  parseMainnetDelegateAuditConfig,
  SOLANA_MAINNET_GENESIS_HASH,
} from '../src/goal9i/mainnet-delegates.js';

const OWNER = '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';
const ASSET = '66aw2vNMJHk4xPjc6VAE9CPPahkEaj7EfpQFFuQuvTd2';

describe('Goal 9I dedicated Mainnet delegate-audit config', () => {
  it('accepts a dedicated HTTPS endpoint and exposes only its origin', () => {
    expect(
      parseMainnetDelegateAuditConfig(
        {
          WALLET_CHILD_MAINNET_RPC_URL:
            'https://user:secret@rpc.example.com/private/api-key?token=hidden',
          WALLET_CHILD_MAINNET_AGENT_ASSET: ASSET,
        },
        OWNER,
      ),
    ).toEqual({
      rpcUrl:
        'https://user:secret@rpc.example.com/private/api-key?token=hidden',
      rpcOrigin: 'https://rpc.example.com',
      asset: ASSET,
      expectedOwner: OWNER,
    });
  });

  it.each([
    'https://api.mainnet-beta.solana.com',
    'https://api.mainnet.solana.com',
    'https://api.devnet.solana.com',
    'http://rpc.example.com',
  ])('refuses public or non-HTTPS RPC %s', (rpcUrl) => {
    expect(() =>
      parseMainnetDelegateAuditConfig(
        {
          WALLET_CHILD_MAINNET_RPC_URL: rpcUrl,
          WALLET_CHILD_MAINNET_AGENT_ASSET: ASSET,
        },
        OWNER,
      ),
    ).toThrow(MainnetDelegateAuditError);
  });

  it('refuses missing or invalid final asset input', () => {
    expect(() => parseMainnetDelegateAuditConfig({}, OWNER)).toThrow(
      MainnetDelegateAuditError,
    );
    expect(() =>
      parseMainnetDelegateAuditConfig(
        {
          WALLET_CHILD_MAINNET_RPC_URL: 'https://rpc.example.com',
          WALLET_CHILD_MAINNET_AGENT_ASSET: 'not-a-key',
        },
        OWNER,
      ),
    ).toThrow(MainnetDelegateAuditError);
  });
});

describe('Goal 9I zero-delegate verdict and source isolation', () => {
  it('accepts zero and blocks funding on any active record', () => {
    expect(() => assertNoMainnetDelegates(0)).not.toThrow();
    expect(() => assertNoMainnetDelegates(1)).toThrow(MainnetDelegateAuditError);
  });

  it('pins the Solana Mainnet genesis hash', () => {
    expect(SOLANA_MAINNET_GENESIS_HASH).toBe(
      '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    );
  });

  it('contains no key loading, transaction builder, simulation, signing, or send path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal9i/mainnet-delegates.ts', 'utf8'),
        readFile('src/cli/audit-delegates-mainnet.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /loadOrCreate|Keypair|Signer|TransactionBuilder|simulateTransaction|signTransaction|sendTransaction|sendAndConfirm|\.sendAndConfirm\(/i,
    );
  });
});
