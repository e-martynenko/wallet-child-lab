import { findAssetSignerPda, mplCore } from '@metaplex-foundation/mpl-core';
import { publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';

import { readGoal5Artifact } from '../goal5/artifact.js';
import { SYSTEM_PROGRAM_ID } from './policy.js';
import type { TransferIntent, TransferPolicy } from './types.js';

export const GOAL_6_MAX_TRANSFER_LAMPORTS = 1_000_000n;
export const GOAL_6_EXAMPLE_TRANSFER_LAMPORTS = 100_000n;
export const GOAL_6_MAX_FEE_PAYER_SPEND_LAMPORTS = 100_000n;

export type WalletChildGoal6Policy = Readonly<{
  policy: TransferPolicy;
  exampleIntent: TransferIntent;
  accounts: Readonly<{
    asset: string;
    collection: string;
    assetSigner: string;
    executionDelegateRecord: string;
    feePayer: string;
    executive: string;
  }>;
}>;

export class WalletChildGoal6PolicyError extends Error {
  override readonly name = 'WalletChildGoal6PolicyError';
}

export async function loadWalletChildGoal6Policy(): Promise<WalletChildGoal6Policy> {
  const goal5 = await readGoal5Artifact();
  if (
    !goal5 ||
    goal5.status !== 'complete' ||
    goal5.checks.final?.activeDelegate !== false
  ) {
    throw new WalletChildGoal6PolicyError(
      'Goal 5 must be complete with delegation revoked before Goal 6.',
    );
  }

  const offlineUmi = createUmi('http://127.0.0.1:8899').use(mplCore());
  const canonicalAssetSigner = findAssetSignerPda(offlineUmi, {
    asset: publicKey(goal5.addresses.asset),
  })[0];
  if (String(canonicalAssetSigner) !== goal5.addresses.assetSigner) {
    throw new WalletChildGoal6PolicyError(
      'Goal 5 Asset Signer does not match canonical MPL Core derivation.',
    );
  }

  const policy: TransferPolicy = Object.freeze({
    network: 'devnet',
    token: 'SOL',
    sourceAssetSigner: goal5.addresses.assetSigner,
    allowedDestination: goal5.addresses.nextOwner,
    maximumLamports: GOAL_6_MAX_TRANSFER_LAMPORTS,
    maximumFeePayerSpendLamports:
      GOAL_6_MAX_FEE_PAYER_SPEND_LAMPORTS,
    allowedProgram: SYSTEM_PROGRAM_ID,
  });
  const exampleIntent: TransferIntent = Object.freeze({
    kind: 'TRANSFER',
    network: 'devnet',
    token: 'SOL',
    destination: goal5.addresses.nextOwner,
    amountLamports: GOAL_6_EXAMPLE_TRANSFER_LAMPORTS,
  });

  return Object.freeze({
    policy,
    exampleIntent,
    accounts: Object.freeze({
      asset: goal5.addresses.asset,
      collection: goal5.addresses.collection,
      assetSigner: goal5.addresses.assetSigner,
      executionDelegateRecord: goal5.addresses.executionDelegateRecord,
      feePayer: goal5.addresses.owner,
      executive: goal5.addresses.executiveAuthority,
    }),
  });
}
