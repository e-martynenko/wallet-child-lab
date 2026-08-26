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
import { verifyGoal9CMetadataIntegrity } from '../goal9c/metadata.js';
import {
  type BootstrapFeeConfig,
  GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS,
} from '../goal9m/bootstrap-fee.js';
import {
  IRYS_MAINNET_ORIGIN,
  quoteFrozenMetadataOnIrys,
} from '../goal9k/irys-quote.js';
import { GOAL_9P_OWNER } from '../goal9p/final-contract.js';
import { verifyFixedRentPlan } from '../goal9q/fixed-rent-plan.js';
import { GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS } from '../goal9r/internal-message-fees.js';
import { GOAL_9_MAX_SOL_RESERVE_LAMPORTS } from '../mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';

export const GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS = 19_985_000n;
export const GOAL_10D_EXPECTED_IRYS_VERSION = '0.2.0';
export const GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS =
  '9NERQjLetzquGwdKt3X4gZ8fE8fPfSkj2xo2esmUjWsz';
export const GOAL_10D_IRYS_GATEWAY_ORIGIN = 'https://gateway.irys.xyz';
export const GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS = 5_000n;
export const GOAL_10D_ACTUAL_BOOTSTRAP_FEE_LAMPORTS = 5_001n;

const PublicKeySchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const IrysInfoSchema = z
  .object({
    version: z.string(),
    addresses: z.object({ solana: PublicKeySchema }).passthrough(),
  })
  .passthrough();
