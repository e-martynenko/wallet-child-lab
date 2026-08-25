import { mplAgentIdentity } from '@metaplex-foundation/mpl-agent-registry';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';

import { readGoal5Artifact } from '../goal5/artifact.js';
import { readGoal9EArtifact } from '../goal9e/artifact.js';
import { GOAL_9L_FUNDING_SOURCE } from '../goal9l/funding-route.js';
import { prepareMainnetIdentityAddresses } from '../goal9n/identity-addresses.js';
import { readGoal9ReadinessArtifact } from '../mainnet/artifact.js';

const CONFIRMATION_FLAG = '--confirm-goal-9n-addresses';

async function main(): Promise<void> {
  if (process.argv.length !== 3 || process.argv[2] !== CONFIRMATION_FLAG) {
    throw new Error(
      `Refusing local Core Asset key generation without exact flag ${CONFIRMATION_FLAG}.`,
    );
  }
  const [devnet, readiness, recovery] = await Promise.all([
    readGoal5Artifact(),
    readGoal9ReadinessArtifact(),
    readGoal9EArtifact(),
  ]);
  if (!devnet || !readiness || !recovery) {
    throw new Error('Goals 5, 9, and 9E evidence are required.');
  }
  const umi = createUmi('http://127.0.0.1:8899')
    .use(mplCore())
    .use(mplAgentIdentity())
    .use(mplToolbox());
  const addresses = await prepareMainnetIdentityAddresses(umi, {
    owner: readiness.addresses.owner,
    executive: readiness.addresses.executive,
    recovery: recovery.addresses.recovery,
    fundingSource: GOAL_9L_FUNDING_SOURCE,
    forbiddenPublicKeys: Object.values(devnet.addresses),
  });
  console.info('Goal 9N final standalone identity addresses: PASS');
  console.info(`Core Asset: ${addresses.coreAsset.publicKey}`);
  console.info(`Agent Identity: ${addresses.agentIdentity}`);
  console.info(`Asset Signer PDA: ${addresses.assetSignerPda}`);
  console.info(`Asset Signer USDC ATA: ${addresses.assetSignerUsdcAta}`);
  console.info(`Recovery USDC ATA: ${addresses.recoveryUsdcAta}`);
  console.info(`Core Asset key: ${addresses.coreAsset.created ? 'CREATED' : 'REUSED'}`);
  console.info('Collection: NONE (standalone Mainnet Asset)');
  console.info('Network request: NO');
  console.info('Transaction built/signed/submitted: NO');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 9N stopped: ${message}`);
  process.exitCode = 1;
});
