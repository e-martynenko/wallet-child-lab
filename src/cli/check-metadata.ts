import { verifyGoal9CMetadataIntegrity } from '../goal9c/metadata.js';

async function main(): Promise<void> {
  const evidence = await verifyGoal9CMetadataIntegrity();
  console.info('Goal 9C metadata contract: PASS');
  console.info(`Type: ${evidence.metadata.type}`);
  console.info(`Active: ${evidence.metadata.active}`);
  console.info(`x402 support: ${evidence.metadata.x402Support}`);
  console.info(`Services: ${evidence.metadata.services.length}`);
  console.info(`Trust claims: ${evidence.metadata.supportedTrust.length}`);
  console.info(`SHA-256: ${evidence.sha256}`);
  console.info(`Canonical bytes: ${evidence.byteLength}`);
  console.info(`Publication: ${evidence.manifest.publicationStatus}`);
  console.info('On-chain URI updated: NO');
  console.info('Transaction submitted: NO');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 9C stopped: ${message}`);
  process.exitCode = 1;
});
