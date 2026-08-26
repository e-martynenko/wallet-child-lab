import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

describe('Goal 9D dependency-risk boundary', () => {
  it('pins the exact reviewed transitive dependency path', async () => {
    const packageJson = JSON.parse(
      await readFile(join(projectRoot, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const lockfile = await readFile(join(projectRoot, 'pnpm-lock.yaml'), 'utf8');

    expect(packageJson.dependencies).not.toHaveProperty('uuid');
    expect(packageJson.dependencies).not.toHaveProperty('jayson');
    expect(lockfile).toContain("'@solana/web3.js@1.98.4'");
    expect(lockfile).toContain('jayson@4.3.0:');
    expect(lockfile).toContain('uuid@8.3.2:');
    expect(lockfile).toContain('uuid: 8.3.2');
  });

  it('finds only uuid.v4 use in the installed jayson package', async () => {
    const pnpmDirectory = join(projectRoot, 'node_modules', '.pnpm');
    const candidates = (await readdir(pnpmDirectory)).filter((name) =>
      name.startsWith('jayson@4.3.0_'),
    );
    const matchingDirectories = (
      await Promise.all(
        candidates.map(async (name) => {
          try {
            await readFile(
              join(pnpmDirectory, name, 'node_modules', 'jayson', 'package.json'),
              'utf8',
            );
            return name;
          } catch {
            return null;
          }
        }),
      )
    ).filter((name): name is string => name !== null);
    expect(matchingDirectories).toHaveLength(1);

    const jaysonRoot = join(
      pnpmDirectory,
      matchingDirectories[0]!,
      'node_modules',
      'jayson',
    );
    const reviewedFiles = await Promise.all(
      [
        'lib/generateRequest.js',
        'lib/utils.js',
        'lib/client/browser/index.js',
      ].map((path) => readFile(join(jaysonRoot, path), 'utf8')),
    );

    for (const source of reviewedFiles) {
      expect(source).toContain("require('uuid').v4");
      expect(source).not.toMatch(/require\(['"]uuid['"]\)\.v(?:3|5|6)\b/);
    }
    expect(reviewedFiles[0]).toContain('return uuid();');
  });

  it('has no direct uuid or jayson import in Wallet Child source', async () => {
    const sourceDirectory = join(projectRoot, 'src');
    const directories = [sourceDirectory];
    const sourceFiles: string[] = [];

    while (directories.length > 0) {
      const directory = directories.pop()!;
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) directories.push(path);
        else if (entry.isFile() && entry.name.endsWith('.ts')) sourceFiles.push(path);
      }
    }

    const forbiddenImport =
      /(?:from\s+|import\s*\(|require\s*\()\s*['"](?:uuid|jayson)(?:\/[^'"]*)?['"]/;
    for (const path of sourceFiles) {
      expect(await readFile(path, 'utf8'), path).not.toMatch(forbiddenImport);
    }
  });
});
