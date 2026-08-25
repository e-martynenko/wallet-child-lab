import {
  parseDurableMetadataVerificationConfig,
  verifyDurableMetadataCopies,
} from '../goal9j/durable-metadata.js';

async function main(): Promise<void> {
  const config = parseDurableMetadataVerificationConfig(process.env);
  const evidence = await verifyDurableMetadataCopies(config);
  console.info('Goal 9J durable metadata retrieval: PASS');
  console.info(`Durable URI: ${evidence.durableUri}`);
  console.info(`SHA-256: ${evidence.sha256}`);
  console.info(`Bytes: ${evidence.byteLength}`);
  for (const retrieval of evidence.retrievals) {
    console.info(`Verified origin: ${retrieval.origin}`);
  }
  console.info('Exact bytes match: YES');
  console.info('On-chain URI update: NO');
  console.info('Transaction submitted: NO');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 9J stopped: ${message}`);
  process.exitCode = 1;
});
