import { verifyGoal10IIrysTransaction } from '../goal10i/irys-transaction-verification.js';
import { verifyMainnetBirthPreflight } from '../goal10j/mainnet-birth-preflight.js';
import { reviewMainnetBirthWrite } from '../goal10k/mainnet-birth-write-review.js';
import { parseBootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';

async function main(): Promise<void> {
  const config = parseBootstrapFeeConfig(process.env);
  try {
    const durability = await verifyGoal10IIrysTransaction();
    const preflight = await verifyMainnetBirthPreflight(config, durability);
    const review = await reviewMainnetBirthWrite(config, preflight);
    console.info('Goal 10K Mainnet birth write review: PASS');
    console.info(`RPC origin: ${review.rpcOrigin}`);
    console.info(`Blockhash context slot: ${review.blockhashContextSlot}`);
    console.info(`Simulation slot: ${review.simulationSlot}`);
    console.info(`Message SHA-256: ${review.messageSha256}`);
    console.info(`Transaction bytes: ${review.transactionByteLength}`);
    console.info(`Instructions: ${review.instructionCount}`);
    console.info(`Required signers: ${review.requiredSigners.join(', ')}`);
    console.info(`Quoted fee: ${review.quotedFeeLamports} lamports`);
    console.info(`Core Asset rent: ${review.coreAssetRentLamports} lamports`);
    console.info(`Agent Identity rent: ${review.agentIdentityRentLamports} lamports`);
    console.info(`Total birth rent: ${review.totalBirthRentLamports} lamports`);
    console.info(
      `Simulated owner debit: ${review.simulatedOwnerDebitLamports} lamports`,
    );
    console.info(
      `Simulation post-balance includes fee: ${review.simulationPostBalanceIncludesFee ? 'YES' : 'NO'}`,
    );
    console.info(`Compute units: ${review.computeUnitsConsumed}`);
    console.info('Key loaded: NO');
    console.info('Message signed: NO');
    console.info('Transaction submitted: NO');
    console.info(`Verdict: ${review.verdict}`);
    console.info(`Required exact confirmation: ${review.requiredExactConfirmation}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(message.replaceAll(config.rpcUrl, config.rpcOrigin));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 10K stopped: ${message}`);
  process.exitCode = 1;
});
