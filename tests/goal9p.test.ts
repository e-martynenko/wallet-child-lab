import { readFile } from 'node:fs/promises';

import {
  mplAgentTools,
  findExecutionDelegateRecordV1Pda,
  findExecutiveProfileV1Pda,
} from '@metaplex-foundation/mpl-agent-registry';
import { MPL_CORE_PROGRAM_ID, mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { createNoopSigner, publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { describe, expect, it } from 'vitest';

import {
  buildOwnerMainnetSolRescue,
  buildOwnerMainnetUsdcRescue,
} from '../src/actions/mainnet-rescue.js';
import { buildMainnetUsdcTransfer } from '../src/actions/mainnet-usdc-transfer.js';
import { buildMainnetUsdcAtaSetup } from '../src/goal9g/usdc-ata-setup.js';
import {
  createFinalMainnetContract,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_EXECUTION_DELEGATE_RECORD,
  GOAL_9P_EXECUTIVE,
  GOAL_9P_EXECUTIVE_PROFILE,
  GOAL_9P_OWNER,
} from '../src/goal9p/final-contract.js';

const umi = createUmi('http://127.0.0.1:8899')
  .use(mplCore())
  .use(mplToolbox())
  .use(mplAgentTools());

function contract() {
  return createFinalMainnetContract(umi);
}

describe('Goal 9P final standalone Mainnet policy contract', () => {
  it('derives the final executive profile and execution delegate record', () => {
    const value = contract();
    const profile = findExecutiveProfileV1Pda(umi, {
      authority: publicKey(GOAL_9P_EXECUTIVE),
    });
    const record = findExecutionDelegateRecordV1Pda(umi, {
      executiveProfile: profile[0],
      agentAsset: publicKey(GOAL_9P_CORE_ASSET),
    });
    expect(String(profile[0])).toBe(GOAL_9P_EXECUTIVE_PROFILE);
    expect(String(record[0])).toBe(GOAL_9P_EXECUTION_DELEGATE_RECORD);
    expect(value.architecture).toEqual({
      standaloneCoreAsset: true,
      collection: null,
    });
  });

  it('builds the final two-ATA setup with the owner as noop payer', () => {
    const value = contract();
    const built = buildMainnetUsdcAtaSetup(
      umi,
      value.ataSetupPolicy,
      createNoopSigner(publicKey(GOAL_9P_OWNER)),
    );
    expect(built.builder.getInstructions()).toHaveLength(2);
  });

  it('builds the final standalone delegated action with the Core sentinel', () => {
    const value = contract();
    const built = buildMainnetUsdcTransfer(
      umi,
      value.action.intent,
      value.action.policy,
      {
        asset: value.addresses.coreAsset,
        collection: null,
        assetSigner: value.addresses.assetSigner,
        executionDelegateRecord: value.addresses.executionDelegateRecord,
        feePayer: createNoopSigner(publicKey(value.addresses.owner)),
        executive: createNoopSigner(publicKey(value.addresses.executive)),
      },
    );
    const outer = built.builder.getInstructions()[0]!;
    expect(String(outer.keys[1]?.pubkey)).toBe(String(MPL_CORE_PROGRAM_ID));
    expect(outer.keys[1]).toMatchObject({ isSigner: false, isWritable: false });
  });

  it('builds both final standalone owner rescue paths', () => {
    const value = contract();
    const accounts = {
      asset: value.addresses.coreAsset,
      collection: null,
      assetSigner: value.addresses.assetSigner,
      owner: createNoopSigner(publicKey(value.addresses.owner)),
    } as const;
    const usdc = buildOwnerMainnetUsdcRescue(
      umi,
      value.rescuePolicy,
      accounts,
      1_000_000n,
    );
    const sol = buildOwnerMainnetSolRescue(
      umi,
      value.rescuePolicy,
      accounts,
      1n,
    );
    expect(String(usdc.builder.getInstructions()[0]?.keys[1]?.pubkey)).toBe(
      String(MPL_CORE_PROGRAM_ID),
    );
    expect(String(sol.builder.getInstructions()[0]?.keys[1]?.pubkey)).toBe(
      String(MPL_CORE_PROGRAM_ID),
    );
  });

  it('contains no RPC, key loading, signing, simulation, or send path', async () => {
    const source = await readFile('src/goal9p/final-contract.ts', 'utf8');
    expect(source).not.toMatch(
      /fetch\(|createUmi\(|loadOrCreate|buildAndSign|signTransaction|simulateTransaction|sendTransaction|sendAndConfirm/i,
    );
  });

  it('publishes the final standalone contract without secret material', async () => {
    const [artifact, identity] = await Promise.all([
      readFile(
        'artifacts/wallet-child-001.goal9p.final-contract.json',
        'utf8',
      ).then((value) => JSON.parse(value) as Record<string, unknown>),
      readFile(
        'artifacts/wallet-child-001.goal9n.identity-addresses.json',
        'utf8',
      ).then(
        (value) =>
          JSON.parse(value) as { addresses: Record<string, string> },
      ),
    ]);
    const final = contract();
    expect(final.addresses).toMatchObject({
      owner: identity.addresses['owner'],
      executive: identity.addresses['executive'],
      recovery: identity.addresses['recovery'],
      coreAsset: identity.addresses['coreAsset'],
      assetSigner: identity.addresses['assetSignerPda'],
      agentIdentity: identity.addresses['agentIdentity'],
      assetSignerUsdcAta: identity.addresses['assetSignerUsdcAta'],
      recoveryUsdcAta: identity.addresses['recoveryUsdcAta'],
    });
    expect(artifact).toMatchObject({
      goal: '9P',
      network: 'mainnet-beta',
      architecture: { standaloneCoreAsset: true, collection: null },
      addresses: final.addresses,
      checks: {
        finalAtaSetupBuild: true,
        finalDelegatedActionBuild: true,
        finalUsdcRescueBuild: true,
        finalSolRescueBuild: true,
        transactionSigned: false,
        transactionSubmitted: false,
      },
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /secret|privateKey|seed|mnemonic|api[_-]?key/i,
    );
  });
});
