import { createHash } from 'node:crypto';

import {
  MPL_AGENT_IDENTITY_PROGRAM_ID,
  mplAgentIdentity,
  registerIdentityV1,
} from '@metaplex-foundation/mpl-agent-registry';
import {
  MPL_CORE_PROGRAM_ID,
  create,
  mplCore,
} from '@metaplex-foundation/mpl-core';
import {
  TRANSACTION_SIZE_LIMIT,
  createNoopSigner,
  publicKey,
  signerIdentity,
  type Transaction,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { z } from 'zod';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../chain/network.js';
import { GOAL_10I_CANONICAL_URI } from '../goal10i/irys-transaction-verification.js';
import {
  GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS,
  type MainnetBirthPreflight,
} from '../goal10j/mainnet-birth-preflight.js';
import type { BootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';
import {
  GOAL_9P_AGENT_IDENTITY,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_OWNER,
} from '../goal9p/final-contract.js';
import { GOAL_9_MAX_SOL_RESERVE_LAMPORTS } from '../mainnet/readiness.js';

export const GOAL_10K_AGENT_NAME = 'Wallet Child #001';
export const GOAL_10K_MAX_FEE_LAMPORTS = 10_000n;
export const GOAL_10K_CORE_ASSET_RENT_LAMPORTS = 4_374_480n;
export const GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS = 1_614_720n;
export const GOAL_10K_TOTAL_BIRTH_RENT_LAMPORTS = 5_989_200n;
export const GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS = 5_999_200n;
export const GOAL_10K_TRANSACTION_BYTE_LENGTH = 566;
export const GOAL_10K_CONFIRMATION =
  'CONFIRM MAINNET BIRTH WALLET CHILD #001 IN ONE ATOMIC TRANSACTION FROM OWNER 6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385 CREATING CORE ASSET HPaGuhYf2qu8UQ7ofJsfjiEzhnoqVmTN9WrGWmuC1Uty AND AGENT IDENTITY EDT4DguQoQgUcEWP7h9z7F4Z5N75oinW6r9PhhuReXf8 WITH METADATA URI https://gateway.irys.xyz/2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL SHA256 7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c CORE RENT 4374480 LAMPORTS IDENTITY RENT 1614720 LAMPORTS TOTAL DEBIT CAP 5999200 LAMPORTS FEE CAP 10000 LAMPORTS NO COLLECTION NO FUNDING NO DELEGATION';

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
    value: z.number().int().nonnegative().nullable(),
  }),
});
const SimulatedAccountSchema = z.object({
  lamports: z.number().int().nonnegative(),
  owner: z.string(),
  executable: z.boolean(),
  data: z.tuple([z.string(), z.literal('base64')]),
});
const SimulationResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(4),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.object({
      err: z.null(),
      logs: z.array(z.string()),
      accounts: z.tuple([
        SimulatedAccountSchema,
        SimulatedAccountSchema,
        SimulatedAccountSchema,
      ]),
      unitsConsumed: z.number().int().positive(),
    }),
  }),
});

export type UnsignedMainnetBirth = Readonly<{
  transaction: Transaction;
  messageBase64: string;
  transactionBase64: string;
  messageSha256: string;
  transactionByteLength: number;
  requiredSigners: readonly [typeof GOAL_9P_OWNER, typeof GOAL_9P_CORE_ASSET];
  programs: readonly [string, string];
  instructionCount: 2;
  signatureCount: 2;
  signaturesAllZero: true;
}>;

