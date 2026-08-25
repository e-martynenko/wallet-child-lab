import { parseWalletChildConfig, type WalletChildConfig } from '../config/env.js';
import {
  assertGoal7Confirmation,
  runGoal7BoundedAction,
} from '../goal7/execute.js';

function redactRpcUrl(message: string, config?: WalletChildConfig): string {
  return config ? message.replaceAll(config.rpcUrl, config.rpcOrigin) : message;
}

async function main(): Promise<void> {
  let config: WalletChildConfig | undefined;
  try {
    assertGoal7Confirmation(process.argv.slice(2));
    config = parseWalletChildConfig(process.env);
    const artifact = await runGoal7BoundedAction(config);
    console.info('Goal 7 read-back: PASS');
    console.info(
      `Bounded transfer: ${artifact.policy.amountLamports} lamports to ${artifact.addresses.testReceiver}`,
    );
    console.info(
      `Asset Signer balance: ${artifact.checks.final?.assetSignerBalanceLamports ?? 'missing'} lamports`,
    );
    console.info('Final delegation: REVOKED');
    console.info(
      `Denied after revoke: ${artifact.checks.deniedAfterRevoke ?? 'missing'}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(redactRpcUrl(message, config));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 7 stopped: ${message}`);
  process.exitCode = 1;
});
