import { resolve } from 'node:path';

import { findAgentIdentityV2Pda } from '@metaplex-foundation/mpl-agent-registry';
import { findAssetSignerPda } from '@metaplex-foundation/mpl-core';
import { findAssociatedTokenPda } from '@metaplex-foundation/mpl-toolbox';
import { publicKey, type Umi } from '@metaplex-foundation/umi';

import { loadOrCreateIsolatedSigner } from '../keys/isolated-key.js';
import { SOLANA_MAINNET_USDC_MINT } from '../mainnet/readiness.js';

export const DEFAULT_MAINNET_CORE_ASSET_PATH = resolve(
  '.wallet-child/mainnet-readiness/core-asset.json',
);

export type MainnetIdentityAddressInput = Readonly<{
  owner: string;
  executive: string;
  recovery: string;
  fundingSource: string;
  forbiddenPublicKeys: readonly string[];
}>;

export type MainnetIdentityAddresses = Readonly<{
  coreAsset: Readonly<{ publicKey: string; created: boolean }>;
  agentIdentity: string;
  assetSignerPda: string;
  assetSignerUsdcAta: string;
  recoveryUsdcAta: string;
  collection: null;
  standalone: true;
}>;

export class MainnetIdentityAddressError extends Error {
  override readonly name = 'MainnetIdentityAddressError';
}

export async function prepareMainnetIdentityAddresses(
  umi: Umi,
  input: MainnetIdentityAddressInput,
  coreAssetPath = DEFAULT_MAINNET_CORE_ASSET_PATH,
): Promise<MainnetIdentityAddresses> {
  const errorFactory = (message: string): MainnetIdentityAddressError =>
    new MainnetIdentityAddressError(message);
  const coreAsset = await loadOrCreateIsolatedSigner(
    umi,
    coreAssetPath,
    'Mainnet Core Asset account',
    errorFactory,
  );
  const coreAssetPublicKey = String(coreAsset.signer.publicKey);
  const agentIdentity = String(
    findAgentIdentityV2Pda(umi, { asset: coreAsset.signer.publicKey })[0],
  );
  const assetSignerPda = String(
    findAssetSignerPda(umi, { asset: coreAsset.signer.publicKey })[0],
  );
  const assetSignerUsdcAta = String(
    findAssociatedTokenPda(umi, {
      mint: publicKey(SOLANA_MAINNET_USDC_MINT),
      owner: publicKey(assetSignerPda),
    })[0],
  );
  const recoveryUsdcAta = String(
    findAssociatedTokenPda(umi, {
      mint: publicKey(SOLANA_MAINNET_USDC_MINT),
      owner: publicKey(input.recovery),
    })[0],
  );
  const mainnetAddresses = [
    input.owner,
    input.executive,
    input.recovery,
    input.fundingSource,
    coreAssetPublicKey,
    agentIdentity,
    assetSignerPda,
    assetSignerUsdcAta,
    recoveryUsdcAta,
    SOLANA_MAINNET_USDC_MINT,
  ];
  if (
    new Set(mainnetAddresses).size !== mainnetAddresses.length ||
    input.forbiddenPublicKeys.some((key) => mainnetAddresses.includes(key))
  ) {
    throw new MainnetIdentityAddressError(
      'Final Mainnet identity addresses must be distinct from every lab principal.',
    );
  }

  return Object.freeze({
    coreAsset: Object.freeze({
      publicKey: coreAssetPublicKey,
      created: coreAsset.created,
    }),
    agentIdentity,
    assetSignerPda,
    assetSignerUsdcAta,
    recoveryUsdcAta,
    collection: null,
    standalone: true,
  });
}
