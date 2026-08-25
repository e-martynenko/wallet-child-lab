import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  findExecutionDelegateRecordV1Pda,
  findExecutiveProfileV1Pda,
  getExecutionDelegateRecordV1AccountDataSerializer,
  getExecutiveProfileV1AccountDataSerializer,
  mplAgentTools,
  MPL_AGENT_TOOLS_PROGRAM_ID,
  tools as mplAgentToolsTypes,
} from '@metaplex-foundation/mpl-agent-registry';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  lamports,
  publicKey,
  type PublicKey,
  type RpcAccount,
} from '@metaplex-foundation/umi';
import { describe, expect, it } from 'vitest';

import {
  readGoal9BArtifact,
  type Goal9BArtifact,
  writeGoal9BArtifact,
} from '../src/goal9b/artifact.js';
import {
  assertDelegateRecordRelationships,
  assertSameAccountSet,
  classifyAgentToolsProgramAccounts,
  Goal9BDelegationAuditError,
} from '../src/goal9b/delegates.js';

const OWNER = '7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c';
const EXECUTIVE = 'ET7sHJiBdS5VgXfQvgzenS9U1iPAa5b3dUZKotCDW2dn';
const ASSET = '66aw2vNMJHk4xPjc6VAE9CPPahkEaj7EfpQFFuQuvTd2';

const umi = createUmi('http://127.0.0.1:8899').use(mplAgentTools());
const authority = publicKey(EXECUTIVE);
const asset = publicKey(ASSET);
const profilePda = findExecutiveProfileV1Pda(umi, { authority });
const recordPda = findExecutionDelegateRecordV1Pda(umi, {
  executiveProfile: profilePda[0],
  agentAsset: asset,
});

function rawAccount(address: PublicKey, data: Uint8Array): RpcAccount {
  return {
    publicKey: address,
    owner: publicKey(MPL_AGENT_TOOLS_PROGRAM_ID),
    executable: false,
    lamports: lamports(1n),
    data,
  };
}

function profileAccount(): RpcAccount {
  return rawAccount(
    profilePda[0],
    getExecutiveProfileV1AccountDataSerializer().serialize({
      key: mplAgentToolsTypes.Key.ExecutiveProfileV1,
      authority,
    }),
  );
}

function delegateAccount(recordAuthority: PublicKey = authority): RpcAccount {
  return rawAccount(
    recordPda[0],
    getExecutionDelegateRecordV1AccountDataSerializer().serialize({
      key: mplAgentToolsTypes.Key.ExecutionDelegateRecordV1,
      bump: recordPda[1],
      executiveProfile: profilePda[0],
      authority: recordAuthority,
      agentAsset: asset,
    }),
  );
}

describe('Goal 9B closed-world Agent Tools account scan', () => {
  it('classifies only current official profile and delegate layouts', () => {
    const classified = classifyAgentToolsProgramAccounts([
      profileAccount(),
      delegateAccount(),
    ]);
    expect(classified.executiveProfiles).toHaveLength(1);
    expect(classified.executionDelegateRecords).toHaveLength(1);
  });

  it('fails closed on unknown layouts, duplicate accounts, or wrong owner', () => {
    const unknown = rawAccount(profilePda[0], new Uint8Array([9, 0, 0]));
    expect(() => classifyAgentToolsProgramAccounts([unknown])).toThrow(
      Goal9BDelegationAuditError,
    );
    const profile = profileAccount();
    expect(() =>
      classifyAgentToolsProgramAccounts([profile, profile]),
    ).toThrow(Goal9BDelegationAuditError);
    expect(() =>
      classifyAgentToolsProgramAccounts([
        { ...profile, owner: publicKey(OWNER) },
      ]),
    ).toThrow(Goal9BDelegationAuditError);
  });

  it('verifies record PDA, bump, executive profile, and authority', () => {
    const record = delegateAccount();
    const classified = classifyAgentToolsProgramAccounts([
      profileAccount(),
      record,
    ]);
    const deserialized = classified.executionDelegateRecords.map((raw) =>
      // The relationship function deliberately receives the SDK result shape.
      getExecutionDelegateRecordV1AccountDataSerializer().deserialize(raw.data)[0],
    );
    const records = deserialized.map((data) => ({
      ...data,
      publicKey: record.publicKey,
      header: {
        owner: record.owner,
        executable: record.executable,
        lamports: record.lamports,
      },
    }));
    expect(() =>
      assertDelegateRecordRelationships(
        umi,
        records,
        classified.executiveProfiles,
      ),
    ).not.toThrow();

    const wrongAuthority = umi.eddsa.generateKeypair().publicKey;
    const tampered = classifyAgentToolsProgramAccounts([
      profileAccount(),
      delegateAccount(wrongAuthority),
    ]).executionDelegateRecords;
    const tamperedData = getExecutionDelegateRecordV1AccountDataSerializer()
      .deserialize(tampered[0]!.data)[0];
    expect(() =>
      assertDelegateRecordRelationships(
        umi,
        [
          {
            ...tamperedData,
            publicKey: tampered[0]!.publicKey,
            header: {
              owner: tampered[0]!.owner,
              executable: false,
              lamports: tampered[0]!.lamports,
            },
          },
        ],
        [profileAccount()],
      ),
    ).toThrow(Goal9BDelegationAuditError);
  });

  it('requires the filtered and full-scan address sets to match', () => {
    const record = delegateAccount();
    expect(() => assertSameAccountSet([record], [record])).not.toThrow();
    expect(() => assertSameAccountSet([record], [])).toThrow(
      Goal9BDelegationAuditError,
    );
  });
});

describe('public Goal 9B artifact', () => {
  it('round-trips the read-only completeness evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9b-'));
    const artifactPath = join(directory, 'goal9b.json');
    const artifact: Goal9BArtifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: '9B',
      network: 'devnet',
      status: 'complete',
      auditedAt: '2026-08-25T00:00:00.000Z',
      rpcOrigin: 'https://api.devnet.solana.com',
      finalizedSlotFloor: 1,
      finalizedSlotAfter: 2,
      addresses: {
        asset: ASSET,
        owner: OWNER,
        agentToolsProgram: String(MPL_AGENT_TOOLS_PROGRAM_ID),
        knownExecutiveProfile: String(profilePda[0]),
        knownExecutionDelegateRecord: String(recordPda[0]),
      },
      layout: {
        executiveProfileDiscriminator: 1,
        executiveProfileSize: 40,
        executionDelegateDiscriminator: 2,
        executionDelegateSize: 104,
        agentAssetOffset: 72,
      },
      counts: {
        allProgramAccounts: 1,
        executiveProfiles: 1,
        executionDelegateRecords: 0,
        matchingAssetDelegates: 0,
      },
      activeRecords: [],
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
    try {
      await writeGoal9BArtifact(artifact, artifactPath);
      await expect(readGoal9BArtifact(artifactPath)).resolves.toEqual(artifact);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
