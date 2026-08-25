import { readGoal9ReadinessArtifact } from '../mainnet/artifact.js';
import {
  auditMainnetDelegates,
  parseMainnetDelegateAuditConfig,
} from '../goal9i/mainnet-delegates.js';

async function main(): Promise<void> {
  const readiness = await readGoal9ReadinessArtifact();
  if (!readiness) throw new Error('Goal 9 readiness evidence is missing.');
  const config = parseMainnetDelegateAuditConfig(
    process.env,
    readiness.addresses.owner,
  );
  try {
    const evidence = await auditMainnetDelegates(config);
    console.info('Goal 9I Mainnet delegation audit: PASS');
    console.info(`RPC origin: ${evidence.rpcOrigin}`);
    console.info(`Asset: ${evidence.asset}`);
    console.info(`Finalized slot floor: ${evidence.finalizedSlotFloor}`);
    console.info(
      `Agent Tools accounts: ${evidence.counts.allProgramAccounts} (${evidence.counts.executiveProfiles} profiles, ${evidence.counts.executionDelegateRecords} records)`,
    );
    console.info('Active delegates for final asset: 0');
    console.info('Key loaded: NO');
    console.info('Transaction built/signed/submitted: NO');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 9I stopped: ${message}`);
  process.exitCode = 1;
});