export type MainnetBirthWriteReview = Readonly<{
  network: 'mainnet-beta';
  rpcOrigin: string;
  blockhashContextSlot: number;
  simulationSlot: number;
  lastValidBlockHeight: number;
  messageSha256: string;
  transactionByteLength: number;
  instructionCount: 2;
  requiredSigners: readonly [typeof GOAL_9P_OWNER, typeof GOAL_9P_CORE_ASSET];
  quotedFeeLamports: typeof GOAL_10K_MAX_FEE_LAMPORTS;
  coreAssetRentLamports: bigint;
  agentIdentityRentLamports: bigint;
  totalBirthRentLamports: bigint;
  simulatedOwnerDebitLamports: bigint;
  simulationPostBalanceIncludesFee: boolean;
  maximumExperimentSolLamports: typeof GOAL_9_MAX_SOL_RESERVE_LAMPORTS;
  computeUnitsConsumed: number;
  simulationPassed: true;
  keyLoaded: false;
  messageSigned: false;
  transactionSubmitted: false;
  actionTimeConfirmationRequired: true;
  requiredExactConfirmation: typeof GOAL_10K_CONFIRMATION;
  verdict: 'STOP_READY_FOR_EXACT_BIRTH_CONFIRMATION';
}>;

export class MainnetBirthWriteReviewError extends Error {
  override readonly name = 'MainnetBirthWriteReviewError';
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isZeroSignature(signature: Uint8Array): boolean {
  return signature.byteLength === 64 && signature.every((byte) => byte === 0);
}

export function buildUnsignedMainnetBirth(blockhash: string): UnsignedMainnetBirth {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(blockhash)) {
    throw new MainnetBirthWriteReviewError('Latest blockhash is malformed.');
  }
  const owner = createNoopSigner(publicKey(GOAL_9P_OWNER));
  const umi = createUmi('http://127.0.0.1:8899')
    .use(signerIdentity(owner))
    .use(mplCore())
    .use(mplAgentIdentity());
  const asset = createNoopSigner(publicKey(GOAL_9P_CORE_ASSET));
  const builder = create(umi, {
    asset,
    authority: owner,
    payer: owner,
    owner: owner.publicKey,
    updateAuthority: owner.publicKey,
    name: GOAL_10K_AGENT_NAME,
    uri: GOAL_10I_CANONICAL_URI,
  }).add(
    registerIdentityV1(umi, {
      agentIdentity: publicKey(GOAL_9P_AGENT_IDENTITY),
      asset: asset.publicKey,
      payer: owner,
      authority: owner,
      agentRegistrationUri: GOAL_10I_CANONICAL_URI,
    }),
  );
  const signers = builder.getSigners(umi).map((signer) => String(signer.publicKey));
  if (
    signers.length !== 2 ||
    signers[0] !== GOAL_9P_OWNER ||
    signers[1] !== GOAL_9P_CORE_ASSET
  ) {
    throw new MainnetBirthWriteReviewError('Mainnet birth signer set changed.');
  }
  const transaction = builder
    .setFeePayer(owner)
    .useLegacyVersion()
    .setBlockhash(blockhash)
    .build(umi);
  const programs = transaction.message.instructions.map((instruction) =>
    String(transaction.message.accounts[instruction.programIndex]),
  );
  const requiredSignerAccounts = transaction.message.accounts
    .slice(0, transaction.message.header.numRequiredSignatures)
    .map(String);
  const serialized = umi.transactions.serialize(transaction);
  if (
    transaction.message.version !== 'legacy' ||
    transaction.message.blockhash !== blockhash ||
    transaction.message.instructions.length !== 2 ||
    transaction.message.header.numRequiredSignatures !== 2 ||
    requiredSignerAccounts[0] !== GOAL_9P_OWNER ||
    requiredSignerAccounts[1] !== GOAL_9P_CORE_ASSET ||
    programs[0] !== String(MPL_CORE_PROGRAM_ID) ||
    programs[1] !== String(MPL_AGENT_IDENTITY_PROGRAM_ID) ||
    transaction.signatures.length !== 2 ||
    !transaction.signatures.every(isZeroSignature) ||
    serialized.byteLength !== GOAL_10K_TRANSACTION_BYTE_LENGTH ||
    serialized.byteLength > TRANSACTION_SIZE_LIMIT
  ) {
    throw new MainnetBirthWriteReviewError('Mainnet birth message shape changed.');
  }
  return Object.freeze({
    transaction,
    messageBase64: Buffer.from(transaction.serializedMessage).toString('base64'),
    transactionBase64: Buffer.from(serialized).toString('base64'),
    messageSha256: sha256(transaction.serializedMessage),
    transactionByteLength: serialized.byteLength,
    requiredSigners: Object.freeze([GOAL_9P_OWNER, GOAL_9P_CORE_ASSET] as const),
    programs: Object.freeze(programs as [string, string]),
    instructionCount: 2 as const,
    signatureCount: 2 as const,
    signaturesAllZero: true as const,
  });
}

