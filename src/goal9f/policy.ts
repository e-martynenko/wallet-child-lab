import { z } from 'zod';

import {
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
  USDC_DECIMALS,
} from '../mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';
import { PublicKeyStringSchema } from '../policy/types.js';

export const GOAL_9F_MAX_FEE_PAYER_SPEND_LAMPORTS = 100_000n;

export const MainnetRescuePolicySchema = z
  .object({
    network: z.literal('mainnet-beta'),
    owner: PublicKeyStringSchema,
    sourceAssetSigner: PublicKeyStringSchema,
    recoveryOwner: PublicKeyStringSchema,
    usdcMint: z.literal(SOLANA_MAINNET_USDC_MINT),
    usdcDecimals: z.literal(USDC_DECIMALS),
    sourceUsdcAccount: PublicKeyStringSchema,
    recoveryUsdcAccount: PublicKeyStringSchema,
    maximumUsdcBaseUnits: z.literal(GOAL_9_MAX_USDC_BASE_UNITS),
    maximumSolLamports: z.literal(GOAL_9_MAX_SOL_RESERVE_LAMPORTS),
    maximumFeePayerSpendLamports: z.literal(
      GOAL_9F_MAX_FEE_PAYER_SPEND_LAMPORTS,
    ),
    tokenProgram: z.literal(SOLANA_LEGACY_TOKEN_PROGRAM_ID),
    systemProgram: z.literal(SYSTEM_PROGRAM_ID),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      new Set([
        policy.owner,
        policy.sourceAssetSigner,
        policy.recoveryOwner,
      ]).size !== 3
    ) {
      context.addIssue({
        code: 'custom',
        path: ['recoveryOwner'],
        message: 'Owner, Asset Signer, and recovery must be distinct.',
      });
    }
    if (
      policy.sourceUsdcAccount === policy.recoveryUsdcAccount ||
      policy.sourceUsdcAccount === policy.usdcMint ||
      policy.recoveryUsdcAccount === policy.usdcMint
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceUsdcAccount'],
        message: 'USDC mint and token accounts must be distinct.',
      });
    }
  });

export type MainnetRescuePolicy = Readonly<
  z.infer<typeof MainnetRescuePolicySchema>
>;

export class MainnetRescuePolicyError extends Error {
  override readonly name = 'MainnetRescuePolicyError';
}

export function parseMainnetRescuePolicy(value: unknown): MainnetRescuePolicy {
  const parsed = MainnetRescuePolicySchema.safeParse(value);
  if (!parsed.success) {
    throw new MainnetRescuePolicyError('Mainnet rescue policy is invalid.');
  }
  return Object.freeze(parsed.data);
}
