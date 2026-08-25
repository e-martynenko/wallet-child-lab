import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  readGoal7Artifact,
  type Goal7Artifact,
  writeGoal7Artifact,
} from '../src/goal7/artifact.js';
import {
  assertGoal7Confirmation,
  GOAL_7_CONFIRMATION,
  Goal7ExecutionError,
  proveGoal7ForbiddenActions,
} from '../src/goal7/execute.js';
import { SYSTEM_PROGRAM_ID } from '../src/policy/policy.js';

const OWNER = '7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c';
const RECEIVER = 'B96kUFzEvVzmW9DKfg3VDV9ZagXXjZ9rc3vyZeMk5svy';
const EXECUTIVE = 'ET7sHJiBdS5VgXfQvgzenS9U1iPAa5b3dUZKotCDW2dn';
const ASSET_SIGNER = '5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Goal 7 write gate', () => {
  it('accepts only the exact Goal 7 confirmation', () => {
    expect(() => assertGoal7Confirmation([GOAL_7_CONFIRMATION])).not.toThrow();
    expect(() => assertGoal7Confirmation([])).toThrow(Goal7ExecutionError);
    expect(() =>
      assertGoal7Confirmation([GOAL_7_CONFIRMATION, '--extra']),
    ).toThrow(Goal7ExecutionError);
  });
});

describe('Goal 7 forbidden-action proof', () => {
  it('denies 1 SOL, an unknown recipient, and injected transaction data', () => {
    expect(
      proveGoal7ForbiddenActions({
        policy: {
          network: 'devnet',
          token: 'SOL',
          sourceAssetSigner: ASSET_SIGNER,
          allowedDestination: RECEIVER,
          maximumLamports: 1_000_000n,
          maximumFeePayerSpendLamports: 100_000n,
          allowedProgram: SYSTEM_PROGRAM_ID,
        },
        exampleIntent: {
          kind: 'TRANSFER',
          network: 'devnet',
          token: 'SOL',
          destination: RECEIVER,
          amountLamports: 100_000n,
        },
        accounts: {
          asset: '66aw2vNMJHk4xPjc6VAE9CPPahkEaj7EfpQFFuQuvTd2',
          collection: 'csuvrVdZYpgVT5dVH9LYfdzQuWzXBYwL1xWDkcenThX',
          assetSigner: ASSET_SIGNER,
          executionDelegateRecord:
            '4nzrCQWJNXRdyd7To3vtzMQioNkDrn4RduW4g3QcqFaH',
          feePayer: OWNER,
          executive: EXECUTIVE,
        },
      }),
    ).toEqual({
      oneSol: 'AMOUNT_OVER_LIMIT',
      unknownDestination: 'DESTINATION_NOT_ALLOWED',
      injectedProgram: 'MALFORMED_ACTION',
    });
  });
});

describe('public Goal 7 artifact', () => {
  it('round-trips prepared transaction evidence without private material', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal7-'));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, 'goal7.json');
    const artifact: Goal7Artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: 7,
      network: 'devnet',
      status: 'in-progress',
      startedAt: '2026-08-24T00:00:00.000Z',
      rpcOrigin: 'https://api.devnet.solana.com',
      addresses: {
        owner: OWNER,
        executiveAuthority: EXECUTIVE,
        executiveProfile: '5JCE3kBRz6U9hGWdEjAoPKrieucfgrnZ9n66Fz3R2Ymq',
        executionDelegateRecord:
          '4nzrCQWJNXRdyd7To3vtzMQioNkDrn4RduW4g3QcqFaH',
        collection: 'csuvrVdZYpgVT5dVH9LYfdzQuWzXBYwL1xWDkcenThX',
        asset: '66aw2vNMJHk4xPjc6VAE9CPPahkEaj7EfpQFFuQuvTd2',
        agentIdentity: '2n9Xko2hRYp7yRxGJCn72RQXdDfXwdpfTMC3ea2zbh57',
        assetSigner: ASSET_SIGNER,
        testReceiver: RECEIVER,
      },
      policy: {
        token: 'SOL',
        amountLamports: '100000',
        maximumTransferLamports: '1000000',
        maximumFeePayerSpendLamports: '100000',
        allowedProgram: SYSTEM_PROGRAM_ID,
      },
      startingBalances: {
        assetSignerLamports: '10000000',
        testReceiverLamports: '0',
        feePayerLamports: '1000000000',
      },
      transactions: {
        boundedTransfer: [
          {
            signature: 'public-signature',
            blockhash: 'public-blockhash',
            lastValidBlockHeight: 123,
            status: 'prepared',
          },
        ],
      },
      checks: {},
    };
    await writeGoal7Artifact(artifact, artifactPath);
    await expect(readGoal7Artifact(artifactPath)).resolves.toEqual(artifact);
  });
});
