import { parseWalletChildConfig, type WalletChildConfig } from '../config/env.js';
import {
  assertGoal4Confirmation,
  runGoal4Funding,
} from '../goal4/fund.js';

function redactRpcUrl(message: string, config?: WalletChildConfig): string {
  return config ? message.replaceAll(config.rpcUrl, config.rpcOrigin) : message;
}

async function main(): Promise<void> {
  let config: WalletChildConfig | undefined;
  try {
    assertGoal4Confirmation(process.argv.slice(2));
    config = parseWalletChildConfig(process.env);
    const artifact = await runGoal4Funding(config);
    console.info('Goal 4 read-back: PASS');
    console.info(`Asset Signer: ${artifact.addresses.assetSigner}`);
    console.info(
      `Balance: ${artifact.funding.beforeLamports} -> ${artifact.funding.afterLamports} lamports`,
    );
    console.info(
      `Funding signature: ${artifact.funding.transaction?.signature ?? 'missing'}`,
    );
    console.info('Goal 4 funding created no executive.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(redactRpcUrl(message, config));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 4 stopped: ${message}`);
  process.exitCode = 1;
});
