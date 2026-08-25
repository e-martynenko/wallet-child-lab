import { createHash } from 'node:crypto';

import {
  findAssociatedTokenPda,
  mplToolbox,
  transferTokensChecked,
} from '@metaplex-foundation/mpl-toolbox';
import {
  createNoopSigner,
  publicKey,
  type Transaction,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { z } from 'zod';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../chain/network.js';
import {
  GOAL_9L_FUNDING_SOURCE,
  GOAL_9L_FUNDING_SOURCE_USDC_ATA,
} from '../goal9l/funding-route.js';
import {
  GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS,
  type BootstrapFeeConfig,
} from '../goal9m/bootstrap-fee.js';
import {
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
  USDC_DECIMALS,
} from '../mainnet/readiness.js';

export const GOAL_9O_ASSET_SIGNER =
  '5Snge43iBczUT16b4ndffdgB4xxR2Bev9vxvLRe5YWyu';
export const GOAL_9O_ASSET_SIGNER_USDC_ATA =
  'hCmisMZFRL7SWKvgdtFWXMTDW3PY858Kmvg6dQ8GQMU';
export const GOAL_9O_USDC_FUNDING_FEE_LAMPORTS =
  GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS;

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
    value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  }),
});

export type UnsignedUsdcFundingMessage = Readonly<{
  transaction: Transaction;
  messageBase64: string;
  messageSha256: string;
  sourceOwner: typeof GOAL_9L_FUNDING_SOURCE;
  sourceTokenAccount: typeof GOAL_9L_FUNDING_SOURCE_USDC_ATA;
  destinationOwner: typeof GOAL_9O_ASSET_SIGNER;
  destinationTokenAccount: typeof GOAL_9O_ASSET_SIGNER_USDC_ATA;
  mint: typeof SOLANA_MAINNET_USDC_MINT;
  amountBaseUnits: typeof GOAL_9_MAX_USDC_BASE_UNITS;
}>;

export type UsdcFundingFeeEvidence = Readonly<{
  network: 'mainnet-beta';
  rpcOrigin: string;
  blockhashContextSlot: number;
  feeContextSlot: number;
  lastValidBlockHeight: number;
  messageSha256: string;
  sourceOwner: typeof GOAL_9L_FUNDING_SOURCE;
  sourceTokenAccount: typeof GOAL_9L_FUNDING_SOURCE_USDC_ATA;
  destinationOwner: typeof GOAL_9O_ASSET_SIGNER;
  destinationTokenAccount: typeof GOAL_9O_ASSET_SIGNER_USDC_ATA;
  mint: typeof SOLANA_MAINNET_USDC_MINT;
  amountBaseUnits: typeof GOAL_9_MAX_USDC_BASE_UNITS;
  quotedFeeLamports: typeof GOAL_9O_USDC_FUNDING_FEE_LAMPORTS;
  unsigned: true;
  keyLoaded: false;
  simulationAttempted: false;
  transactionSubmitted: false;
}>;

export class UsdcFundingFeeError extends Error {
  override readonly name = 'UsdcFundingFeeError';
}

function assertCanonicalAccounts(): void {
  const umi = createUmi('http://127.0.0.1:8899').use(mplToolbox());
  const expectedSource = findAssociatedTokenPda(umi, {
    mint: publicKey(SOLANA_MAINNET_USDC_MINT),
    owner: publicKey(GOAL_9L_FUNDING_SOURCE),
  });
  const expectedDestination = findAssociatedTokenPda(umi, {
    mint: publicKey(SOLANA_MAINNET_USDC_MINT),
    owner: publicKey(GOAL_9O_ASSET_SIGNER),
  });
  if (
    String(expectedSource[0]) !== GOAL_9L_FUNDING_SOURCE_USDC_ATA ||
    String(expectedDestination[0]) !== GOAL_9O_ASSET_SIGNER_USDC_ATA
  ) {
    throw new UsdcFundingFeeError('USDC funding accounts are not canonical ATAs.');
  }
}

function assertFundingInstruction(transaction: Transaction): void {
  const message = transaction.message;
  const instruction = message.instructions[0];
  const expectedAccounts = [
    GOAL_9L_FUNDING_SOURCE,
    GOAL_9L_FUNDING_SOURCE_USDC_ATA,
    GOAL_9O_ASSET_SIGNER_USDC_ATA,
    SOLANA_LEGACY_TOKEN_PROGRAM_ID,
    SOLANA_MAINNET_USDC_MINT,
  ];
  if (
    message.version !== 'legacy' ||
    message.header.numRequiredSignatures !== 1 ||
    message.header.numReadonlySignedAccounts !== 0 ||
    message.header.numReadonlyUnsignedAccounts !== 2 ||
    message.accounts.map(String).join(',') !== expectedAccounts.join(',') ||
    message.instructions.length !== 1 ||
    !instruction ||
    instruction.programIndex !== 3 ||
    instruction.accountIndexes.join(',') !== '1,4,2,0' ||
    instruction.data.length !== 10
  ) {
    throw new UsdcFundingFeeError('Unsigned USDC funding message shape changed.');
  }
  const view = new DataView(
    instruction.data.buffer,
    instruction.data.byteOffset,
    instruction.data.byteLength,
  );
  if (
    instruction.data[0] !== 12 ||
    view.getBigUint64(1, true) !== GOAL_9_MAX_USDC_BASE_UNITS ||
    instruction.data[9] !== USDC_DECIMALS
  ) {
    throw new UsdcFundingFeeError('Unsigned USDC funding data changed.');
  }
}

