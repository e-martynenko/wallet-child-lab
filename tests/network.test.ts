import { describe, expect, it, vi } from 'vitest';

import type { WalletChildConfig } from '../src/config/env.js';
import {
  NetworkSafetyError,
  SOLANA_DEVNET_GENESIS_HASH,
  SOLANA_MAINNET_BETA_GENESIS_HASH,
  verifyDevnetRpc,
  type RpcFetch,
} from '../src/chain/network.js';

const config: WalletChildConfig = Object.freeze({
  network: 'devnet',
  rpcUrl: 'https://rpc.example.test/?api-key=must-not-leak',
  rpcOrigin: 'https://rpc.example.test',
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('verifyDevnetRpc', () => {
  it('accepts only the canonical Devnet genesis hash', async () => {
    const fetchRpc = vi.fn<RpcFetch>().mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: SOLANA_DEVNET_GENESIS_HASH,
      }),
    );

    await expect(verifyDevnetRpc(config, fetchRpc)).resolves.toEqual({
      network: 'devnet',
      genesisHash: SOLANA_DEVNET_GENESIS_HASH,
      rpcOrigin: 'https://rpc.example.test',
    });

    expect(fetchRpc).toHaveBeenCalledOnce();
    const [, request] = fetchRpc.mock.calls[0] ?? [];
    expect(request?.method).toBe('POST');
    expect(request?.body).toBe(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getGenesisHash' }),
    );
  });

  it('refuses Mainnet even when configuration says Devnet', async () => {
    const fetchRpc = vi.fn<RpcFetch>().mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: SOLANA_MAINNET_BETA_GENESIS_HASH,
      }),
    );

    await expect(verifyDevnetRpc(config, fetchRpc)).rejects.toThrow(
      /Refusing non-Devnet RPC/,
    );
  });

  it('refuses an unexpected RPC response shape', async () => {
    const fetchRpc = vi
      .fn<RpcFetch>()
      .mockResolvedValue(jsonResponse({ result: SOLANA_DEVNET_GENESIS_HASH }));

    await expect(verifyDevnetRpc(config, fetchRpc)).rejects.toThrow(
      NetworkSafetyError,
    );
  });

  it('reports JSON-RPC errors without exposing the RPC credential', async () => {
    const fetchRpc = vi.fn<RpcFetch>().mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32000, message: 'upstream failure' },
      }),
    );

    const error = await verifyDevnetRpc(config, fetchRpc).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(NetworkSafetyError);
    expect(String(error)).not.toContain('must-not-leak');
    expect(String(error)).toContain('https://rpc.example.test');
  });

  it('refuses non-successful HTTP responses', async () => {
    const fetchRpc = vi
      .fn<RpcFetch>()
      .mockResolvedValue(jsonResponse({ message: 'unavailable' }, 503));

    await expect(verifyDevnetRpc(config, fetchRpc)).rejects.toThrow(/HTTP 503/);
  });
});
