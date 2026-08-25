import { parseWalletChildConfig } from '../config/env.js';
import { verifyDevnetRpc } from '../chain/network.js';

async function main(): Promise<void> {
  const config = parseWalletChildConfig(process.env);
  const verification = await verifyDevnetRpc(config);

  process.stdout.write(
    [
      'Wallet Child network check',
      `Network: ${verification.network}`,
      `Genesis hash: ${verification.genesisHash}`,
      `RPC origin: ${verification.rpcOrigin}`,
      'Write capability: NOT CONFIGURED',
      '',
    ].join('\n'),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  process.stderr.write(`Wallet Child network check failed: ${message}\n`);
  process.exitCode = 1;
});
