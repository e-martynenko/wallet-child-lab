import {
  deserializeExecutionDelegateRecordV1,
  deserializeExecutiveProfileV1,
  findExecutionDelegateRecordV1Pda,
  findExecutiveProfileV1Pda,
  getExecutionDelegateRecordV1GpaBuilder,
  MPL_AGENT_TOOLS_PROGRAM_ID,
  tools as mplAgentTools,
  type ExecutionDelegateRecordV1,
} from '@metaplex-foundation/mpl-agent-registry';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import {
  publicKey,
  type PublicKey,
  type RpcAccount,
  type Umi,
} from '@metaplex-foundation/umi';

import { createVerifiedDevnetUmi } from '../chain/umi.js';
import type { WalletChildConfig } from '../config/env.js';
import { readGoal5Artifact } from '../goal5/artifact.js';
import { readGoal9AArtifact } from '../goal9a/artifact.js';
import {
  type Goal9BArtifact,
  writeGoal9BArtifact,
} from './artifact.js';

export const EXECUTIVE_PROFILE_V1_SIZE = 40;
export const EXECUTION_DELEGATE_RECORD_V1_SIZE = 104;
export const EXECUTION_DELEGATE_AGENT_ASSET_OFFSET = 72;

export class Goal9BDelegationAuditError extends Error {
  override readonly name = 'Goal9BDelegationAuditError';
}

export type ClassifiedAgentToolsAccounts = Readonly<{
  executiveProfiles: RpcAccount[];
  executionDelegateRecords: RpcAccount[];
}>;

function allZero(data: Uint8Array): boolean {
  return data.every((byte) => byte === 0);
}

export function classifyAgentToolsProgramAccounts(
  accounts: RpcAccount[],
): ClassifiedAgentToolsAccounts {
  const seen = new Set<string>();
  const executiveProfiles: RpcAccount[] = [];
  const executionDelegateRecords: RpcAccount[] = [];
  for (const account of accounts) {
    const address = String(account.publicKey);
    if (seen.has(address)) {
      throw new Goal9BDelegationAuditError(
        'Agent Tools program scan returned a duplicate account.',
      );
    }
    seen.add(address);
    if (
      String(account.owner) !== String(MPL_AGENT_TOOLS_PROGRAM_ID) ||
      account.executable
    ) {
      throw new Goal9BDelegationAuditError(
        'Agent Tools program scan returned an invalid account owner or executable flag.',
      );
    }
    if (
      account.data.length === EXECUTIVE_PROFILE_V1_SIZE &&
      account.data[0] === mplAgentTools.Key.ExecutiveProfileV1 &&
      allZero(account.data.slice(1, 8))
    ) {
      executiveProfiles.push(account);
      continue;
    }
    if (
      account.data.length === EXECUTION_DELEGATE_RECORD_V1_SIZE &&
      account.data[0] === mplAgentTools.Key.ExecutionDelegateRecordV1 &&
      allZero(account.data.slice(2, 8))
    ) {
      executionDelegateRecords.push(account);
      continue;
    }
    throw new Goal9BDelegationAuditError(
      `Unknown Agent Tools account layout at ${address}; completeness claim denied.`,
    );
  }
  return Object.freeze({ executiveProfiles, executionDelegateRecords });
}

function sortedAddresses(accounts: RpcAccount[]): string[] {
  return accounts.map((account) => String(account.publicKey)).sort();
}

export function assertSameAccountSet(
  fullScanMatches: RpcAccount[],
  filteredMatches: RpcAccount[],
): void {
  const full = sortedAddresses(fullScanMatches);
  const filtered = sortedAddresses(filteredMatches);
  if (
    full.length !== filtered.length ||
    full.some((address, index) => address !== filtered[index])
  ) {
    throw new Goal9BDelegationAuditError(
      'Asset-filtered delegate query does not match the full program scan.',
    );
  }
}

