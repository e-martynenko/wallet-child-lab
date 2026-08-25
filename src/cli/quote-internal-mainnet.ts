import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';
import { quoteUnsignedInternalMessageFees } from '../goal9r/internal-message-fees.js';

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const evidence = await quoteUnsignedInternalMessageFees(config);
    console.info('Goal 9R URI-independent Mainnet message fees: PASS');
    console.info(`RPC origin: ${evidence.rpcOrigin}`);
    for (const message of evidence.messages) {
      console.info(
        `${message.name}: ${message.quotedFeeLamports} lamports, ${message.requiredSignatures} signature(s), fee slot ${message.feeContextSlot}, SHA-256 ${message.messageSha256}`,
      );
    }
    console.info(`Total fee: ${evidence.totalFeeLamports} lamports`);
    console.info(`Blockhash context slot: ${evidence.blockhashContextSlot}`);
    console.info(`Last valid block height: ${evidence.lastValidBlockHeight}`);
    console.info('Message signed: NO');
    console.info('Simulation attempted: NO');
    console.info('Transaction submitted: NO');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 9R stopped: ${message}`);
  process.exitCode = 1;
});
