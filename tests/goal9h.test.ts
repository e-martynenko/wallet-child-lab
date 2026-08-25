import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  MainnetLifecycleBudgetError,
  type MainnetLifecycleBudget,
  verifyMainnetLifecycleBudget,
} from '../src/goal9h/budget.js';
import {
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
} from '../src/mainnet/readiness.js';

const budget: MainnetLifecycleBudget = {
  usdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
  usdcAcquisitionUsdCents: 100,
  solAcquisitionUsdCents: 300,
  sol: {
    identityAndCollectionLamports: 8_000_000n,
    executiveAndDelegationLamports: 2_000_000n,
    metadataPublicationLamports: 100_000n,
    usdcAtaSetupLamports: 4_500_000n,
    assetSignerReserveLamports: 5_000_000n,
    boundedActionFeeLamports: 100_000n,
    revokeFeeLamports: 100_000n,
    usdcRescueFeeLamports: 100_000n,
    solRescueFeeLamports: 100_000n,
  },
};

describe('Goal 9H aggregate Mainnet lifecycle budget', () => {
  it('accepts the exact total SOL boundary and returns remaining USD room', () => {
    expect(verifyMainnetLifecycleBudget(budget)).toEqual({
      totalSolLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
      remainingSolLamports: 0n,
      totalAcquisitionUsdCents: 400,
      remainingAcquisitionUsdCents: 600,
      maximumUsdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
      maximumTotalSolLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
      maximumAcquisitionUsdCents: 1_000,
    });
  });

  it('denies even one lamport above the total SOL cap', () => {
    expect(() =>
      verifyMainnetLifecycleBudget({
        ...budget,
        sol: {
          ...budget.sol,
          assetSignerReserveLamports:
            budget.sol.assetSignerReserveLamports + 1n,
        },
      }),
    ).toThrow(MainnetLifecycleBudgetError);
  });

  it('denies combined acquisition cost above USD 10.00', () => {
    expect(() =>
      verifyMainnetLifecycleBudget({
        ...budget,
        usdcAcquisitionUsdCents: 101,
        solAcquisitionUsdCents: 900,
      }),
    ).toThrow(MainnetLifecycleBudgetError);
  });

  it('denies an inflated USDC amount, ATA slice, or individual fee', () => {
    for (const changed of [
      { ...budget, usdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS + 1n },
      {
        ...budget,
        sol: { ...budget.sol, usdcAtaSetupLamports: 5_000_001n },
      },
      {
        ...budget,
        sol: { ...budget.sol, boundedActionFeeLamports: 100_001n },
      },
    ]) {
      expect(() => verifyMainnetLifecycleBudget(changed)).toThrow(
        MainnetLifecycleBudgetError,
      );
    }
  });

  it('denies negative units and fractional cent quotes', () => {
    expect(() =>
      verifyMainnetLifecycleBudget({
        ...budget,
        sol: { ...budget.sol, assetSignerReserveLamports: -1n },
      }),
    ).toThrow(MainnetLifecycleBudgetError);
    expect(() =>
      verifyMainnetLifecycleBudget({
        ...budget,
        usdcAcquisitionUsdCents: 100.5,
      }),
    ).toThrow(MainnetLifecycleBudgetError);
  });

  it('contains no RPC, pricing feed, key, builder, signing, or send path', async () => {
    const source = await readFile('src/goal9h/budget.ts', 'utf8');
    expect(source).not.toMatch(
      /from ['"]@metaplex-foundation\/umi|fetch\(|createUmi\(|TransactionBuilder|simulateTransaction|signTransaction|sendTransaction|sendAndConfirm/i,
    );
  });
});
