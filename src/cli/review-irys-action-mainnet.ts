import { prepareMetadataPublicationPlan } from '../goal10d/metadata-publication-plan.js';
import {
  createIrysFundingActionReview,
  verifyInstalledIrysSdkContract,
} from '../goal10e/irys-action-review.js';
import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const sdk = await verifyInstalledIrysSdkContract();
    const plan = await prepareMetadataPublicationPlan(config);
    const review = createIrysFundingActionReview(plan, sdk);
    console.info('Goal 10E Irys Mainnet action review: PASS');
    console.info(`RPC origin: ${plan.rpcOrigin}`);
    console.info(`Finalized slot: ${plan.finalizedSlot}`);
    console.info(`Irys existing balance: ${plan.irysExistingBalanceLamports} lamports`);
    console.info(`Funding message SHA-256: ${plan.fundingMessageSha256}`);
    console.info(`Blockhash context slot: ${plan.blockhashContextSlot}`);
    console.info(`Fee context slot: ${plan.feeContextSlot}`);
    console.info(`Last valid block height: ${plan.lastValidBlockHeight}`);
    console.info(
      `Pinned packages: @irys/upload@${sdk.packages.upload}, ` +
        `@irys/upload-solana@${sdk.packages.solana}`,
    );
    console.info(
      `Audit: ${sdk.audit.findings} findings ` +
        `(${sdk.audit.high} high, ${sdk.audit.moderate} moderate, ` +
        `${sdk.audit.low} low); exact-path acceptance only`,
    );
    console.info(`Funding: ${review.fundingLamports} lamports`);
    console.info(`Fee cap: ${review.feeCapLamports} lamports`);
    console.info(
      `Maximum owner outflow: ${review.maximumOwnerOutflowLamports} lamports`,
    );
    console.info('Owner key loaded: NO');
    console.info('SDK wallet initialized: NO');
    console.info('Funding attempted: NO');
    console.info('Upload attempted: NO');
    console.info('Transaction submitted: NO');
    console.info('Exact funding confirmation required:');
    console.info(review.confirmationPhrase);
    console.info(`Verdict: ${review.verdict}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10E stopped: ${message}`);
  process.exitCode = 1;
});
