import { resolve } from 'node:path';

import type { Umi } from '@metaplex-foundation/umi';

import { loadOrCreateIsolatedSigner } from '../keys/isolated-key.js';

export const DEFAULT_MAINNET_READINESS_OWNER_PATH = resolve(
  '.wallet-child/mainnet-readiness/owner.json',
);
export const DEFAULT_MAINNET_READINESS_EXECUTIVE_PATH = resolve(
  '.wallet-child/mainnet-readiness/executive.json',
);

export class MainnetReadinessWalletError extends Error {
  override readonly name = 'MainnetReadinessWalletError';
}

export type MainnetReadinessWallets = Readonly<{
  owner: Readonly<{ publicKey: string; created: boolean }>;
  executive: Readonly<{ publicKey: string; created: boolean }>;
}>;

export async function prepareMainnetReadinessWallets(
  umi: Pick<Umi, 'eddsa'>,
  forbiddenPublicKeys: readonly string[],
  ownerPath = DEFAULT_MAINNET_READINESS_OWNER_PATH,
  executivePath = DEFAULT_MAINNET_READINESS_EXECUTIVE_PATH,
): Promise<MainnetReadinessWallets> {
  const errorFactory = (message: string): MainnetReadinessWalletError =>
    new MainnetReadinessWalletError(message);
  const owner = await loadOrCreateIsolatedSigner(
    umi,
    ownerPath,
    'Mainnet-readiness owner',
    errorFactory,
  );
  const executive = await loadOrCreateIsolatedSigner(
    umi,
    executivePath,
    'Mainnet-readiness executive',
    errorFactory,
  );
  const ownerPublicKey = String(owner.signer.publicKey);
  const executivePublicKey = String(executive.signer.publicKey);
  const addresses = [
    ownerPublicKey,
    executivePublicKey,
    ...forbiddenPublicKeys,
  ];

  if (new Set(addresses).size !== addresses.length) {
    throw new MainnetReadinessWalletError(
      'Mainnet-readiness owner and executive must be distinct from each other and every Devnet principal.',
    );
  }

  return Object.freeze({
    owner: Object.freeze({
      publicKey: ownerPublicKey,
      created: owner.created,
    }),
    executive: Object.freeze({
      publicKey: executivePublicKey,
      created: executive.created,
    }),
  });
}