export function buildUnsignedUsdcFundingMessage(
  blockhash: string,
): UnsignedUsdcFundingMessage {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(blockhash)) {
    throw new UsdcFundingFeeError('Latest blockhash is malformed.');
  }
  assertCanonicalAccounts();
  const umi = createUmi('http://127.0.0.1:8899').use(mplToolbox());
  const source = createNoopSigner(publicKey(GOAL_9L_FUNDING_SOURCE));
  const transaction = transferTokensChecked(umi, {
    source: publicKey(GOAL_9L_FUNDING_SOURCE_USDC_ATA),
    mint: publicKey(SOLANA_MAINNET_USDC_MINT),
    destination: publicKey(GOAL_9O_ASSET_SIGNER_USDC_ATA),
    authority: source,
    amount: GOAL_9_MAX_USDC_BASE_UNITS,
    decimals: USDC_DECIMALS,
  })
    .setFeePayer(source)
    .useLegacyVersion()
    .setBlockhash(blockhash)
    .build(umi);
  assertFundingInstruction(transaction);
  return Object.freeze({
    transaction,
    messageBase64: Buffer.from(transaction.serializedMessage).toString('base64'),
    messageSha256: createHash('sha256')
      .update(transaction.serializedMessage)
      .digest('hex'),
    sourceOwner: GOAL_9L_FUNDING_SOURCE,
    sourceTokenAccount: GOAL_9L_FUNDING_SOURCE_USDC_ATA,
    destinationOwner: GOAL_9O_ASSET_SIGNER,
    destinationTokenAccount: GOAL_9O_ASSET_SIGNER_USDC_ATA,
    mint: SOLANA_MAINNET_USDC_MINT,
    amountBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
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
    throw new UsdcFundingFeeError(`Mainnet RPC read failed at ${config.rpcOrigin}.`);
  }
  if (!response.ok) {
    throw new UsdcFundingFeeError(`Mainnet RPC read failed with HTTP ${response.status}.`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new UsdcFundingFeeError('Mainnet RPC returned invalid JSON.');
  }
  const rpcError = RpcErrorSchema.safeParse(payload);
  if (rpcError.success) {
    throw new UsdcFundingFeeError(
      `Mainnet RPC read failed with code ${rpcError.data.error.code}.`,
    );
  }
  return payload;
}

export async function quoteUnsignedUsdcFundingFee(
  config: BootstrapFeeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<UsdcFundingFeeEvidence> {
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
    throw new UsdcFundingFeeError('RPC genesis hash is not Solana Mainnet.');
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
    throw new UsdcFundingFeeError('Mainnet RPC returned an invalid blockhash.');
  }
  const message = buildUnsignedUsdcFundingMessage(
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
    throw new UsdcFundingFeeError('Mainnet RPC did not quote the exact message.');
  }
  const quotedFeeLamports = BigInt(fee.data.result.value);
  if (quotedFeeLamports !== GOAL_9O_USDC_FUNDING_FEE_LAMPORTS) {
    throw new UsdcFundingFeeError(
      'USDC funding fee changed; the fixed 0.02 SOL allocation must be reworked.',
    );
  }
  return Object.freeze({
    network: 'mainnet-beta',
    rpcOrigin: config.rpcOrigin,
    blockhashContextSlot: blockhash.data.result.context.slot,
    feeContextSlot: fee.data.result.context.slot,
    lastValidBlockHeight: blockhash.data.result.value.lastValidBlockHeight,
    messageSha256: message.messageSha256,
    sourceOwner: message.sourceOwner,
    sourceTokenAccount: message.sourceTokenAccount,
    destinationOwner: message.destinationOwner,
    destinationTokenAccount: message.destinationTokenAccount,
    mint: message.mint,
    amountBaseUnits: message.amountBaseUnits,
    quotedFeeLamports: GOAL_9O_USDC_FUNDING_FEE_LAMPORTS,
    unsigned: true,
    keyLoaded: false,
    simulationAttempted: false,
    transactionSubmitted: false,
  });
}
