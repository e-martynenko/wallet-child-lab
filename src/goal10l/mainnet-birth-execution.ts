import { createHash } from 'node:crypto';

import {
  fetchAgentIdentityV2,
  MPL_AGENT_IDENTITY_PROGRAM_ID,
  mplAgentIdentity,
} from '@metaplex-foundation/mpl-agent-registry';
import {
  fetchAssetV1,
  MPL_CORE_PROGRAM_ID,
  mplCore,
} from '@metaplex-foundation/mpl-core';
import {
  base58,
  publicKey,
  type KeypairSigner,
  type RpcSimulateTransactionResult,
  type Transaction,
  type TransactionWithMeta,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { z } from 'zod';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../chain/network.js';
import {
  GOAL_10I_CANONICAL_URI,
  verifyGoal10IIrysTransaction,
} from '../goal10i/irys-transaction-verification.js';
import {
  GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS,
  verifyMainnetBirthPreflight,
} from '../goal10j/mainnet-birth-preflight.js';
import {
  buildUnsignedMainnetBirth,
  GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS,
  GOAL_10K_AGENT_NAME,
  GOAL_10K_CONFIRMATION,
  GOAL_10K_CORE_ASSET_RENT_LAMPORTS,
  GOAL_10K_MAX_FEE_LAMPORTS,
  GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS,
  GOAL_10K_TOTAL_BIRTH_RENT_LAMPORTS,
  GOAL_10K_TRANSACTION_BYTE_LENGTH,
  reviewMainnetBirthWrite,
  type MainnetBirthWriteReview,
} from '../goal10k/mainnet-birth-write-review.js';
import type { BootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';
import {
  GOAL_9P_AGENT_IDENTITY,
  GOAL_9P_ASSET_SIGNER,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_OWNER,
} from '../goal9p/final-contract.js';
import { DEFAULT_MAINNET_CORE_ASSET_PATH } from '../goal9n/identity-addresses.js';
import { loadExistingIsolatedSigner } from '../keys/isolated-key.js';
import { DEFAULT_MAINNET_READINESS_OWNER_PATH } from '../mainnet/wallets.js';

export const GOAL_10L_CONFIRMATION = GOAL_10K_CONFIRMATION;
export const GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS =
  GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS -
  GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS;
export const GOAL_10L_MAX_COMPUTE_UNITS = 100_000;

const RpcErrorSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});
const LatestBlockhashSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(21),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.object({
      blockhash: z.string().min(32).max(44),
      lastValidBlockHeight: z.number().int().positive(),
    }),
  }),
});
const FeeSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(22),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.number().int().nonnegative().nullable(),
  }),
});
const SendSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(23),
  result: z.string(),
});
const FEE_READ_ATTEMPTS = 6;

type BirthTransactionWithMeta = TransactionWithMeta & {
  response: { slot: bigint };
};

export type MainnetBirthReceipt = Readonly<{
  signature: string;
  slot: bigint;
  messageSha256: string;
  signedTransactionSha256: string;
  feeLamports: typeof GOAL_10K_MAX_FEE_LAMPORTS;
  coreAssetRentLamports: typeof GOAL_10K_CORE_ASSET_RENT_LAMPORTS;
  agentIdentityRentLamports: typeof GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS;
  totalOwnerDebitLamports: typeof GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS;
  ownerPreLamports: typeof GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS;
  ownerPostLamports: typeof GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS;
  computeUnitsConsumed: number;
  owner: typeof GOAL_9P_OWNER;
  coreAsset: typeof GOAL_9P_CORE_ASSET;
  agentIdentity: typeof GOAL_9P_AGENT_IDENTITY;
  assetSigner: typeof GOAL_9P_ASSET_SIGNER;
  metadataUri: typeof GOAL_10I_CANONICAL_URI;
  finalizedReadbackPassed: true;
  fundingIncluded: false;
  delegationIncluded: false;
}>;

