import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  findAgentIdentityV2Pda,
  mplAgentIdentity,
} from '@metaplex-foundation/mpl-agent-registry';
import {
  findAssetSignerPda,
  mplCore,
} from '@metaplex-foundation/mpl-core';
import { generateSigner } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertPublicArtifact,
  type Goal3Artifact,
  Goal3ArtifactError,
  readGoal3Artifact,
  writeGoal3Artifact,
} from '../src/goal3/artifact.js';
import {
  assertGoal3Confirmation,
  GOAL_3_CONFIRMATION,
  Goal3BirthError,
  requestDevnetAirdrop,
} from '../src/goal3/birth.js';
import {
  assertGoal3ReadBack,
  type Goal3Expected,
  type Goal3ReadBack,
  Goal3InvariantError,
} from '../src/goal3/invariants.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function validReadBack(): {
  actual: Goal3ReadBack;
  expected: Goal3Expected;
} {
  const expected: Goal3Expected = {
    coreProgram: 'core-program',
    agentIdentityProgram: 'identity-program',
    collection: 'collection-address',
    asset: 'asset-address',
    agentIdentity: 'identity-address',
    assetSigner: 'asset-signer-address',
    collectionName: 'Wallet Child Lab',
    collectionUri: 'https://example.test/collection.json',
    assetName: 'Wallet Child #001',
    assetUri: 'https://example.test/agent.json',
    agentIdentityUri: 'https://example.test/agent.json',
  };

  return {
    expected,
    actual: {
      owner: 'owner-address',
      collection: {
        publicKey: expected.collection,
        programOwner: expected.coreProgram,
        updateAuthority: 'owner-address',
        name: expected.collectionName,
        uri: expected.collectionUri,
        numMinted: 1,
        currentSize: 1,
      },
      asset: {
        publicKey: expected.asset,
        programOwner: expected.coreProgram,
        owner: 'owner-address',
        updateAuthorityType: 'Collection',
        updateAuthorityAddress: expected.collection,
        name: expected.assetName,
        uri: expected.assetUri,
        agentIdentityUris: [expected.agentIdentityUri],
      },
      agentIdentity: {
        publicKey: expected.agentIdentity,
        programOwner: expected.agentIdentityProgram,
        linkedAsset: expected.asset,
        agentToken: null,
      },
      assetSigner: {
        publicKey: expected.assetSigner,
        balanceLamports: 0n,
      },
    },
  };
}

describe('Goal 3 write gate', () => {
  it('accepts only the one exact Goal 3 confirmation argument', () => {
    expect(() => assertGoal3Confirmation([GOAL_3_CONFIRMATION])).not.toThrow();
    expect(() => assertGoal3Confirmation([])).toThrow(Goal3BirthError);
    expect(() =>
      assertGoal3Confirmation([GOAL_3_CONFIRMATION, '--extra']),
    ).toThrow(Goal3BirthError);
  });
});

describe('Devnet faucet response', () => {
  it('returns only a valid public transaction signature', async () => {
    const umi = createUmi('http://127.0.0.1:8899');
    const owner = generateSigner(umi);
    const signature = base58.deserialize(new Uint8Array(64).fill(1))[0];
    const fetchRpc = async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: signature }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    await expect(
      requestDevnetAirdrop('https://example.test', owner.publicKey, fetchRpc),
    ).resolves.toBe(signature);
  });

  it('fails closed on an RPC error instead of recording undefined', async () => {
    const umi = createUmi('http://127.0.0.1:8899');
    const owner = generateSigner(umi);
    const fetchRpc = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32429, message: 'rate limited' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    await expect(
      requestDevnetAirdrop('https://example.test', owner.publicKey, fetchRpc),
    ).rejects.toThrow('RPC -32429');
  });
});

describe('canonical PDA derivation', () => {
  it('is deterministic and keeps owner, identity, and Asset Signer separate', () => {
    const umi = createUmi('http://127.0.0.1:8899')
      .use(mplCore())
      .use(mplAgentIdentity());
    const owner = generateSigner(umi);
    const asset = generateSigner(umi);

    const firstAssetSigner = findAssetSignerPda(umi, {
      asset: asset.publicKey,
    });
    const secondAssetSigner = findAssetSignerPda(umi, {
      asset: asset.publicKey,
    });
    const agentIdentity = findAgentIdentityV2Pda(umi, {
      asset: asset.publicKey,
    });

    expect(firstAssetSigner).toEqual(secondAssetSigner);
    expect(firstAssetSigner[0]).not.toBe(owner.publicKey);
    expect(agentIdentity[0]).not.toBe(owner.publicKey);
    expect(agentIdentity[0]).not.toBe(firstAssetSigner[0]);
  });
});

describe('Goal 3 read-back invariants', () => {
  it('accepts the expected minimal birth state', () => {
    const { actual, expected } = validReadBack();
    expect(() => assertGoal3ReadBack(actual, expected)).not.toThrow();
  });

  it('rejects any accidental Asset Signer funding', () => {
    const { actual, expected } = validReadBack();
    actual.assetSigner.balanceLamports = 1n;

    expect(() => assertGoal3ReadBack(actual, expected)).toThrow(
      Goal3InvariantError,
    );
  });

  it('rejects an unexpected registration URI', () => {
    const { actual, expected } = validReadBack();
    actual.asset.agentIdentityUris = ['https://unexpected.test/agent.json'];

    expect(() => assertGoal3ReadBack(actual, expected)).toThrow(
      Goal3InvariantError,
    );
  });
});

describe('public Goal 3 artifact', () => {
  it('refuses private-material fields and 64-byte secret-like arrays', () => {
    expect(() => assertPublicArtifact({ privateKey: 'nope' })).toThrow(
      Goal3ArtifactError,
    );
    expect(() => assertPublicArtifact({ bytes: Array(64).fill(1) })).toThrow(
      Goal3ArtifactError,
    );
  });

  it('writes only the explicit public structure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-artifact-'));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, 'goal3.json');
    const artifact: Goal3Artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      network: 'devnet',
      status: 'in-progress',
      startedAt: '2026-08-24T00:00:00.000Z',
      rpcOrigin: 'https://api.devnet.solana.com',
      metadata: {
        gist: 'https://example.test/gist',
        asset: 'https://example.test/agent.json',
        collection: 'https://example.test/collection.json',
      },
      addresses: { owner: 'owner-address' },
      transactions: {
        ownerAirdrops: [
          { signature: 'airdrop-one', status: 'confirmed' },
          { signature: 'airdrop-two', status: 'confirmed' },
        ],
      },
    };

    await writeGoal3Artifact(artifact, artifactPath);
    const written = await readFile(artifactPath, 'utf8');

    expect(JSON.parse(written)).toEqual(artifact);
    await expect(readGoal3Artifact(artifactPath)).resolves.toEqual(artifact);
    expect(written).not.toMatch(/secret|seed|private|keypair/i);
  });
});
