import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  canonicalizeGoal9CMetadata,
  GOAL_9C_INTEGRITY_PATH,
  GOAL_9C_METADATA_PATH,
  Goal9CMetadataError,
  verifyGoal9CMetadataIntegrity,
} from '../src/goal9c/metadata.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryPair(
  metadataRaw: string,
  manifestRaw: string,
): Promise<Readonly<{ metadataPath: string; manifestPath: string }>> {
  const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9c-'));
  temporaryDirectories.push(directory);
  const metadataPath = join(directory, 'metadata.json');
  const manifestPath = join(directory, 'integrity.json');
  await Promise.all([
    writeFile(metadataPath, metadataRaw, 'utf8'),
    writeFile(manifestPath, manifestRaw, 'utf8'),
  ]);
  return Object.freeze({ metadataPath, manifestPath });
}

describe('Goal 9C fixed metadata contract', () => {
  it('verifies exact canonical bytes and the recorded SHA-256 digest', async () => {
    const evidence = await verifyGoal9CMetadataIntegrity();
    expect(evidence.sha256).toBe(
      '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
    );
    expect(evidence.byteLength).toBe(351);
    expect(evidence.metadata).toMatchObject({
      active: false,
      x402Support: false,
      image: '',
      services: [],
      registrations: [],
      supportedTrust: [],
    });
    expect(canonicalizeGoal9CMetadata(evidence.metadata)).toBe(
      await readFile(GOAL_9C_METADATA_PATH, 'utf8'),
    );
    expect(evidence.manifest).toMatchObject({
      publicationStatus: 'PUBLISHED',
      durableUri:
        'https://gateway.irys.xyz/2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL',
      onChainUriUpdated: false,
    });
  });

  it('rejects non-canonical bytes even when the JSON meaning is unchanged', async () => {
    const [metadataRaw, manifestRaw] = await Promise.all([
      readFile(GOAL_9C_METADATA_PATH, 'utf8'),
      readFile(GOAL_9C_INTEGRITY_PATH, 'utf8'),
    ]);
    const paths = await temporaryPair(` ${metadataRaw}`, manifestRaw);
    await expect(
      verifyGoal9CMetadataIntegrity(paths.metadataPath, paths.manifestPath),
    ).rejects.toThrow(Goal9CMetadataError);
  });

  it.each([
    ['active', true],
    ['x402Support', true],
    ['services', [{ name: 'MCP', endpoint: 'https://example.com' }]],
    ['supportedTrust', ['reputation']],
    ['registrations', [{ agentId: 1, agentRegistry: 'example' }]],
  ])('rejects unsupported %s claims', async (field, value) => {
    const [metadataRaw, manifestRaw] = await Promise.all([
      readFile(GOAL_9C_METADATA_PATH, 'utf8'),
      readFile(GOAL_9C_INTEGRITY_PATH, 'utf8'),
    ]);
    const metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
    metadata[field] = value;
    const paths = await temporaryPair(
      `${JSON.stringify(metadata, null, 2)}\n`,
      manifestRaw,
    );
    await expect(
      verifyGoal9CMetadataIntegrity(paths.metadataPath, paths.manifestPath),
    ).rejects.toThrow(Goal9CMetadataError);
  });

  it('rejects extra fields and a mismatched integrity digest', async () => {
    const [metadataRaw, manifestRaw] = await Promise.all([
      readFile(GOAL_9C_METADATA_PATH, 'utf8'),
      readFile(GOAL_9C_INTEGRITY_PATH, 'utf8'),
    ]);
    const metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
    metadata['network'] = 'mainnet-beta';
    const extraPaths = await temporaryPair(
      `${JSON.stringify(metadata, null, 2)}\n`,
      manifestRaw,
    );
    await expect(
      verifyGoal9CMetadataIntegrity(
        extraPaths.metadataPath,
        extraPaths.manifestPath,
      ),
    ).rejects.toThrow(Goal9CMetadataError);

    const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
    manifest['sha256'] = '0'.repeat(64);
    const digestPaths = await temporaryPair(
      metadataRaw,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await expect(
      verifyGoal9CMetadataIntegrity(
        digestPaths.metadataPath,
        digestPaths.manifestPath,
      ),
    ).rejects.toThrow(Goal9CMetadataError);
  });
});
