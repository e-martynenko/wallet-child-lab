import { parseWalletChildConfig, type WalletChildConfig } from '../config/env.js';
import {
  assertGoal5Confirmation,
  runGoal5Lifecycle,
} from '../goal5/lifecycle.js';

function redactRpcUrl(message: string, config?: WalletChildConfig): string {
  return config ? message.replaceAll(config.rpcUrl, config.rpcOrigin) : message;
}

async function main(): Promise<void> {
  let config: WalletChildConfig | undefined;
  try {
    assertGoal5Confirmation(process.argv.slice(2));
    config = parseWalletChildConfig(process.env);
    const artifact = await runGoal5Lifecycle(config);
    console.info('Goal 5 read-back: PASS');
    console.info(`Executive: ${artifact.addresses.executiveAuthority}`);
    console.info(`Executive Profile: ${artifact.addresses.executiveProfile}`);
    console.info(
      `Execution Delegate Record: ${artifact.addresses.executionDelegateRecord}`,
    );
    console.info('Final delegation: REVOKED');
    console.info(`Final owner: ${artifact.checks.final?.owner ?? 'missing'}`);
    console.info(
      `Asset Signer balance: ${artifact.checks.final?.assetSignerBalanceLamports ?? 'missing'} lamports`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(redactRpcUrl(message, config));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 5 stopped: ${message}`);
  process.exitCode = 1;
});
