import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  GOAL_10N_ACTIVATION_RENT_LAMPORTS,
  GOAL_10N_ACTUAL_ACQUISITION_ALLOCATION_LAMPORTS,
  GOAL_10N_CONSERVATIVE_OWNER_AFTER_LAMPORTS,
  GOAL_10N_CONSERVATIVE_OWNER_DEBIT_LAMPORTS,
  GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS,
  GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS,
  GOAL_10N_MAX_ACTIVATION_DEBIT_LAMPORTS,
  GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS,
  GOAL_10N_UNALLOCATED_ACQUISITION_LAMPORTS,
  PostBirthActivationReviewError,
  verifyPostBirthActivationSnapshot,
} from '../src/goal10n/post-birth-activation-review.js';
import { GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS } from '../src/goal10l/mainnet-birth-execution.js';
import { GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS } from '../src/goal9r/internal-message-fees.js';
import { GOAL_9_MAX_USDC_BASE_UNITS } from '../src/mainnet/readiness.js';

function validSnapshot() {
  return {
    finalizedSlot: 442_803_098,
    ownerLamports: GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS,
    fundingSourceLamports: 5_000n,
    fundingSourceUsdcBaseUnits: 1_000_000n,
    assetSignerAbsent: true,
    assetSignerUsdcAtaAbsent: true,
    recoveryAbsent: true,
    recoveryUsdcAtaAbsent: true,
    executiveAbsent: true,
    executiveProfileAbsent: true,
    executionDelegateRecordAbsent: true,
    executiveProfileRentLamports:
      GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS,
    executionDelegateRentLamports:
      GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS,
    tokenAccountRentLamports: GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS,
  };
}

describe('Goal 10N post-birth activation review', () => {
  it('closes the activation rent, internal fees, and remaining owner balance', () => {
    expect(GOAL_10N_ACTIVATION_RENT_LAMPORTS).toBe(6_862_560n);
    expect(GOAL_10N_CONSERVATIVE_OWNER_DEBIT_LAMPORTS).toBe(
      GOAL_10N_ACTIVATION_RENT_LAMPORTS +
        GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS,
    );
    expect(GOAL_10N_CONSERVATIVE_OWNER_DEBIT_LAMPORTS).toBeLessThanOrEqual(
      GOAL_10N_MAX_ACTIVATION_DEBIT_LAMPORTS,
    );
    expect(GOAL_10N_CONSERVATIVE_OWNER_AFTER_LAMPORTS).toBe(7_075_032n);
    expect(GOAL_10N_ACTUAL_ACQUISITION_ALLOCATION_LAMPORTS).toBe(19_995_001n);
    expect(GOAL_10N_UNALLOCATED_ACQUISITION_LAMPORTS).toBe(4_999n);
  });

  it('accepts only the exact empty post-birth activation baseline', () => {
    expect(() => verifyPostBirthActivationSnapshot(validSnapshot())).not.toThrow();
  });

  it.each([
    ['owner balance drift', { ownerLamports: 1n }],
    ['funding below one USDC', { fundingSourceUsdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS - 1n }],
    ['existing Asset Signer ATA', { assetSignerUsdcAtaAbsent: false }],
    ['existing executive profile', { executiveProfileAbsent: false }],
    ['existing delegate record', { executionDelegateRecordAbsent: false }],
    ['rent drift', { tokenAccountRentLamports: GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS + 1n }],
  ])('fails closed on %s', (_label, change) => {
    expect(() =>
      verifyPostBirthActivationSnapshot({ ...validSnapshot(), ...change }),
    ).toThrow(PostBirthActivationReviewError);
  });

  it('contains no key loading, signing, simulation, or submission path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal10n/post-birth-activation-review.ts', 'utf8'),
        readFile('src/cli/review-post-birth-activation-mainnet.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /generateSigner|keypairIdentity|loadExistingIsolatedSigner|buildAndSign|signTransaction|simulateTransaction|sendTransaction|sendAndConfirm/i,
    );
    expect(sources).not.toMatch(/messageBase64|serializedTransaction|secretKey|privateKey|mnemonic/i);
  });

  it('pins a public STOP artifact with no credential material', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal10n.post-birth-activation-review.json',
        'utf8',
      ),
    ) as Record<string, any>;
    expect(artifact).toMatchObject({
      goal: '10N',
      status: 'POST_BIRTH_ACTIVATION_REVIEW_PASSED',
      accounts: {
        fundingSourceSolSufficient: true,
        fundingSourceUsdcSufficient: true,
        childAccountsAbsent: true,
        activeExecutionDelegates: 0,
      },
      funding: {
        exactUsdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS.toString(),
        actualAcquisitionAllocationLamports:
          GOAL_10N_ACTUAL_ACQUISITION_ALLOCATION_LAMPORTS.toString(),
        unallocatedAcquisitionLamports:
          GOAL_10N_UNALLOCATED_ACQUISITION_LAMPORTS.toString(),
        boundaryStillClosed: true,
      },
      activation: {
        totalRentLamports: GOAL_10N_ACTIVATION_RENT_LAMPORTS.toString(),
        totalInternalFeesLamports:
          GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS.toString(),
        conservativeOwnerAfterLamports:
          GOAL_10N_CONSERVATIVE_OWNER_AFTER_LAMPORTS.toString(),
      },
      checks: {
        keyLoaded: false,
        transactionSigned: false,
        simulationAttempted: false,
        transactionSubmitted: false,
      },
      verdict: 'PASS_STOP_BEFORE_ATA_PERMISSION_OR_FUNDING_WRITE',
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /api[_-]?key|rpcUrl|secret|privateKey|seed|mnemonic|messageBase64/i,
    );
  });
});
