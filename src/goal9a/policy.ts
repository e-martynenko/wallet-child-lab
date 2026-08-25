import { z } from 'zod';

import { PublicKeyStringSchema } from '../policy/types.js';

export const GOAL_9A_TEST_TOKEN_LABEL = 'WALLET_CHILD_USDC_SHAPED_TEST_ONLY';
export const GOAL_9A_DECIMALS = 6;
export const GOAL_9A_INITIAL_SUPPLY_BASE_UNITS = 2_000_000n;
export const GOAL_9A_ACTION_BASE_UNITS = 100_000n;
export const GOAL_9A_MAX_TRANSFER_BASE_UNITS = 1_000_000n;
export const GOAL_9A_RESCUE_BASE_UNITS =
  GOAL_9A_INITIAL_SUPPLY_BASE_UNITS - GOAL_9A_ACTION_BASE_UNITS;
export const GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS = 100_000n;

export const LEGACY_TOKEN_PROGRAM_ID =
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const CIRCLE_MAINNET_USDC_MINT =
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const CIRCLE_DEVNET_USDC_MINT =
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export const TestTokenTransferIntentSchema = z
  .object({
    kind: z.literal('TRANSFER_TEST_TOKEN'),
    network: z.literal('devnet'),
    token: z.literal(GOAL_9A_TEST_TOKEN_LABEL),
    destinationOwner: PublicKeyStringSchema,
    amountBaseUnits: z.bigint(),
  })
  .strict();

export type TestTokenTransferIntent = Readonly<
  z.infer<typeof TestTokenTransferIntentSchema>
>;

export const TestTokenTransferPolicySchema = z
  .object({
    network: z.literal('devnet'),
    token: z.literal(GOAL_9A_TEST_TOKEN_LABEL),
    mint: PublicKeyStringSchema,
    decimals: z.literal(GOAL_9A_DECIMALS),
    sourceAssetSigner: PublicKeyStringSchema,
    sourceTokenAccount: PublicKeyStringSchema,
    allowedDestinationOwner: PublicKeyStringSchema,
    allowedDestinationTokenAccount: PublicKeyStringSchema,
    recoveryOwner: PublicKeyStringSchema,
    recoveryTokenAccount: PublicKeyStringSchema,
    maximumBaseUnits: z.bigint().positive(),
    maximumFeePayerSpendLamports: z.bigint().positive(),
    allowedProgram: PublicKeyStringSchema,
  })
  .strict();

export type TestTokenTransferPolicy = Readonly<
  z.infer<typeof TestTokenTransferPolicySchema>
>;

export type TestTokenDenialReason =
  | 'MALFORMED_POLICY'
  | 'MALFORMED_ACTION'
  | 'PROGRAM_NOT_ALLOWED'
  | 'OFFICIAL_USDC_FORBIDDEN'
  | 'INVALID_ACCOUNT_RELATIONSHIP'
  | 'WRONG_NETWORK'
  | 'TOKEN_NOT_ALLOWED'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_OVER_LIMIT'
  | 'DESTINATION_NOT_ALLOWED';

export type TestTokenPolicyDecision =
  | Readonly<{
      decision: 'ALLOW';
      intent: TestTokenTransferIntent;
      policy: TestTokenTransferPolicy;
    }>
  | Readonly<{ decision: 'DENY'; reason: TestTokenDenialReason }>;

export function validateTestTokenAction(
  action: unknown,
  policyInput: unknown,
): TestTokenPolicyDecision {
  const parsedPolicy = TestTokenTransferPolicySchema.safeParse(policyInput);
  if (!parsedPolicy.success) {
    return Object.freeze({ decision: 'DENY', reason: 'MALFORMED_POLICY' });
  }
  const policy = Object.freeze(parsedPolicy.data);
  if (policy.allowedProgram !== LEGACY_TOKEN_PROGRAM_ID) {
    return Object.freeze({ decision: 'DENY', reason: 'PROGRAM_NOT_ALLOWED' });
  }
  if (
    policy.mint === CIRCLE_MAINNET_USDC_MINT ||
    policy.mint === CIRCLE_DEVNET_USDC_MINT
  ) {
    return Object.freeze({
      decision: 'DENY',
      reason: 'OFFICIAL_USDC_FORBIDDEN',
    });
  }

  const principals = [
    policy.sourceAssetSigner,
    policy.allowedDestinationOwner,
    policy.recoveryOwner,
  ];
  const tokenAccounts = [
    policy.sourceTokenAccount,
    policy.allowedDestinationTokenAccount,
    policy.recoveryTokenAccount,
  ];
  if (
    new Set(principals).size !== principals.length ||
    new Set(tokenAccounts).size !== tokenAccounts.length ||
    tokenAccounts.includes(policy.mint)
  ) {
    return Object.freeze({
      decision: 'DENY',
      reason: 'INVALID_ACCOUNT_RELATIONSHIP',
    });
  }

  const parsedAction = TestTokenTransferIntentSchema.safeParse(action);
  if (!parsedAction.success) {
    return Object.freeze({ decision: 'DENY', reason: 'MALFORMED_ACTION' });
  }
  const intent = Object.freeze(parsedAction.data);
  if (intent.network !== policy.network) {
    return Object.freeze({ decision: 'DENY', reason: 'WRONG_NETWORK' });
  }
  if (intent.token !== policy.token) {
    return Object.freeze({ decision: 'DENY', reason: 'TOKEN_NOT_ALLOWED' });
  }
  if (intent.amountBaseUnits <= 0n) {
    return Object.freeze({ decision: 'DENY', reason: 'INVALID_AMOUNT' });
  }
  if (intent.amountBaseUnits > policy.maximumBaseUnits) {
    return Object.freeze({ decision: 'DENY', reason: 'AMOUNT_OVER_LIMIT' });
  }
  if (intent.destinationOwner !== policy.allowedDestinationOwner) {
    return Object.freeze({
      decision: 'DENY',
      reason: 'DESTINATION_NOT_ALLOWED',
    });
  }
  return Object.freeze({ decision: 'ALLOW', intent, policy });
}
