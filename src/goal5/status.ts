import {
  safeFetchExecutionDelegateRecordV1,
  safeFetchExecutiveProfileV1,
} from '@metaplex-foundation/mpl-agent-registry';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import { publicKey } from '@metaplex-foundation/umi';

import { createVerifiedDevnetUmi } from '../chain/umi.js';
import type { WalletChildConfig } from '../config/env.js';
import { readGoal5Artifact } from './artifact.js';

export type Goal5Status =
  | { executive: 'NONE'; delegation: 'NONE' }
  | {
      executive: string;
      executiveProfile: string;
      delegation: 'ACTIVE' | 'REVOKED';
    };

export class Goal5StatusError extends Error {
  override readonly name = 'Goal5StatusError';
}

export async function readGoal5Status(
  config: WalletChildConfig,
): Promise<Goal5Status> {
  const artifact = await readGoal5Artifact();
  if (!artifact) {
    return { executive: 'NONE', delegation: 'NONE' };
  }

  const { umi } = await createVerifiedDevnetUmi(config);
  const profileAddress = publicKey(artifact.addresses.executiveProfile);
  const delegateAddress = publicKey(
    artifact.addresses.executionDelegateRecord,
  );
  const [profile, delegate, asset] = await Promise.all([
    safeFetchExecutiveProfileV1(umi, profileAddress, {
      commitment: 'finalized',
    }),
    safeFetchExecutionDelegateRecordV1(umi, delegateAddress, {
      commitment: 'finalized',
    }),
    fetchAsset(umi, publicKey(artifact.addresses.asset), {
      commitment: 'finalized',
    }),
  ]);

  if (
    !profile ||
    String(profile.authority) !== artifact.addresses.executiveAuthority ||
    String(asset.owner) !== artifact.addresses.owner
  ) {
    throw new Goal5StatusError(
      'Goal 5 profile or final ownership no longer matches the chain.',
    );
  }

  if (
    delegate &&
    (String(delegate.executiveProfile) !==
      artifact.addresses.executiveProfile ||
      String(delegate.authority) !== artifact.addresses.executiveAuthority ||
      String(delegate.agentAsset) !== artifact.addresses.asset)
  ) {
    throw new Goal5StatusError(
      'The live Execution Delegate Record has unexpected contents.',
    );
  }

  return {
    executive: artifact.addresses.executiveAuthority,
    executiveProfile: artifact.addresses.executiveProfile,
    delegation: delegate ? 'ACTIVE' : 'REVOKED',
  };
}