export class MainnetBirthExecutionError extends Error {
  override readonly name = 'MainnetBirthExecutionError';
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function signatureToString(signature: Uint8Array): string {
  return base58.deserialize(signature)[0];
}

function isNonzeroSignature(signature: Uint8Array | undefined): boolean {
  return Boolean(
    signature &&
      signature.byteLength === 64 &&
      signature.some((byte) => byte !== 0),
  );
}

export function assertGoal10LConfirmation(arguments_: readonly string[]): void {
  if (arguments_.length !== 1 || arguments_[0] !== GOAL_10L_CONFIRMATION) {
    throw new MainnetBirthExecutionError(
      'Goal 10L Mainnet birth is locked: the exact reviewed confirmation is required.',
    );
  }
}

export function assertGoal10LReview(review: MainnetBirthWriteReview): void {
  if (
    review.verdict !== 'STOP_READY_FOR_EXACT_BIRTH_CONFIRMATION' ||
    review.requiredExactConfirmation !== GOAL_10L_CONFIRMATION ||
    review.quotedFeeLamports !== GOAL_10K_MAX_FEE_LAMPORTS ||
    review.totalBirthRentLamports !== GOAL_10K_TOTAL_BIRTH_RENT_LAMPORTS ||
    review.simulatedOwnerDebitLamports !==
      GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS ||
    review.transactionByteLength !== GOAL_10K_TRANSACTION_BYTE_LENGTH ||
    review.instructionCount !== 2 ||
    review.requiredSigners[0] !== GOAL_9P_OWNER ||
    review.requiredSigners[1] !== GOAL_9P_CORE_ASSET ||
    !review.simulationPassed ||
    review.keyLoaded ||
    review.messageSigned ||
    review.transactionSubmitted
  ) {
    throw new MainnetBirthExecutionError(
      'Goal 10K reviewed birth contract changed.',
    );
  }
}

async function rpcRequest(
  config: BootstrapFeeConfig,
  id: 21 | 22 | 23,
  method: 'getLatestBlockhash' | 'getFeeForMessage' | 'sendTransaction',
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
    throw new MainnetBirthExecutionError(
      `Mainnet RPC ${method} failed at ${config.rpcOrigin}.`,
    );
  }
  if (!response.ok) {
    throw new MainnetBirthExecutionError(
      `Mainnet RPC ${method} returned HTTP ${response.status}.`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MainnetBirthExecutionError(
      `Mainnet RPC ${method} returned invalid JSON.`,
    );
  }
  const rpcError = RpcErrorSchema.safeParse(payload);
  if (rpcError.success) {
    throw new MainnetBirthExecutionError(
      `Mainnet RPC ${method} failed with code ${rpcError.data.error.code}.`,
    );
  }
  return payload;
}

async function prepareExactBirthTransaction(
  config: BootstrapFeeConfig,
  fetchImpl: typeof fetch,
  minimumContextSlot: number,
): Promise<
  Readonly<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
    contextSlot: number;
    messageSha256: string;
  }>
