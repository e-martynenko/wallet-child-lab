import { verifyGoal10IIrysTransaction } from '../goal10i/irys-transaction-verification.js';
import { verifyMainnetBirthPreflight } from '../goal10j/mainnet-birth-preflight.js';
import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const durability = await verifyGoal10IIrysTransaction();
    const preflight = await verifyMainnetBirthPreflight(config, durability);
    console.info('Goal 10J Mainnet birth preflight: READ-ONLY');
    console.info(`RPC origin: ${preflight.rpcOrigin}`);
    console.info(`Finalized slot: ${preflight.finalizedSlot}`);
    console.info(`Metadata durability: ${preflight.metadata.durability}`);
    console.info(
      `Supplemental Arweave evidence: ${preflight.metadata.supplementalArweaveEvidence}`,
    );
    console.info(`Metadata URI: ${preflight.metadata.uri}`);
    console.info(`Metadata SHA-256: ${preflight.metadata.sha256}`);
    console.info(`Required programs executable: YES`);
    console.info(`Frozen future accounts absent: ${preflight.accounts.checkedCount}/7`);
    console.info(`Owner balance: ${preflight.accounts.ownerBalanceLamports} lamports`);
    console.info(
      `Known fixed rent: ${preflight.fixedRent.knownFixedRentLamports} lamports`,
    );
    console.info(
      `Metaplex packages: agent-registry@${preflight.packageContract.agentRegistry}, ` +
        `core@${preflight.packageContract.core}, toolbox@${preflight.packageContract.toolbox}, ` +
        `umi@${preflight.packageContract.umi}, ` +
        `umi-bundle-defaults@${preflight.packageContract.umiBundleDefaults}`,
    );
    console.info('Core Asset key loaded: NO');
    console.info('Transaction built: NO');
    console.info('Transaction submitted: NO');
    console.info(`Verdict: ${preflight.verdict}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10J stopped: ${message}`);
  process.exitCode = 1;
});
