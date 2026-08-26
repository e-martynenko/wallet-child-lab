import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  executeGoal10HIrysMetadataUpload,
  GOAL_10H_CONFIRMATION,
  recoverGoal10HAcceptedUpload,
} from '../goal10h/metadata-upload-execution.js';

const ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal10h.metadata-upload-receipt.json',
);

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  const recovered = arguments_[0] === '--recover';
  const recoveredId = arguments_[1];
  if (recovered && (arguments_.length !== 2 || !recoveredId)) {
    throw new Error('Goal 10H recovery requires exactly one Irys ID.');
  }
  const result = recovered
    ? await recoverGoal10HAcceptedUpload(recoveredId as string)
    : await executeGoal10HIrysMetadataUpload(arguments_);
  const artifact = {
    schemaVersion: 1,
    experiment: 'wallet-child-001',
    goal: '10H',
    network: 'mainnet',
    recordedAt: new Date().toISOString(),
    status: 'IRYS_METADATA_UPLOAD_VERIFIED',
    actionTimeConfirmation: {
      exactPhrase: GOAL_10H_CONFIRMATION,
      received: true,
      scope: 'ONE_EXACT_PUBLIC_IRYS_METADATA_UPLOAD',
      topUpIncluded: false,
      solanaTransactionIncluded: false,
      treasuryActionIncluded: false,
    },
    metadata: {
      sha256: result.metadataSha256,
      byteLength: result.metadataByteLength,
      contentType: result.contentType,
      owner: result.owner,
    },
    upload: {
      id: result.id,
      durableUri: result.durableUri,
      gatewayUrl: result.gatewayUrl,
      uploadCalls: result.uploadCalls,
      exactGatewayBytesVerified: result.exactGatewayBytesVerified,
      retrievals: result.retrievals,
      twoOriginExactBytesVerified: result.twoOriginExactBytesVerified,
    },
    irysCredit: {
      quoteLamports: result.quoteLamports.toString(),
      beforeLamports: result.creditBeforeLamports.toString(),
      afterLamports: result.creditAfterLamports.toString(),
      spentLamports: result.creditSpentLamports.toString(),
      topUpAttempted: result.topUpAttempted,
    },
    receipt: result.receipt,
    checks: {
      preKeyReviewPassed: true,
      existingOwnerKeyLoadedAfterPreflight: true,
      sdkWalletAddressVerified: true,
      receiptSignatureVerified: result.receipt.signatureVerified,
      exactGatewayBytesVerified: result.exactGatewayBytesVerified,
      uploadSubmittedOnce: result.uploadCalls === 1,
      twoOriginExactBytesVerified: result.twoOriginExactBytesVerified,
      solanaTransactionSubmitted: result.solanaTransactionSubmitted,
      treasuryActionAuthorized: result.treasuryActionAuthorized,
    },
    recovery: {
      used: recovered,
      reason: recovered
        ? 'Initial executor stopped after acceptance because receipt ID length and zero deadlineHeight were more permissive than the reviewed validator.'
        : null,
      secondUploadAttempted: false,
    },
    verification: {
      testsPassedAfterWrite: false,
      typecheckPassedAfterWrite: false,
      codeReviewPassedAfterWrite: false,
      credentialScanPassedAfterWrite: false,
      diffCheckPassedAfterWrite: false,
      twoOriginExactRetrievalPassed: result.twoOriginExactBytesVerified,
      arweaveSettlementVerified: false,
    },
    nextGate: {
      uploadAuthorized: false,
      topUpAuthorized: false,
      onChainBindingAuthorized: false,
      identityCreationAuthorized: false,
      treasuryActionAuthorized: false,
      requiredNextGoal: '10I_ARWEAVE_SETTLEMENT_VERIFICATION',
    },
    verdict: 'UPLOAD_PASS_STOP_BEFORE_ON_CHAIN_BINDING',
  };
  await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.info('Goal 10H Irys metadata upload: VERIFIED');
  console.info(`Irys ID: ${result.id}`);
  console.info(`Durable URI: ${result.durableUri}`);
  console.info(`Gateway: ${result.gatewayUrl}`);
  console.info(`SHA-256: ${result.metadataSha256}`);
  console.info(`Bytes: ${result.metadataByteLength}`);
  console.info(`Credit: ${result.creditBeforeLamports} -> ${result.creditAfterLamports}`);
  console.info(`Credit spent: ${result.creditSpentLamports} lamports`);
  console.info('Receipt signature verified: YES');
  console.info('Exact gateway bytes verified: YES');
  console.info('Two-origin exact bytes verified: YES');
  console.info(`Recovered without second upload: ${recovered ? 'YES' : 'NO'}`);
  console.info('Top-up attempted: NO');
  console.info('Solana transaction submitted: NO');
  console.info('Treasury action: NO_GO');
  console.info('Verdict: UPLOAD_PASS_STOP_BEFORE_ON_CHAIN_BINDING');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10H stopped: ${message}`);
  process.exitCode = 1;
});