async function rpcRequest(
  config: BootstrapFeeConfig,
  id: number,
  method: 'getGenesisHash' | 'getLatestBlockhash' | 'getFeeForMessage' | 'simulateTransaction',
  params: readonly unknown[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MainnetBirthWriteReviewError(
      `Mainnet RPC ${method} read failed at ${config.rpcOrigin}.`,
    );
  }
  if (!response.ok) {
    throw new MainnetBirthWriteReviewError(
      `Mainnet RPC ${method} returned HTTP ${response.status}.`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MainnetBirthWriteReviewError(
      `Mainnet RPC ${method} returned invalid JSON.`,
    );
  }
  const rpcError = RpcErrorSchema.safeParse(payload);
  if (rpcError.success) {
    throw new MainnetBirthWriteReviewError(
      `Mainnet RPC ${method} failed with code ${rpcError.data.error.code}.`,
    );
  }
  return payload;
}

export async function reviewMainnetBirthWrite(
  config: BootstrapFeeConfig,
  preflight: MainnetBirthPreflight,
  fetchImpl: typeof fetch = fetch,
): Promise<MainnetBirthWriteReview> {
  if (
    preflight.verdict !== 'STOP_READY_FOR_MAINNET_BIRTH_WRITE_REVIEW' ||
    preflight.metadata.durability !== 'IRYS_DURABLE_ACCEPTED' ||
    preflight.accounts.ownerBalanceLamports !==
      GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS ||
    !preflight.accounts.allAbsent
  ) {
    throw new MainnetBirthWriteReviewError(
      'Read-only Mainnet birth preflight is not review-ready.',
    );
  }
  const genesis = GenesisResponseSchema.safeParse(
    await rpcRequest(config, 1, 'getGenesisHash', [], fetchImpl),
  );
  if (!genesis.success || genesis.data.result !== SOLANA_MAINNET_BETA_GENESIS_HASH) {
    throw new MainnetBirthWriteReviewError('RPC genesis hash is not Solana Mainnet.');
  }
  const blockhash = LatestBlockhashResponseSchema.safeParse(
    await rpcRequest(
      config,
      2,
      'getLatestBlockhash',
      [{ commitment: 'finalized' }],
      fetchImpl,
    ),
  );
  if (!blockhash.success || blockhash.data.result.context.slot < preflight.finalizedSlot) {
    throw new MainnetBirthWriteReviewError(
      'Mainnet RPC returned a stale or invalid blockhash.',
    );
  }
  const unsigned = buildUnsignedMainnetBirth(
    blockhash.data.result.value.blockhash,
  );
  const fee = FeeResponseSchema.safeParse(
    await rpcRequest(
      config,
      3,
      'getFeeForMessage',
      [
        unsigned.messageBase64,
        {
          commitment: 'finalized',
          minContextSlot: blockhash.data.result.context.slot,
        },
      ],
      fetchImpl,
    ),
  );
  if (
    !fee.success ||
    fee.data.result.value === null ||
    fee.data.result.context.slot < blockhash.data.result.context.slot ||
    BigInt(fee.data.result.value) !== GOAL_10K_MAX_FEE_LAMPORTS
  ) {
    throw new MainnetBirthWriteReviewError('Mainnet birth fee quote changed.');
  }
  const simulation = SimulationResponseSchema.safeParse(
    await rpcRequest(
      config,
      4,
      'simulateTransaction',
      [
        unsigned.transactionBase64,
        {
          encoding: 'base64',
          commitment: 'finalized',
          sigVerify: false,
          replaceRecentBlockhash: false,
          minContextSlot: fee.data.result.context.slot,
          accounts: {
            encoding: 'base64',
            addresses: [GOAL_9P_OWNER, GOAL_9P_CORE_ASSET, GOAL_9P_AGENT_IDENTITY],
          },
        },
      ],
      fetchImpl,
    ),
  );
  if (!simulation.success || simulation.data.result.context.slot < fee.data.result.context.slot) {
    throw new MainnetBirthWriteReviewError('Mainnet birth simulation failed.');
  }
  const [ownerAfter, coreAssetAfter, agentIdentityAfter] =
    simulation.data.result.value.accounts;
  const coreRent = BigInt(coreAssetAfter.lamports);
  const identityRent = BigInt(agentIdentityAfter.lamports);
  const totalRent = coreRent + identityRent;
  if (
    ownerAfter.owner !== '11111111111111111111111111111111' ||
    coreAssetAfter.owner !== String(MPL_CORE_PROGRAM_ID) ||
    agentIdentityAfter.owner !== String(MPL_AGENT_IDENTITY_PROGRAM_ID) ||
    coreAssetAfter.executable ||
    agentIdentityAfter.executable
  ) {
    throw new MainnetBirthWriteReviewError(
      'Mainnet birth simulated account ownership changed.',
    );
  }
  if (
    coreRent !== GOAL_10K_CORE_ASSET_RENT_LAMPORTS ||
    identityRent !== GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS ||
    identityRent !== preflight.fixedRent.agentIdentityLamports ||
    totalRent !== GOAL_10K_TOTAL_BIRTH_RENT_LAMPORTS ||
    totalRent + GOAL_10K_MAX_FEE_LAMPORTS !==
      GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS ||
    GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS >= GOAL_9_MAX_SOL_RESERVE_LAMPORTS
  ) {
    throw new MainnetBirthWriteReviewError(
      'Mainnet birth simulated rent invariant changed.',
    );
  }
  const simulatedOwnerDebit =
    GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS - BigInt(ownerAfter.lamports);
  const postBalanceIncludesFee =
    simulatedOwnerDebit === GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS;
  if (!postBalanceIncludesFee) {
    throw new MainnetBirthWriteReviewError(
      'Mainnet birth simulated owner debit does not reconcile.',
    );
  }
  return Object.freeze({
    network: 'mainnet-beta' as const,
    rpcOrigin: config.rpcOrigin,
    blockhashContextSlot: blockhash.data.result.context.slot,
    simulationSlot: simulation.data.result.context.slot,
    lastValidBlockHeight: blockhash.data.result.value.lastValidBlockHeight,
    messageSha256: unsigned.messageSha256,
    transactionByteLength: unsigned.transactionByteLength,
    instructionCount: 2 as const,
    requiredSigners: unsigned.requiredSigners,
    quotedFeeLamports: GOAL_10K_MAX_FEE_LAMPORTS,
    coreAssetRentLamports: coreRent,
    agentIdentityRentLamports: identityRent,
    totalBirthRentLamports: totalRent,
    simulatedOwnerDebitLamports: simulatedOwnerDebit,
    simulationPostBalanceIncludesFee: postBalanceIncludesFee,
    maximumExperimentSolLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
    computeUnitsConsumed: simulation.data.result.value.unitsConsumed,
    simulationPassed: true as const,
    keyLoaded: false as const,
    messageSigned: false as const,
    transactionSubmitted: false as const,
    actionTimeConfirmationRequired: true as const,
    requiredExactConfirmation: GOAL_10K_CONFIRMATION,
    verdict: 'STOP_READY_FOR_EXACT_BIRTH_CONFIRMATION' as const,
  });
}
