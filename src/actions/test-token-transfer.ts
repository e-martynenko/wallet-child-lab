import { execute, MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import {
  findAssociatedTokenPda,
  transferTokensChecked,
} from '@metaplex-foundation/mpl-toolbox';
import {
  createNoopSigner,
  publicKey,
  type Instruction,
  type Signer,
  type TransactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi';

import {
  GOAL_9A_DECIMALS,
  GOAL_9A_RESCUE_BASE_UNITS,
  LEGACY_TOKEN_PROGRAM_ID,
  type TestTokenTransferIntent,
  type TestTokenTransferPolicy,
  validateTestTokenAction,
} from '../goal9a/policy.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';

export type DelegatedTestTokenAccounts = Readonly<{
  asset: string;
  collection: string;
  assetSigner: string;
  executionDelegateRecord: string;
  feePayer: Signer;
  executive: Signer;
}>;

export type OwnerRescueAccounts = Readonly<{
  asset: string;
  collection: string;
  assetSigner: string;
  owner: Signer;
}>;

export type TestTokenBuild = Readonly<{
  builder: TransactionBuilder;
  innerInstruction: Instruction;
  intent?: TestTokenTransferIntent;
  policy: TestTokenTransferPolicy;
}>;

export type TestTokenBalanceEvidence = Readonly<{
  sourceBefore: bigint;
  sourceAfter: bigint;
  destinationBefore: bigint;
  destinationAfter: bigint;
  recoveryBefore: bigint;
  recoveryAfter: bigint;
  feePayerBeforeLamports: bigint;
  feePayerAfterLamports: bigint;
}>;

export class TestTokenBuildError extends Error {
  override readonly name = 'TestTokenBuildError';
}

export class TestTokenBalanceError extends Error {
  override readonly name = 'TestTokenBalanceError';
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  if (
    actual.length !== expected.length ||
    actual.some((byte, index) => byte !== expected[index])
  ) {
    throw new TestTokenBuildError(
      'Instruction data does not match fixed TransferChecked data.',
    );
  }
}

function assertMeta(
  instruction: Instruction,
  index: number,
  expected: Readonly<{
    publicKey: string;
    signer: boolean;
    writable: boolean;
  }>,
): void {
  const meta = instruction.keys[index];
  if (
    !meta ||
    String(meta.pubkey) !== expected.publicKey ||
    meta.isSigner !== expected.signer ||
    meta.isWritable !== expected.writable
  ) {
    throw new TestTokenBuildError(`Unexpected account meta at index ${index}.`);
  }
}

function expectedTransferCheckedData(
  amountBaseUnits: bigint,
  decimals: number,
): Uint8Array {
  const data = new Uint8Array(10);
  data[0] = 12;
  new DataView(data.buffer).setBigUint64(1, amountBaseUnits, true);
  data[9] = decimals;
  return data;
}

function assertCanonicalTokenAccounts(
  umi: Umi,
  policy: TestTokenTransferPolicy,
): void {
  const expected = [
    [policy.sourceAssetSigner, policy.sourceTokenAccount],
    [policy.allowedDestinationOwner, policy.allowedDestinationTokenAccount],
    [policy.recoveryOwner, policy.recoveryTokenAccount],
  ] as const;
  for (const [owner, tokenAccount] of expected) {
    const canonical = findAssociatedTokenPda(umi, {
      mint: publicKey(policy.mint),
      owner: publicKey(owner),
    });
    if (String(canonical[0]) !== tokenAccount) {
      throw new TestTokenBuildError(
        'Policy token account is not the canonical associated token account.',
      );
    }
  }
}

export function assertDelegatedTestTokenInner(
  instructions: Instruction[],
  expected: Readonly<{
    executionDelegateRecord: string;
    sourceTokenAccount: string;
    mint: string;
    destinationTokenAccount: string;
    assetSigner: string;
    amountBaseUnits: bigint;
  }>,
): void {
  if (instructions.length !== 1) {
    throw new TestTokenBuildError('Exactly one inner instruction is required.');
  }
  const instruction = instructions[0];
  if (!instruction || String(instruction.programId) !== LEGACY_TOKEN_PROGRAM_ID) {
    throw new TestTokenBuildError('Only the legacy Token Program is allowed.');
  }
  if (instruction.keys.length !== 5) {
    throw new TestTokenBuildError(
      'Delegated TransferChecked must contain exactly five account metas.',
    );
  }
  const metas = [
    [expected.executionDelegateRecord, false, false],
    [expected.sourceTokenAccount, false, true],
    [expected.mint, false, false],
    [expected.destinationTokenAccount, false, true],
    [expected.assetSigner, true, false],
  ] as const;
  metas.forEach(([publicKeyValue, signer, writable], index) =>
    assertMeta(instruction, index, {
      publicKey: publicKeyValue,
      signer,
      writable,
    }),
  );
  assertBytesEqual(
    instruction.data,
    expectedTransferCheckedData(expected.amountBaseUnits, GOAL_9A_DECIMALS),
  );
}

export function assertDelegatedTestTokenBuilder(
  builder: TransactionBuilder,
  expected: Readonly<{
    asset: string;
    collection: string;
    assetSigner: string;
    feePayer: string;
    executive: string;
    executionDelegateRecord: string;
    sourceTokenAccount: string;
    mint: string;
    destinationTokenAccount: string;
    amountBaseUnits: bigint;
  }>,
): void {
  const instructions = builder.getInstructions();
  if (instructions.length !== 1) {
    throw new TestTokenBuildError(
      'Exactly one outer Core Execute instruction is required.',
    );
  }
  const instruction = instructions[0];
  if (!instruction || String(instruction.programId) !== String(MPL_CORE_PROGRAM_ID)) {
    throw new TestTokenBuildError('Outer instruction must use MPL Core.');
  }
  if (instruction.keys.length !== 12) {
    throw new TestTokenBuildError(
      'Delegated Core Execute has unexpected account metas.',
    );
  }
  const metas = [
    [expected.asset, false, true],
    [expected.collection, false, true],
    [expected.assetSigner, false, false],
    [expected.feePayer, true, true],
    [expected.executive, true, false],
    [SYSTEM_PROGRAM_ID, false, false],
    [LEGACY_TOKEN_PROGRAM_ID, false, false],
    [expected.executionDelegateRecord, false, false],
    [expected.sourceTokenAccount, false, true],
    [expected.mint, false, false],
    [expected.destinationTokenAccount, false, true],
    [expected.assetSigner, false, false],
  ] as const;
  metas.forEach(([publicKeyValue, signer, writable], index) =>
    assertMeta(instruction, index, {
      publicKey: publicKeyValue,
      signer,
      writable,
    }),
  );
  const innerData = expectedTransferCheckedData(
    expected.amountBaseUnits,
    GOAL_9A_DECIMALS,
  );
  const outerData = new Uint8Array(5 + innerData.length);
  outerData[0] = 31;
  new DataView(outerData.buffer).setUint32(1, innerData.length, true);
  outerData.set(innerData, 5);
  assertBytesEqual(instruction.data, outerData);
}

export function buildDelegatedTestTokenTransfer(
  umi: Umi,
  action: unknown,
  policyInput: unknown,
  accounts: DelegatedTestTokenAccounts,
): TestTokenBuild {
  const decision = validateTestTokenAction(action, policyInput);
  if (decision.decision === 'DENY') {
    throw new TestTokenBuildError(`Policy denied action: ${decision.reason}.`);
  }
  const { intent, policy } = decision;
  if (accounts.assetSigner !== policy.sourceAssetSigner) {
    throw new TestTokenBuildError('Builder source is not the Asset Signer.');
  }
  assertCanonicalTokenAccounts(umi, policy);

  const built = transferTokensChecked(umi, {
    source: publicKey(policy.sourceTokenAccount),
    mint: publicKey(policy.mint),
    destination: publicKey(policy.allowedDestinationTokenAccount),
    authority: createNoopSigner(publicKey(policy.sourceAssetSigner)),
    amount: intent.amountBaseUnits,
    decimals: policy.decimals,
  }).getInstructions();
  const transfer = built[0];
  if (!transfer || built.length !== 1) {
    throw new TestTokenBuildError('TransferChecked builder shape changed.');
  }
  const forwarded: Instruction = {
    ...transfer,
    keys: [
      {
        pubkey: publicKey(accounts.executionDelegateRecord),
        isSigner: false,
        isWritable: false,
      },
      ...transfer.keys,
    ],
  };
  assertDelegatedTestTokenInner([forwarded], {
    executionDelegateRecord: accounts.executionDelegateRecord,
    sourceTokenAccount: policy.sourceTokenAccount,
    mint: policy.mint,
    destinationTokenAccount: policy.allowedDestinationTokenAccount,
    assetSigner: policy.sourceAssetSigner,
    amountBaseUnits: intent.amountBaseUnits,
  });

  const builder = execute(umi, {
    asset: { publicKey: publicKey(accounts.asset) },
    collection: { publicKey: publicKey(accounts.collection) },
    payer: accounts.feePayer,
    authority: accounts.executive,
    instructions: [forwarded],
  });
  assertDelegatedTestTokenBuilder(builder, {
    asset: accounts.asset,
    collection: accounts.collection,
    assetSigner: accounts.assetSigner,
    feePayer: String(accounts.feePayer.publicKey),
    executive: String(accounts.executive.publicKey),
    executionDelegateRecord: accounts.executionDelegateRecord,
    sourceTokenAccount: policy.sourceTokenAccount,
    mint: policy.mint,
    destinationTokenAccount: policy.allowedDestinationTokenAccount,
    amountBaseUnits: intent.amountBaseUnits,
  });
  return Object.freeze({
    builder,
    innerInstruction: forwarded,
    intent,
    policy,
  });
}

export function buildOwnerTestTokenRescue(
  umi: Umi,
  policyInput: unknown,
  accounts: OwnerRescueAccounts,
): TestTokenBuild {
  const destinationOwner =
    policyInput !== null && typeof policyInput === 'object'
      ? (policyInput as Record<string, unknown>)['allowedDestinationOwner']
      : undefined;
  const decision = validateTestTokenAction(
    {
      kind: 'TRANSFER_TEST_TOKEN',
      network: 'devnet',
      token: 'WALLET_CHILD_USDC_SHAPED_TEST_ONLY',
      destinationOwner,
      amountBaseUnits: 1n,
    },
    policyInput,
  );
  if (decision.decision === 'DENY') {
    throw new TestTokenBuildError(
      `Rescue policy is invalid: ${decision.reason}.`,
    );
  }
  const { policy } = decision;
  if (accounts.assetSigner !== policy.sourceAssetSigner) {
    throw new TestTokenBuildError('Rescue source is not the Asset Signer.');
  }
  assertCanonicalTokenAccounts(umi, policy);

  const built = transferTokensChecked(umi, {
    source: publicKey(policy.sourceTokenAccount),
    mint: publicKey(policy.mint),
    destination: publicKey(policy.recoveryTokenAccount),
    authority: createNoopSigner(publicKey(policy.sourceAssetSigner)),
    amount: GOAL_9A_RESCUE_BASE_UNITS,
    decimals: policy.decimals,
  }).getInstructions();
  const transfer = built[0];
  if (!transfer || built.length !== 1) {
    throw new TestTokenBuildError('Rescue TransferChecked shape changed.');
  }
  if (transfer.keys.length !== 4) {
    throw new TestTokenBuildError(
      'Owner rescue must contain exactly four inner account metas.',
    );
  }
  const innerMetas = [
    [policy.sourceTokenAccount, false, true],
    [policy.mint, false, false],
    [policy.recoveryTokenAccount, false, true],
    [policy.sourceAssetSigner, true, false],
  ] as const;
  innerMetas.forEach(([publicKeyValue, signer, writable], index) =>
    assertMeta(transfer, index, {
      publicKey: publicKeyValue,
      signer,
      writable,
    }),
  );
  assertBytesEqual(
    transfer.data,
    expectedTransferCheckedData(
      GOAL_9A_RESCUE_BASE_UNITS,
      GOAL_9A_DECIMALS,
    ),
  );

  const builder = execute(umi, {
    asset: { publicKey: publicKey(accounts.asset) },
    collection: { publicKey: publicKey(accounts.collection) },
    payer: accounts.owner,
    authority: accounts.owner,
    instructions: [transfer],
  });
  const outer = builder.getInstructions();
  const outerInstruction = outer[0];
  if (
    outer.length !== 1 ||
    !outerInstruction ||
    String(outerInstruction.programId) !== String(MPL_CORE_PROGRAM_ID) ||
    outerInstruction.keys.length !== 11
  ) {
    throw new TestTokenBuildError('Owner rescue Core Execute shape changed.');
  }
  const outerMetas = [
    [accounts.asset, false, true],
    [accounts.collection, false, true],
    [accounts.assetSigner, false, false],
    [String(accounts.owner.publicKey), true, true],
    [String(accounts.owner.publicKey), true, false],
    [SYSTEM_PROGRAM_ID, false, false],
    [LEGACY_TOKEN_PROGRAM_ID, false, false],
    [policy.sourceTokenAccount, false, true],
    [policy.mint, false, false],
    [policy.recoveryTokenAccount, false, true],
    [policy.sourceAssetSigner, false, false],
  ] as const;
  outerMetas.forEach(([publicKeyValue, signer, writable], index) =>
    assertMeta(outerInstruction, index, {
      publicKey: publicKeyValue,
      signer,
      writable,
    }),
  );
  const innerData = expectedTransferCheckedData(
    GOAL_9A_RESCUE_BASE_UNITS,
    GOAL_9A_DECIMALS,
  );
  const outerData = new Uint8Array(5 + innerData.length);
  outerData[0] = 31;
  new DataView(outerData.buffer).setUint32(1, innerData.length, true);
  outerData.set(innerData, 5);
  assertBytesEqual(outerInstruction.data, outerData);

  return Object.freeze({ builder, innerInstruction: transfer, policy });
}

function assertFeePayerSpend(
  before: bigint,
  after: bigint,
  maximum: bigint,
): void {
  const spend = before - after;
  if (spend <= 0n || spend > maximum) {
    throw new TestTokenBalanceError(
      'Fee-payer spend is missing, negative, or above its ceiling.',
    );
  }
}

export function assertTestTokenActionDeltas(
  evidence: TestTokenBalanceEvidence,
  expectedAmount: bigint,
  maximumFeePayerSpendLamports: bigint,
): void {
  if (
    evidence.sourceBefore - evidence.sourceAfter !== expectedAmount ||
    evidence.destinationAfter - evidence.destinationBefore !== expectedAmount ||
    evidence.recoveryAfter !== evidence.recoveryBefore
  ) {
    throw new TestTokenBalanceError(
      'Bounded TEST-token action deltas do not reconcile.',
    );
  }
  assertFeePayerSpend(
    evidence.feePayerBeforeLamports,
    evidence.feePayerAfterLamports,
    maximumFeePayerSpendLamports,
  );
}

export function assertTestTokenRescueDeltas(
  evidence: TestTokenBalanceEvidence,
  expectedAmount: bigint,
  maximumFeePayerSpendLamports: bigint,
): void {
  if (
    evidence.sourceBefore - evidence.sourceAfter !== expectedAmount ||
    evidence.recoveryAfter - evidence.recoveryBefore !== expectedAmount ||
    evidence.destinationAfter !== evidence.destinationBefore ||
    evidence.sourceAfter !== 0n
  ) {
    throw new TestTokenBalanceError(
      'Owner TEST-token rescue deltas do not reconcile.',
    );
  }
  assertFeePayerSpend(
    evidence.feePayerBeforeLamports,
    evidence.feePayerAfterLamports,
    maximumFeePayerSpendLamports,
  );
}
