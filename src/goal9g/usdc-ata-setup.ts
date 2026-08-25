import {
  createAssociatedToken,
  findAssociatedTokenPda,
} from '@metaplex-foundation/mpl-toolbox';
import {
  publicKey,
  type Instruction,
  type Signer,
  type TransactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi';
import { z } from 'zod';

import {
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
} from '../mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';
import { PublicKeyStringSchema } from '../policy/types.js';

export const ASSOCIATED_TOKEN_PROGRAM_ID =
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const GOAL_9G_MAX_ATA_SETUP_SPEND_LAMPORTS = 5_000_000n;

const MainnetUsdcAtaSetupPolicySchema = z
  .object({
    network: z.literal('mainnet-beta'),
    payer: PublicKeyStringSchema,
    assetSigner: PublicKeyStringSchema,
    recoveryOwner: PublicKeyStringSchema,
    mint: z.literal(SOLANA_MAINNET_USDC_MINT),
    sourceAta: PublicKeyStringSchema,
    recoveryAta: PublicKeyStringSchema,
    associatedTokenProgram: z.literal(ASSOCIATED_TOKEN_PROGRAM_ID),
    tokenProgram: z.literal(SOLANA_LEGACY_TOKEN_PROGRAM_ID),
    systemProgram: z.literal(SYSTEM_PROGRAM_ID),
    maximumSetupSpendLamports: z.literal(
      GOAL_9G_MAX_ATA_SETUP_SPEND_LAMPORTS,
    ),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      new Set([
        policy.payer,
        policy.assetSigner,
        policy.recoveryOwner,
        policy.sourceAta,
        policy.recoveryAta,
        policy.mint,
      ]).size !== 6
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceAta'],
        message: 'ATA setup principals and accounts must be distinct.',
      });
    }
  });

export type MainnetUsdcAtaSetupPolicy = Readonly<
  z.infer<typeof MainnetUsdcAtaSetupPolicySchema>
>;

export type MainnetUsdcAtaState = Readonly<{
  address: string;
  programOwner: string;
  mint: string;
  tokenOwner: string;
  amountBaseUnits: bigint;
  delegate: string | null;
  closeAuthority: string | null;
  initialized: boolean;
}>;

export class MainnetUsdcAtaSetupError extends Error {
  override readonly name = 'MainnetUsdcAtaSetupError';
}

function parsePolicy(value: unknown): MainnetUsdcAtaSetupPolicy {
  const parsed = MainnetUsdcAtaSetupPolicySchema.safeParse(value);
  if (!parsed.success) {
    throw new MainnetUsdcAtaSetupError('Mainnet USDC ATA setup policy is invalid.');
  }
  return Object.freeze(parsed.data);
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
    throw new MainnetUsdcAtaSetupError(`Unexpected ATA setup meta at index ${index}.`);
  }
}

function assertCreateAta(
  instruction: Instruction,
  policy: MainnetUsdcAtaSetupPolicy,
  ata: string,
  owner: string,
): void {
  if (
    String(instruction.programId) !== policy.associatedTokenProgram ||
    instruction.data.length !== 0 ||
    instruction.keys.length !== 6
  ) {
    throw new MainnetUsdcAtaSetupError('ATA create instruction shape changed.');
  }
  const metas = [
    [policy.payer, true, true],
    [ata, false, true],
    [owner, false, false],
    [policy.mint, false, false],
    [policy.systemProgram, false, false],
    [policy.tokenProgram, false, false],
  ] as const;
  metas.forEach(([key, signer, writable], index) =>
    assertMeta(instruction, index, key, signer, writable),
  );
}

export function buildMainnetUsdcAtaSetup(
  umi: Umi,
  policyInput: unknown,
  payer: Signer,
): Readonly<{ builder: TransactionBuilder; policy: MainnetUsdcAtaSetupPolicy }> {
  const policy = parsePolicy(policyInput);
  if (String(payer.publicKey) !== policy.payer) {
    throw new MainnetUsdcAtaSetupError('ATA setup payer does not match policy.');
  }
  const sourceAta = findAssociatedTokenPda(umi, {
    mint: publicKey(policy.mint),
    owner: publicKey(policy.assetSigner),
  });
  const recoveryAta = findAssociatedTokenPda(umi, {
    mint: publicKey(policy.mint),
    owner: publicKey(policy.recoveryOwner),
  });
  if (
    String(sourceAta[0]) !== policy.sourceAta ||
    String(recoveryAta[0]) !== policy.recoveryAta
  ) {
    throw new MainnetUsdcAtaSetupError('ATA setup addresses are not canonical.');
  }

  const builder = createAssociatedToken(umi, {
    payer,
    ata: publicKey(policy.sourceAta),
    owner: publicKey(policy.assetSigner),
    mint: publicKey(policy.mint),
    systemProgram: publicKey(policy.systemProgram),
    tokenProgram: publicKey(policy.tokenProgram),
  }).add(
    createAssociatedToken(umi, {
      payer,
      ata: publicKey(policy.recoveryAta),
      owner: publicKey(policy.recoveryOwner),
      mint: publicKey(policy.mint),
      systemProgram: publicKey(policy.systemProgram),
      tokenProgram: publicKey(policy.tokenProgram),
    }),
  );
  const instructions = builder.getInstructions();
  if (instructions.length !== 2 || !instructions[0] || !instructions[1]) {
    throw new MainnetUsdcAtaSetupError('ATA setup must contain exactly two instructions.');
  }
  assertCreateAta(instructions[0], policy, policy.sourceAta, policy.assetSigner);
  assertCreateAta(instructions[1], policy, policy.recoveryAta, policy.recoveryOwner);
  return Object.freeze({ builder, policy });
}

export function classifyMainnetUsdcAtaPreflight(
  source: MainnetUsdcAtaState | null,
  recovery: MainnetUsdcAtaState | null,
): 'BUILD_BOTH' | 'ALREADY_COMPLETE' {
  if (source === null && recovery === null) return 'BUILD_BOTH';
  if (source === null || recovery === null) {
    throw new MainnetUsdcAtaSetupError('Partial ATA setup is not an approved message shape.');
  }
  return 'ALREADY_COMPLETE';
}

export function assertMainnetUsdcAtaState(
  state: MainnetUsdcAtaState,
  expected: Readonly<{ address: string; tokenOwner: string }>,
): void {
  if (
    state.address !== expected.address ||
    state.programOwner !== SOLANA_LEGACY_TOKEN_PROGRAM_ID ||
    state.mint !== SOLANA_MAINNET_USDC_MINT ||
    state.tokenOwner !== expected.tokenOwner ||
    state.amountBaseUnits !== 0n ||
    state.delegate !== null ||
    state.closeAuthority !== null ||
    !state.initialized
  ) {
    throw new MainnetUsdcAtaSetupError('USDC ATA state does not match the empty safe baseline.');
  }
}

export function assertMainnetUsdcAtaSetupSpend(
  beforeLamports: bigint,
  afterLamports: bigint,
): void {
  const spend = beforeLamports - afterLamports;
  if (spend <= 0n || spend > GOAL_9G_MAX_ATA_SETUP_SPEND_LAMPORTS) {
    throw new MainnetUsdcAtaSetupError('ATA setup spend is missing or above its ceiling.');
  }
}