export function assertDelegateRecordRelationships(
  umi: Pick<Umi, 'eddsa' | 'programs'>,
  records: ExecutionDelegateRecordV1[],
  profileAccounts: RpcAccount[],
): void {
  const profiles = new Map(
    profileAccounts.map((raw) => {
      const profile = deserializeExecutiveProfileV1(raw);
      return [String(profile.publicKey), profile] as const;
    }),
  );
  for (const record of records) {
    const expectedRecord = findExecutionDelegateRecordV1Pda(umi, {
      executiveProfile: record.executiveProfile,
      agentAsset: record.agentAsset,
    });
    const profile = profiles.get(String(record.executiveProfile));
    if (
      String(expectedRecord[0]) !== String(record.publicKey) ||
      expectedRecord[1] !== record.bump ||
      !profile ||
      String(profile.authority) !== String(record.authority) ||
      String(
        findExecutiveProfileV1Pda(umi, {
          authority: record.authority,
        })[0],
      ) !== String(record.executiveProfile)
    ) {
      throw new Goal9BDelegationAuditError(
        `Delegate record ${record.publicKey} failed PDA/profile validation.`,
      );
    }
  }
}

function recordsForAsset(
  rawRecords: RpcAccount[],
  asset: PublicKey,
): RpcAccount[] {
  return rawRecords.filter((raw) => {
    const record = deserializeExecutionDelegateRecordV1(raw);
    return String(record.agentAsset) === String(asset);
  });
}

function summaries(records: RpcAccount[]): Goal9BArtifact['activeRecords'] {
  return records
    .map((raw) => deserializeExecutionDelegateRecordV1(raw))
    .map((record) => ({
      address: String(record.publicKey),
      executiveProfile: String(record.executiveProfile),
      authority: String(record.authority),
      agentAsset: String(record.agentAsset),
    }))
    .sort((left, right) => left.address.localeCompare(right.address));
}

