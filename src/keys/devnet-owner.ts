import { resolve } from 'node:path';

import type { KeypairSigner, Umi } from '@metaplex-foundation/umi';

import { loadOrCreateIsolatedSigner } from './isolated-key.js';

export const DEFAULT_DEVNET_OWNER_PATH = resolve(
  '.wallet-child/devnet/owner.json',
);
export const DEFAULT_DEVNET_EXECUTIVE_PATH = resolve(
  '.wallet-child/devnet/executive.json',
);
export const DEFAULT_DEVNET_NEXT_OWNER_PATH = resolve(
  '.wallet-child/devnet/next-owner.json',
);

export class DevnetOwnerError extends Error {
  override readonly name = 'DevnetOwnerError';
}

async function loadOrCreateDevnetSigner(
  umi: Pick<Umi, 'eddsa'>,
  keyPath: string,
  label: string,
): Promise<Readonly<{ signer: KeypairSigner; created: boolean }>> {
  return loadOrCreateIsolatedSigner(
    umi,
    keyPath,
    label,
    (message) => new DevnetOwnerError(message),
  );
}

export async function loadOrCreateDevnetOwner(
  umi: Pick<Umi, 'eddsa'>,
  keyPath = DEFAULT_DEVNET_OWNER_PATH,
): Promise<Readonly<{ owner: KeypairSigner; created: boolean }>> {
  const result = await loadOrCreateDevnetSigner(
    umi,
    keyPath,
    'Devnet owner',
  );
  return Object.freeze({ owner: result.signer, created: result.created });
}

export async function loadOrCreateDevnetExecutive(
  umi: Pick<Umi, 'eddsa'>,
  keyPath = DEFAULT_DEVNET_EXECUTIVE_PATH,
): Promise<Readonly<{ executive: KeypairSigner; created: boolean }>> {
  const result = await loadOrCreateDevnetSigner(
    umi,
    keyPath,
    'Devnet executive',
  );
  return Object.freeze({ executive: result.signer, created: result.created });
}

export async function loadOrCreateDevnetNextOwner(
  umi: Pick<Umi, 'eddsa'>,
  keyPath = DEFAULT_DEVNET_NEXT_OWNER_PATH,
): Promise<Readonly<{ nextOwner: KeypairSigner; created: boolean }>> {
  const result = await loadOrCreateDevnetSigner(
    umi,
    keyPath,
    'Devnet next-owner',
  );
  return Object.freeze({ nextOwner: result.signer, created: result.created });
}
