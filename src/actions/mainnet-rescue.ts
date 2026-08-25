import { execute, MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import {
  findAssociatedTokenPda,
  transferSol,
  transferTokensChecked,
} from '@metaplex-foundation/mpl-toolbox';
import {
  createNoopSigner,
  lamports,
  publicKey,
  type Instruction,
  type Signer,
  type TransactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi';

import {
  parseMainnetRescuePolicy,
  type MainnetRescuePolicy,
} from '../goal9f/policy.js';

export type MainnetOwnerRescueAccounts = Readonly<{
  asset: string;
  collection: null;
  assetSigner: string;
  owner: Signer;
}>;

export type MainnetRescueBuild = Readonly<{
  builder: TransactionBuilder;
  innerInstruction: Instruction;
  policy: MainnetRescuePolicy;
  amount: bigint;
  asset: 'USDC' | 'SOL';
}>;

export class MainnetRescueBuildError extends Error {
  override readonly name = 'MainnetRescueBuildError';
}

export class MainnetRescueBalanceError extends Error {
  override readonly name = 'MainnetRescueBalanceError';
}

export type MainnetRescueBalanceEvidence = Readonly<{
  sourceBefore: bigint;
  sourceAfter: bigint;
  recoveryBefore: bigint;
  recoveryAfter: bigint;
  feePayerBeforeLamports: bigint;
  feePayerAfterLamports: bigint;
}>;

function assertBytes(actual: Uint8Array, expected: Uint8Array): void {
  if (
    actual.length !== expected.length ||
    actual.some((byte, index) => byte !== expected[index])
  ) {
    throw new MainnetRescueBuildError('Rescue instruction bytes changed.');
  }
}

function assertMeta(
  instruction: Instruction,
  index: number,
  key: string,
  signer: boolean,
  writable: boolean,
): void {
  const meta = instruction.keys[index];
  if (
    !meta ||
    String(meta.pubkey) !== key ||
    meta.isSigner !== signer ||
    meta.isWritable !== writable
  ) {
    throw new MainnetRescueBuildError(`Unexpected rescue meta at index ${index}.`);
  }
}

function assertAccounts(
  umi: Umi,
  policy: MainnetRescuePolicy,
  accounts: MainnetOwnerRescueAccounts,
): void {
  if (
    accounts.assetSigner !== policy.sourceAssetSigner ||
    String(accounts.owner.publicKey) !== policy.owner
  ) {
    throw new MainnetRescueBuildError('Rescue owner or Asset Signer does not match policy.');
  }
  const sourceAta = findAssociatedTokenPda(umi, {
    mint: publicKey(policy.usdcMint),
    owner: publicKey(policy.sourceAssetSigner),
  });
  const recoveryAta = findAssociatedTokenPda(umi, {
    mint: publicKey(policy.usdcMint),
    owner: publicKey(policy.recoveryOwner),
  });
  if (
    String(sourceAta[0]) !== policy.sourceUsdcAccount ||
    String(recoveryAta[0]) !== policy.recoveryUsdcAccount
  ) {
    throw new MainnetRescueBuildError('Rescue policy does not use canonical USDC ATAs.');
  }
}

function checkedTokenData(amount: bigint, decimals: number): Uint8Array {
  const data = new Uint8Array(10);
  data[0] = 12;
  new DataView(data.buffer).setBigUint64(1, amount, true);
  data[9] = decimals;
  return data;
}

function systemTransferData(amount: bigint): Uint8Array {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, amount, true);
  return data;
}

function executeData(inner: Uint8Array): Uint8Array {
  const data = new Uint8Array(5 + inner.length);
  data[0] = 31;
  new DataView(data.buffer).setUint32(1, inner.length, true);
  data.set(inner, 5);
  return data;
}

export function buildOwnerMainnetUsdcRescue(
  umi: Umi,
  policyInput: unknown,
  accounts: MainnetOwnerRescueAccounts,
  amountBaseUnits: bigint,
): MainnetRescueBuild {
  const policy = parseMainnetRescuePolicy(policyInput);
  assertAccounts(umi, policy, accounts);
  if (amountBaseUnits <= 0n || amountBaseUnits > policy.maximumUsdcBaseUnits) {
    throw new MainnetRescueBuildError('USDC rescue amount is outside the fixed cap.');
  }
  const instructions = transferTokensChecked(umi, {
    source: publicKey(policy.sourceUsdcAccount),
    mint: publicKey(policy.usdcMint),
    destination: publicKey(policy.recoveryUsdcAccount),
    authority: createNoopSigner(publicKey(policy.sourceAssetSigner)),
    amount: amountBaseUnits,
    decimals: policy.usdcDecimals,
  }).getInstructions();
  const inner = instructions[0];
  if (!inner || instructions.length !== 1 || inner.keys.length !== 4) {
    throw new MainnetRescueBuildError('USDC rescue must be one four-meta instruction.');
  }
  const innerMetas = [
    [policy.sourceUsdcAccount, false, true],
    [policy.usdcMint, false, false],
    [policy.recoveryUsdcAccount, false, true],
    [policy.sourceAssetSigner, true, false],
  ] as const;
  innerMetas.forEach(([key, signer, writable], index) =>
    assertMeta(inner, index, key, signer, writable),
  );
  const expectedInner = checkedTokenData(amountBaseUnits, policy.usdcDecimals);
  assertBytes(inner.data, expectedInner);

  const builder = execute(umi, {
    asset: { publicKey: publicKey(accounts.asset) },
    payer: accounts.owner,
    authority: accounts.owner,
    instructions: [inner],
  });
  const outerInstructions = builder.getInstructions();
  const outer = outerInstructions[0];
  if (
    outerInstructions.length !== 1 ||
    !outer ||
    String(outer.programId) !== String(MPL_CORE_PROGRAM_ID) ||
    outer.keys.length !== 11
  ) {
    throw new MainnetRescueBuildError('USDC owner rescue Core Execute shape changed.');
  }
  const outerMetas = [
    [accounts.asset, false, true],
    [String(MPL_CORE_PROGRAM_ID), false, false],
    [accounts.assetSigner, false, false],
    [policy.owner, true, true],
    [policy.owner, true, false],
    [policy.systemProgram, false, false],
    [policy.tokenProgram, false, false],
    [policy.sourceUsdcAccount, false, true],
    [policy.usdcMint, false, false],
    [policy.recoveryUsdcAccount, false, true],
    [policy.sourceAssetSigner, false, false],
  ] as const;
  outerMetas.forEach(([key, signer, writable], index) =>
    assertMeta(outer, index, key, signer, writable),
  );
  assertBytes(outer.data, executeData(expectedInner));
  return Object.freeze({
    builder,
    innerInstruction: inner,
    policy,
    amount: amountBaseUnits,
    asset: 'USDC',
  });
}

export function buildOwnerMainnetSolRescue(
  umi: Umi,
  policyInput: unknown,
  accounts: MainnetOwnerRescueAccounts,
  amountLamports: bigint,
): MainnetRescueBuild {
  const policy = parseMainnetRescuePolicy(policyInput);
  assertAccounts(umi, policy, accounts);
  if (amountLamports <= 0n || amountLamports > policy.maximumSolLamports) {
    throw new MainnetRescueBuildError('SOL rescue amount is outside the fixed cap.');
  }
  const instructions = transferSol(umi, {
    source: createNoopSigner(publicKey(policy.sourceAssetSigner)),
    destination: publicKey(policy.recoveryOwner),
    amount: lamports(amountLamports),
  }).getInstructions();
  const inner = instructions[0];
  if (!inner || instructions.length !== 1 || inner.keys.length !== 2) {
    throw new MainnetRescueBuildError('SOL rescue must be one two-meta instruction.');
  }
  assertMeta(inner, 0, policy.sourceAssetSigner, true, true);
  assertMeta(inner, 1, policy.recoveryOwner, false, true);
  const expectedInner = systemTransferData(amountLamports);
  assertBytes(inner.data, expectedInner);

  const builder = execute(umi, {
    asset: { publicKey: publicKey(accounts.asset) },
    payer: accounts.owner,
    authority: accounts.owner,
    instructions: [inner],
  });
  const outerInstructions = builder.getInstructions();
  const outer = outerInstructions[0];
  if (
    outerInstructions.length !== 1 ||
    !outer ||
    String(outer.programId) !== String(MPL_CORE_PROGRAM_ID) ||
    outer.keys.length !== 9
  ) {
    throw new MainnetRescueBuildError('SOL owner rescue Core Execute shape changed.');
  }
  const outerMetas = [
    [accounts.asset, false, true],
    [String(MPL_CORE_PROGRAM_ID), false, false],
    [accounts.assetSigner, false, false],
    [policy.owner, true, true],
    [policy.owner, true, false],
    [policy.systemProgram, false, false],
    [policy.systemProgram, false, false],
    [policy.sourceAssetSigner, false, true],
    [policy.recoveryOwner, false, true],
  ] as const;
  outerMetas.forEach(([key, signer, writable], index) =>
    assertMeta(outer, index, key, signer, writable),
  );
  assertBytes(outer.data, executeData(expectedInner));
  return Object.freeze({
    builder,
    innerInstruction: inner,
    policy,
    amount: amountLamports,
    asset: 'SOL',
  });
}

export function assertMainnetRescueDeltas(
  evidence: MainnetRescueBalanceEvidence,
  expectedAmount: bigint,
  maximumFeePayerSpendLamports: bigint,
): void {
  const feeSpend =
    evidence.feePayerBeforeLamports - evidence.feePayerAfterLamports;
  if (
    expectedAmount <= 0n ||
    evidence.sourceBefore !== expectedAmount ||
    evidence.sourceAfter !== 0n ||
    evidence.recoveryAfter - evidence.recoveryBefore !== expectedAmount ||
    feeSpend <= 0n ||
    feeSpend > maximumFeePayerSpendLamports
  ) {
    throw new MainnetRescueBalanceError(
      'Owner rescue did not evacuate and reconcile the full expected balance.',
    );
  }
}
