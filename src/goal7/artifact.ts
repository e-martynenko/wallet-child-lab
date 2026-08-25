import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { assertPublicArtifact } from '../goal3/artifact.js';

export const GOAL_7_ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal7.devnet.json',
);

export type Goal7TransactionName =
  | 'prepareReceiver'
  | 'delegate'
  | 'boundedTransfer'
  | 'revoke';

export type Goal7TransactionAttempt = {
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
  status: 'prepared' | 'submitted' | 'confirmed' | 'expired' | 'failed';
};

export type Goal7Balances = {
  assetSignerLamports: string;
  testReceiverLamports: string;
  feePayerLamports: string;
};

export type Goal7Artifact = {
  schemaVersion: 1;
  experiment: 'wallet-child-001';
  goal: 7;
  network: 'devnet';
  status: 'in-progress' | 'complete';
  startedAt: string;
  completedAt?: string;
  rpcOrigin: string;
  addresses: {
    owner: string;
    executiveAuthority: string;
    executiveProfile: string;
    executionDelegateRecord: string;
    collection: string;
    asset: string;
    agentIdentity: string;
    assetSigner: string;
    testReceiver: string;
  };
  policy: {
    token: 'SOL';
    amountLamports: '100000';
    maximumTransferLamports: '1000000';
    maximumFeePayerSpendLamports: '100000';
    allowedProgram: string;
  };
  startingBalances: Goal7Balances;
  transactions: Partial<
    Record<Goal7TransactionName, Goal7TransactionAttempt[]>
  >;
  checks: {
    forbiddenActionsDenied?: {
      oneSol: 'AMOUNT_OVER_LIMIT';
      unknownDestination: 'DESTINATION_NOT_ALLOWED';
      injectedProgram: 'MALFORMED_ACTION';
    };
    activeDelegateVerified?: true;
    receiverRentExempt?: {
      minimumLamports: '890880';
      ownerFundingLamports: '890880';
      balanceAfterLamports: string;
    };
    actionBefore?: Goal7Balances;
    actionAfter?: Goal7Balances;
    actionReconciled?: true;
    recordAbsentAfterRevoke?: true;
    deniedAfterRevoke?: 'NoApprovals';
    final?: {
      owner: string;
      activeDelegate: false;
      assetSignerBalanceLamports: '9900000';
      testReceiverBalanceLamports: string;
      legacyTokenAccounts: 0;
      token2022Accounts: 0;
    };
  };
};

export class Goal7ArtifactError extends Error {
  override readonly name = 'Goal7ArtifactError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertGoal7ArtifactShape(value: unknown): asserts value is Goal7Artifact {
  if (!isRecord(value)) {
    throw new Goal7ArtifactError('The Goal 7 artifact has an invalid shape.');
  }
  const addresses = value['addresses'];
  const policy = value['policy'];
  const startingBalances = value['startingBalances'];
  const transactions = value['transactions'];
  const checks = value['checks'];
  if (
    !isRecord(addresses) ||
    !isRecord(policy) ||
    !isRecord(startingBalances) ||
    !isRecord(transactions) ||
    !isRecord(checks)
  ) {
    throw new Goal7ArtifactError('The Goal 7 artifact has invalid sections.');
  }
  if (
    value['schemaVersion'] !== 1 ||
    value['experiment'] !== 'wallet-child-001' ||
    value['goal'] !== 7 ||
    value['network'] !== 'devnet' ||
    (value['status'] !== 'in-progress' && value['status'] !== 'complete') ||
    typeof value['startedAt'] !== 'string' ||
    typeof value['rpcOrigin'] !== 'string'
  ) {
    throw new Goal7ArtifactError(
      'The Goal 7 artifact has invalid required fields.',
    );
  }
  for (const key of [
    'owner',
    'executiveAuthority',
    'executiveProfile',
    'executionDelegateRecord',
    'collection',
    'asset',
    'agentIdentity',
    'assetSigner',
    'testReceiver',
  ]) {
    if (typeof addresses[key] !== 'string') {
      throw new Goal7ArtifactError(`Invalid Goal 7 ${key} address.`);
    }
  }
  for (const name of [
    'prepareReceiver',
    'delegate',
    'boundedTransfer',
    'revoke',
  ]) {
    const attempts = transactions[name];
    if (
      attempts !== undefined &&
      (!Array.isArray(attempts) ||
        !attempts.every(
          (attempt) =>
            isRecord(attempt) &&
            typeof attempt['signature'] === 'string' &&
            typeof attempt['blockhash'] === 'string' &&
            typeof attempt['lastValidBlockHeight'] === 'number' &&
            ['prepared', 'submitted', 'confirmed', 'expired', 'failed'].includes(
              String(attempt['status']),
            ),
        ))
    ) {
      throw new Goal7ArtifactError(`Invalid Goal 7 ${name} attempts.`);
    }
  }
}

export async function readGoal7Artifact(
  artifactPath = GOAL_7_ARTIFACT_PATH,
): Promise<Goal7Artifact | null> {
  let contents: string;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Goal7ArtifactError('Could not read the Goal 7 artifact.');
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Goal7ArtifactError('The Goal 7 artifact is not valid JSON.');
  }
  assertPublicArtifact(value);
  assertGoal7ArtifactShape(value);
  return value;
}

export async function writeGoal7Artifact(
  artifact: Goal7Artifact,
  artifactPath = GOAL_7_ARTIFACT_PATH,
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