export async function auditGoal9BDelegates(
  config: WalletChildConfig,
): Promise<Goal9BArtifact> {
  const [goal5, goal9a] = await Promise.all([
    readGoal5Artifact(),
    readGoal9AArtifact(),
  ]);
  if (
    !goal5 ||
    goal5.status !== 'complete' ||
    !goal9a ||
    goal9a.status !== 'complete' ||
    goal9a.checks.final?.activeDelegate !== false
  ) {
    throw new Goal9BDelegationAuditError(
      'Goals 5 and 9A must be complete with the known delegation revoked.',
    );
  }
  const { umi, verification } = await createVerifiedDevnetUmi(config);
  const assetAddress = publicKey(goal5.addresses.asset);
  const finalizedSlotFloor = await umi.rpc.getSlot({ commitment: 'finalized' });
  const allProgramAccounts = await umi.rpc.getProgramAccounts(
    publicKey(MPL_AGENT_TOOLS_PROGRAM_ID),
    {
      commitment: 'finalized',
      minContextSlot: finalizedSlotFloor,
    },
  );
  const classified = classifyAgentToolsProgramAccounts(allProgramAccounts);
  const allRecords = classified.executionDelegateRecords.map((raw) =>
    deserializeExecutionDelegateRecordV1(raw),
  );
  assertDelegateRecordRelationships(
    umi,
    allRecords,
    classified.executiveProfiles,
  );

  const fullScanMatches = recordsForAsset(
    classified.executionDelegateRecords,
    assetAddress,
  );
  const filteredRaw = await getExecutionDelegateRecordV1GpaBuilder(umi)
    .whereSize(EXECUTION_DELEGATE_RECORD_V1_SIZE)
    .whereField('key', mplAgentTools.Key.ExecutionDelegateRecordV1)
    .whereField('agentAsset', assetAddress)
    .get({
      commitment: 'finalized',
      minContextSlot: finalizedSlotFloor,
    });
  const filteredClassified = classifyAgentToolsProgramAccounts(filteredRaw);
  if (filteredClassified.executiveProfiles.length !== 0) {
    throw new Goal9BDelegationAuditError(
      'Delegate-only filtered query returned an executive profile.',
    );
  }
  assertSameAccountSet(
    fullScanMatches,
    filteredClassified.executionDelegateRecords,
  );

  const profileRaw = classified.executiveProfiles.find(
    (account) => String(account.publicKey) === goal5.addresses.executiveProfile,
  );
  if (!profileRaw) {
    throw new Goal9BDelegationAuditError(
      'Known executive profile is missing from the complete program scan.',
    );
  }
  const knownProfile = deserializeExecutiveProfileV1(profileRaw);
  if (
    String(knownProfile.authority) !== goal5.addresses.executiveAuthority ||
    String(
      findExecutiveProfileV1Pda(umi, {
        authority: knownProfile.authority,
      })[0],
    ) !== goal5.addresses.executiveProfile
  ) {
    throw new Goal9BDelegationAuditError(
      'Known executive profile failed scan validation.',
    );
  }
  if (
    classified.executionDelegateRecords.some(
      (account) =>
        String(account.publicKey) === goal5.addresses.executionDelegateRecord,
    )
  ) {
    throw new Goal9BDelegationAuditError(
      'Known revoked delegate record is still active.',
    );
  }
  const asset = await fetchAsset(umi, assetAddress, {
    commitment: 'finalized',
    minContextSlot: finalizedSlotFloor,
  });
  if (String(asset.owner) !== goal5.addresses.owner) {
    throw new Goal9BDelegationAuditError(
      'Core asset owner changed before the delegation audit.',
    );
  }
  const activeRecords = summaries(fullScanMatches);
  if (activeRecords.length !== 0) {
    throw new Goal9BDelegationAuditError(
      `Goal 9B found ${activeRecords.length} active execution delegate record(s); review and revoke before funding.`,
    );
  }
  const finalizedSlotAfter = await umi.rpc.getSlot({ commitment: 'finalized' });
  if (finalizedSlotAfter < finalizedSlotFloor) {
    throw new Goal9BDelegationAuditError(
      'Finalized slot moved backwards during the audit.',
    );
  }

  const artifact: Goal9BArtifact = {
    schemaVersion: 1,
    experiment: 'wallet-child-001',
    goal: '9B',
    network: 'devnet',
    status: 'complete',
    auditedAt: new Date().toISOString(),
    rpcOrigin: verification.rpcOrigin,
    finalizedSlotFloor,
    finalizedSlotAfter,
    addresses: {
      asset: goal5.addresses.asset,
      owner: goal5.addresses.owner,
      agentToolsProgram: String(MPL_AGENT_TOOLS_PROGRAM_ID),
      knownExecutiveProfile: goal5.addresses.executiveProfile,
      knownExecutionDelegateRecord: goal5.addresses.executionDelegateRecord,
    },
    layout: {
      executiveProfileDiscriminator: 1,
      executiveProfileSize: 40,
      executionDelegateDiscriminator: 2,
      executionDelegateSize: 104,
      agentAssetOffset: 72,
    },
    counts: {
      allProgramAccounts: allProgramAccounts.length,
      executiveProfiles: classified.executiveProfiles.length,
      executionDelegateRecords: classified.executionDelegateRecords.length,
      matchingAssetDelegates: activeRecords.length,
    },
    activeRecords,
    checks: {
      verifiedDevnetGenesis: true,
      programLayoutClosedWorld: true,
      everyRecordPdaVerified: true,
      everyRecordProfileVerified: true,
      filteredQueryMatchesFullScan: true,
      knownProfileVerified: true,
      knownRecordAbsent: true,
      assetOwnerVerified: true,
    },
    verdict: 'NO_ACTIVE_EXECUTION_DELEGATES_AT_FINALIZED_AUDIT',
    scopeClaim:
      'Complete for current ExecutionDelegateRecordV1 accounts returned by the verified Devnet RPC at finalized commitment.',
    limitation:
      'A single RPC cannot cryptographically prove that the provider is not censoring data; Mainnet must use a reviewed dedicated RPC and repeat the audit immediately before funding.',
  };
  await writeGoal9BArtifact(artifact);
  return artifact;
}
