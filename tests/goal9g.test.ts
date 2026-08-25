import { readFile } from 'node:fs/promises';

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplToolbox, findAssociatedTokenPda } from '@metaplex-foundation/mpl-toolbox';
import { createNoopSigner, publicKey } from '@metaplex-foundation/umi';
import { describe, expect, it } from 'vitest';

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  assertMainnetUsdcAtaSetupSpend,
  assertMainnetUsdcAtaState,
  buildMainnetUsdcAtaSetup,
  classifyMainnetUsdcAtaPreflight,
  GOAL_9G_MAX_ATA_SETUP_SPEND_LAMPORTS,
  MainnetUsdcAtaSetupError,
  type MainnetUsdcAtaSetupPolicy,
  type MainnetUsdcAtaState,
} from '../src/goal9g/usdc-ata-setup.js';
import {
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
} from '../src/mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../src/policy/policy.js';

const OWNER = '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';
const RECOVERY = 'ABZePapHbYaTg7GU4LGQNcYmfURvue5uVrrf4FUa4x3j';
const ASSET_SIGNER = '5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD';

const umi = createUmi('http://127.0.0.1:8899').use(mplToolbox());
const payer = createNoopSigner(publicKey(OWNER));

function ata(owner: string): string {
  return String(
    findAssociatedTokenPda(umi, {
      mint: publicKey(SOLANA_MAINNET_USDC_MINT),
      owner: publicKey(owner),
    })[0],
  );
}

const policy: MainnetUsdcAtaSetupPolicy = {
  network: 'mainnet-beta',
  payer: OWNER,
  assetSigner: ASSET_SIGNER,
  recoveryOwner: RECOVERY,
  mint: SOLANA_MAINNET_USDC_MINT,
  sourceAta: ata(ASSET_SIGNER),
  recoveryAta: ata(RECOVERY),
  associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  tokenProgram: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  systemProgram: SYSTEM_PROGRAM_ID,
  maximumSetupSpendLamports: GOAL_9G_MAX_ATA_SETUP_SPEND_LAMPORTS,
};

function emptyState(address: string, tokenOwner: string): MainnetUsdcAtaState {
  return {
    address,
    programOwner: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
    mint: SOLANA_MAINNET_USDC_MINT,
    tokenOwner,
    amountBaseUnits: 0n,
    delegate: null,
    closeAuthority: null,
    initialized: true,
  };
}

describe('Goal 9G exact two-ATA setup builder', () => {
  it('builds only source and recovery canonical ATA creation', () => {
    const built = buildMainnetUsdcAtaSetup(umi, policy, payer);
    const instructions = built.builder.getInstructions();
    expect(instructions).toHaveLength(2);
    expect(instructions.map((instruction) => String(instruction.programId))).toEqual([
      ASSOCIATED_TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ]);
    expect(instructions.map((instruction) => Array.from(instruction.data))).toEqual([
      [],
      [],
    ]);
    expect(instructions.map((instruction) => instruction.keys.length)).toEqual([
      6,
      6,
    ]);
    expect(instructions[0]?.keys.map((meta) => String(meta.pubkey))).toEqual([
      OWNER,
      policy.sourceAta,
      ASSET_SIGNER,
      SOLANA_MAINNET_USDC_MINT,
      SYSTEM_PROGRAM_ID,
      SOLANA_LEGACY_TOKEN_PROGRAM_ID,
    ]);
    expect(instructions[1]?.keys.map((meta) => String(meta.pubkey))).toEqual([
      OWNER,
      policy.recoveryAta,
      RECOVERY,
      SOLANA_MAINNET_USDC_MINT,
      SYSTEM_PROGRAM_ID,
      SOLANA_LEGACY_TOKEN_PROGRAM_ID,
    ]);
  });

  it('denies wrong payer, mint, program, cap, relationship, or ATA', () => {
    const cases: Array<Readonly<{ input: unknown; signer?: typeof payer }>> = [
      { input: { ...policy, network: 'devnet' } },
      { input: { ...policy, mint: RECOVERY } },
      { input: { ...policy, associatedTokenProgram: OWNER } },
      { input: { ...policy, maximumSetupSpendLamports: 6_000_000n } },
      { input: { ...policy, recoveryOwner: OWNER } },
      { input: { ...policy, sourceAta: RECOVERY } },
      { input: policy, signer: createNoopSigner(publicKey(RECOVERY)) },
    ];
    for (const { input, signer } of cases) {
      expect(() => buildMainnetUsdcAtaSetup(umi, input, signer ?? payer)).toThrow(
        MainnetUsdcAtaSetupError,
      );
    }
  });
});

describe('Goal 9G preflight, read-back, and accounting', () => {
  const source = emptyState(policy.sourceAta, ASSET_SIGNER);
  const recovery = emptyState(policy.recoveryAta, RECOVERY);

  it('builds both from empty state and submits zero writes after completion', () => {
    expect(classifyMainnetUsdcAtaPreflight(null, null)).toBe('BUILD_BOTH');
    expect(classifyMainnetUsdcAtaPreflight(source, recovery)).toBe(
      'ALREADY_COMPLETE',
    );
  });

  it('stops on a partial state instead of inventing another message shape', () => {
    expect(() => classifyMainnetUsdcAtaPreflight(source, null)).toThrow(
      MainnetUsdcAtaSetupError,
    );
    expect(() => classifyMainnetUsdcAtaPreflight(null, recovery)).toThrow(
      MainnetUsdcAtaSetupError,
    );
  });

  it('requires initialized empty canonical accounts with no authorities', () => {
    expect(() =>
      assertMainnetUsdcAtaState(source, {
        address: policy.sourceAta,
        tokenOwner: ASSET_SIGNER,
      }),
    ).not.toThrow();
    for (const changed of [
      { amountBaseUnits: 1n },
      { delegate: OWNER },
      { closeAuthority: OWNER },
      { initialized: false },
      { tokenOwner: OWNER },
    ]) {
      expect(() =>
        assertMainnetUsdcAtaState(
          { ...source, ...changed },
          { address: policy.sourceAta, tokenOwner: ASSET_SIGNER },
        ),
      ).toThrow(MainnetUsdcAtaSetupError);
    }
  });

  it('enforces the two-ATA setup spend ceiling', () => {
    expect(() =>
      assertMainnetUsdcAtaSetupSpend(10_000_000n, 5_500_000n),
    ).not.toThrow();
    expect(() =>
      assertMainnetUsdcAtaSetupSpend(10_000_000n, 4_999_999n),
    ).toThrow(MainnetUsdcAtaSetupError);
  });

  it('contains no RPC, key loading, simulation, signing, or send path', async () => {
    const sourceCode = await readFile('src/goal9g/usdc-ata-setup.ts', 'utf8');
    expect(sourceCode).not.toMatch(
      /fetch\(|createUmi\(|loadOrCreate|simulateTransaction|signTransaction|sendTransaction|sendAndConfirm|\.sendAndConfirm\(/i,
    );
  });
});
