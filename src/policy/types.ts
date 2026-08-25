import { publicKey } from '@metaplex-foundation/umi';
import { z } from 'zod';

function isPublicKeyString(value: string): boolean {
  try {
    return String(publicKey(value)) === value;
  } catch {
    return false;
  }
}

export const PublicKeyStringSchema = z
  .string()
  .refine(isPublicKeyString, 'Expected a canonical Solana public key.');

export const TransferIntentSchema = z
  .object({
    kind: z.literal('TRANSFER'),
    network: z.string().min(1),
    token: z.string().min(1),
    destination: PublicKeyStringSchema,
    amountLamports: z.bigint(),
  })
  .strict();

export type TransferIntent = Readonly<z.infer<typeof TransferIntentSchema>>;

export const TransferPolicySchema = z
  .object({
    network: z.literal('devnet'),
    token: z.literal('SOL'),
    sourceAssetSigner: PublicKeyStringSchema,
    allowedDestination: PublicKeyStringSchema,
    maximumLamports: z.bigint().positive(),
    maximumFeePayerSpendLamports: z.bigint().positive(),
    allowedProgram: PublicKeyStringSchema,
  })
  .strict();

export type TransferPolicy = Readonly<z.infer<typeof TransferPolicySchema>>;

export type PolicyDenialReason =
  | 'MALFORMED_POLICY'
  | 'MALFORMED_ACTION'
  | 'WRONG_NETWORK'
  | 'TOKEN_NOT_ALLOWED'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_OVER_LIMIT'
  | 'DESTINATION_NOT_ALLOWED'
  | 'INVALID_SOURCE_DESTINATION_RELATIONSHIP'
  | 'PROGRAM_NOT_ALLOWED';

export type PolicyDecision =
  | Readonly<{
      decision: 'ALLOW';
      intent: TransferIntent;
      policy: TransferPolicy;
    }>
  | Readonly<{
      decision: 'DENY';
      reason: PolicyDenialReason;
    }>;
