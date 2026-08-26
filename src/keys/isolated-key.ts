import { chmod, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  createSignerFromKeypair,
  type KeypairSigner,
  type Umi,
} from '@metaplex-foundation/umi';

type ErrorFactory = (message: string) => Error;

function parseSecretKey(
  raw: string,
  label: string,
  errorFactory: ErrorFactory,
): Uint8Array {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw errorFactory(`The ${label} key file is not valid JSON.`);
  }

  if (
    !Array.isArray(value) ||
    value.length !== 64 ||
    !value.every(
      (byte) =>
        Number.isInteger(byte) &&
        typeof byte === 'number' &&
        byte >= 0 &&
        byte <= 255,
    )
  ) {
    throw errorFactory(
      `The ${label} key file must contain exactly 64 byte values.`,
    );
  }

  return Uint8Array.from(value);
}

async function loadSigner(
  umi: Pick<Umi, 'eddsa'>,
  keyPath: string,
  label: string,
  errorFactory: ErrorFactory,
): Promise<KeypairSigner | null> {
  let stats;

  try {
    stats = await lstat(keyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw errorFactory(`Could not inspect the ${label} key file.`);
  }

  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw errorFactory(
      `The ${label} key path must be a regular file, not a link.`,
    );
  }

  if ((stats.mode & 0o077) !== 0) {
    throw errorFactory(
      `The ${label} key file is too permissive; expected mode 0600.`,
    );
  }

  let raw: string;
  try {
    raw = await readFile(keyPath, 'utf8');
  } catch {
    throw errorFactory(`Could not read the ${label} key file.`);
  }

  const secretKey = parseSecretKey(raw, label, errorFactory);
  try {
    const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
    return createSignerFromKeypair(umi, keypair);
  } catch {
    throw errorFactory(`The ${label} key material is invalid.`);
  }
}

export async function loadOrCreateIsolatedSigner(
  umi: Pick<Umi, 'eddsa'>,
  keyPath: string,
  label: string,
  errorFactory: ErrorFactory,
): Promise<Readonly<{ signer: KeypairSigner; created: boolean }>> {
  const existingSigner = await loadSigner(
    umi,
    keyPath,
    label,
    errorFactory,
  );
  if (existingSigner) {
    return Object.freeze({ signer: existingSigner, created: false });
  }

  const keyDirectory = dirname(keyPath);

  try {
    await mkdir(keyDirectory, { recursive: true, mode: 0o700 });
    await chmod(keyDirectory, 0o700);

    const keypair = umi.eddsa.generateKeypair();
    await writeFile(
      keyPath,
      `${JSON.stringify(Array.from(keypair.secretKey))}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    await chmod(keyPath, 0o600);

    return Object.freeze({
      signer: createSignerFromKeypair(umi, keypair),
      created: true,
    });
  } catch {
    throw errorFactory(`Could not create the isolated ${label} key file.`);
  }
}

export async function loadExistingIsolatedSigner(
  umi: Pick<Umi, 'eddsa'>,
  keyPath: string,
  label: string,
  errorFactory: ErrorFactory,
): Promise<KeypairSigner> {
  const signer = await loadSigner(umi, keyPath, label, errorFactory);
  if (!signer) {
    throw errorFactory(`The ${label} key file does not exist.`);
  }
  return signer;
}
