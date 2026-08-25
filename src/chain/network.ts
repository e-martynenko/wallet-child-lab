import { z } from 'zod';

import type { WalletChildConfig } from '../config/env.js';

export const SOLANA_DEVNET_GENESIS_HASH =
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';

export const SOLANA_MAINNET_BETA_GENESIS_HASH =
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

const GenesisHashSuccessSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.literal(1),
    result: z.string().min(1),
  })
  .strict();

const GenesisHashErrorSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.literal(1),
    error: z.object({
      code: z.number(),
      message: z.string(),
    }),
  })
  .passthrough();

export type VerifiedDevnet = Readonly<{
  network: 'devnet';
  genesisHash: typeof SOLANA_DEVNET_GENESIS_HASH;
  rpcOrigin: string;
}>;

export class NetworkSafetyError extends Error {
  override readonly name = 'NetworkSafetyError';
}

export type RpcFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function verifyDevnetRpc(
  config: WalletChildConfig,
  fetchRpc: RpcFetch = globalThis.fetch,
): Promise<VerifiedDevnet> {
  let response: Response;

  try {
    response = await fetchRpc(config.rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getGenesisHash',
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new NetworkSafetyError(
      `Unable to verify the RPC cluster at ${config.rpcOrigin}.`,
    );
  }

  if (!response.ok) {
    throw new NetworkSafetyError(
      `RPC cluster verification failed at ${config.rpcOrigin} with HTTP ${response.status}.`,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new NetworkSafetyError(
      `RPC cluster verification at ${config.rpcOrigin} returned invalid JSON.`,
    );
  }

  const rpcError = GenesisHashErrorSchema.safeParse(payload);

  if (rpcError.success) {
    throw new NetworkSafetyError(
      `RPC getGenesisHash failed at ${config.rpcOrigin} with code ${rpcError.data.error.code}.`,
    );
  }

  const parsed = GenesisHashSuccessSchema.safeParse(payload);

  if (!parsed.success) {
    throw new NetworkSafetyError(
      `RPC cluster verification at ${config.rpcOrigin} returned an unexpected response.`,
    );
  }

  if (parsed.data.result !== SOLANA_DEVNET_GENESIS_HASH) {
    throw new NetworkSafetyError(
      `Refusing non-Devnet RPC at ${config.rpcOrigin}. Genesis hash did not match Solana Devnet.`,
    );
  }

  return Object.freeze({
    network: 'devnet',
    genesisHash: SOLANA_DEVNET_GENESIS_HASH,
    rpcOrigin: config.rpcOrigin,
  });
}
