import { z } from 'zod';

import {
  SOLANA_MAINNET_BETA_GENESIS_HASH,
  type RpcFetch,
} from '../chain/network.js';

export const SOLANA_MAINNET_USDC_MINT =
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_LEGACY_TOKEN_PROGRAM_ID =
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const MPL_AGENT_TOOLS_PROGRAM_ID =
  'TLREGni9ZEyGC3vnPZtqUh95xQ8oPqJSvNjvB7FGK8S';
export const BPF_UPGRADEABLE_LOADER_ID =
  'BPFLoaderUpgradeab1e11111111111111111111111';
export const USDC_DECIMALS = 6;

export const GOAL_9_MAX_USDC_BASE_UNITS = 1_000_000n;
export const GOAL_9_MAX_SOL_RESERVE_LAMPORTS = 20_000_000n;
export const GOAL_9_MAX_ACQUISITION_COST_USD_CENTS = 1_000n;

const MainnetReadinessEnvironmentSchema = z
  .object({
    WALLET_CHILD_MAINNET_READ_RPC_URL: z.string().url(),
  })
  .strict();

const RpcErrorSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});

const GenesisResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(1),
  result: z.string().min(1),
});

const MintResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(2),
  result: z.object({
    value: z
      .object({
        executable: z.literal(false),
        owner: z.string(),
        data: z.object({
          program: z.literal('spl-token'),
          parsed: z.object({
            type: z.literal('mint'),
            info: z.object({
              decimals: z.number().int(),
              isInitialized: z.boolean(),
              supply: z.string().regex(/^\d+$/),
            }),
          }),
        }),
      })
      .nullable(),
  }),
});

const ProgramResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(3),
  result: z.object({
    value: z
      .object({
        executable: z.boolean(),
        owner: z.string(),
      })
      .nullable(),
  }),
});

export type MainnetReadinessConfig = Readonly<{
  rpcUrl: string;
  rpcOrigin: string;
}>;

export type VerifiedMainnetReadiness = Readonly<{
  network: 'mainnet-beta';
  genesisHash: typeof SOLANA_MAINNET_BETA_GENESIS_HASH;
  rpcOrigin: string;
  usdc: Readonly<{
    mint: typeof SOLANA_MAINNET_USDC_MINT;
    owner: typeof SOLANA_LEGACY_TOKEN_PROGRAM_ID;
    decimals: typeof USDC_DECIMALS;
    initialized: true;
  }>;
  agentTools: Readonly<{
    programId: typeof MPL_AGENT_TOOLS_PROGRAM_ID;
    executable: true;
  }>;
}>;

export class MainnetReadinessError extends Error {
  override readonly name = 'MainnetReadinessError';
}

export function parseMainnetReadinessConfig(
  environment: NodeJS.ProcessEnv,
): MainnetReadinessConfig {
  const parsed = MainnetReadinessEnvironmentSchema.safeParse({
    WALLET_CHILD_MAINNET_READ_RPC_URL:
      environment['WALLET_CHILD_MAINNET_READ_RPC_URL'],
  });
  if (!parsed.success) {
    throw new MainnetReadinessError(
      'Set WALLET_CHILD_MAINNET_READ_RPC_URL to an HTTPS Solana Mainnet read endpoint.',
    );
  }

  const rpcUrl = new URL(parsed.data.WALLET_CHILD_MAINNET_READ_RPC_URL);
  if (rpcUrl.protocol !== 'https:') {
    throw new MainnetReadinessError(
      'The Mainnet read-only RPC endpoint must use HTTPS.',
    );
  }
  return Object.freeze({
    rpcUrl: rpcUrl.toString(),
    rpcOrigin: rpcUrl.origin,
  });
}

async function rpcRequest(
  config: MainnetReadinessConfig,
  id: 1 | 2 | 3,
  method: 'getGenesisHash' | 'getAccountInfo',
  params: readonly unknown[],
  fetchRpc: RpcFetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchRpc(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new MainnetReadinessError(
      `Unable to read Mainnet RPC at ${config.rpcOrigin}.`,
    );
  }

  if (!response.ok) {
    throw new MainnetReadinessError(
      `Mainnet RPC read failed at ${config.rpcOrigin} with HTTP ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MainnetReadinessError(
      `Mainnet RPC at ${config.rpcOrigin} returned invalid JSON.`,
    );
  }
  const rpcError = RpcErrorSchema.safeParse(payload);
  if (rpcError.success) {
    throw new MainnetReadinessError(
      `Mainnet RPC read failed with code ${rpcError.data.error.code}.`,
    );
  }
  return payload;
}

export async function verifyMainnetReadiness(
  config: MainnetReadinessConfig,
  fetchRpc: RpcFetch = globalThis.fetch,
): Promise<VerifiedMainnetReadiness> {
  const genesisPayload = await rpcRequest(
    config,
    1,
    'getGenesisHash',
    [],
    fetchRpc,
  );
  const genesis = GenesisResponseSchema.safeParse(genesisPayload);
  if (
    !genesis.success ||
    genesis.data.result !== SOLANA_MAINNET_BETA_GENESIS_HASH
  ) {
    throw new MainnetReadinessError(
      'Refusing RPC whose genesis hash does not match Solana Mainnet Beta.',
    );
  }

  const mintPayload = await rpcRequest(
    config,
    2,
    'getAccountInfo',
    [
      SOLANA_MAINNET_USDC_MINT,
      { encoding: 'jsonParsed', commitment: 'finalized' },
    ],
    fetchRpc,
  );
  const mint = MintResponseSchema.safeParse(mintPayload);
  const mintAccount = mint.success ? mint.data.result.value : null;
  if (
    !mintAccount ||
    mintAccount.owner !== SOLANA_LEGACY_TOKEN_PROGRAM_ID ||
    mintAccount.data.parsed.info.decimals !== USDC_DECIMALS ||
    !mintAccount.data.parsed.info.isInitialized
  ) {
    throw new MainnetReadinessError(
      'The authoritative Solana USDC address is not the expected initialized 6-decimal legacy SPL mint.',
    );
  }

  const toolsPayload = await rpcRequest(
    config,
    3,
    'getAccountInfo',
    [
      MPL_AGENT_TOOLS_PROGRAM_ID,
      { encoding: 'base64', commitment: 'finalized' },
    ],
    fetchRpc,
  );
  const tools = ProgramResponseSchema.safeParse(toolsPayload);
  const toolsAccount = tools.success ? tools.data.result.value : null;
  if (
    !toolsAccount?.executable ||
    toolsAccount.owner !== BPF_UPGRADEABLE_LOADER_ID
  ) {
    throw new MainnetReadinessError(
      'The expected Metaplex Agent Tools program is not executable on Mainnet.',
    );
  }

  return Object.freeze({
    network: 'mainnet-beta',
    genesisHash: SOLANA_MAINNET_BETA_GENESIS_HASH,
    rpcOrigin: config.rpcOrigin,
    usdc: Object.freeze({
      mint: SOLANA_MAINNET_USDC_MINT,
      owner: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
      decimals: USDC_DECIMALS,
      initialized: true,
    }),
    agentTools: Object.freeze({
      programId: MPL_AGENT_TOOLS_PROGRAM_ID,
      executable: true,
    }),
  });
}
