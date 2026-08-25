import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DevnetOwnerError,
  loadOrCreateDevnetExecutive,
  loadOrCreateDevnetNextOwner,
  loadOrCreateDevnetOwner,
} from '../src/keys/devnet-owner.js';

const temporaryDirectories: string[] = [];

async function temporaryKeyPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'wallet-child-owner-'));
  temporaryDirectories.push(directory);
  return join(directory, 'keys', 'owner.json');
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('isolated Devnet owner', () => {
  it('creates a mode-0600 key and reloads the same public key', async () => {
    const umi = createUmi('http://127.0.0.1:8899');
    const keyPath = await temporaryKeyPath();

    const first = await loadOrCreateDevnetOwner(umi, keyPath);
    const second = await loadOrCreateDevnetOwner(umi, keyPath);
    const keyStats = await stat(keyPath);
    const storedValue = JSON.parse(await readFile(keyPath, 'utf8')) as unknown;

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.owner.publicKey).toBe(first.owner.publicKey);
    expect(keyStats.mode & 0o777).toBe(0o600);
    expect(Array.isArray(storedValue) && storedValue.length).toBe(64);
  });

  it('refuses an existing key file readable by group or others', async () => {
    const umi = createUmi('http://127.0.0.1:8899');
    const keyPath = await temporaryKeyPath();

    await loadOrCreateDevnetOwner(umi, keyPath);
    await chmod(keyPath, 0o644);

    await expect(loadOrCreateDevnetOwner(umi, keyPath)).rejects.toThrow(
      DevnetOwnerError,
    );
  });

  it('keeps owner, executive, and next owner in separate key files', async () => {
    const umi = createUmi('http://127.0.0.1:8899');
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-principals-'));
    temporaryDirectories.push(directory);

    const { owner } = await loadOrCreateDevnetOwner(
      umi,
      join(directory, 'owner.json'),
    );
    const { executive } = await loadOrCreateDevnetExecutive(
      umi,
      join(directory, 'executive.json'),
    );
    const { nextOwner } = await loadOrCreateDevnetNextOwner(
      umi,
      join(directory, 'next-owner.json'),
    );

    expect(new Set([owner.publicKey, executive.publicKey, nextOwner.publicKey]).size).toBe(3);
  });
});
