import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { reviewPostBirthActivation } from '../goal10n/post-birth-activation-review.js';
import {
  GOAL_10O_CONFIRMATION,
  reviewMainnetActivationWrite,
} from '../goal10o/mainnet-activation-write-review.js';
import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';

const ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal10o.mainnet-activation-write-review.json',
);

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const preflight = await reviewPostBirthActivation(config);
    const review = await reviewMainnetActivationWrite(config, preflight);
    const artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: '10O',
      network: review.network,
      recordedAt: new Date().toISOString(),
      status: 'KEYLESS_MAINNET_ACTIVATION_WRITE_REVIEW_PASSED',
      rpcOrigin: review.rpcOrigin,
      context: {
        preflightSlot: review.preflightSlot,
        blockhashContextSlot: review.blockhashContextSlot,
        simulationSlot: review.simulationSlot,
        lastValidBlockHeight: review.lastValidBlockHeight,
      },
      activation: {
        atomicTransactionCount: 1,
        transactionByteLength: review.transactionByteLength,
        instructionCount: review.instructionCount,
        requiredSigners: review.requiredSigners,
        assetSignerUsdcAta:
          'hCmisMZFRL7SWKvgdtFWXMTDW3PY858Kmvg6dQ8GQMU',
        recoveryUsdcAta: '8dbJMqCGAMTuJZ5ZZZeQMT43WqkkrwmBiyEJRH8szAd',
        executiveProfile: '3Uy4XhPJLAdFRyFLAfJM7ruNc3Td5Ld1258Gx5z2WYXo',
        executionDelegateRecord:
          'Fr2yQyG7gEQYjL6Sr8sYXrS2n21bfjod5rKQDdo7bgcm',
        messageSha256: review.messageSha256,
      },
      caps: {
        feeLamports: review.quotedFeeLamports.toString(),
        totalRentLamports: review.totalActivationRentLamports.toString(),
        totalDebitLamports: review.simulatedOwnerDebitLamports.toString(),
        ownerAfterLamports: review.simulatedOwnerAfterLamports.toString(),
        computeUnitsConsumed: review.computeUnitsConsumed,
      },
      checks: {
        createdAccountsEmpty: review.createdAccountsEmpty,
        broadExecutionDelegateCreated: review.broadExecutionDelegateCreated,
        fundingIncluded: review.fundingIncluded,
        usdcTransferIncluded: review.usdcTransferIncluded,
        externalActionIncluded: review.externalActionIncluded,
        keyLoaded: review.keyLoaded,
        messageSigned: review.messageSigned,
        simulationPassed: review.simulationPassed,
        transactionSubmitted: review.transactionSubmitted,
      },
      risk: {
        executionDelegateIsBroad: true,
        onchainAmountDestinationAndProgramCaps: false,
        offchainFixedBuilderAndIsolatedExecutiveRequired: true,
        ownerCanRevokeWithoutExecutive: true,
      },
      actionTimeConfirmation: {
        received: false,
        requiredExactPhrase: GOAL_10O_CONFIRMATION,
      },
      verdict: review.verdict,
    };
    await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    console.info('Goal 10O Mainnet activation write review: PASS');
    console.info(`Preflight slot: ${review.preflightSlot}`);
    console.info(`Simulation slot: ${review.simulationSlot}`);
    console.info(`Transaction bytes: ${review.transactionByteLength}`);
    console.info(`Instructions: ${review.instructionCount}`);
    console.info(`Required signers: ${review.requiredSigners.join(', ')}`);
    console.info(`Quoted fee: ${review.quotedFeeLamports} lamports`);
    console.info(
      `Total activation rent: ${review.totalActivationRentLamports} lamports`,
    );
    console.info(
      `Simulated owner debit: ${review.simulatedOwnerDebitLamports} lamports`,
    );
    console.info(
      `Simulated owner after: ${review.simulatedOwnerAfterLamports} lamports`,
    );
    console.info(`Compute units: ${review.computeUnitsConsumed}`);
    console.info('Broad execution delegate: YES');
    console.info('Funding/USDC transfer/external action: NO');
    console.info('Key loaded/signed/submitted: NO');
    console.info(`Verdict: ${review.verdict}`);
    console.info(`Required exact confirmation: ${review.requiredExactConfirmation}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10O stopped: ${message}`);
  process.exitCode = 1;
});
