import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { assertPublicArtifact } from '../goal3/artifact.js';

export const GOAL_9A_ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal9a.devnet.json',
);

export type Goal9ATransactionName =
  | 'createMint'
  | 'createAtas'
  | 'mintSupply'
  | 'delegate'
  | 'boundedTransfer'
  | 'revoke'
  | 'ownerRescue';

export type Goal9ATransactionAttempt = {
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
  status: 'prepared' | 'submitted' | 'confirmed' | 'expired' | 'failed';
};

export type Goal9ABalances = {
  sourceBaseUnits: string;
  destinationBaseUnits: string;
  recoveryBaseUnits: string;
  feePayerLamports: string;
};

export type Goal9AArtifact = {
  schemaVersion: 1;
  experiment: 'wallet-child-001';
  goal: '9A';
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
    testMint: string;
    sourceAta: string;
    destinationAta: string;
    recoveryOwner: string;
    recoveryAta: string;
  };
  policy: {
    token: 'WALLET_CHILD_USDC_SHAPED_TEST_ONLY';
    decimals: 6;
    initialSupplyBaseUnits: '2000000';
    actionBaseUnits: '100000';
    maximumTransferBaseUnits: '1000000';
    rescueBaseUnits: '1900000';
    maximumFeePayerSpendLamports: '100000';
    allowedProgram: string;
  };
  ownerStartingLamports: string;
  transactions: Partial<
    Record<Goal9ATransactionName, Goal9ATransactionAttempt[]>
  >;
  checks: {
    forbiddenActionsDenied?: {
      officialMainnetUsdc: 'OFFICIAL_USDC_FORBIDDEN';
      officialDevnetUsdc: 'OFFICIAL_USDC_FORBIDDEN';
      overLimit: 'AMOUNT_OVER_LIMIT';
      unknownDestination: 'DESTINATION_NOT_ALLOWED';
      injectedInstruction: 'MALFORMED_ACTION';
    };
    mintVerified?: true;
    atasVerified?: true;
    mintAuthorityRevoked?: true;
    activeDelegateVerified?: true;
    actionBefore?: Goal9ABalances;
    actionAfter?: Goal9ABalances;
    actionReconciled?: true;
    recordAbsentAfterRevoke?: true;
    deniedAfterRevoke?: 'NoApprovals';
    rescueBefore?: Goal9ABalances;
    rescueAfter?: Goal9ABalances;
    rescueReconciled?: true;
    final?: {
      owner: string;
      activeDelegate: false;
      sourceBaseUnits: '0';
      destinationBaseUnits: '100000';
      recoveryBaseUnits: '1900000';
      mintSupplyBaseUnits: '2000000';
      mintAuthority: null;
      freezeAuthority: null;
      tokenDelegates: 0;
      tokenCloseAuthorities: 0;
      assetSignerBalanceLamports: '9900000';
      ownerEndingLamports: string;
      totalOwnerSpendLamports: string;
    };
  };
};

export class Goal9AArtifactError extends Error {
  override readonly name = 'Goal9AArtifactError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertGoal9AArtifactShape(
  value: unknown,
): asserts value is Goal9AArtifact {
  if (!isRecord(value)) {
    throw new Goal9AArtifactError('The Goal 9A artifact has an invalid shape.');
  }
  const addresses = value['addresses'];
  const policy = value['policy'];
  const transactions = value['transactions'];
  const checks = value['checks'];
  if (
    !isRecord(addresses) ||
    !isRecord(policy) ||
    !isRecord(transactions) ||
    !isRecord(checks)
  ) {
    throw new Goal9AArtifactError('The Goal 9A artifact has invalid sections.');
  }
  if (
    value['schemaVersion'] !== 1 ||
    value['experiment'] !== 'wallet-child-001' ||
    value['goal'] !== '9A' ||
    value['network'] !== 'devnet' ||
    (value['status'] !== 'in-progress' && value['status'] !== 'complete') ||
    typeof value['startedAt'] !== 'string' ||
    typeof value['rpcOrigin'] !== 'string' ||
    typeof value['ownerStartingLamports'] !== 'string'
  ) {
    throw new Goal9AArtifactError(
      'The Goal 9A artifact has invalid required fields.',
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
    'testMint',
    'sourceAta',
    'destinationAta',
    'recoveryOwner',
    'recoveryAta',
  ]) {
    if (typeof addresses[key] !== 'string') {
      throw new Goal9AArtifactError(`Invalid Goal 9A ${key} address.`);
    }
  }
  for (const name of [
    'createMint',
    'createAtas',
    'mintSupply',
    'delegate',
    'boundedTransfer',
    'revoke',
    'ownerRescue',
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
      throw new Goal9AArtifactError(`Invalid Goal 9A ${name} attempts.`);
    }
  }
}

export async function readGoal9AArtifact(
  artifactPath = GOAL_9A_ARTIFACT_PATH,
): Promise<Goal9AArtifact | null> {
  let contents: string;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Goal9AArtifactError('Could not read the Goal 9A artifact.');
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Goal9AArtifactError('The Goal 9A artifact is not valid JSON.');
  }
  assertPublicArtifact(value);
  assertGoal9AArtifactShape(value);
  return value;
}

export async function writeGoal9AArtifact(
  artifact: Goal9AArtifact,
  artifactPath = GOAL_9A_ARTIFACT_PATH,
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