const IrysBalanceSchema = z.object({ balance: z.string().regex(/^\d+$/) }).passthrough();
const RpcErrorSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});
const RpcEnvelopeSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.number().int(),
  result: z.unknown(),
});
const ContextValueSchema = z.object({
  context: z.object({ slot: z.number().int().positive() }),
  value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const LatestBlockhashSchema = z.object({
  context: z.object({ slot: z.number().int().positive() }),
  value: z.object({
    blockhash: z.string().min(32).max(44),
    lastValidBlockHeight: z.number().int().positive(),
  }),
});
const FeeSchema = z.object({
  context: z.object({ slot: z.number().int().positive() }),
  value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
});

type RpcMethod =
  | 'getGenesisHash'
  | 'getSlot'
  | 'getBalance'
  | 'getMinimumBalanceForRentExemption'
  | 'getLatestBlockhash'
  | 'getFeeForMessage';

export type UnsignedIrysFundingMessage = Readonly<{
  transaction: Transaction;
  messageBase64: string;
  messageSha256: string;
  source: typeof GOAL_9P_OWNER;
  destination: typeof GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS;
  transferLamports: bigint;
}>;

export type MetadataPublicationPlan = Readonly<{
  network: 'mainnet-beta';
  rpcOrigin: string;
  finalizedSlot: number;
  owner: typeof GOAL_9P_OWNER;
  ownerBalanceLamports: typeof GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS;
  metadataSha256: string;
  metadataByteLength: number;
  irysVersion: typeof GOAL_10D_EXPECTED_IRYS_VERSION;
  irysFundingAddress: typeof GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS;
  irysGatewayOrigin: typeof GOAL_10D_IRYS_GATEWAY_ORIGIN;
  irysExistingBalanceLamports: 0n;
  storageQuoteLamports: bigint;
  fundingTransferLamports: bigint;
  fundingFeeLamports: typeof GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS;
  fundingMessageSha256: string;
  blockhashContextSlot: number;
  feeContextSlot: number;
  lastValidBlockHeight: number;
  fixedRentLamports: bigint;
  internalFeeLamports: typeof GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS;
  metadataPublicationLamports: bigint;
  knownOwnerCostsLamports: bigint;
  ownerAfterKnownCostsLamports: bigint;
  actualAcquisitionAllocationLamports: bigint;
  unallocatedAcquisitionBoundaryLamports: bigint;
  missing: Readonly<{
    coreAssetRentAndIdentityPluginTopUp: true;
    uriDependentAssetAndIdentityFees: true;
    liveSolRescueFeeAndAmount: true;
    sameSignedBytesSimulations: true;
  }>;
  unsigned: true;
  keyLoaded: false;
  fundingAttempted: false;
  uploadAttempted: false;
  transactionSubmitted: false;
  verdict: 'STOP_READY_FOR_GOAL_10E_IMPLEMENTATION_REVIEW';
}>;

export class MetadataPublicationPlanError extends Error {
  override readonly name = 'MetadataPublicationPlanError';
}

function parseAtomic(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > 30) {
    throw new MetadataPublicationPlanError(`${label} is malformed.`);
  }
  return BigInt(value);
}

function assertFundingInstruction(
  transaction: Transaction,
  amount: bigint,
): void {
  const message = transaction.message;
  const instruction = message.instructions[0];
  if (
    amount <= 0n ||
    message.version !== 'legacy' ||
    message.header.numRequiredSignatures !== 1 ||
    message.header.numReadonlySignedAccounts !== 0 ||
    message.header.numReadonlyUnsignedAccounts !== 1 ||
    message.accounts.length !== 3 ||
    String(message.accounts[0]) !== GOAL_9P_OWNER ||
    String(message.accounts[1]) !== GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS ||
    String(message.accounts[2]) !== SYSTEM_PROGRAM_ID ||
    message.instructions.length !== 1 ||
    !instruction ||
    instruction.programIndex !== 2 ||
    instruction.accountIndexes.length !== 2 ||
    instruction.accountIndexes[0] !== 0 ||
    instruction.accountIndexes[1] !== 1 ||
    instruction.data.length !== 12
  ) {
    throw new MetadataPublicationPlanError(
      'Unsigned Irys funding message shape changed.',
    );
  }
  const view = new DataView(
    instruction.data.buffer,
    instruction.data.byteOffset,
    instruction.data.byteLength,
  );
  if (view.getUint32(0, true) !== 2 || view.getBigUint64(4, true) !== amount) {
    throw new MetadataPublicationPlanError(
      'Unsigned Irys funding transfer data changed.',
    );
  }
}

export function buildUnsignedIrysFundingMessage(
  blockhash: string,
  amount: bigint,
): UnsignedIrysFundingMessage {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(blockhash)) {
    throw new MetadataPublicationPlanError('Latest blockhash is malformed.');
  }
  const umi = createUmi('http://127.0.0.1:8899').use(mplToolbox());
  const source = createNoopSigner(publicKey(GOAL_9P_OWNER));
  const transaction = transferSol(umi, {
    source,
    destination: publicKey(GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS),
    amount: lamports(amount),
  })
    .setFeePayer(source)
    .useLegacyVersion()
    .setBlockhash(blockhash)
    .build(umi);
  assertFundingInstruction(transaction, amount);
  const messageBase64 = Buffer.from(transaction.serializedMessage).toString(
    'base64',
  );
  return Object.freeze({
    transaction,
    messageBase64,
    messageSha256: createHash('sha256')
      .update(transaction.serializedMessage)
      .digest('hex'),
    source: GOAL_9P_OWNER,
    destination: GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
    transferLamports: amount,
  });
}

async function readJson(url: URL, fetchImpl: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new MetadataPublicationPlanError('Irys read failed.');
  }
  if (!response.ok) {
    throw new MetadataPublicationPlanError(
      `Irys read failed with HTTP ${response.status}.`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new MetadataPublicationPlanError('Irys returned invalid JSON.');
  }
}

async function rpcRead(
  config: BootstrapFeeConfig,
  id: number,
  method: RpcMethod,
  params: readonly unknown[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(config.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new MetadataPublicationPlanError(
        `Mainnet RPC ${method} read failed at ${config.rpcOrigin}.`,
      );
    }
    if (!response.ok) {
      throw new MetadataPublicationPlanError(
        `Mainnet RPC ${method} read failed with HTTP ${response.status}.`,
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MetadataPublicationPlanError(
        `Mainnet RPC ${method} returned invalid JSON.`,
      );
    }
    const rpcError = RpcErrorSchema.safeParse(payload);
    if (rpcError.success) {
      if (rpcError.data.error.code === -32016 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
      throw new MetadataPublicationPlanError(
        `Mainnet RPC ${method} read failed with code ${rpcError.data.error.code}.`,
      );
    }
    const envelope = RpcEnvelopeSchema.safeParse(payload);
    if (!envelope.success || envelope.data.id !== id) {
      throw new MetadataPublicationPlanError(
        `Mainnet RPC ${method} response is malformed.`,
      );
    }
    return envelope.data.result;
  }
  throw new MetadataPublicationPlanError(`Mainnet RPC ${method} read failed.`);
}

function parseResult<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new MetadataPublicationPlanError(`Mainnet RPC ${label} is malformed.`);
  }
  return parsed.data;
}

