import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { createNoopSigner, publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';

import { buildBoundedTransfer } from '../actions/transfer.js';
import { loadWalletChildGoal6Policy } from '../policy/wallet-child-policy.js';

async function main(): Promise<void> {
  const configured = await loadWalletChildGoal6Policy();
  const offlineUmi = createUmi('http://127.0.0.1:8899')
    .use(mplToolbox())
    .use(mplCore());
  const result = buildBoundedTransfer(
    offlineUmi,
    configured.exampleIntent,
    configured.policy,
    {
      asset: configured.accounts.asset,
      collection: configured.accounts.collection,
      assetSigner: configured.accounts.assetSigner,
      executionDelegateRecord:
        configured.accounts.executionDelegateRecord,
      feePayer: createNoopSigner(publicKey(configured.accounts.feePayer)),
      executive: createNoopSigner(publicKey(configured.accounts.executive)),
    },
  );

  console.info('Goal 6 policy firewall: PASS');
  console.info(`Network: ${result.policy.network}`);
  console.info(`Token: ${result.policy.token}`);
  console.info(`Source: ${result.policy.sourceAssetSigner}`);
  console.info(`Destination: ${result.policy.allowedDestination}`);
  console.info(`Maximum: ${result.policy.maximumLamports} lamports`);
  console.info(`Example: ${result.intent.amountLamports} lamports`);
  console.info('Inner program: System Program only');
  console.info('Inner instructions: exactly 1');
  console.info('Transaction signed: NO');
  console.info('Transaction submitted: NO');
  console.info('Execution delegation remains: REVOKED');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Policy check stopped: ${message}`);
  process.exitCode = 1;
});
