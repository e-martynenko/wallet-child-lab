import {
  execute,
  MPL_CORE_PROGRAM_ID,
} from '@metaplex-foundation/mpl-core';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';
import {
  createNoopSigner,
  lamports,
  publicKey,
  type Instruction,
  type Signer,
  type TransactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi';

import { SYSTEM_PROGRAM_ID, validateAction } from '../policy/policy.js';
import type { TransferIntent, TransferPolicy } from '../policy/types.js';

export type BoundedTransferAccounts = Readonly<{
  asset: string;
  collection: string;
  assetSigner: string;
  executionDelegateRecord: string;
  feePayer: Signer;
  executive: Signer;
}>;

export type BoundedTransferBuild = Readonly<{
  builder: TransactionBuilder;
  innerInstruction: Instruction;
  intent: TransferIntent;
  policy: TransferPolicy;
}>;

export type TransferBalanceEvidence = Readonly<{
  sourceBeforeLamports: bigint;
  sourceAfterLamports: bigint;
  destinationBeforeLamports: bigint;
  destinationAfterLamports: bigint;
  feePayerBeforeLamports: bigint;
  feePayerAfterLamports: bigint;
}>;

export class PolicyBuildError extends Error {
  override readonly name = 'PolicyBuildError';
}

export class BalanceReconciliationError extends Error {
  override readonly name = 'BalanceReconciliationError';
}

function assertPublicKeysDistinct(values: string[]): void {
  if (new Set(values).size !== values.length) {
    throw new PolicyBuildError(
      'Asset, collection, delegate, source, destination, payer, and executive must be distinct.',
    );
  }
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  if (
    actual.length !== expected.length ||
    actual.some((byte, index) => byte !== expected[index])
  ) {
    throw new PolicyBuildError('Instruction data does not match the fixed transfer.');
  }
}

function assertAccountMeta(
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
    throw new PolicyBuildError(`Unexpected account meta at index ${index}.`);
  }
}

function expectedSystemTransferData(amountLamports: bigint): Uint8Array {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, amountLamports, true);
  return data;
}

export function assertBoundedInnerTransfer(
  instructions: Instruction[],
  expected: Readonly<{
    executionDelegateRecord: string;
    source: string;
    destination: string;
    amountLamports: bigint;
  }>,
): void {
  if (instructions.length !== 1) {
    throw new PolicyBuildError('Exactly one inner instruction is required.');
  }
  const instruction = instructions[0];
  if (!instruction || String(instruction.programId) !== SYSTEM_PROGRAM_ID) {
    throw new PolicyBuildError('Only the System Program is allowed.');
  }
  if (instruction.keys.length !== 3) {
    throw new PolicyBuildError(
      'The forwarded transfer must contain exactly three account metas.',
    );
  }
  assertAccountMeta(instruction, 0, {
    publicKey: expected.executionDelegateRecord,
    signer: false,
    writable: false,
  });
  assertAccountMeta(instruction, 1, {
    publicKey: expected.source,
    signer: true,
    writable: true,
  });
  assertAccountMeta(instruction, 2, {
    publicKey: expected.destination,
    signer: false,
    writable: true,
  });
  assertBytesEqual(
    instruction.data,
    expectedSystemTransferData(expected.amountLamports),
  );
}

export function assertBoundedExecuteBuilder(
  builder: TransactionBuilder,
  expected: Readonly<{
    asset: string;
    collection: string;
    assetSigner: string;
    feePayer: string;
    executive: string;
    executionDelegateRecord: string;
    destination: string;
    amountLamports: bigint;
  }>,
): void {
  const instructions = builder.getInstructions();
  if (instructions.length !== 1) {
    throw new PolicyBuildError('Exactly one Core Execute instruction is required.');
  }
  const instruction = instructions[0];
  if (!instruction || String(instruction.programId) !== String(MPL_CORE_PROGRAM_ID)) {
    throw new PolicyBuildError('Outer instruction must use MPL Core.');
  }
  if (instruction.keys.length !== 10) {
    throw new PolicyBuildError('Core Execute has unexpected account metas.');
  }

  const metas = [
    [expected.asset, false, true],
    [expected.collection, false, true],
    [expected.assetSigner, false, false],
    [expected.feePayer, true, true],
    [expected.executive, true, false],
    [SYSTEM_PROGRAM_ID, false, false],
    [SYSTEM_PROGRAM_ID, false, false],
    [expected.executionDelegateRecord, false, false],
    [expected.assetSigner, false, true],
    [expected.destination, false, true],
  ] as const;
  metas.forEach(([publicKeyValue, signer, writable], index) =>
    assertAccountMeta(instruction, index, {
      publicKey: publicKeyValue,
      signer,
      writable,
    }),
  );

  const innerData = expectedSystemTransferData(expected.amountLamports);
  const expectedOuterData = new Uint8Array(5 + innerData.length);
  const view = new DataView(expectedOuterData.buffer);
  expectedOuterData[0] = 31;
  view.setUint32(1, innerData.length, true);
  expectedOuterData.set(innerData, 5);
  assertBytesEqual(instruction.data, expectedOuterData);
}

