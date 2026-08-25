import { createHash } from 'node:crypto';

import { mplToolbox, transferSol } from '@metaplex-foundation/mpl-toolbox';
import {
  createNoopSigner,
  lamports,
  publicKey,
  type Transaction,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { z } from 'zod';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../chain/network.js';
import { GOAL_9_MAX_SOL_RESERVE_LAMPORTS } from '../mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';
import {
  GOAL_9L_FUNDING_SOURCE,
  GOAL_9L_WALLET_CHILD_OWNER,
} from '../goal9l/funding-route.js';

export const GOAL_9M_BOOTSTRAP_FEE_LAMPORTS = 5_000n;
export const GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS = 5_000n;
export const GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS =
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS -
  GOAL_9M_BOOTSTRAP_FEE_LAMPORTS -
  GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS;

const PUBLIC_SOLANA_RPC_HOSTS = new Set([
  'api.mainnet-beta.solana.com',
  'api.mainnet.solana.com',
  'api.devnet.solana.com',
  'api.testnet.solana.com',
]);

const RpcErrorSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});

const GenesisResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(1),
  result: z.string(),
});

const LatestBlockhashResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(2),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.object({
      blockhash: z.string().min(32).max(44),
      lastValidBlockHeight: z.number().int().positive(),
    }),
  }),
});

const FeeResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(3),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
  }),
});

export type BootstrapFeeConfig = Readonly<{
  rpcUrl: string;
  rpcOrigin: string;
}>;

export type UnsignedBootstrapMessage = Readonly<{
  transaction: Transaction;
  messageBase64: string;
  messageSha256: string;
  source: typeof GOAL_9L_FUNDING_SOURCE;
  destination: typeof GOAL_9L_WALLET_CHILD_OWNER;
  transferLamports: typeof GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS;
}>;

export type BootstrapFeeEvidence = Readonly<{
  network: 'mainnet-beta';
  rpcOrigin: string;
  blockhashContextSlot: number;
  feeContextSlot: number;
  lastValidBlockHeight: number;
  messageSha256: string;
  source: typeof GOAL_9L_FUNDING_SOURCE;
  destination: typeof GOAL_9L_WALLET_CHILD_OWNER;
  transferLamports: typeof GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS;
  quotedFeeLamports: typeof GOAL_9M_BOOTSTRAP_FEE_LAMPORTS;
  futureUsdcFundingFeeReserveLamports:
    typeof GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS;
  totalExperimentSolBoundaryLamports: typeof GOAL_9_MAX_SOL_RESERVE_LAMPORTS;
  unsigned: true;
  keyLoaded: false;
  simulationAttempted: false;
  transactionSubmitted: false;
}>;

export class BootstrapFeeError extends Error {
  override readonly name = 'BootstrapFeeError';
}

export function parseBootstrapFeeConfig(
  environment: NodeJS.ProcessEnv,
): BootstrapFeeConfig {
  const rawUrl = environment['WALLET_CHILD_MAINNET_RPC_URL'];
  if (!rawUrl) {
    throw new BootstrapFeeError('A dedicated Mainnet RPC URL is required.');
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BootstrapFeeError('The Mainnet RPC URL is invalid.');
  }
  if (
    url.protocol !== 'https:' ||
    PUBLIC_SOLANA_RPC_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new BootstrapFeeError(
      'Bootstrap fee quote requires a dedicated HTTPS Mainnet RPC.',
    );
  }
  if (/^\/{2,}$/.test(url.pathname)) {
    url.pathname = '/';
  }
  return Object.freeze({ rpcUrl: url.toString(), rpcOrigin: url.origin });
}

function assertBootstrapInstruction(transaction: Transaction): void {
  const message = transaction.message;
  const instruction = message.instructions[0];
  if (
    message.version !== 'legacy' ||
    message.header.numRequiredSignatures !== 1 ||
    message.header.numReadonlySignedAccounts !== 0 ||
    message.header.numReadonlyUnsignedAccounts !== 1 ||
    message.accounts.length !== 3 ||
    String(message.accounts[0]) !== GOAL_9L_FUNDING_SOURCE ||
    String(message.accounts[1]) !== GOAL_9L_WALLET_CHILD_OWNER ||
    String(message.accounts[2]) !== SYSTEM_PROGRAM_ID ||
    message.instructions.length !== 1 ||
    !instruction ||
    instruction.programIndex !== 2 ||
    instruction.accountIndexes.length !== 2 ||
    instruction.accountIndexes[0] !== 0 ||
    instruction.accountIndexes[1] !== 1 ||
    instruction.data.length !== 12
  ) {
    throw new BootstrapFeeError('Unsigned bootstrap message shape changed.');
  }
  const view = new DataView(
    instruction.data.buffer,
    instruction.data.byteOffset,
    instruction.data.byteLength,
  );
  if (
    view.getUint32(0, true) !== 2 ||
    view.getBigUint64(4, true) !== GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS
  ) {
    throw new BootstrapFeeError('Unsigned bootstrap transfer data changed.');
  }
}

