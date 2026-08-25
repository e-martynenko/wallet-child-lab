import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const GOAL_3_ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.devnet.json',
);

export type TransactionRecord = {
  signature: string;
  status: 'submitted' | 'confirmed';
};

export type Goal3Artifact = {
  schemaVersion: 1;
  experiment: 'wallet-child-001';
  network: 'devnet';
  status: 'in-progress' | 'complete';
  startedAt: string;
  completedAt?: string;
  rpcOrigin: string;
  metadata: {
    gist: string;
    asset: string;
    collection: string;
  };
  addresses: {
    owner: string;
    collection?: string;
    asset?: string;
    agentIdentity?: string;
    assetSigner?: string;
  };
  transactions: {
    ownerAirdrops?: TransactionRecord[];
    createCollection?: TransactionRecord;
    createAsset?: TransactionRecord;
    registerIdentity?: TransactionRecord;
  };
  readBack?: {
    collectionName: string;
    collectionUri: string;
    collectionNumMinted: number;
    collectionCurrentSize: number;
    assetName: string;
    assetUri: string;
    agentIdentityUri: string;
    agentToken: null | string;
    assetSignerBalanceLamports: string;
    ownerBalanceLamports: string;
  };
};

export class Goal3ArtifactError extends Error {
  override readonly name = 'Goal3ArtifactError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTransactionRecord(value: unknown): value is TransactionRecord {
  return (
    isRecord(value) &&
    typeof value['signature'] === 'string' &&
    (value['status'] === 'submitted' || value['status'] === 'confirmed')
  );
}

function assertGoal3ArtifactShape(value: unknown): asserts value is Goal3Artifact {
  if (!isRecord(value)) {
    throw new Goal3ArtifactError('The Goal 3 artifact has an invalid shape.');
  }

  const metadata = value['metadata'];
  const addresses = value['addresses'];
  const transactions = value['transactions'];
  if (!isRecord(metadata) || !isRecord(addresses) || !isRecord(transactions)) {
    throw new Goal3ArtifactError('The Goal 3 artifact has an invalid shape.');
  }

  if (
    value['schemaVersion'] !== 1 ||
    value['experiment'] !== 'wallet-child-001' ||
    value['network'] !== 'devnet' ||
    (value['status'] !== 'in-progress' && value['status'] !== 'complete') ||
    typeof value['startedAt'] !== 'string' ||
    typeof value['rpcOrigin'] !== 'string' ||
    typeof metadata['gist'] !== 'string' ||
    typeof metadata['asset'] !== 'string' ||
    typeof metadata['collection'] !== 'string' ||
    typeof addresses['owner'] !== 'string'
  ) {
    throw new Goal3ArtifactError('The Goal 3 artifact has invalid required fields.');
  }

  for (const key of ['collection', 'asset', 'agentIdentity', 'assetSigner']) {
    const address = addresses[key];
    if (address !== undefined && typeof address !== 'string') {
      throw new Goal3ArtifactError(`The Goal 3 artifact has an invalid ${key} address.`);
    }
  }

  const airdrops = transactions['ownerAirdrops'];
  if (
    airdrops !== undefined &&
    (!Array.isArray(airdrops) || !airdrops.every(isTransactionRecord))
  ) {
    throw new Goal3ArtifactError('The Goal 3 artifact has invalid airdrop records.');
  }

  for (const key of ['createCollection', 'createAsset', 'registerIdentity']) {
    const transaction = transactions[key];
    if (transaction !== undefined && !isTransactionRecord(transaction)) {
      throw new Goal3ArtifactError(
        `The Goal 3 artifact has an invalid ${key} transaction.`,
      );
    }
  }
}

export function assertPublicArtifact(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    if (
      value.length === 64 &&
      value.every(
        (item) =>
          typeof item === 'number' &&
          Number.isInteger(item) &&
          item >= 0 &&
          item <= 255,
      )
    ) {
      throw new Goal3ArtifactError(
        `Possible secret-key byte array found at ${path}.`,
      );
    }

    value.forEach((item, index) =>
      assertPublicArtifact(item, `${path}[${index}]`),
    );
    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (/(secret|seed|private|keypair)/i.test(key)) {
      throw new Goal3ArtifactError(
        `Forbidden private-material field found at ${path}.${key}.`,
      );
    }
    assertPublicArtifact(item, `${path}.${key}`);
  }
}

export async function assertArtifactDoesNotExist(
  artifactPath = GOAL_3_ARTIFACT_PATH,
): Promise<void> {
  try {
    await stat(artifactPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw new Goal3ArtifactError('Could not inspect the Goal 3 artifact path.');
  }

  throw new Goal3ArtifactError(
    'The Goal 3 artifact already exists. Inspect it before any retry; this command will not create a second agent.',
  );
}

export async function readGoal3Artifact(
  artifactPath = GOAL_3_ARTIFACT_PATH,
): Promise<Goal3Artifact | null> {
  let contents: string;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new Goal3ArtifactError('Could not read the Goal 3 artifact.');
  }

  let artifact: unknown;
  try {
    artifact = JSON.parse(contents);
  } catch {
    throw new Goal3ArtifactError('The Goal 3 artifact is not valid JSON.');
  }

  assertPublicArtifact(artifact);
  assertGoal3ArtifactShape(artifact);
  return artifact;
}

export async function writeGoal3Artifact(
  artifact: Goal3Artifact,
  artifactPath = GOAL_3_ARTIFACT_PATH,
): Promise<void> {
  assertPublicArtifact(artifact);

  const parent = dirname(artifactPath);
  const temporaryPath = `${artifactPath}.tmp`;
  await mkdir(parent, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o644,
  });
  await rename(temporaryPath, artifactPath);
}
