import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { assertPublicArtifact } from '../goal3/artifact.js';
import type { TokenAccountSummary } from './wallet.js';

export const GOAL_4_ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal4.devnet.json',
);

export type Goal4Artifact = {
  schemaVersion: 1;
  experiment: 'wallet-child-001';
  goal: 4;
  network: 'devnet';
  status: 'in-progress' | 'complete';
  startedAt: string;
  completedAt?: string;
  rpcOrigin: string;
  addresses: {
    owner: string;
    collection: string;
    asset: string;
    agentIdentity: string;
    assetSigner: string;
  };
  funding: {
    amountLamports: string;
    ownerBeforeLamports: string;
    beforeLamports: string;
    ownerAfterLamports?: string;
    afterLamports?: string;
    transaction?: {
      signature: string;
      status: 'submitted' | 'confirmed';
    };
  };
  readBack?: {
    registered: true;
    executive: 'NONE';
    tokenAccounts: {
      legacy: TokenAccountSummary[];
      token2022: TokenAccountSummary[];
    };
    relationship: {
      assetOwner: string;
      assetCollection: string;
      collectionUpdateAuthority: string;
      identityAsset: string;
    };
  };
};

export class Goal4ArtifactError extends Error {
  override readonly name = 'Goal4ArtifactError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertGoal4ArtifactShape(value: unknown): asserts value is Goal4Artifact {
  if (!isRecord(value)) {
    throw new Goal4ArtifactError('The Goal 4 artifact has an invalid shape.');
  }
  const addresses = value['addresses'];
  const funding = value['funding'];
  if (!isRecord(addresses) || !isRecord(funding)) {
    throw new Goal4ArtifactError('The Goal 4 artifact has invalid sections.');
  }
  if (
    value['schemaVersion'] !== 1 ||
    value['experiment'] !== 'wallet-child-001' ||
    value['goal'] !== 4 ||
    value['network'] !== 'devnet' ||
    (value['status'] !== 'in-progress' && value['status'] !== 'complete') ||
    typeof value['startedAt'] !== 'string' ||
    typeof value['rpcOrigin'] !== 'string' ||
    typeof funding['amountLamports'] !== 'string' ||
    typeof funding['ownerBeforeLamports'] !== 'string' ||
    typeof funding['beforeLamports'] !== 'string'
  ) {
    throw new Goal4ArtifactError('The Goal 4 artifact has invalid required fields.');
  }
  for (const key of [
    'owner',
    'collection',
    'asset',
    'agentIdentity',
    'assetSigner',
  ]) {
    if (typeof addresses[key] !== 'string') {
      throw new Goal4ArtifactError(`The Goal 4 artifact has an invalid ${key}.`);
    }
  }
  const transaction = funding['transaction'];
  if (
    transaction !== undefined &&
    (!isRecord(transaction) ||
      typeof transaction['signature'] !== 'string' ||
      (transaction['status'] !== 'submitted' &&
        transaction['status'] !== 'confirmed'))
  ) {
    throw new Goal4ArtifactError('The Goal 4 artifact has an invalid transaction.');
  }
}

export async function readGoal4Artifact(
  artifactPath = GOAL_4_ARTIFACT_PATH,
): Promise<Goal4Artifact | null> {
  let contents: string;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new Goal4ArtifactError('Could not read the Goal 4 artifact.');
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Goal4ArtifactError('The Goal 4 artifact is not valid JSON.');
  }
  assertPublicArtifact(value);
  assertGoal4ArtifactShape(value);
  return value;
}

export async function writeGoal4Artifact(
  artifact: Goal4Artifact,
  artifactPath = GOAL_4_ARTIFACT_PATH,
): Promise<void> {
  assertPublicArtifact(artifact);
  const temporaryPath = `${artifactPath}.tmp`;
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o644,
  });
  await rename(temporaryPath, artifactPath);
}
