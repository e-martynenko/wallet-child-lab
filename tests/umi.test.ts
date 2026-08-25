import { describe, expect, it, vi } from 'vitest';

import type { WalletChildConfig } from '../src/config/env.js';
import { createVerifiedDevnetUmi } from '../src/chain/umi.js';
import {
  SOLANA_DEVNET_GENESIS_HASH,
  type RpcFetch,
} from '../src/chain/network.js';

const config: WalletChildConfig = Object.freeze({
  network: 'devnet',
  rpcUrl: 'https://rpc.example.test/?api-key=must-not-leak',
  rpcOrigin: 'https://rpc.example.test',
});

describe('createVerifiedDevnetUmi', () => {
  it('registers only after the Devnet check succeeds', async () => {
    const fetchRpc = vi.fn<RpcFetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: SOLANA_DEVNET_GENESIS_HASH,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const { umi, verification } = await createVerifiedDevnetUmi(
      config,
      fetchRpc,
    );

    expect(verification.genesisHash).toBe(SOLANA_DEVNET_GENESIS_HASH);
    expect(umi.programs.get('mplCore').publicKey).toBe(
      'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d',
    );
    expect(umi.programs.get('mplAgentIdentity').publicKey).toBe(
      '1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p',
    );
    expect(umi.programs.get('mplAgentTools').publicKey).toBe(
      'TLREGni9ZEyGC3vnPZtqUh95xQ8oPqJSvNjvB7FGK8S',
    );
    expect(umi.programs.get('splToken').publicKey).toBe(
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    );
    expect(umi.programs.get('splToken2022').publicKey).toBe(
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    );
  });
});
