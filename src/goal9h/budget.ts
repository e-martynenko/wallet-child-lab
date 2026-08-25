import { z } from 'zod';

import {
  GOAL_9_MAX_ACQUISITION_COST_USD_CENTS,
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
} from '../mainnet/readiness.js';
import { GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS } from '../goal9e/policy.js';
import { GOAL_9G_MAX_ATA_SETUP_SPEND_LAMPORTS } from '../goal9g/usdc-ata-setup.js';
import {
  GOAL_9M_BOOTSTRAP_FEE_LAMPORTS,
  GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS,
} from '../goal9m/bootstrap-fee.js';

const nonnegativeBigint = z.bigint().nonnegative();

export const MainnetLifecycleBudgetSchema = z
  .object({
    usdcBaseUnits: z.literal(GOAL_9_MAX_USDC_BASE_UNITS),
    usdcAcquisitionUsdCents: z.number().int().nonnegative(),
    solAcquisitionUsdCents: z.number().int().nonnegative(),
    sol: z
      .object({
        bootstrapFundingFeeLamports: z.literal(
          GOAL_9M_BOOTSTRAP_FEE_LAMPORTS,
        ),
        usdcFundingFeeLamports: z.literal(
          GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS,
        ),
        identityAndCollectionLamports: nonnegativeBigint,
        executiveAndDelegationLamports: nonnegativeBigint,
        metadataPublicationLamports: nonnegativeBigint,
        usdcAtaSetupLamports: nonnegativeBigint.max(
          GOAL_9G_MAX_ATA_SETUP_SPEND_LAMPORTS,
        ),
        assetSignerReserveLamports: nonnegativeBigint,
        boundedActionFeeLamports: nonnegativeBigint.max(
          GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS,
        ),
        revokeFeeLamports: nonnegativeBigint.max(
          GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS,
        ),
        usdcRescueFeeLamports: nonnegativeBigint.max(
          GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS,
        ),
        solRescueFeeLamports: nonnegativeBigint.max(
          GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS,
        ),
      })
      .strict(),
  })
  .strict();

export type MainnetLifecycleBudget = Readonly<
  z.infer<typeof MainnetLifecycleBudgetSchema>
>;

export type MainnetLifecycleBudgetEvidence = Readonly<{
  totalSolLamports: bigint;
  remainingSolLamports: bigint;
  totalAcquisitionUsdCents: number;
  remainingAcquisitionUsdCents: number;
  maximumUsdcBaseUnits: bigint;
  maximumTotalSolLamports: bigint;
  maximumAcquisitionUsdCents: number;
}>;

export class MainnetLifecycleBudgetError extends Error {
  override readonly name = 'MainnetLifecycleBudgetError';
}

export function verifyMainnetLifecycleBudget(
  input: unknown,
): MainnetLifecycleBudgetEvidence {
  const parsed = MainnetLifecycleBudgetSchema.safeParse(input);
  if (!parsed.success) {
    throw new MainnetLifecycleBudgetError('Mainnet lifecycle budget input is invalid.');
  }
  const budget = parsed.data;
  const totalSolLamports = Object.values(budget.sol).reduce(
    (total, value) => total + value,
    0n,
  );
  if (totalSolLamports > GOAL_9_MAX_SOL_RESERVE_LAMPORTS) {
    throw new MainnetLifecycleBudgetError(
      'All Mainnet SOL rent, setup, fees, reserves, and emergency allowance exceed 0.02 SOL.',
    );
  }
  const totalAcquisitionUsdCents =
    budget.usdcAcquisitionUsdCents + budget.solAcquisitionUsdCents;
  if (totalAcquisitionUsdCents > GOAL_9_MAX_ACQUISITION_COST_USD_CENTS) {
    throw new MainnetLifecycleBudgetError(
      'Combined USDC and SOL acquisition cost exceeds USD 10.00.',
    );
  }
  return Object.freeze({
    totalSolLamports,
    remainingSolLamports:
      GOAL_9_MAX_SOL_RESERVE_LAMPORTS - totalSolLamports,
    totalAcquisitionUsdCents,
    remainingAcquisitionUsdCents:
      Number(GOAL_9_MAX_ACQUISITION_COST_USD_CENTS) -
      totalAcquisitionUsdCents,
    maximumUsdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
    maximumTotalSolLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
    maximumAcquisitionUsdCents: Number(
      GOAL_9_MAX_ACQUISITION_COST_USD_CENTS,
    ),
  });
}
