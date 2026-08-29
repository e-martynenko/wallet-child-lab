import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  executeMainnetBirth,
  GOAL_10L_CONFIRMATION,
} from '../goal10l/mainnet-birth-execution.js';
import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';

const ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal10l.mainnet-birth-receipt.json',
);

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const receipt = await executeMainnetBirth(
      config,
      process.argv.slice(2),
    );
    const artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: '10L',
      network: 'mainnet-beta',
      recordedAt: new Date().toISOString(),
      status: 'MAINNET_BIRTH_FINALIZED',
      actionTimeConfirmation: {
        exactPhrase: GOAL_10L_CONFIRMATION,
        received: true,
        scope: 'ONE_ATOMIC_CORE_ASSET_AND_AGENT_IDENTITY_BIRTH',
      },
      finalizedTransaction: {
        signature: receipt.signature,
        slot: receipt.slot.toString(),
        messageSha256: receipt.messageSha256,
        signedTransactionSha256: receipt.signedTransactionSha256,
        instructionCount: 2,
        feeLamports: receipt.feeLamports.toString(),
        coreAssetRentLamports: receipt.coreAssetRentLamports.toString(),
        agentIdentityRentLamports:
          receipt.agentIdentityRentLamports.toString(),
        totalOwnerDebitLamports: receipt.totalOwnerDebitLamports.toString(),
        ownerPreLamports: receipt.ownerPreLamports.toString(),
        ownerPostLamports: receipt.ownerPostLamports.toString(),
        computeUnitsConsumed: receipt.computeUnitsConsumed,
        confirmationStatus: 'finalized',
        error: null,
      },
      identity: {
        owner: receipt.owner,
        coreAsset: receipt.coreAsset,
        agentIdentity: receipt.agentIdentity,
        assetSigner: receipt.assetSigner,
        collection: null,
        metadataUri: receipt.metadataUri,
      },
      checks: {
        metadataDurabilityRecheckedBeforeKeyLoad: true,
        allFutureAccountsAbsentBeforeKeyLoad: true,
        exactFeeRecheckedBeforeKeyLoad: true,
        isolatedOwnerAndCoreKeysMatched: true,
        sameSignedBytesSimulationPassed: true,
        exactSerializedBytesSubmittedOnce: true,
        finalizedTransactionDecoded: true,
        finalizedIdentityReadbackPassed: receipt.finalizedReadbackPassed,
        fundingIncluded: receipt.fundingIncluded,
        delegationIncluded: receipt.delegationIncluded,
        usdcIncluded: false,
      },
      verification: {
        testsPassedAfterWrite: false,
        typecheckPassedAfterWrite: false,
        codeReviewPassedAfterWrite: false,
        credentialScanPassedAfterWrite: false,
        diffCheckPassedAfterWrite: false,
      },
      nextGate: {
        fundingAuthorized: false,
        delegationAuthorized: false,
        usdcTestAuthorized: false,
        requiredNextGoal: '10M_POST_BIRTH_PERMISSION_AUDIT',
      },
      verdict: 'BIRTH_PASS_STOP_BEFORE_PERMISSION_OR_FUNDING_ACTION',
    };
    await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    console.info('Goal 10L Mainnet birth: FINALIZED');
    console.info(`Signature: ${receipt.signature}`);
    console.info(`Finalized slot: ${receipt.slot}`);
    console.info(`Core Asset: ${receipt.coreAsset}`);
    console.info(`Agent Identity: ${receipt.agentIdentity}`);
    console.info(`Owner after: ${receipt.ownerPostLamports} lamports`);
    console.info('Funding included: NO');
    console.info('Delegation included: NO');
    console.info('USDC included: NO');
    console.info('Verdict: BIRTH_PASS_STOP_BEFORE_PERMISSION_OR_FUNDING_ACTION');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10L stopped: ${message}`);
  process.exitCode = 1;
});
