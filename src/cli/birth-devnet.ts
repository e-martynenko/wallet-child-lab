import { parseWalletChildConfig, type WalletChildConfig } from '../config/env.js';
import {
  assertGoal3Confirmation,
  runGoal3Birth,
} from '../goal3/birth.js';

function redactRpcUrl(message: string, config?: WalletChildConfig): string {
  if (!config) {
    return message;
  }
  return message.replaceAll(config.rpcUrl, config.rpcOrigin);
}

async function main(): Promise<void> {
  assertGoal3Confirmation(process.argv.slice(2));
  const config = parseWalletChildConfig(process.env);

  try {
    const artifact = await runGoal3Birth(config);
    console.info('Goal 3 read-back: PASS');
    console.info(`Collection: ${artifact.addresses.collection}`);
    console.info(`Asset: ${artifact.addresses.asset}`);
    console.info(`Agent Identity: ${artifact.addresses.agentIdentity}`);
    console.info(`Asset Signer: ${artifact.addresses.assetSigner}`);
    console.info('Asset Signer funding: 0 lamports (intentionally deferred)');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Goal 3 failure.';
    throw new Error(redactRpcUrl(message, config));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 3 stopped: ${message}`);
  process.exitCode = 1;
});