export function buildBoundedTransfer(
  umi: Umi,
  action: unknown,
  policyInput: unknown,
  accounts: BoundedTransferAccounts,
): BoundedTransferBuild {
  const decision = validateAction(action, policyInput);
  if (decision.decision === 'DENY') {
    throw new PolicyBuildError(`Policy denied action: ${decision.reason}.`);
  }
  const { intent, policy } = decision;

  if (accounts.assetSigner !== policy.sourceAssetSigner) {
    throw new PolicyBuildError('Builder source is not the policy Asset Signer.');
  }
  assertPublicKeysDistinct([
    accounts.asset,
    accounts.collection,
    accounts.executionDelegateRecord,
    accounts.assetSigner,
    intent.destination,
    String(accounts.feePayer.publicKey),
    String(accounts.executive.publicKey),
  ]);

  const systemTransfer = transferSol(umi, {
    source: createNoopSigner(publicKey(accounts.assetSigner)),
    destination: publicKey(intent.destination),
    amount: lamports(intent.amountLamports),
  }).getInstructions();
  const transferInstruction = systemTransfer[0];
  if (!transferInstruction || systemTransfer.length !== 1) {
    throw new PolicyBuildError('System transfer builder shape changed.');
  }
  const forwardedInstruction: Instruction = {
    ...transferInstruction,
    keys: [
      {
        pubkey: publicKey(accounts.executionDelegateRecord),
        isSigner: false,
        isWritable: false,
      },
      ...transferInstruction.keys,
    ],
  };
  assertBoundedInnerTransfer([forwardedInstruction], {
    executionDelegateRecord: accounts.executionDelegateRecord,
    source: accounts.assetSigner,
    destination: intent.destination,
    amountLamports: intent.amountLamports,
  });

  const builder = execute(umi, {
    asset: { publicKey: publicKey(accounts.asset) },
    collection: { publicKey: publicKey(accounts.collection) },
    payer: accounts.feePayer,
    authority: accounts.executive,
    instructions: [forwardedInstruction],
  });
  assertBoundedExecuteBuilder(builder, {
    asset: accounts.asset,
    collection: accounts.collection,
    assetSigner: accounts.assetSigner,
    feePayer: String(accounts.feePayer.publicKey),
    executive: String(accounts.executive.publicKey),
    executionDelegateRecord: accounts.executionDelegateRecord,
    destination: intent.destination,
    amountLamports: intent.amountLamports,
  });

  return Object.freeze({
    builder,
    innerInstruction: forwardedInstruction,
    intent,
    policy,
  });
}

export function assertBoundedTransferBalanceDeltas(
  evidence: TransferBalanceEvidence,
  expectedAmountLamports: bigint,
  maximumFeePayerSpendLamports: bigint,
): void {
  if (expectedAmountLamports <= 0n || maximumFeePayerSpendLamports <= 0n) {
    throw new BalanceReconciliationError(
      'Expected amount and fee ceiling must be positive.',
    );
  }

  const sourceSpend =
    evidence.sourceBeforeLamports - evidence.sourceAfterLamports;
  const destinationGain =
    evidence.destinationAfterLamports - evidence.destinationBeforeLamports;
  const feePayerSpend =
    evidence.feePayerBeforeLamports - evidence.feePayerAfterLamports;
  if (
    sourceSpend !== expectedAmountLamports ||
    destinationGain !== expectedAmountLamports
  ) {
    throw new BalanceReconciliationError(
      'Source and destination deltas do not match the transfer amount.',
    );
  }
  if (
    feePayerSpend <= 0n ||
    feePayerSpend > maximumFeePayerSpendLamports
  ) {
    throw new BalanceReconciliationError(
      'Fee-payer spend is missing, negative, or above its ceiling.',
    );
  }
}
