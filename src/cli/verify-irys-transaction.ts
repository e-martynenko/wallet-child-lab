import { verifyGoal10IIrysTransaction } from '../goal10i/irys-transaction-verification.js';

async function main(): Promise<void> {
  const evidence = await verifyGoal10IIrysTransaction();
  console.info(
    `Goal 10I Irys transaction verification: ${evidence.settlement.state === 'SETTLED' ? 'PASS' : 'PARTIAL'}`,
  );
  console.info(`Irys ID: ${evidence.id}`);
  console.info(`Canonical URI: ${evidence.canonicalIrysUri}`);
  console.info(`SHA-256: ${evidence.metadataSha256}`);
  console.info(`Bytes: ${evidence.metadataByteLength}`);
  console.info(`Indexed owner: ${evidence.indexer.owner}`);
  console.info('Receipt signature verified now: YES');
  console.info(
    `Non-canonical arweave.net probe: HTTP ${evidence.uriCorrection.arweaveProbeStatus}`,
  );
  console.info(`Uploader status: ${evidence.settlement.uploaderStatus}`);
  console.info(
    `Seeded miners: ${evidence.settlement.seededMinerCount}/${evidence.settlement.requiredSeededMinerCount}`,
  );
  console.info(`Arweave bundle: ${evidence.settlement.bundleId ?? 'NOT INDEXED'}`);
  console.info(
    `Arweave confirmations: ${evidence.settlement.confirmations}/${evidence.settlement.requiredConfirmations}`,
  );
  console.info(`Settlement state: ${evidence.settlement.state}`);
  console.info('Owner key loaded: NO');
  console.info('Upload attempted: NO');
  console.info('Solana transaction submitted: NO');
  console.info('On-chain binding attempted: NO');
  if (evidence.settlement.state !== 'SETTLED') process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10I stopped: ${message}`);
  process.exitCode = 1;
});
