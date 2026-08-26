import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';
import { simulateUnsignedBootstrap } from '../goal10a/bootstrap-simulation.js';

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const evidence = await simulateUnsignedBootstrap(config);
    console.info('Goal 10A exact unsigned bootstrap simulation: PASS');
    console.info(`RPC origin: ${evidence.rpcOrigin}`);
    console.info(`Message SHA-256: ${evidence.messageSha256}`);
    console.info(`Blockhash context slot: ${evidence.blockhashContextSlot}`);
    console.info(`Account context slot: ${evidence.accountContextSlot}`);
    console.info(`Fee context slot: ${evidence.feeContextSlot}`);
    console.info(`Last valid block height: ${evidence.lastValidBlockHeight}`);
    console.info(
      `Serialized transaction length: ${evidence.serializedTransactionBytes} bytes`,
    );
    console.info(`Exact fee: ${evidence.quotedFeeLamports} lamports`);
    console.info(
      `Balances: ${evidence.sourceBeforeLamports} -> ${evidence.sourceAfterLamports} source; ` +
        `${evidence.ownerBeforeLamports} -> ${evidence.ownerAfterLamports} owner`,
    );
    console.info(`Simulation context slot: ${evidence.simulationContextSlot}`);
    console.info(`Units consumed: ${evidence.unitsConsumed ?? 'not returned'}`);
    console.info('Signature verification: OFF (unsigned simulation)');
    console.info('Transaction submitted: NO');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10A stopped: ${message}`);
  process.exitCode = 1;
});
