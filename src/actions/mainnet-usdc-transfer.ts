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
  type MainnetUsdcIntent,
  type MainnetUsdcPolicy,
  validateMainnetUsdcAction,
} from '../goal9e/policy.js';
import { SOLANA_LEGACY_TOKEN_PROGRAM_ID, USDC_DECIMALS } from '../mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';

export type MainnetUsdcAccounts = Readonly<{
  asset: string;
  collection: string;
  assetSigner: string;
  executionDelegateRecord: string;
  feePayer: Signer;
  executive: Signer;
}>;

export type MainnetUsdcBuild = Readonly<{
  builder: TransactionBuilder;
  innerInstruction: Instruction;
  intent: MainnetUsdcIntent;
  policy: MainnetUsdcPolicy;
}>;

export class MainnetUsdcBuildError extends Error {
  override readonly name = 'MainnetUsdcBuildError';
}

function assertBytes(actual: Uint8Array, expected: Uint8Array): void {
  if (
    actual.length !== expected.length ||
    actual.some((byte, index) => byte !== expected[index])
  ) {
    throw new MainnetUsdcBuildError('Instruction data changed from fixed TransferChecked bytes.');
  }
}

function transferCheckedData(amountBaseUnits: bigint): Uint8Array {
  const data = new Uint8Array(10);
  data[0] = 12;
  new DataView(data.buffer).setBigUint64(1, amountBaseUnits, true);
  data[9] = USDC_DECIMALS;
  return data;
}

function assertMeta(
  instruction: Instruction,
  index: number,
  publicKeyValue: string,
  signer: boolean,
  writable: boolean,
): void {
  const meta = instruction.keys[index];
  if (
    !meta ||
    String(meta.pubkey) !== publicKeyValue ||
    meta.isSigner !== signer ||
    meta.isWritable !== writable
  ) {
    throw new MainnetUsdcBuildError(`Unexpected account meta at index ${index}.`);
  }
}

function assertCanonicalAtas(umi: Umi, policy: MainnetUsdcPolicy): void {
  const expected = [
    [policy.sourceAssetSigner, policy.sourceTokenAccount],
    [policy.allowedDestinationOwner, policy.allowedDestinationTokenAccount],
  ] as const;
  for (const [owner, account] of expected) {
    const canonical = findAssociatedTokenPda(umi, {
      mint: publicKey(policy.mint),
      owner: publicKey(owner),
    });
    if (String(canonical[0]) !== account) {
      throw new MainnetUsdcBuildError('A token account is not the canonical USDC ATA.');
    }
  }
}

export function assertMainnetUsdcInnerInstruction(
  instruction: Instruction,
  expected: Readonly<{
    executionDelegateRecord: string;
    sourceTokenAccount: string;
    mint: string;
    destinationTokenAccount: string;
    assetSigner: string;
    amountBaseUnits: bigint;
  }>,
): void {
  if (String(instruction.programId) !== SOLANA_LEGACY_TOKEN_PROGRAM_ID) {
    throw new MainnetUsdcBuildError('Only the legacy Token Program is allowed.');
  }
  if (instruction.keys.length !== 5) {
    throw new MainnetUsdcBuildError('Delegated TransferChecked must have five metas.');
  }
  const metas = [
    [expected.executionDelegateRecord, false, false],
    [expected.sourceTokenAccount, false, true],
    [expected.mint, false, false],
    [expected.destinationTokenAccount, false, true],
    [expected.assetSigner, true, false],
  ] as const;
  metas.forEach(([key, signer, writable], index) =>
    assertMeta(instruction, index, key, signer, writable),
  );
  assertBytes(instruction.data, transferCheckedData(expected.amountBaseUnits));
}

function assertOuterBuilder(
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
  const instruction = instructions[0];
  if (
    instructions.length !== 1 ||
    !instruction ||
    String(instruction.programId) !== String(MPL_CORE_PROGRAM_ID) ||
    instruction.keys.length !== 12
  ) {
    throw new MainnetUsdcBuildError('Core Execute outer shape changed.');
  }
  const metas = [
    [expected.asset, false, true],
    [expected.collection, false, true],
    [expected.assetSigner, false, false],
    [expected.feePayer, true, true],
    [expected.executive, true, false],
    [SYSTEM_PROGRAM_ID, false, false],
    [SOLANA_LEGACY_TOKEN_PROGRAM_ID, false, false],
    [expected.executionDelegateRecord, false, false],
    [expected.sourceTokenAccount, false, true],
    [expected.mint, false, false],
    [expected.destinationTokenAccount, false, true],
    [expected.assetSigner, false, false],
  ] as const;
  metas.forEach(([key, signer, writable], index) =>
    assertMeta(instruction, index, key, signer, writable),
  );
  const inner = transferCheckedData(expected.amountBaseUnits);
  const outer = new Uint8Array(5 + inner.length);
  outer[0] = 31;
  new DataView(outer.buffer).setUint32(1, inner.length, true);
  outer.set(inner, 5);
  assertBytes(instruction.data, outer);
}

export function buildMainnetUsdcTransfer(
  umi: Umi,
  action: unknown,
  policyInput: unknown,
  accounts: MainnetUsdcAccounts,
): MainnetUsdcBuild {
  const decision = validateMainnetUsdcAction(action, policyInput);
  if (decision.decision === 'DENY') {
    throw new MainnetUsdcBuildError(`Policy denied action: ${decision.reason}.`);
  }
  const { intent, policy } = decision;
  if (accounts.assetSigner !== policy.sourceAssetSigner) {
    throw new MainnetUsdcBuildError('Builder source is not the Asset Signer.');
  }
  assertCanonicalAtas(umi, policy);

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
    throw new MainnetUsdcBuildError('TransferChecked builder shape changed.');
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
  assertMainnetUsdcInnerInstruction(forwarded, {
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
  assertOuterBuilder(builder, {
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
  return Object.freeze({ builder, innerInstruction: forwarded, intent, policy });
}
