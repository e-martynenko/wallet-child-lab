import { parseWalletChildConfig, type WalletChildConfig } from '../config/env.js';
import {
  assertGoal9AConfirmation,
  runGoal9ATestTokenAction,
} from '../goal9a/execute.js';

function redactRpcUrl(message: string, config?: WalletChildConfig): string {
  return config ? message.replaceAll(config.rpcUrl, config.rpcOrigin) : message;
}

async function main(): Promise<void> {
  let config: WalletChildConfig | undefined;
  try {
    assertGoal9AConfirmation(process.argv.slice(2));
    config = parseWalletChildConfig(process.env);
    const artifact = await runGoal9ATestTokenAction(config);
    console.info('Goal 9A finalized read-back: PASS');
    console.info(`TEST mint: ${artifact.addresses.testMint}`);
    console.info(
      `Bounded transfer: ${artifact.policy.actionBaseUnits} base units to ${artifact.addresses.destinationAta}`,
    );
    console.info(
      `Owner rescue: ${artifact.policy.rescueBaseUnits} base units to ${artifact.addresses.recoveryAta}`,
    );
    console.info('Final delegation: REVOKED');
    console.info(`Denied after revoke: ${artifact.checks.deniedAfterRevoke}`);
    console.info(
      `Devnet SOL spent by owner: ${artifact.checks.final?.totalOwnerSpendLamports ?? 'missing'} lamports`,
    );
    console.info('Real USDC touched: NO');
    console.info('Mainnet transaction: NO');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(redactRpcUrl(message, config));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 9A stopped: ${message}`);
  process.exitCode = 1;
});
