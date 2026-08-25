import { readFile } from 'node:fs/promises';

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import {
  findAssociatedTokenPda,
  mplToolbox,
} from '@metaplex-foundation/mpl-toolbox';
import { createNoopSigner, publicKey } from '@metaplex-foundation/umi';
import { describe, expect, it } from 'vitest';

import {
  assertMainnetRescueDeltas,
  buildOwnerMainnetSolRescue,
  buildOwnerMainnetUsdcRescue,
  MainnetRescueBalanceError,
  MainnetRescueBuildError,
} from '../src/actions/mainnet-rescue.js';
import {
  GOAL_9F_MAX_FEE_PAYER_SPEND_LAMPORTS,
  MainnetRescuePolicyError,
  type MainnetRescuePolicy,
  parseMainnetRescuePolicy,
} from '../src/goal9f/policy.js';
import {
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
} from '../src/mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../src/policy/policy.js';

const OWNER = '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';
const RECOVERY = 'ABZePapHbYaTg7GU4LGQNcYmfURvue5uVrrf4FUa4x3j';
const ASSET = '66aw2vNMJHk4xPjc6VAE9CPPahkEaj7EfpQFFuQuvTd2';
const COLLECTION = 'csuvrVdZYpgVT5dVH9LYfdzQuWzXBYwL1xWDkcenThX';
const ASSET_SIGNER = '5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD';

const umi = createUmi('http://127.0.0.1:8899')
  .use(mplToolbox())
  .use(mplCore());

function usdcAta(owner: string): string {
  return String(
    findAssociatedTokenPda(umi, {
      mint: publicKey(SOLANA_MAINNET_USDC_MINT),
      owner: publicKey(owner),
    })[0],
  );
}

const policy: MainnetRescuePolicy = {
  network: 'mainnet-beta',
  owner: OWNER,
  sourceAssetSigner: ASSET_SIGNER,
  recoveryOwner: RECOVERY,
  usdcMint: SOLANA_MAINNET_USDC_MINT,
  usdcDecimals: 6,
  sourceUsdcAccount: usdcAta(ASSET_SIGNER),
  recoveryUsdcAccount: usdcAta(RECOVERY),
  maximumUsdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
  maximumSolLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  maximumFeePayerSpendLamports: GOAL_9F_MAX_FEE_PAYER_SPEND_LAMPORTS,
  tokenProgram: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  systemProgram: SYSTEM_PROGRAM_ID,
};

const accounts = {
  asset: ASSET,
  collection: COLLECTION,
  assetSigner: ASSET_SIGNER,
  owner: createNoopSigner(publicKey(OWNER)),
};

describe('Goal 9F fixed owner-only rescue policy', () => {
  it('accepts only the exact Mainnet constants and distinct recovery', () => {
    expect(parseMainnetRescuePolicy(policy)).toEqual(policy);
    for (const changed of [
      { ...policy, network: 'devnet' },
      { ...policy, usdcMint: RECOVERY },
      { ...policy, usdcDecimals: 9 },
      { ...policy, maximumUsdcBaseUnits: 2_000_000n },
      { ...policy, maximumSolLamports: 30_000_000n },
      { ...policy, tokenProgram: RECOVERY },
      { ...policy, recoveryOwner: OWNER },
      { ...policy, recoveryUsdcAccount: policy.sourceUsdcAccount },
    ]) {
      expect(() => parseMainnetRescuePolicy(changed)).toThrow(
        MainnetRescuePolicyError,
      );
    }
  });
});

