import { quoteFrozenMetadataOnIrys } from '../goal9k/irys-quote.js';

async function main(): Promise<void> {
  const evidence = await quoteFrozenMetadataOnIrys();
  console.info('Goal 9K Irys metadata quote: PASS');
  console.info(`Frozen SHA-256: ${evidence.metadataSha256}`);
  console.info(`Frozen bytes: ${evidence.metadataByteLength}`);
  console.info(`Quote: ${evidence.quoteLamports} lamports (${evidence.quoteSol} SOL)`);
  console.info(
    `Storage quote cap: ${evidence.maximumStorageQuoteLamports} lamports`,
  );
  console.info('Wallet key loaded: NO');
  console.info('Funding attempted: NO');
  console.info('Upload attempted: NO');
  console.info('Transaction submitted: NO');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 9K stopped: ${message}`);
  process.exitCode = 1;
});
