import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  reviewPostBirthActivation,
} from '../goal10n/post-birth-activation-review.js';
import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';

const ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal10n.post-birth-activation-review.json',
);

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const review = await reviewPostBirthActivation(config);
    const artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: '10N',
      network: review.network,
      recordedAt: new Date().toISOString(),
      status: 'POST_BIRTH_ACTIVATION_REVIEW_PASSED',
      rpcOrigin: review.rpcOrigin,
      finalizedSlotFloor: review.finalizedSlotFloor,
      identity: review.identity,
      accounts: {
        ownerLamports: review.accounts.ownerLamports.toString(),
        fundingSourceSolSufficient:
          review.accounts.fundingSourceSolSufficient,
        fundingSourceUsdcSufficient:
          review.accounts.fundingSourceUsdcSufficient,
        childAccountsAbsent: review.accounts.childAccountsAbsent,
        activeExecutionDelegates: review.accounts.activeExecutionDelegates,
      },
      funding: {
        exactUsdcBaseUnits: review.funding.exactUsdcBaseUnits.toString(),
        externalFeeLamports: review.funding.externalFeeLamports.toString(),
        actualAcquisitionAllocationLamports:
          review.funding.actualAcquisitionAllocationLamports.toString(),
        unallocatedAcquisitionLamports:
          review.funding.unallocatedAcquisitionLamports.toString(),
        totalExperimentSolBoundaryLamports:
          review.funding.totalExperimentSolBoundaryLamports.toString(),
        boundaryStillClosed: review.funding.boundaryStillClosed,
      },
      activation: {
        executiveProfileRentLamports:
          review.activation.executiveProfileRentLamports.toString(),
        executionDelegateRentLamports:
          review.activation.executionDelegateRentLamports.toString(),
        tokenAccountRentLamports:
          review.activation.tokenAccountRentLamports.toString(),
        tokenAccountCount: review.activation.tokenAccountCount,
        totalRentLamports: review.activation.totalRentLamports.toString(),
        totalInternalFeesLamports:
          review.activation.totalInternalFeesLamports.toString(),
        conservativeOwnerDebitLamports:
          review.activation.conservativeOwnerDebitLamports.toString(),
        conservativeOwnerAfterLamports:
          review.activation.conservativeOwnerAfterLamports.toString(),
      },
      checks: review.checks,
      nextRequiredAction: review.nextRequiredAction,
      verdict: review.verdict,
    };
    await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    console.info('Goal 10N post-birth activation review: PASS');
    console.info(`Finalized slot floor: ${review.finalizedSlotFloor}`);
    console.info('Active execution delegates: 0');
    console.info('Child USDC ATAs: ABSENT');
    console.info(
      `Activation rent: ${review.activation.totalRentLamports} lamports`,
    );
    console.info(
      `All internal fees: ${review.activation.totalInternalFeesLamports} lamports`,
    );
    console.info(
      `Conservative owner after: ${review.activation.conservativeOwnerAfterLamports} lamports`,
    );
    console.info('Key loaded: NO');
    console.info('Transaction signed/simulated/submitted: NO');
    console.info(`Verdict: ${review.verdict}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10N stopped: ${message}`);
  process.exitCode = 1;
});
