import { resolve } from 'node:path';

import type { Umi } from '@metaplex-foundation/umi';

import { loadOrCreateIsolatedSigner } from '../keys/isolated-key.js';

export const DEFAULT_MAINNET_RECOVERY_PATH = resolve(
  '.wallet-child/mainnet-readiness/recovery.json',
);

export class MainnetRecoveryError extends Error {
  override readonly name = 'MainnetRecoveryError';
}

export async function prepareMainnetRecoveryWallet(
  umi: Pick<Umi, 'eddsa'>,
  forbiddenPublicKeys: readonly string[],
  recoveryPath = DEFAULT_MAINNET_RECOVERY_PATH,
): Promise<Readonly<{ publicKey: string; created: boolean }>> {
  const loaded = await loadOrCreateIsolatedSigner(
    umi,
    recoveryPath,
    'Mainnet-readiness recovery',
    (message) => new MainnetRecoveryError(message),
  );
  const publicKey = String(loaded.signer.publicKey);
  if (forbiddenPublicKeys.includes(publicKey)) {
    throw new MainnetRecoveryError(
      'The recovery wallet must be distinct from every owner, executive, and Devnet principal.',
    );
  }
  return Object.freeze({ publicKey, created: loaded.created });
}
