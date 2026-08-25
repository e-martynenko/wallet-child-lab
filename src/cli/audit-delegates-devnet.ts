import { parseWalletChildConfig, type WalletChildConfig } from '../config/env.js';
import { auditGoal9BDelegates } from '../goal9b/delegates.js';

function redactRpcUrl(message: string, config?: WalletChildConfig): string {
  return config ? message.replaceAll(config.rpcUrl, config.rpcOrigin) : message;
}

async function main(): Promise<void> {
  let config: WalletChildConfig | undefined;
  try {
    config = parseWalletChildConfig(process.env);
    const artifact = await auditGoal9BDelegates(config);
    console.info('Goal 9B delegation audit: PASS');
    console.info(`Finalized slot floor: ${artifact.finalizedSlotFloor}`);
    console.info(
      `Agent Tools accounts: ${artifact.counts.allProgramAccounts} (${artifact.counts.executiveProfiles} profiles, ${artifact.counts.executionDelegateRecords} delegate records)`,
    );
    console.info(
      `Active delegates for Wallet Child #001: ${artifact.counts.matchingAssetDelegates}`,
    );
    console.info(`Known record absent: ${artifact.checks.knownRecordAbsent}`);
    console.info('Transaction signed: NO');
    console.info('Transaction submitted: NO');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(redactRpcUrl(message, config));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 9B stopped: ${message}`);
  process.exitCode = 1;
});
