import { z } from 'zod';

import {
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
  USDC_DECIMALS,
} from '../mainnet/readiness.js';
import { PublicKeyStringSchema } from '../policy/types.js';
import { GOAL_9E_ACTION_BASE_UNITS } from './artifact.js';

export const GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS = 100_000n;

export const MainnetUsdcIntentSchema = z
  .object({
    kind: z.literal('TRANSFER_USDC'),
    network: z.literal('mainnet-beta'),
    token: z.literal('USDC'),
    destinationOwner: PublicKeyStringSchema,
    amountBaseUnits: z.literal(GOAL_9E_ACTION_BASE_UNITS),
  })
  .strict();

export type MainnetUsdcIntent = Readonly<
  z.infer<typeof MainnetUsdcIntentSchema>
>;

export const MainnetUsdcPolicySchema = z
  .object({
    network: z.literal('mainnet-beta'),
    token: z.literal('USDC'),
    mint: z.literal(SOLANA_MAINNET_USDC_MINT),
    decimals: z.literal(USDC_DECIMALS),
    sourceAssetSigner: PublicKeyStringSchema,
    sourceTokenAccount: PublicKeyStringSchema,
    allowedDestinationOwner: PublicKeyStringSchema,
    allowedDestinationTokenAccount: PublicKeyStringSchema,
    actionBaseUnits: z.literal(GOAL_9E_ACTION_BASE_UNITS),
    maximumTreasuryBaseUnits: z.literal(GOAL_9_MAX_USDC_BASE_UNITS),
    maximumFeePayerSpendLamports: z.literal(
      GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS,
    ),
    allowedProgram: z.literal(SOLANA_LEGACY_TOKEN_PROGRAM_ID),
  })
  .strict();

export type MainnetUsdcPolicy = Readonly<
  z.infer<typeof MainnetUsdcPolicySchema>
>;

export type MainnetUsdcDenialReason =
  | 'MALFORMED_POLICY'
  | 'MALFORMED_ACTION'
  | 'INVALID_ACCOUNT_RELATIONSHIP'
  | 'DESTINATION_NOT_ALLOWED';

export type MainnetUsdcDecision =
  | Readonly<{
      decision: 'ALLOW';
      intent: MainnetUsdcIntent;
      policy: MainnetUsdcPolicy;
    }>
  | Readonly<{ decision: 'DENY'; reason: MainnetUsdcDenialReason }>;

export function validateMainnetUsdcAction(
  action: unknown,
  policyInput: unknown,
): MainnetUsdcDecision {
  const parsedPolicy = MainnetUsdcPolicySchema.safeParse(policyInput);
  if (!parsedPolicy.success) {
    return Object.freeze({ decision: 'DENY', reason: 'MALFORMED_POLICY' });
  }
  const policy = Object.freeze(parsedPolicy.data);
  if (
    policy.sourceAssetSigner === policy.allowedDestinationOwner ||
    policy.sourceTokenAccount === policy.allowedDestinationTokenAccount ||
    policy.sourceTokenAccount === policy.mint ||
    policy.allowedDestinationTokenAccount === policy.mint
  ) {
    return Object.freeze({
      decision: 'DENY',
      reason: 'INVALID_ACCOUNT_RELATIONSHIP',
    });
  }

  const parsedAction = MainnetUsdcIntentSchema.safeParse(action);
  if (!parsedAction.success) {
    return Object.freeze({ decision: 'DENY', reason: 'MALFORMED_ACTION' });
  }
  const intent = Object.freeze(parsedAction.data);
  if (intent.destinationOwner !== policy.allowedDestinationOwner) {
    return Object.freeze({
      decision: 'DENY',
      reason: 'DESTINATION_NOT_ALLOWED',
    });
  }
  return Object.freeze({ decision: 'ALLOW', intent, policy });
}
