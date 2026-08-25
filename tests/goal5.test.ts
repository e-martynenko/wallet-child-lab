import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  readGoal5Artifact,
  type Goal5Artifact,
  writeGoal5Artifact,
} from '../src/goal5/artifact.js';
import {
  assertDistinctPrincipals,
  assertExecutiveSimulation,
  assertGoal5Confirmation,
  GOAL_5_CONFIRMATION,
  Goal5LifecycleError,
} from '../src/goal5/lifecycle.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Goal 5 write gate', () => {
  it('accepts only the exact Goal 5 confirmation', () => {
    expect(() => assertGoal5Confirmation([GOAL_5_CONFIRMATION])).not.toThrow();
    expect(() => assertGoal5Confirmation([])).toThrow(Goal5LifecycleError);
    expect(() =>
      assertGoal5Confirmation([GOAL_5_CONFIRMATION, '--extra']),
    ).toThrow(Goal5LifecycleError);
  });
});

describe('Goal 5 principals', () => {
  it('requires owner, next owner, executive, and Asset Signer to differ', () => {
    expect(() =>
      assertDistinctPrincipals({
        owner: 'owner',
        nextOwner: 'next-owner',
        executiveAuthority: 'executive',
        assetSigner: 'asset-signer',
      }),
    ).not.toThrow();
    expect(() =>
      assertDistinctPrincipals({
        owner: 'same',
        nextOwner: 'next-owner',
        executiveAuthority: 'same',
        assetSigner: 'asset-signer',
      }),
    ).toThrow(Goal5LifecycleError);
  });
});

describe('Goal 5 execute simulation checks', () => {
  it('accepts success only while execution is expected to be allowed', () => {
    expect(() => assertExecutiveSimulation(null, [], 'allowed')).not.toThrow();
    expect(() =>
      assertExecutiveSimulation({ InstructionError: [0, { Custom: 26 }] }, [], 'allowed'),
    ).toThrow(Goal5LifecycleError);
  });

  it('requires the exact Core NoApprovals error after revocation', () => {
    expect(() =>
      assertExecutiveSimulation(
        { InstructionError: [0, { Custom: 26 }] },
        ['Program failed: custom program error: 0x1a'],
        'NoApprovals',
      ),
    ).not.toThrow();
    expect(() =>
      assertExecutiveSimulation(
        { InstructionError: [0, { Custom: 1 }] },
        ['different failure'],
        'NoApprovals',
      ),
    ).toThrow(Goal5LifecycleError);
  });
});

describe('public Goal 5 artifact', () => {
  it('round-trips lifecycle evidence without key material', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal5-'));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, 'goal5.json');
    const artifact: Goal5Artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: 5,
      network: 'devnet',
      status: 'in-progress',
      startedAt: '2026-08-24T00:00:00.000Z',
      rpcOrigin: 'https://api.devnet.solana.com',
      addresses: {
        owner: 'owner',
        nextOwner: 'next-owner',
        executiveAuthority: 'executive',
        executiveProfile: 'executive-profile',
        executionDelegateRecord: 'delegate-record',
        collection: 'collection',
        asset: 'asset',
        agentIdentity: 'identity',
        assetSigner: 'asset-signer',
      },
      startingAssetSignerBalanceLamports: '10000000',
      transactions: {},
      checks: {},
    };

    await writeGoal5Artifact(artifact, artifactPath);
    await expect(readGoal5Artifact(artifactPath)).resolves.toEqual(artifact);
  });
});
