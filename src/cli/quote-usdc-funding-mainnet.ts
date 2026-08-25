import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';
import { quoteUnsignedUsdcFundingFee } from '../goal9o/usdc-funding-fee.js';

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const evidence = await quoteUnsignedUsdcFundingFee(config);
    console.info('Goal 9O unsigned Mainnet USDC funding fee: PASS');
    console.info(`RPC origin: ${evidence.rpcOrigin}`);
    console.info(`Source ATA: ${evidence.sourceTokenAccount}`);
    console.info(`Destination ATA: ${evidence.destinationTokenAccount}`);
    console.info(`Transfer: ${evidence.amountBaseUnits} USDC base units`);
    console.info(`Fee: ${evidence.quotedFeeLamports} lamports`);
    console.info(`Blockhash context slot: ${evidence.blockhashContextSlot}`);
    console.info(`Fee context slot: ${evidence.feeContextSlot}`);
    console.info(`Last valid block height: ${evidence.lastValidBlockHeight}`);
    console.info(`Message SHA-256: ${evidence.messageSha256}`);
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
  console.error(`Goal 9O stopped: ${message}`);
  process.exitCode = 1;
});