> {
  const latest = LatestBlockhashSchema.safeParse(
    await rpcRequest(
      config,
      21,
      'getLatestBlockhash',
      [
        {
          commitment: 'finalized',
          minContextSlot: minimumContextSlot,
        },
      ],
      fetchImpl,
    ),
  );
  if (
    !latest.success ||
    latest.data.result.context.slot < minimumContextSlot
  ) {
    throw new MainnetBirthExecutionError(
      'Fresh Mainnet blockhash response is malformed.',
    );
  }
  const built = buildUnsignedMainnetBirth(
    latest.data.result.value.blockhash,
  );
  let feePayload: unknown;
  for (let attempt = 1; attempt <= FEE_READ_ATTEMPTS; attempt += 1) {
    try {
      feePayload = await rpcRequest(
        config,
        22,
        'getFeeForMessage',
        [
          built.messageBase64,
          {
            commitment: 'finalized',
            minContextSlot: minimumContextSlot,
          },
        ],
        fetchImpl,
      );
    } catch (error) {
      if (
        attempt === FEE_READ_ATTEMPTS ||
        !(error instanceof MainnetBirthExecutionError) ||
        !error.message.includes('code -32016')
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      continue;
    }
    const candidate = FeeSchema.safeParse(feePayload);
    if (
      !candidate.success ||
      (candidate.data.result.value !== null &&
        candidate.data.result.context.slot >= minimumContextSlot)
    ) {
      break;
    }
    if (attempt < FEE_READ_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }
  const fee = FeeSchema.safeParse(feePayload);
  if (
    !fee.success ||
    fee.data.result.value === null ||
    fee.data.result.context.slot < minimumContextSlot ||
    BigInt(fee.data.result.value) !== GOAL_10K_MAX_FEE_LAMPORTS
  ) {
    throw new MainnetBirthExecutionError(
      'Fresh Mainnet birth fee changed from the reviewed amount.',
    );
  }
  return Object.freeze({
    transaction: built.transaction,
    blockhash: latest.data.result.value.blockhash,
    lastValidBlockHeight: latest.data.result.value.lastValidBlockHeight,
    contextSlot: minimumContextSlot,
    messageSha256: built.messageSha256,
  });
}

async function loadBirthSigners(
  umi: ReturnType<typeof createUmi>,
  ownerPath: string,
  coreAssetPath: string,
): Promise<readonly [KeypairSigner, KeypairSigner]> {
  const errorFactory = (message: string): MainnetBirthExecutionError =>
    new MainnetBirthExecutionError(message);
  const owner = await loadExistingIsolatedSigner(
    umi,
    ownerPath,
    'Mainnet-readiness owner',
    errorFactory,
  );
  const coreAsset = await loadExistingIsolatedSigner(
    umi,
    coreAssetPath,
    'Mainnet Core Asset account',
    errorFactory,
  );
  if (
    String(owner.publicKey) !== GOAL_9P_OWNER ||
    String(coreAsset.publicKey) !== GOAL_9P_CORE_ASSET
  ) {
    throw new MainnetBirthExecutionError(
      'Loaded isolated signer does not match the reviewed Mainnet birth.',
    );
  }
  return Object.freeze([owner, coreAsset] as const);
}

async function signExactBirth(
  transaction: Transaction,
  owner: KeypairSigner,
  coreAsset: KeypairSigner,
  expectedMessageSha256: string,
  serialize: (transaction: Transaction) => Uint8Array,
): Promise<
  Readonly<{
    transaction: Transaction;
    serialized: Uint8Array;
    signature: string;
    signedTransactionSha256: string;
  }>
> {
  const ownerSigned = await owner.signTransaction(transaction);
  const signed = await coreAsset.signTransaction(ownerSigned);
  const serialized = serialize(signed);
  if (
    sha256(signed.serializedMessage) !== expectedMessageSha256 ||
    serialized.byteLength !== GOAL_10K_TRANSACTION_BYTE_LENGTH ||
    signed.signatures.length !== 2 ||
    !isNonzeroSignature(signed.signatures[0]) ||
    !isNonzeroSignature(signed.signatures[1])
  ) {
    throw new MainnetBirthExecutionError(
      'The signed Mainnet birth bytes do not match the reviewed message.',
    );
  }
  return Object.freeze({
    transaction: signed,
    serialized,
    signature: signatureToString(signed.signatures[0]!),
    signedTransactionSha256: sha256(serialized),
  });
}

export function assertGoal10LSignedSimulation(
  simulation: RpcSimulateTransactionResult,
): number {
  const owner = simulation.accounts?.[0];
  const coreAsset = simulation.accounts?.[1];
  const agentIdentity = simulation.accounts?.[2];
  const computeUnits = simulation.unitsConsumed ?? 0;
  if (
    simulation.err !== null ||
    !owner ||
    !coreAsset ||
    !agentIdentity ||
    owner.owner !== '11111111111111111111111111111111' ||
    BigInt(owner.lamports) !== GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS ||
    coreAsset.owner !== String(MPL_CORE_PROGRAM_ID) ||
    BigInt(coreAsset.lamports) !== GOAL_10K_CORE_ASSET_RENT_LAMPORTS ||
    coreAsset.executable ||
    agentIdentity.owner !== String(MPL_AGENT_IDENTITY_PROGRAM_ID) ||
    BigInt(agentIdentity.lamports) !==
      GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS ||
    agentIdentity.executable ||
    computeUnits <= 0 ||
    computeUnits > GOAL_10L_MAX_COMPUTE_UNITS
  ) {
    const logs = simulation.logs?.slice(-8).join(' | ') ?? 'No logs.';
    throw new MainnetBirthExecutionError(
      `Exact signed Mainnet birth simulation failed. ${logs}`,
    );
  }
  return computeUnits;
}

async function submitExactSerializedBirth(
  config: BootstrapFeeConfig,
  serialized: Uint8Array,
  expectedSignature: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const sent = SendSchema.safeParse(
    await rpcRequest(
      config,
      23,
      'sendTransaction',
      [
        Buffer.from(serialized).toString('base64'),
        {
          encoding: 'base64',
          skipPreflight: false,
          preflightCommitment: 'finalized',
          maxRetries: 3,
        },
      ],
      fetchImpl,
    ),
  );
  if (!sent.success || sent.data.result !== expectedSignature) {
    throw new MainnetBirthExecutionError(
      'Mainnet RPC did not return the exact signed birth signature.',
    );
  }
}

async function waitForFinalizedBirth(
  umi: ReturnType<typeof createUmi>,
  signature: Uint8Array,
): Promise<BirthTransactionWithMeta> {
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    const transaction = await umi.rpc.getTransaction(signature, {
      commitment: 'finalized',
    });
    if (transaction) return transaction as BirthTransactionWithMeta;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new MainnetBirthExecutionError(
    'Finalized birth read-back is unavailable; do not submit again.',
  );
}

export function verifyFinalizedBirthTransaction(
  transaction: BirthTransactionWithMeta,
  expectedSignature: string,
  expectedMessageSha256: string,
  expectedSignedTransactionSha256: string,
  serializedTransaction: Uint8Array,
): void {
  const expected = buildUnsignedMainnetBirth(transaction.message.blockhash);
  const ownerIndex = transaction.message.accounts.findIndex(
    (account) => String(account) === GOAL_9P_OWNER,
  );
  const coreIndex = transaction.message.accounts.findIndex(
    (account) => String(account) === GOAL_9P_CORE_ASSET,
  );
  const identityIndex = transaction.message.accounts.findIndex(
    (account) => String(account) === GOAL_9P_AGENT_IDENTITY,
  );
  const pre = transaction.meta.preBalances;
  const post = transaction.meta.postBalances;
  if (
    sha256(transaction.serializedMessage) !== expectedMessageSha256 ||
    sha256(expected.transaction.serializedMessage) !== expectedMessageSha256 ||
    sha256(serializedTransaction) !== expectedSignedTransactionSha256 ||
    !transaction.signatures[0] ||
    signatureToString(transaction.signatures[0]) !== expectedSignature ||
    transaction.meta.err !== null ||
    transaction.meta.fee.basisPoints !== GOAL_10K_MAX_FEE_LAMPORTS ||
    ownerIndex < 0 ||
    coreIndex < 0 ||
    identityIndex < 0 ||
    pre[ownerIndex]?.basisPoints !==
      GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS ||
    post[ownerIndex]?.basisPoints !== GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS ||
    pre[coreIndex]?.basisPoints !== 0n ||
    post[coreIndex]?.basisPoints !== GOAL_10K_CORE_ASSET_RENT_LAMPORTS ||
    pre[identityIndex]?.basisPoints !== 0n ||
    post[identityIndex]?.basisPoints !==
      GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS
  ) {
    throw new MainnetBirthExecutionError(
      'Finalized Mainnet birth does not match the exact approved receipt.',
    );
  }
}

async function verifyFinalizedBirthReadback(
  umi: ReturnType<typeof createUmi>,
  minContextSlot: number,
): Promise<void> {
  const asset = await fetchAssetV1(umi, publicKey(GOAL_9P_CORE_ASSET), {
    commitment: 'finalized',
    minContextSlot,
  });
  const identity = await fetchAgentIdentityV2(
    umi,
    publicKey(GOAL_9P_AGENT_IDENTITY),
    { commitment: 'finalized', minContextSlot },
  );
  const assetSignerBalance = await umi.rpc.getBalance(
    publicKey(GOAL_9P_ASSET_SIGNER),
    { commitment: 'finalized', minContextSlot },
  );
  const forbiddenPlugins = [
    asset.freezeDelegate,
    asset.burnDelegate,
    asset.transferDelegate,
    asset.updateDelegate,
    asset.permanentFreezeDelegate,
    asset.permanentTransferDelegate,
    asset.permanentBurnDelegate,
    asset.addBlocker,
    asset.freezeExecute,
    asset.permanentFreezeExecute,
  ];
  const agentIdentities = asset.agentIdentities ?? [];
  if (
    String(asset.publicKey) !== GOAL_9P_CORE_ASSET ||
    String(asset.header.owner) !== String(MPL_CORE_PROGRAM_ID) ||
    String(asset.owner) !== GOAL_9P_OWNER ||
    asset.updateAuthority.type !== 'Address' ||
    String(asset.updateAuthority.address) !== GOAL_9P_OWNER ||
    asset.name !== GOAL_10K_AGENT_NAME ||
    asset.uri !== GOAL_10I_CANONICAL_URI ||
    forbiddenPlugins.some(Boolean) ||
    (asset.lifecycleHooks?.length ?? 0) !== 0 ||
    (asset.oracles?.length ?? 0) !== 0 ||
    (asset.appDatas?.length ?? 0) !== 0 ||
    (asset.linkedLifecycleHooks?.length ?? 0) !== 0 ||
    (asset.linkedAppDatas?.length ?? 0) !== 0 ||
    (asset.dataSections?.length ?? 0) !== 0 ||
    agentIdentities.length !== 1 ||
    agentIdentities[0]?.uri !== GOAL_10I_CANONICAL_URI ||
    String(identity.publicKey) !== GOAL_9P_AGENT_IDENTITY ||
    String(identity.header.owner) !== String(MPL_AGENT_IDENTITY_PROGRAM_ID) ||
    String(identity.asset) !== GOAL_9P_CORE_ASSET ||
    identity.agentToken.__option !== 'None' ||
    assetSignerBalance.basisPoints !== 0n
  ) {
    throw new MainnetBirthExecutionError(
      'Finalized Core Asset, Agent Identity, or permission read-back is invalid.',
    );
  }
}

export async function executeMainnetBirth(
  config: BootstrapFeeConfig,
  arguments_: readonly string[],
  fetchImpl: typeof fetch = fetch,
  ownerPath = DEFAULT_MAINNET_READINESS_OWNER_PATH,
  coreAssetPath = DEFAULT_MAINNET_CORE_ASSET_PATH,
): Promise<MainnetBirthReceipt> {
  assertGoal10LConfirmation(arguments_);

  // Repeat every public gate before either isolated key file is opened.
  const durability = await verifyGoal10IIrysTransaction(fetchImpl);
  const preflight = await verifyMainnetBirthPreflight(
    config,
    durability,
    fetchImpl,
  );
  const review = await reviewMainnetBirthWrite(config, preflight, fetchImpl);
  assertGoal10LReview(review);

  const umi = createUmi(config.rpcUrl).use(mplCore()).use(mplAgentIdentity());
  if ((await umi.rpc.getGenesisHash()) !== SOLANA_MAINNET_BETA_GENESIS_HASH) {
    throw new MainnetBirthExecutionError('RPC is not Solana Mainnet.');
  }
  const prepared = await prepareExactBirthTransaction(
    config,
    fetchImpl,
    review.simulationSlot,
  );

  // Keys are loaded only after all public checks and the fresh exact fee quote.
  const [owner, coreAsset] = await loadBirthSigners(
    umi,
    ownerPath,
    coreAssetPath,
  );
  const signed = await signExactBirth(
    prepared.transaction,
    owner,
    coreAsset,
    prepared.messageSha256,
    (transaction) => umi.transactions.serialize(transaction),
  );
  const simulation = await umi.rpc.simulateTransaction(signed.transaction, {
    commitment: 'finalized',
    minContextSlot: prepared.contextSlot,
    verifySignatures: true,
    replaceRecentBlockhash: false,
    accounts: [
      publicKey(GOAL_9P_OWNER),
      publicKey(GOAL_9P_CORE_ASSET),
      publicKey(GOAL_9P_AGENT_IDENTITY),
    ],
  });
  const computeUnitsConsumed = assertGoal10LSignedSimulation(simulation);
  if (
    sha256(umi.transactions.serialize(signed.transaction)) !==
    signed.signedTransactionSha256
  ) {
    throw new MainnetBirthExecutionError(
      'Signed transaction bytes changed after simulation.',
    );
  }

  await submitExactSerializedBirth(
    config,
    signed.serialized,
    signed.signature,
    fetchImpl,
  );
  const signatureBytes = signed.transaction.signatures[0]!;
  const confirmation = await umi.rpc.confirmTransaction(signatureBytes, {
    commitment: 'finalized',
    strategy: {
      type: 'blockhash',
      blockhash: prepared.blockhash,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
    },
  });
  if (confirmation.value.err !== null) {
    throw new MainnetBirthExecutionError(
      'Mainnet birth failed after submission.',
    );
  }
  const finalized = await waitForFinalizedBirth(umi, signatureBytes);
  verifyFinalizedBirthTransaction(
    finalized,
    signed.signature,
    prepared.messageSha256,
    signed.signedTransactionSha256,
    umi.transactions.serialize(finalized),
  );
  const finalizedSlot = Number(finalized.response.slot);
  await verifyFinalizedBirthReadback(umi, finalizedSlot);
  const ownerAfter = await umi.rpc.getBalance(publicKey(GOAL_9P_OWNER), {
    commitment: 'finalized',
    minContextSlot: finalizedSlot,
  });
  if (ownerAfter.basisPoints !== GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS) {
    throw new MainnetBirthExecutionError(
      'Finalized owner balance does not match the approved birth receipt.',
    );
  }
  return Object.freeze({
    signature: signed.signature,
    slot: finalized.response.slot,
    messageSha256: prepared.messageSha256,
    signedTransactionSha256: signed.signedTransactionSha256,
    feeLamports: GOAL_10K_MAX_FEE_LAMPORTS,
    coreAssetRentLamports: GOAL_10K_CORE_ASSET_RENT_LAMPORTS,
    agentIdentityRentLamports: GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS,
    totalOwnerDebitLamports: GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS,
    ownerPreLamports: GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS,
    ownerPostLamports: GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS,
    computeUnitsConsumed,
    owner: GOAL_9P_OWNER,
    coreAsset: GOAL_9P_CORE_ASSET,
    agentIdentity: GOAL_9P_AGENT_IDENTITY,
    assetSigner: GOAL_9P_ASSET_SIGNER,
    metadataUri: GOAL_10I_CANONICAL_URI,
    finalizedReadbackPassed: true as const,
    fundingIncluded: false as const,
    delegationIncluded: false as const,
  });
}
