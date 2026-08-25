import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';

import { readGoal5Artifact } from '../goal5/artifact.js';
import {
  createGoal9EArtifact,
  readGoal9EArtifact,
  writeGoal9EArtifact,
} from '../goal9e/artifact.js';
import { prepareMainnetRecoveryWallet } from '../goal9e/recovery.js';
import { readGoal9ReadinessArtifact } from '../mainnet/artifact.js';

const CONFIRMATION_FLAG = '--confirm-goal-9e-recovery';

async function main(): Promise<void> {
  if (process.argv.length !== 3 || process.argv[2] !== CONFIRMATION_FLAG) {
    throw new Error(
      `Refusing local key generation without exact flag ${CONFIRMATION_FLAG}.`,
    );
  }
  const [readiness, devnet, existing] = await Promise.all([
    readGoal9ReadinessArtifact(),
    readGoal5Artifact(),
    readGoal9EArtifact(),
  ]);
  if (!readiness || !devnet || devnet.status !== 'complete') {
    throw new Error('Goal 5 and Goal 9 public evidence must exist first.');
  }
  const forbidden = [
    readiness.addresses.owner,
    readiness.addresses.executive,
    ...Object.values(devnet.addresses),
  ];
  const offlineUmi = createUmi('http://127.0.0.1:8899');
  const recovery = await prepareMainnetRecoveryWallet(offlineUmi, forbidden);
  const artifact = createGoal9EArtifact({
    owner: readiness.addresses.owner,
    executive: readiness.addresses.executive,
    recovery: recovery.publicKey,
    ...(existing ? { createdAt: existing.createdAt } : {}),
  });
  await writeGoal9EArtifact(artifact);

  console.info('Goal 9E isolated recovery boundary: PASS');
  console.info(`Recovery: ${recovery.publicKey}`);
  console.info(`Recovery key: ${recovery.created ? 'CREATED' : 'REUSED'}`);
  console.info('Allowed USDC action: 100000 base units (0.1 USDC)');
  console.info('Funded: NO');
  console.info('Network request: NO');
  console.info('Offline builder shape tested: YES');
  console.info('Final Mainnet message built/signed/submitted: NO');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 9E recovery preparation stopped: ${message}`);
  process.exitCode = 1;
});
