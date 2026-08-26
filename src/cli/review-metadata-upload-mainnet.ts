import { reviewIrysMetadataUpload } from '../goal10g/metadata-upload-review.js';

async function main(): Promise<void> {
  const review = await reviewIrysMetadataUpload();
  console.info('Goal 10G Irys permanent metadata upload review: PASS');
  console.info(`Owner: ${review.owner}`);
  console.info(`Metadata SHA-256: ${review.metadataSha256}`);
  console.info(`Metadata bytes: ${review.metadataByteLength}`);
  console.info(`Content-Type: ${review.contentType}`);
  console.info(`Existing Irys credit: ${review.irysCreditLamports} lamports`);
  console.info(`Fresh tagged quote: ${review.freshTaggedQuoteLamports} lamports`);
  console.info(`Maximum existing-credit spend: ${review.maximumCreditSpendLamports}`);
  console.info('Top-up allowed: NO');
  console.info('Solana transaction included: NO');
  console.info('Owner key loaded: NO');
  console.info('SDK wallet initialized: NO');
  console.info('Upload attempted: NO');
  console.info('This upload will be public and intended to be permanent.');
  console.info('Exact upload confirmation required:');
  console.info(review.confirmationPhrase);
  console.info(`Verdict: ${review.verdict}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10G stopped: ${message}`);
  process.exitCode = 1;
});
