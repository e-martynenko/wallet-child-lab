import { prepareMetadataPublicationPlan } from '../goal10d/metadata-publication-plan.js';
import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const plan = await prepareMetadataPublicationPlan(config);
    console.info('Goal 10D Mainnet metadata publication plan: PASS');
    console.info(`RPC origin: ${plan.rpcOrigin}`);
    console.info(`Finalized slot: ${plan.finalizedSlot}`);
    console.info(`Irys version: ${plan.irysVersion}`);
    console.info(`Irys funding address: ${plan.irysFundingAddress}`);
    console.info(`Irys existing balance: ${plan.irysExistingBalanceLamports} lamports`);
    console.info(`Storage: ${plan.storageQuoteLamports} lamports`);
    console.info(`Funding fee: ${plan.fundingFeeLamports} lamports`);
    console.info(`Blockhash context slot: ${plan.blockhashContextSlot}`);
    console.info(`Fee context slot: ${plan.feeContextSlot}`);
    console.info(`Last valid block height: ${plan.lastValidBlockHeight}`);
    console.info(`Fixed known rents: ${plan.fixedRentLamports} lamports`);
    console.info(
      `Metadata publication total: ${plan.metadataPublicationLamports} lamports`,
    );
    console.info(`Known owner costs: ${plan.knownOwnerCostsLamports} lamports`);
    console.info(
      `Owner after known costs: ${plan.ownerAfterKnownCostsLamports} lamports`,
    );
    console.info(`Funding message SHA-256: ${plan.fundingMessageSha256}`);
    console.info('Message signed: NO');
    console.info('Funding attempted: NO');
    console.info('Upload attempted: NO');
    console.info('Transaction submitted: NO');
    console.info(`Verdict: ${plan.verdict}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10D stopped: ${message}`);
  process.exitCode = 1;
});
