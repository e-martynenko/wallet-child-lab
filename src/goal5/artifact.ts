import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  assertPublicArtifact,
  type TransactionRecord,
} from '../goal3/artifact.js';

export const GOAL_5_ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal5.devnet.json',
);

export type Goal5TransactionName =
  | 'registerExecutive'
  | 'delegateInitial'
  | 'revokeInitial'
  | 'delegateOwnershipTest'
  | 'transferToNextOwner'
  | 'revokeAfterTransfer'
  | 'transferBack';

export type Goal5Artifact = {
  schemaVersion: 1;
  experiment: 'wallet-child-001';
  goal: 5;
  network: 'devnet';
  status: 'in-progress' | 'complete';
  startedAt: string;
  completedAt?: string;
  rpcOrigin: string;
  addresses: {
    owner: string;
    nextOwner: string;
    executiveAuthority: string;
    executiveProfile: string;
    executionDelegateRecord: string;
    collection: string;
    asset: string;
    agentIdentity: string;
    assetSigner: string;
  };
  startingAssetSignerBalanceLamports: string;
  transactions: Partial<Record<Goal5TransactionName, TransactionRecord>>;
  checks: {
    executiveProfileVerified?: true;
    initialDelegationVerified?: true;
    activeSimulationBeforeRevoke?: 'allowed';
    recordAbsentAfterInitialRevoke?: true;
    deniedAfterInitialRevoke?: 'NoApprovals';
    ownershipTest?: {
      ownerBefore: string;
      ownerAfter: string;
      delegateRecordSurvived: true;
      activeSimulationAfterTransfer: 'allowed';
    };
    recordAbsentAfterFinalRevoke?: true;
    deniedAfterFinalRevoke?: 'NoApprovals';
    final?: {
      owner: string;
      activeDelegate: false;
      assetSignerBalanceLamports: string;
      legacyTokenAccounts: number;
      token2022Accounts: number;
    };
  };
};

export class Goal5ArtifactError extends Error {
  override readonly name = 'Goal5ArtifactError';
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

function assertGoal5ArtifactShape(value: unknown): asserts value is Goal5Artifact {
  if (!isRecord(value)) {
    throw new Goal5ArtifactError('The Goal 5 artifact has an invalid shape.');
  }

  const addresses = value['addresses'];
  const transactions = value['transactions'];
  const checks = value['checks'];
  if (
    !isRecord(addresses) ||
    !isRecord(transactions) ||
    !isRecord(checks)
  ) {
    throw new Goal5ArtifactError('The Goal 5 artifact has invalid sections.');
  }

  if (
    value['schemaVersion'] !== 1 ||
    value['experiment'] !== 'wallet-child-001' ||
    value['goal'] !== 5 ||
    value['network'] !== 'devnet' ||
    (value['status'] !== 'in-progress' && value['status'] !== 'complete') ||
    typeof value['startedAt'] !== 'string' ||
    typeof value['rpcOrigin'] !== 'string' ||
    typeof value['startingAssetSignerBalanceLamports'] !== 'string'
  ) {
    throw new Goal5ArtifactError(
      'The Goal 5 artifact has invalid required fields.',
    );
  }

  for (const key of [
    'owner',
    'nextOwner',
    'executiveAuthority',
    'executiveProfile',
    'executionDelegateRecord',
    'collection',
    'asset',
    'agentIdentity',
    'assetSigner',
  ]) {
    if (typeof addresses[key] !== 'string') {
      throw new Goal5ArtifactError(
        `The Goal 5 artifact has an invalid ${key} address.`,
      );
    }
  }

  const transactionNames: Goal5TransactionName[] = [
    'registerExecutive',
    'delegateInitial',
    'revokeInitial',
    'delegateOwnershipTest',
    'transferToNextOwner',
    'revokeAfterTransfer',
    'transferBack',
  ];
  for (const name of transactionNames) {
    const transaction = transactions[name];
    if (transaction !== undefined && !isTransactionRecord(transaction)) {
      throw new Goal5ArtifactError(
        `The Goal 5 artifact has an invalid ${name} transaction.`,
      );
    }
  }
}

export async function readGoal5Artifact(
  artifactPath = GOAL_5_ARTIFACT_PATH,
): Promise<Goal5Artifact | null> {
  let contents: string;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new Goal5ArtifactError('Could not read the Goal 5 artifact.');
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Goal5ArtifactError('The Goal 5 artifact is not valid JSON.');
  }

  assertPublicArtifact(value);
  assertGoal5ArtifactShape(value);
  return value;
}

export async function writeGoal5Artifact(
  artifact: Goal5Artifact,
  artifactPath = GOAL_5_ARTIFACT_PATH,
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
