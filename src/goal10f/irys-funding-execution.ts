import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
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

import {
  buildUnsignedIrysFundingMessage,
  GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS,
  GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
  GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS,
  type MetadataPublicationPlan,
  prepareMetadataPublicationPlan,
} from '../goal10d/metadata-publication-plan.js';
import {
  createIrysFundingActionReview,
  type IrysSdkReviewEvidence,
  verifyInstalledIrysSdkContract,
} from '../goal10e/irys-action-review.js';
import { GOAL_9P_OWNER } from '../goal9p/final-contract.js';
import type { BootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';
import { verifyGoal9CMetadataIntegrity } from '../goal9c/metadata.js';
import { IRYS_MAINNET_ORIGIN } from '../goal9k/irys-quote.js';
import { loadExistingIsolatedSigner } from '../keys/isolated-key.js';
import { DEFAULT_MAINNET_READINESS_OWNER_PATH } from '../mainnet/wallets.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';

export const GOAL_10F_FUNDING_LAMPORTS = 3_208n;
export const GOAL_10F_CONFIRMATION =
  'CONFIRM IRYS METADATA FUNDING 3208 LAMPORTS WITH FEE CAP 5000 ' +
  'LAMPORTS FROM 6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385 ' +
  'TO 9NERQjLetzquGwdKt3X4gZ8fE8fPfSkj2xo2esmUjWsz FOR SHA256 ' +
  '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c';
export const GOAL_10F_EXPECTED_OWNER_AFTER_LAMPORTS =
  GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS -
  GOAL_10F_FUNDING_LAMPORTS -
  GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS;
export const GOAL_10F_IRYS_FUND_SOURCE_SHA256 =
  'cf6fbed46e74e17bf32dfaf6b08a99c6bd56a897e8278d3686608dbb6b2a7fcf';

const FeeResultSchema = z.object({
  context: z.object({ slot: z.number().int().positive() }),
  value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const RpcEnvelopeSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(10),
  result: FeeResultSchema,
});
const IrysBalanceSchema = z.object({
  balance: z.string().regex(/^(0|[1-9][0-9]*)$/),
});

export class IrysFundingExecutionError extends Error {
  override readonly name = 'IrysFundingExecutionError';
}

export type Goal10FFinalizedReceipt = Readonly<{
  signature: string;
  slot: bigint;
  feeLamports: bigint;
  transferLamports: typeof GOAL_10F_FUNDING_LAMPORTS;
  ownerPreLamports: typeof GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS;
  ownerPostLamports: typeof GOAL_10F_EXPECTED_OWNER_AFTER_LAMPORTS;
  destinationPreLamports: bigint;
  destinationPostLamports: bigint;
  signedTransactionSha256: string;
  fundingMessageSha256: string;
  irysCreditLamports: bigint;
  irysCreditRegistered: true;
  sdkWalletInitialized: false;
  uploadAttempted: false;
}>;

type FundingTransactionWithMeta = TransactionWithMeta & {
  response: { slot: bigint };
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function signatureToString(signature: Uint8Array): string {
  return base58.deserialize(signature)[0];
}

export function assertGoal10FConfirmation(arguments_: readonly string[]): void {
  if (arguments_.length !== 1 || arguments_[0] !== GOAL_10F_CONFIRMATION) {
    throw new IrysFundingExecutionError(
      'Goal 10F write is locked: the exact reviewed confirmation is required.',
    );
  }
}

export async function verifyIrysCreditRegistrationContract(
  projectRoot = process.cwd(),
): Promise<void> {
  let source: string;
  try {
    const uploadPackage = await realpath(
      resolve(projectRoot, 'node_modules/@irys/upload/package.json'),
    );
    const requireFromUpload = createRequire(uploadPackage);
    const coreEntrypoint = requireFromUpload.resolve('@irys/upload-core');
    source = await readFile(
      resolve(dirname(coreEntrypoint), '../../src/fund.ts'),
      'utf8',
    );
  } catch {
    throw new IrysFundingExecutionError(
      'Reviewed Irys credit-registration source is unavailable.',
    );
  }
  if (
    sha256(Buffer.from(source, 'utf8')) !==
      GOAL_10F_IRYS_FUND_SOURCE_SHA256 ||
    !source.includes('public async submitFundTransaction(') ||
    !source.includes('`/account/balance/${this.utils.token}`') ||
    !source.includes('{ tx_id: transactionId }') ||
    !source.includes('[202]')
  ) {
    throw new IrysFundingExecutionError(
      'Reviewed Irys credit-registration contract changed.',
    );
  }
}

function assertFundingTransactionShape(
  transaction: Transaction,
  amount: bigint,
): void {
  const message = transaction.message;
  const instruction = message.instructions[0];
  if (
    amount !== GOAL_10F_FUNDING_LAMPORTS ||
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
    throw new IrysFundingExecutionError(
      'Goal 10F transaction is not the exact reviewed System transfer.',
    );
  }
  const view = new DataView(
    instruction.data.buffer,
    instruction.data.byteOffset,
    instruction.data.byteLength,
  );
  if (view.getUint32(0, true) !== 2 || view.getBigUint64(4, true) !== amount) {
    throw new IrysFundingExecutionError(
      'Goal 10F transfer instruction data changed.',
    );
  }
}

export function assertGoal10FPlan(
  plan: MetadataPublicationPlan,
  sdk: IrysSdkReviewEvidence,
): void {
  const expectedReview = createIrysFundingActionReview(plan, sdk);
  if (
    expectedReview.confirmationPhrase !== GOAL_10F_CONFIRMATION ||
    expectedReview.fundingLamports !== GOAL_10F_FUNDING_LAMPORTS ||
    expectedReview.feeCapLamports !==
      GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS ||
    plan.ownerBalanceLamports !== GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS
  ) {
    throw new IrysFundingExecutionError('Goal 10F reviewed contract drifted.');
  }
}

async function quoteExactFundingFee(
  config: BootstrapFeeConfig,
  transaction: Transaction,
  fetchImpl: typeof fetch,
): Promise<Readonly<{ feeLamports: bigint; contextSlot: number }>> {
  let response: Response;
  try {
    response = await fetchImpl(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'getFeeForMessage',
        params: [
          Buffer.from(transaction.serializedMessage).toString('base64'),
          { commitment: 'finalized' },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new IrysFundingExecutionError(
      `Fresh funding-fee read failed at ${config.rpcOrigin}.`,
    );
  }
  if (!response.ok) {
    throw new IrysFundingExecutionError(
      `Fresh funding-fee read returned HTTP ${response.status}.`,
    );
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new IrysFundingExecutionError(
      'Fresh funding-fee read returned invalid JSON.',
    );
  }
  const parsed = RpcEnvelopeSchema.safeParse(value);
  if (!parsed.success) {
    throw new IrysFundingExecutionError(
      'Fresh funding-fee read returned a malformed result.',
    );
  }
  const feeLamports = BigInt(parsed.data.result.value);
  if (feeLamports > GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS) {
    throw new IrysFundingExecutionError(
      'Fresh funding fee exceeds the confirmed 5000-lamport cap.',
    );
  }
  if (feeLamports !== GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS) {
    throw new IrysFundingExecutionError(
      'Fresh funding fee changed from the exact reviewed 5000 lamports.',
    );
  }
  return Object.freeze({
    feeLamports,
    contextSlot: parsed.data.result.context.slot,
  });
}

export function assertGoal10FSimulation(
  simulation: RpcSimulateTransactionResult,
): void {
  const owner = simulation.accounts?.[0];
  if (
    simulation.err !== null ||
    !owner ||
    BigInt(owner.lamports) !== GOAL_10F_EXPECTED_OWNER_AFTER_LAMPORTS
  ) {
    const logs = simulation.logs?.slice(-6).join(' | ') ?? 'No logs.';
    throw new IrysFundingExecutionError(
      `Exact signed-byte simulation failed or balance delta drifted. ${logs}`,
    );
  }
}

export function verifyFinalizedFundingTransaction(
  transaction: FundingTransactionWithMeta,
  expectedSignature: string,
  expectedSignedTransactionSha256: string,
  serializedTransaction: Uint8Array,
): Omit<Goal10FFinalizedReceipt, 'irysCreditLamports' | 'irysCreditRegistered'> {
  assertFundingTransactionShape(transaction, GOAL_10F_FUNDING_LAMPORTS);
  const signature = transaction.signatures[0];
  const pre = transaction.meta.preBalances.map((value) => value.basisPoints);
  const post = transaction.meta.postBalances.map((value) => value.basisPoints);
  if (
    !signature ||
    signatureToString(signature) !== expectedSignature ||
    sha256(serializedTransaction) !== expectedSignedTransactionSha256 ||
    transaction.meta.err !== null ||
    transaction.meta.fee.basisPoints !==
      GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS ||
    pre.length !== 3 ||
    post.length !== 3 ||
    pre[0] !== GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS ||
    post[0] !== GOAL_10F_EXPECTED_OWNER_AFTER_LAMPORTS ||
    pre[1] === undefined ||
    post[1] === undefined ||
    post[1] - pre[1] !== GOAL_10F_FUNDING_LAMPORTS ||
    pre[2] !== post[2]
  ) {
    throw new IrysFundingExecutionError(
      'Finalized Goal 10F transaction does not match the approved receipt.',
    );
  }
  return Object.freeze({
    signature: expectedSignature,
    slot: transaction.response.slot,
    feeLamports: GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS,
    transferLamports: GOAL_10F_FUNDING_LAMPORTS,
    ownerPreLamports: GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS,
    ownerPostLamports: GOAL_10F_EXPECTED_OWNER_AFTER_LAMPORTS,
    destinationPreLamports: pre[1],
    destinationPostLamports: post[1],
    signedTransactionSha256: expectedSignedTransactionSha256,
    fundingMessageSha256: sha256(transaction.serializedMessage),
    sdkWalletInitialized: false,
    uploadAttempted: false,
  });
}

async function readIrysCredit(
  fetchImpl: typeof fetch,
): Promise<bigint> {
  let response: Response;
  try {
    const url = new URL('/account/balance/solana', IRYS_MAINNET_ORIGIN);
    url.searchParams.set('address', GOAL_9P_OWNER);
    response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new IrysFundingExecutionError('Irys credit read failed.');
  }
  if (!response.ok) {
    throw new IrysFundingExecutionError(
      `Irys credit read returned HTTP ${response.status}.`,
    );
  }
  const parsed = IrysBalanceSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new IrysFundingExecutionError('Irys credit read is malformed.');
  }
  return BigInt(parsed.data.balance);
}

export async function registerAndVerifyIrysCredit(
  signature: string,
  fetchImpl: typeof fetch = fetch,
  wait: (milliseconds: number) => Promise<void> =
    (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<bigint> {
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base58.serialize(signature);
  } catch {
    throw new IrysFundingExecutionError('Funding signature is malformed.');
  }
  if (signatureBytes.length !== 64) {
    throw new IrysFundingExecutionError('Funding signature is malformed.');
  }
  const before = await readIrysCredit(fetchImpl);
  if (before > GOAL_10F_FUNDING_LAMPORTS) {
    throw new IrysFundingExecutionError(
      'Irys credit exceeded the exact Goal 10F amount before registration.',
    );
  }
  if (before < GOAL_10F_FUNDING_LAMPORTS) {
    let accepted = false;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        const response = await fetchImpl(
          new URL('/account/balance/solana', IRYS_MAINNET_ORIGIN),
          {
            method: 'POST',
            redirect: 'error',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
            },
            body: JSON.stringify({ tx_id: signature }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (response.status === 202) {
          accepted = true;
          break;
        }
      } catch {
        // Retrying the identical finalized transaction id is idempotent.
      }
      await wait(100 * attempt);
    }
    if (!accepted) {
      throw new IrysFundingExecutionError(
        'Irys did not accept the finalized funding transaction id.',
      );
    }
  }
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const balance = await readIrysCredit(fetchImpl);
    if (balance === GOAL_10F_FUNDING_LAMPORTS) return balance;
    if (balance > GOAL_10F_FUNDING_LAMPORTS) {
      throw new IrysFundingExecutionError(
        'Irys credited more than the exact Goal 10F amount.',
      );
    }
    await wait(1_000);
  }
  throw new IrysFundingExecutionError(
    'Irys credit registration is still pending; do not fund again.',
  );
}

async function loadOwner(
  umi: ReturnType<typeof createUmi>,
  ownerPath: string,
): Promise<KeypairSigner> {
  const owner = await loadExistingIsolatedSigner(
    umi,
    ownerPath,
    'Mainnet-readiness owner',
    (message) => new IrysFundingExecutionError(message),
  );
  if (String(owner.publicKey) !== GOAL_9P_OWNER) {
    throw new IrysFundingExecutionError(
      'Loaded owner key does not match the fixed Goal 10F source.',
    );
  }
  return owner;
}

async function waitForFinalizedTransaction(
  umi: ReturnType<typeof createUmi>,
  signatureBytes: Uint8Array,
): Promise<FundingTransactionWithMeta> {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const transaction = await umi.rpc.getTransaction(signatureBytes, {
      commitment: 'finalized',
    });
    if (transaction) return transaction as FundingTransactionWithMeta;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new IrysFundingExecutionError(
    'Finalized transaction readback is not available; do not fund again.',
  );
}

export async function executeGoal10FIrysFunding(
  config: BootstrapFeeConfig,
  arguments_: readonly string[],
  fetchImpl: typeof fetch = fetch,
  ownerPath = DEFAULT_MAINNET_READINESS_OWNER_PATH,
): Promise<Goal10FFinalizedReceipt> {
  assertGoal10FConfirmation(arguments_);
  const sdk = await verifyInstalledIrysSdkContract();
  await verifyIrysCreditRegistrationContract();
  const metadata = await verifyGoal9CMetadataIntegrity();
  if (
    metadata.sha256 !==
      '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c' ||
    metadata.byteLength !== 351
  ) {
    throw new IrysFundingExecutionError('Frozen metadata contract changed.');
  }
  const plan = await prepareMetadataPublicationPlan(config, fetchImpl);
  assertGoal10FPlan(plan, sdk);

  const umi = createUmi(config.rpcUrl).use(mplToolbox());
  const blockhash = await umi.rpc.getLatestBlockhash({ commitment: 'finalized' });
  const built = buildUnsignedIrysFundingMessage(
    blockhash.blockhash,
    GOAL_10F_FUNDING_LAMPORTS,
  );
  assertFundingTransactionShape(built.transaction, GOAL_10F_FUNDING_LAMPORTS);
  await quoteExactFundingFee(config, built.transaction, fetchImpl);

  // The local key is deliberately loaded only after every public preflight and
  // exact-fee check above has passed.
  const owner = await loadOwner(umi, ownerPath);
  const signed = await owner.signTransaction(built.transaction);
  assertFundingTransactionShape(signed, GOAL_10F_FUNDING_LAMPORTS);
  const signatureBytes = signed.signatures[0];
  if (!signatureBytes || signatureBytes.every((byte) => byte === 0)) {
    throw new IrysFundingExecutionError('Owner signing did not produce a signature.');
  }
  const signature = signatureToString(signatureBytes);
  const serializedSigned = umi.transactions.serialize(signed);
  const signedTransactionSha256 = sha256(serializedSigned);

  const simulation = await umi.rpc.simulateTransaction(signed, {
    commitment: 'finalized',
    verifySignatures: true,
    replaceRecentBlockhash: false,
    accounts: [publicKey(GOAL_9P_OWNER)],
  });
  assertGoal10FSimulation(simulation);
  if (sha256(umi.transactions.serialize(signed)) !== signedTransactionSha256) {
    throw new IrysFundingExecutionError(
      'Signed transaction bytes changed after simulation.',
    );
  }

  const submittedSignature = await umi.rpc.sendTransaction(signed, {
    skipPreflight: false,
    preflightCommitment: 'finalized',
    maxRetries: 3,
  });
  if (signatureToString(submittedSignature) !== signature) {
    throw new IrysFundingExecutionError(
      'Mainnet RPC returned a different transaction signature.',
    );
  }
  const confirmation = await umi.rpc.confirmTransaction(signatureBytes, {
    commitment: 'finalized',
    strategy: {
      type: 'blockhash',
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    },
  });
  if (confirmation.value.err !== null) {
    throw new IrysFundingExecutionError(
      'Goal 10F transaction failed after submission.',
    );
  }
  const finalized = await waitForFinalizedTransaction(umi, signatureBytes);
  const decoded = verifyFinalizedFundingTransaction(
    finalized,
    signature,
    signedTransactionSha256,
    umi.transactions.serialize(finalized),
  );
  const ownerReadback = await umi.rpc.getBalance(publicKey(GOAL_9P_OWNER), {
    commitment: 'finalized',
    minContextSlot: Number(finalized.response.slot),
  });
  if (ownerReadback.basisPoints !== GOAL_10F_EXPECTED_OWNER_AFTER_LAMPORTS) {
    throw new IrysFundingExecutionError(
      'Finalized owner readback does not match the exact funding receipt.',
    );
  }
  const irysCreditLamports = await registerAndVerifyIrysCredit(
    signature,
    fetchImpl,
  );
  return Object.freeze({
    ...decoded,
    irysCreditLamports,
    irysCreditRegistered: true,
  });
}