export function buildUnsignedBootstrapMessage(
  blockhash: string,
): UnsignedBootstrapMessage {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(blockhash)) {
    throw new BootstrapFeeError('Latest blockhash is malformed.');
  }
  const umi = createUmi('http://127.0.0.1:8899').use(mplToolbox());
  const source = createNoopSigner(publicKey(GOAL_9L_FUNDING_SOURCE));
  const transaction = transferSol(umi, {
    source,
    destination: publicKey(GOAL_9L_WALLET_CHILD_OWNER),
    amount: lamports(GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS),
  })
    .setFeePayer(source)
    .useLegacyVersion()
    .setBlockhash(blockhash)
    .build(umi);
  assertBootstrapInstruction(transaction);
  const messageBase64 = Buffer.from(transaction.serializedMessage).toString(
    'base64',
  );
  return Object.freeze({
    transaction,
    messageBase64,
    messageSha256: createHash('sha256')
      .update(transaction.serializedMessage)
      .digest('hex'),
    source: GOAL_9L_FUNDING_SOURCE,
    destination: GOAL_9L_WALLET_CHILD_OWNER,
    transferLamports: GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS,
  });
}

async function rpcRequest(
  config: BootstrapFeeConfig,
  id: 1 | 2 | 3,
  method: 'getGenesisHash' | 'getLatestBlockhash' | 'getFeeForMessage',
  params: readonly unknown[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new BootstrapFeeError(
      `Mainnet RPC read failed at ${config.rpcOrigin}.`,
    );
  }
  if (!response.ok) {
    throw new BootstrapFeeError(
      `Mainnet RPC read failed with HTTP ${response.status}.`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new BootstrapFeeError('Mainnet RPC returned invalid JSON.');
  }
  const rpcError = RpcErrorSchema.safeParse(payload);
  if (rpcError.success) {
    throw new BootstrapFeeError(
      `Mainnet RPC read failed with code ${rpcError.data.error.code}.`,
    );
  }
  return payload;
}

export async function quoteUnsignedBootstrapFee(
  config: BootstrapFeeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<BootstrapFeeEvidence> {
  const genesisPayload = await rpcRequest(
    config,
    1,
    'getGenesisHash',
    [],
    fetchImpl,
  );
  const genesis = GenesisResponseSchema.safeParse(genesisPayload);
  if (
    !genesis.success ||
    genesis.data.result !== SOLANA_MAINNET_BETA_GENESIS_HASH
  ) {
    throw new BootstrapFeeError('RPC genesis hash is not Solana Mainnet.');
  }

  const blockhashPayload = await rpcRequest(
    config,
    2,
    'getLatestBlockhash',
    [{ commitment: 'finalized' }],
    fetchImpl,
  );
  const blockhash = LatestBlockhashResponseSchema.safeParse(blockhashPayload);
  if (!blockhash.success) {
    throw new BootstrapFeeError('Mainnet RPC returned an invalid blockhash.');
  }
  const message = buildUnsignedBootstrapMessage(
    blockhash.data.result.value.blockhash,
  );

  const feePayload = await rpcRequest(
    config,
    3,
    'getFeeForMessage',
    [
      message.messageBase64,
      {
        commitment: 'finalized',
        minContextSlot: blockhash.data.result.context.slot,
      },
    ],
    fetchImpl,
  );
  const fee = FeeResponseSchema.safeParse(feePayload);
  if (
    !fee.success ||
    fee.data.result.value === null ||
    fee.data.result.context.slot < blockhash.data.result.context.slot
  ) {
    throw new BootstrapFeeError('Mainnet RPC did not quote the exact message.');
  }
  const quotedFeeLamports = BigInt(fee.data.result.value);
  if (quotedFeeLamports !== GOAL_9M_BOOTSTRAP_FEE_LAMPORTS) {
    throw new BootstrapFeeError(
      'Bootstrap fee changed; the fixed 0.02 SOL allocation must be reworked.',
    );
  }

  return Object.freeze({
    network: 'mainnet-beta',
    rpcOrigin: config.rpcOrigin,
    blockhashContextSlot: blockhash.data.result.context.slot,
    feeContextSlot: fee.data.result.context.slot,
    lastValidBlockHeight: blockhash.data.result.value.lastValidBlockHeight,
    messageSha256: message.messageSha256,
    source: message.source,
    destination: message.destination,
    transferLamports: GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS,
    quotedFeeLamports: GOAL_9M_BOOTSTRAP_FEE_LAMPORTS,
    futureUsdcFundingFeeReserveLamports:
      GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS,
    totalExperimentSolBoundaryLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
    unsigned: true,
    keyLoaded: false,
    simulationAttempted: false,
    transactionSubmitted: false,
  });
}