describe('Goal 9F owner-only USDC rescue builder', () => {
  it('builds one capped TransferChecked without a delegate record', () => {
    const built = buildOwnerMainnetUsdcRescue(
      umi,
      policy,
      accounts,
      900_000n,
    );
    expect(built.asset).toBe('USDC');
    expect(built.innerInstruction.keys).toHaveLength(4);
    expect(Array.from(built.innerInstruction.data)).toEqual([
      12,
      160,
      187,
      13,
      0,
      0,
      0,
      0,
      0,
      6,
    ]);
    expect(built.builder.getInstructions()[0]?.keys).toHaveLength(11);
  });

  it('denies zero, excess, non-canonical accounts, and wrong owner', () => {
    for (const amount of [0n, GOAL_9_MAX_USDC_BASE_UNITS + 1n]) {
      expect(() =>
        buildOwnerMainnetUsdcRescue(umi, policy, accounts, amount),
      ).toThrow(MainnetRescueBuildError);
    }
    expect(() =>
      buildOwnerMainnetUsdcRescue(
        umi,
        { ...policy, sourceUsdcAccount: RECOVERY },
        accounts,
        1n,
      ),
    ).toThrow(MainnetRescueBuildError);
    expect(() =>
      buildOwnerMainnetUsdcRescue(
        umi,
        policy,
        { ...accounts, owner: createNoopSigner(publicKey(RECOVERY)) },
        1n,
      ),
    ).toThrow(MainnetRescueBuildError);
  });
});

describe('Goal 9F owner-only SOL rescue builder', () => {
  it('builds one capped System transfer without a delegate record', () => {
    const built = buildOwnerMainnetSolRescue(
      umi,
      policy,
      accounts,
      GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
    );
    expect(built.asset).toBe('SOL');
    expect(built.innerInstruction.keys).toHaveLength(2);
    expect(Array.from(built.innerInstruction.data)).toEqual([
      2,
      0,
      0,
      0,
      0,
      45,
      49,
      1,
      0,
      0,
      0,
      0,
    ]);
    expect(built.builder.getInstructions()[0]?.keys).toHaveLength(9);
  });

  it('denies zero, excess, wrong Asset Signer, and malformed policy', () => {
    for (const amount of [0n, GOAL_9_MAX_SOL_RESERVE_LAMPORTS + 1n]) {
      expect(() =>
        buildOwnerMainnetSolRescue(umi, policy, accounts, amount),
      ).toThrow(MainnetRescueBuildError);
    }
    expect(() =>
      buildOwnerMainnetSolRescue(
        umi,
        policy,
        { ...accounts, assetSigner: RECOVERY },
        1n,
      ),
    ).toThrow(MainnetRescueBuildError);
    expect(() =>
      buildOwnerMainnetSolRescue(umi, null, accounts, 1n),
    ).toThrow(MainnetRescuePolicyError);
  });

  it('contains no delegate, RPC, key loading, simulation, signing, or send path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal9f/policy.ts', 'utf8'),
        readFile('src/actions/mainnet-rescue.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(/executionDelegateRecord|executive/i);
    expect(sources).not.toMatch(
      /fetch\(|createUmi\(|loadOrCreate|simulateTransaction|signTransaction|sendTransaction|sendAndConfirm|\.sendAndConfirm\(/i,
    );
  });
});

describe('Goal 9F finalized rescue accounting contract', () => {
  it('requires a complete evacuation and bounded owner fee', () => {
    expect(() =>
      assertMainnetRescueDeltas(
        {
          sourceBefore: 900_000n,
          sourceAfter: 0n,
          recoveryBefore: 100_000n,
          recoveryAfter: 1_000_000n,
          feePayerBeforeLamports: 1_000_000n,
          feePayerAfterLamports: 950_000n,
        },
        900_000n,
        GOAL_9F_MAX_FEE_PAYER_SPEND_LAMPORTS,
      ),
    ).not.toThrow();
  });

  it('rejects a residual balance, unexplained delta, or excess fee', () => {
    for (const changed of [
      { sourceAfter: 1n },
      { recoveryAfter: 999_999n },
      { feePayerAfterLamports: 800_000n },
    ]) {
      expect(() =>
        assertMainnetRescueDeltas(
          {
            sourceBefore: 900_000n,
            sourceAfter: 0n,
            recoveryBefore: 100_000n,
            recoveryAfter: 1_000_000n,
            feePayerBeforeLamports: 1_000_000n,
            feePayerAfterLamports: 950_000n,
            ...changed,
          },
          900_000n,
          GOAL_9F_MAX_FEE_PAYER_SPEND_LAMPORTS,
        ),
      ).toThrow(MainnetRescueBalanceError);
    }
  });
});
