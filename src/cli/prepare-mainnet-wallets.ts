import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';

import { readGoal5Artifact } from '../goal5/artifact.js';
import {
  readGoal9ReadinessArtifact,
  writeGoal9ReadinessArtifact,
} from '../mainnet/artifact.js';
import { prepareMainnetReadinessWallets } from '../mainnet/wallets.js';

const CONFIRMATION_FLAG = '--confirm-goal-9-wallets';

async function main(): Promise<void> {
  if (
    process.argv.length !== 3 ||
    process.argv[2] !== CONFIRMATION_FLAG
  ) {
    throw new Error(
      `Refusing local key generation without exact flag ${CONFIRMATION_FLAG}.`,
    );
  }

  const devnet = await readGoal5Artifact();
  if (
    !devnet ||
    devnet.status !== 'complete' ||
    devnet.checks.final?.activeDelegate !== false
  ) {
    throw new Error(
      'Goal 5 must be complete with Devnet delegation revoked first.',
    );
  }
  const forbiddenPublicKeys = Object.values(devnet.addresses);
  const offlineUmi = createUmi('http://127.0.0.1:8899');
  const wallets = await prepareMainnetReadinessWallets(
    offlineUmi,
    forbiddenPublicKeys,
  );
  const existingArtifact = await readGoal9ReadinessArtifact();
  const artifact = {
    schemaVersion: 1,
    experiment: 'wallet-child-001',
    goal: 9,
    network: 'mainnet-beta',
    status: 'unfunded',
    createdAt: existingArtifact?.createdAt ?? new Date().toISOString(),
    addresses: {
      owner: wallets.owner.publicKey,
      executive: wallets.executive.publicKey,
    },
    checks: {
      distinctFromEachOther: true,
      distinctFromDevnet: true,
      funded: false,
    },
  } as const;
  await writeGoal9ReadinessArtifact(artifact);

  console.info('Goal 9 isolated readiness wallets: PASS');
  console.info(`Owner: ${wallets.owner.publicKey}`);
  console.info(`Executive: ${wallets.executive.publicKey}`);
  console.info(`Owner key: ${wallets.owner.created ? 'CREATED' : 'REUSED'}`);
  console.info(
    `Executive key: ${wallets.executive.created ? 'CREATED' : 'REUSED'}`,
  );
  console.info('Funded: NO');
  console.info('Network request: NO');
  console.info('Transaction built/signed/submitted: NO');
  console.info('Mainnet write capability: NOT IMPLEMENTED');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Goal 9 wallet preparation stopped: ${message}`);
  process.exitCode = 1;
});
