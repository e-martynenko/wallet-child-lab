import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  executeGoal10FIrysFunding,
  GOAL_10F_CONFIRMATION,
} from '../goal10f/irys-funding-execution.js';
import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';

const ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal10f.irys-funding-receipt.json',
);

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const receipt = await executeGoal10FIrysFunding(
      config,
      process.argv.slice(2),
    );
  const artifact = {
    schemaVersion: 1,
    experiment: 'wallet-child-001',
    goal: '10F',
    network: 'mainnet-beta',
    recordedAt: new Date().toISOString(),
    status: 'FINALIZED_IRYS_FUNDING_CREDITED',
    actionTimeConfirmation: {
      exactPhrase: GOAL_10F_CONFIRMATION,
      received: true,
      scope: 'ONE_EXACT_SOLANA_TRANSFER_AND_IRYS_CREDIT_REGISTRATION',
      uploadIncluded: false,
    },
    finalizedTransaction: {
      signature: receipt.signature,
      slot: receipt.slot.toString(),
      source: '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385',
      destination: '9NERQjLetzquGwdKt3X4gZ8fE8fPfSkj2xo2esmUjWsz',
      program: '11111111111111111111111111111111',
      instructionCount: 1,
      transferLamports: receipt.transferLamports.toString(),
      feeLamports: receipt.feeLamports.toString(),
      maximumApprovedFeeLamports: '5000',
      ownerPreLamports: receipt.ownerPreLamports.toString(),
      ownerPostLamports: receipt.ownerPostLamports.toString(),
      destinationPreLamports: receipt.destinationPreLamports.toString(),
      destinationPostLamports: receipt.destinationPostLamports.toString(),
      signedTransactionSha256: receipt.signedTransactionSha256,
      fundingMessageSha256: receipt.fundingMessageSha256,
      confirmationStatus: 'finalized',
      error: null,
    },
    irysCredit: {
      owner: '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385',
      token: 'solana',
      creditedLamports: receipt.irysCreditLamports.toString(),
      registered: receipt.irysCreditRegistered,
    },
    checks: {
      ownerKeyLoadedAfterPreflight: true,
      messageSigned: true,
      sameSignedBytesSimulationPassed: true,
      transactionSubmittedOnce: true,
      finalizedDecodePassed: true,
      finalizedBalanceReadbackPassed: true,
      irysCreditRegistered: true,
      sdkWalletInitialized: receipt.sdkWalletInitialized,
      uploadAttempted: receipt.uploadAttempted,
      treasuryActionAuthorized: false,
      topUpAllowed: false,
    },
    verification: {
      testsPassedAfterWrite: false,
      typecheckPassedAfterWrite: false,
      codeReviewPassedAfterWrite: false,
      credentialScanPassedAfterWrite: false,
      diffCheckPassedAfterWrite: false,
    },
    nextGate: {
      nextFinancialActionAuthorized: false,
      uploadAuthorized: false,
      treasuryActionAuthorized: false,
      treasuryActionVerdict: 'NO_GO',
      requiredNextGoal: '10G_IRYS_METADATA_UPLOAD_REVIEW',
    },
    verdict: 'IRYS_FUNDING_PASS_STOP_BEFORE_UPLOAD',
  };
    await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    console.info('Goal 10F Irys funding: FINALIZED AND CREDITED');
    console.info(`Signature: ${receipt.signature}`);
    console.info(`Finalized slot: ${receipt.slot}`);
    console.info(`Transfer: ${receipt.transferLamports} lamports`);
    console.info(`Fee: ${receipt.feeLamports} lamports`);
    console.info(`Owner after: ${receipt.ownerPostLamports} lamports`);
    console.info(`Irys credit: ${receipt.irysCreditLamports} lamports`);
    console.info('Upload attempted: NO');
    console.info('Treasury action: NO_GO');
    console.info('Verdict: IRYS_FUNDING_PASS_STOP_BEFORE_UPLOAD');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10F stopped: ${message}`);
  process.exitCode = 1;
});
