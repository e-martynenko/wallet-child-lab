import { z } from 'zod';

import {
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
} from '../mainnet/readiness.js';

export const GOAL_9L_FUNDING_SOURCE =
  '8W7sQKSRuYAdev3qcZCm9rrs4DDKbnEgD4fA8kvENvxt';
export const GOAL_9L_FUNDING_SOURCE_USDC_ATA =
  '2RETLnM6iGVayfXP9ynTLmgk5oB5gqHpY8BbVuG1oVyQ';
export const GOAL_9L_WALLET_CHILD_OWNER =
  '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';
export const GOAL_9L_EXECUTIVE =
  'EJQcuD9FtJ33c2wA7GM6HzvmJJJbPsYnmH5ZjTDdhbjF';
export const GOAL_9L_RECOVERY =
  'ABZePapHbYaTg7GU4LGQNcYmfURvue5uVrrf4FUa4x3j';

const FundingRouteSnapshotSchema = z
  .object({
    sourceFinalizedSlot: z.number().int().positive(),
    walletChildFinalizedSlot: z.number().int().positive(),
    source: z
      .object({
        address: z.literal(GOAL_9L_FUNDING_SOURCE),
        solLamports: z.bigint().nonnegative(),
        usdcAccount: z
          .object({
            address: z.literal(GOAL_9L_FUNDING_SOURCE_USDC_ATA),
            programOwner: z.literal(SOLANA_LEGACY_TOKEN_PROGRAM_ID),
            mint: z.literal(SOLANA_MAINNET_USDC_MINT),
            tokenOwner: z.literal(GOAL_9L_FUNDING_SOURCE),
            amountBaseUnits: z.bigint().nonnegative(),
            delegate: z.null(),
            closeAuthority: z.null(),
            state: z.literal('initialized'),
          })
          .strict(),
      })
      .strict(),
    walletChild: z
      .object({
        owner: z.literal(GOAL_9L_WALLET_CHILD_OWNER),
        ownerSolLamports: z.literal(0n),
        ownerUsdcAccountCount: z.literal(0),
        executive: z.literal(GOAL_9L_EXECUTIVE),
        executiveSolLamports: z.literal(0n),
        executiveUsdcAccountCount: z.literal(0),
        recovery: z.literal(GOAL_9L_RECOVERY),
        recoverySolLamports: z.literal(0n),
        recoveryUsdcAccountCount: z.literal(0),
      })
      .strict(),
  })
  .strict();

export type FundingRouteSnapshot = Readonly<
  z.infer<typeof FundingRouteSnapshotSchema>
>;

export type FundingRouteEvidence = Readonly<{
  network: 'mainnet-beta';
  sourceFinalizedSlot: number;
  walletChildFinalizedSlot: number;
  source: typeof GOAL_9L_FUNDING_SOURCE;
  sourceUsdcAccount: typeof GOAL_9L_FUNDING_SOURCE_USDC_ATA;
  bootstrapSolDestination: typeof GOAL_9L_WALLET_CHILD_OWNER;
  futureUsdcDestination: null;
  availableSolLamports: bigint;
  availableUsdcBaseUnits: bigint;
  maximumPermittedSolLamports: typeof GOAL_9_MAX_SOL_RESERVE_LAMPORTS;
  exactPermittedUsdcBaseUnits: typeof GOAL_9_MAX_USDC_BASE_UNITS;
  stagedOutsideWalletChild: true;
  walletChildStillUnfunded: true;
  fundingSourceKeyLoadedByLab: false;
  transactionBuilt: false;
  transactionSubmitted: false;
  limitation: string;
}>;

export class FundingRouteError extends Error {
  override readonly name = 'FundingRouteError';
}

export function verifyFundingRouteSnapshot(
  input: unknown,
): FundingRouteEvidence {
  const parsed = FundingRouteSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    throw new FundingRouteError(
      'Funding-route snapshot is invalid or Wallet Child is already funded.',
    );
  }
  const snapshot = parsed.data;
  if (snapshot.walletChildFinalizedSlot < snapshot.sourceFinalizedSlot) {
    throw new FundingRouteError(
      'Wallet Child read-back cannot precede the source snapshot.',
    );
  }
  const principals = [
    snapshot.source.address,
    snapshot.source.usdcAccount.address,
    snapshot.walletChild.owner,
    snapshot.walletChild.executive,
    snapshot.walletChild.recovery,
    SOLANA_MAINNET_USDC_MINT,
  ];
  if (new Set(principals).size !== principals.length) {
    throw new FundingRouteError(
      'Funding-route principals and accounts must be distinct.',
    );
  }
  if (
    snapshot.source.solLamports < GOAL_9_MAX_SOL_RESERVE_LAMPORTS ||
    snapshot.source.usdcAccount.amountBaseUnits < GOAL_9_MAX_USDC_BASE_UNITS
  ) {
    throw new FundingRouteError(
      'External funding source cannot cover the fixed Wallet Child caps.',
    );
  }

  return Object.freeze({
    network: 'mainnet-beta',
    sourceFinalizedSlot: snapshot.sourceFinalizedSlot,
    walletChildFinalizedSlot: snapshot.walletChildFinalizedSlot,
    source: GOAL_9L_FUNDING_SOURCE,
    sourceUsdcAccount: GOAL_9L_FUNDING_SOURCE_USDC_ATA,
    bootstrapSolDestination: GOAL_9L_WALLET_CHILD_OWNER,
    futureUsdcDestination: null,
    availableSolLamports: snapshot.source.solLamports,
    availableUsdcBaseUnits: snapshot.source.usdcAccount.amountBaseUnits,
    maximumPermittedSolLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
    exactPermittedUsdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
    stagedOutsideWalletChild: true,
    walletChildStillUnfunded: true,
    fundingSourceKeyLoadedByLab: false,
    transactionBuilt: false,
    transactionSubmitted: false,
    limitation:
      'The operator identifies this as a dedicated experimental source. On-chain history is public and cannot prove that an upstream wallet is unrelated.',
  });
}

export const FundingTransferIntentSchema = z
  .object({
    network: z.literal('mainnet-beta'),
    source: z.literal(GOAL_9L_FUNDING_SOURCE),
    destinationOwner: z.literal(GOAL_9L_WALLET_CHILD_OWNER),
    usdcBaseUnits: z.literal(0n),
    solLamports: z.bigint().positive().max(GOAL_9_MAX_SOL_RESERVE_LAMPORTS),
  })
  .strict();

export type FundingTransferIntent = Readonly<
  z.infer<typeof FundingTransferIntentSchema>
>;

export function validateFundingTransferIntent(
  input: unknown,
): FundingTransferIntent {
  const parsed = FundingTransferIntentSchema.safeParse(input);
  if (!parsed.success) {
    throw new FundingRouteError(
      'Bootstrap intent exceeds or changes the reviewed SOL-only route.',
    );
  }
  return Object.freeze(parsed.data);
}