export async function prepareMetadataPublicationPlan(
  config: BootstrapFeeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MetadataPublicationPlan> {
  const [metadata, quote, infoValue, balanceValue] = await Promise.all([
    verifyGoal9CMetadataIntegrity(),
    quoteFrozenMetadataOnIrys(fetchImpl),
    readJson(new URL('/info', IRYS_MAINNET_ORIGIN), fetchImpl),
    readJson(
      new URL(
        `/account/balance/solana?address=${encodeURIComponent(GOAL_9P_OWNER)}`,
        IRYS_MAINNET_ORIGIN,
      ),
      fetchImpl,
    ),
  ]);
  const info = IrysInfoSchema.safeParse(infoValue);
  const balance = IrysBalanceSchema.safeParse(balanceValue);
  if (
    !info.success ||
    info.data.version !== GOAL_10D_EXPECTED_IRYS_VERSION ||
    info.data.addresses.solana !== GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS
  ) {
    throw new MetadataPublicationPlanError(
      'Irys version or Solana funding address changed; re-review is required.',
    );
  }
  if (!balance.success || parseAtomic(balance.data.balance, 'Irys balance') !== 0n) {
    throw new MetadataPublicationPlanError(
      'Irys owner balance is not the expected unfunded zero state.',
    );
  }

  const genesis = await rpcRead(config, 1, 'getGenesisHash', [], fetchImpl);
  if (genesis !== SOLANA_MAINNET_BETA_GENESIS_HASH) {
    throw new MetadataPublicationPlanError('RPC genesis hash is not Solana Mainnet.');
  }
  const finalizedSlot = parseResult(
    z.number().int().positive(),
    await rpcRead(config, 2, 'getSlot', [{ commitment: 'finalized' }], fetchImpl),
    'finalized slot',
  );
  const ownerBalance = parseResult(
    ContextValueSchema,
    await rpcRead(
      config,
      3,
      'getBalance',
      [GOAL_9P_OWNER, { commitment: 'finalized', minContextSlot: finalizedSlot }],
      fetchImpl,
    ),
    'owner balance',
  );
  if (
    ownerBalance.context.slot < finalizedSlot ||
    BigInt(ownerBalance.value) !== GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS
  ) {
    throw new MetadataPublicationPlanError(
      'Owner balance drifted from the finalized bootstrap receipt.',
    );
  }

  const rent104 = parseResult(
    z.number().int().positive(),
    await rpcRead(
      config,
      4,
      'getMinimumBalanceForRentExemption',
      [104, { commitment: 'finalized' }],
      fetchImpl,
    ),
    '104-byte rent quote',
  );
  const rent40 = parseResult(
    z.number().int().positive(),
    await rpcRead(
      config,
      5,
      'getMinimumBalanceForRentExemption',
      [40, { commitment: 'finalized' }],
      fetchImpl,
    ),
    '40-byte rent quote',
  );
  const rent165 = parseResult(
    z.number().int().positive(),
    await rpcRead(
      config,
      6,
      'getMinimumBalanceForRentExemption',
      [165, { commitment: 'finalized' }],
      fetchImpl,
    ),
    '165-byte rent quote',
  );
  const fixedRent = verifyFixedRentPlan({
    finalizedSlot: ownerBalance.context.slot,
    agentIdentityLamports: BigInt(rent104),
    executiveProfileLamports: BigInt(rent40),
    executionDelegateRecordLamports: BigInt(rent104),
    tokenAccountLamports: BigInt(rent165),
  });

  const blockhash = parseResult(
    LatestBlockhashSchema,
    await rpcRead(
      config,
      7,
      'getLatestBlockhash',
      [{ commitment: 'finalized', minContextSlot: ownerBalance.context.slot }],
      fetchImpl,
    ),
    'latest blockhash',
  );
  const message = buildUnsignedIrysFundingMessage(
    blockhash.value.blockhash,
    quote.quoteLamports,
  );
  const fee = parseResult(
    FeeSchema,
    await rpcRead(
      config,
      8,
      'getFeeForMessage',
      [
        message.messageBase64,
        {
          commitment: 'finalized',
          minContextSlot: blockhash.context.slot,
        },
      ],
      fetchImpl,
    ),
    'funding fee quote',
  );
  if (
    fee.value === null ||
    fee.context.slot < blockhash.context.slot ||
    BigInt(fee.value) !== GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS
  ) {
    throw new MetadataPublicationPlanError(
      'Exact Irys funding message fee changed; re-review is required.',
    );
  }

  const metadataPublicationLamports =
    quote.quoteLamports + GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS;
  const knownOwnerCostsLamports =
    fixedRent.fixedRentLamports +
    GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS +
    metadataPublicationLamports;
  const ownerAfterKnownCostsLamports =
    GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS - knownOwnerCostsLamports;
  const actualAcquisitionAllocationLamports =
    GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS +
    GOAL_10D_ACTUAL_BOOTSTRAP_FEE_LAMPORTS +
    GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS;
  const unallocatedAcquisitionBoundaryLamports =
    GOAL_9_MAX_SOL_RESERVE_LAMPORTS - actualAcquisitionAllocationLamports;
  if (
    metadata.sha256 !== quote.metadataSha256 ||
    metadata.byteLength !== quote.metadataByteLength ||
    ownerAfterKnownCostsLamports <= 0n ||
    actualAcquisitionAllocationLamports > GOAL_9_MAX_SOL_RESERVE_LAMPORTS ||
    unallocatedAcquisitionBoundaryLamports !== 4_999n
  ) {
    throw new MetadataPublicationPlanError(
      'Metadata integrity or fixed acquisition accounting changed.',
    );
  }

  return Object.freeze({
    network: 'mainnet-beta',
    rpcOrigin: config.rpcOrigin,
    finalizedSlot: ownerBalance.context.slot,
    owner: GOAL_9P_OWNER,
    ownerBalanceLamports: GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS,
    metadataSha256: metadata.sha256,
    metadataByteLength: metadata.byteLength,
    irysVersion: GOAL_10D_EXPECTED_IRYS_VERSION,
    irysFundingAddress: GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
    irysGatewayOrigin: GOAL_10D_IRYS_GATEWAY_ORIGIN,
    irysExistingBalanceLamports: 0n,
    storageQuoteLamports: quote.quoteLamports,
    fundingTransferLamports: quote.quoteLamports,
    fundingFeeLamports: GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS,
    fundingMessageSha256: message.messageSha256,
    blockhashContextSlot: blockhash.context.slot,
    feeContextSlot: fee.context.slot,
    lastValidBlockHeight: blockhash.value.lastValidBlockHeight,
    fixedRentLamports: fixedRent.fixedRentLamports,
    internalFeeLamports: GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS,
    metadataPublicationLamports,
    knownOwnerCostsLamports,
    ownerAfterKnownCostsLamports,
    actualAcquisitionAllocationLamports,
    unallocatedAcquisitionBoundaryLamports,
    missing: Object.freeze({
      coreAssetRentAndIdentityPluginTopUp: true,
      uriDependentAssetAndIdentityFees: true,
      liveSolRescueFeeAndAmount: true,
      sameSignedBytesSimulations: true,
    }),
    unsigned: true,
    keyLoaded: false,
    fundingAttempted: false,
    uploadAttempted: false,
    transactionSubmitted: false,
    verdict: 'STOP_READY_FOR_GOAL_10E_IMPLEMENTATION_REVIEW',
  });
}
