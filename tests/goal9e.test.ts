import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import {
  findAssociatedTokenPda,
  mplToolbox,
} from '@metaplex-foundation/mpl-toolbox';
import { createNoopSigner, publicKey } from '@metaplex-foundation/umi';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertMainnetUsdcInnerInstruction,
  buildMainnetUsdcTransfer,
  MainnetUsdcBuildError,
} from '../src/actions/mainnet-usdc-transfer.js';
import {
  createGoal9EArtifact,
  GOAL_9E_ACTION_BASE_UNITS,
  readGoal9EArtifact,
  writeGoal9EArtifact,
} from '../src/goal9e/artifact.js';
import {
  MainnetRecoveryError,
  prepareMainnetRecoveryWallet,
} from '../src/goal9e/recovery.js';
import {
  GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS,
  type MainnetUsdcPolicy,
  validateMainnetUsdcAction,
} from '../src/goal9e/policy.js';
import {
  GOAL_9_MAX_ACQUISITION_COST_USD_CENTS,
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_MAINNET_USDC_MINT,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
} from '../src/mainnet/readiness.js';

const OWNER = '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';
const EXECUTIVE = 'EJQcuD9FtJ33c2wA7GM6HzvmJJJbPsYnmH5ZjTDdhbjF';
const RECOVERY = 'B96kUFzEvVzmW9DKfg3VDV9ZagXXjZ9rc3vyZeMk5svy';
const ASSET = '66aw2vNMJHk4xPjc6VAE9CPPahkEaj7EfpQFFuQuvTd2';
const COLLECTION = 'csuvrVdZYpgVT5dVH9LYfdzQuWzXBYwL1xWDkcenThX';
const ASSET_SIGNER = '5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD';
const RECORD = '4nzrCQWJNXRdyd7To3vtzMQioNkDrn4RduW4g3QcqFaH';
const temporaryDirectories: string[] = [];

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

const policy: MainnetUsdcPolicy = {
  network: 'mainnet-beta',
  token: 'USDC',
  mint: SOLANA_MAINNET_USDC_MINT,
  decimals: 6,
  sourceAssetSigner: ASSET_SIGNER,
  sourceTokenAccount: usdcAta(ASSET_SIGNER),
  allowedDestinationOwner: RECOVERY,
  allowedDestinationTokenAccount: usdcAta(RECOVERY),
  actionBaseUnits: GOAL_9E_ACTION_BASE_UNITS,
  maximumTreasuryBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
  maximumFeePayerSpendLamports: GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS,
  allowedProgram: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
};

const intent = {
  kind: 'TRANSFER_USDC',
  network: 'mainnet-beta',
  token: 'USDC',
  destinationOwner: RECOVERY,
  amountBaseUnits: GOAL_9E_ACTION_BASE_UNITS,
} as const;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Goal 9E isolated Mainnet recovery boundary', () => {
  it('creates one mode-0600 key and reuses it idempotently', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9e-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'recovery.json');
    const umi = createUmi('http://127.0.0.1:8899');

    const first = await prepareMainnetRecoveryWallet(umi, [OWNER, EXECUTIVE], path);
    const second = await prepareMainnetRecoveryWallet(umi, [OWNER, EXECUTIVE], path);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.publicKey).toBe(first.publicKey);
    expect(first.publicKey).not.toBe(OWNER);
    expect(first.publicKey).not.toBe(EXECUTIVE);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('rejects a recovery wallet in the forbidden principal set', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9e-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'recovery.json');
    const umi = createUmi('http://127.0.0.1:8899');
    const recovery = await prepareMainnetRecoveryWallet(umi, [], path);

    await expect(
      prepareMainnetRecoveryWallet(umi, [recovery.publicKey], path),
    ).rejects.toThrow(MainnetRecoveryError);
  });

  it('writes public evidence with fixed caps and no write claim', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9e-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'goal9e.json');
    const artifact = createGoal9EArtifact({
      owner: OWNER,
      executive: EXECUTIVE,
      recovery: RECOVERY,
      createdAt: '2026-08-25T00:00:00.000Z',
    });
    await writeGoal9EArtifact(artifact, path);

    expect(await readGoal9EArtifact(path)).toEqual(artifact);
    expect(artifact.policy).toEqual({
      token: 'USDC',
      mint: SOLANA_MAINNET_USDC_MINT,
      decimals: 6,
      actionBaseUnits: GOAL_9E_ACTION_BASE_UNITS.toString(),
      maximumTreasuryBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS.toString(),
      maximumSolReserveLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS.toString(),
      maximumAcquisitionCostUsdCents:
        GOAL_9_MAX_ACQUISITION_COST_USD_CENTS.toString(),
      allowedDestinationOwner: RECOVERY,
    });
    expect(artifact.checks).toMatchObject({
      funded: false,
      networkRequest: false,
      offlineBuilderShapeTested: true,
      finalMainnetMessageBuilt: false,
      finalMainnetMessageSigned: false,
      mainnetTransactionSubmitted: false,
    });
    expect(await readFile(path, 'utf8')).not.toMatch(
      /secret|seed|private|keypair|\[\s*\d+(?:\s*,\s*\d+){63}\s*\]/i,
    );
  });

  it('rejects a recovery destination equal to the owner', () => {
    expect(() =>
      createGoal9EArtifact({
        owner: OWNER,
        executive: EXECUTIVE,
        recovery: OWNER,
      }),
    ).toThrow();
  });
});

describe('Goal 9E fixed Mainnet USDC policy', () => {
  it('allows only the exact 0.1 USDC intent to recovery', () => {
    expect(validateMainnetUsdcAction(intent, policy)).toEqual({
      decision: 'ALLOW',
      intent,
      policy,
    });
  });

  it.each([
    [{ ...intent, amountBaseUnits: 1n }, 'MALFORMED_ACTION'],
    [{ ...intent, amountBaseUnits: 0n }, 'MALFORMED_ACTION'],
    [{ ...intent, network: 'devnet' }, 'MALFORMED_ACTION'],
    [{ ...intent, token: 'SOL' }, 'MALFORMED_ACTION'],
    [{ ...intent, destinationOwner: EXECUTIVE }, 'DESTINATION_NOT_ALLOWED'],
    [{ ...intent, instructions: [] }, 'MALFORMED_ACTION'],
  ])('denies modified action input as %s', (action, reason) => {
    expect(validateMainnetUsdcAction(action, policy)).toEqual({
      decision: 'DENY',
      reason,
    });
  });

  it('denies a different mint, program, decimal count, cap, or account reuse', () => {
    for (const changed of [
      { ...policy, mint: RECOVERY },
      { ...policy, allowedProgram: RECOVERY },
      { ...policy, decimals: 9 },
      { ...policy, maximumTreasuryBaseUnits: 2_000_000n },
    ]) {
      expect(validateMainnetUsdcAction(intent, changed)).toEqual({
        decision: 'DENY',
        reason: 'MALFORMED_POLICY',
      });
    }
    expect(
      validateMainnetUsdcAction(intent, {
        ...policy,
        allowedDestinationTokenAccount: policy.sourceTokenAccount,
      }),
    ).toEqual({
      decision: 'DENY',
      reason: 'INVALID_ACCOUNT_RELATIONSHIP',
    });
  });
});

describe('Goal 9E keyless offline Mainnet USDC builder', () => {
  const accounts = {
    asset: ASSET,
    collection: COLLECTION,
    assetSigner: ASSET_SIGNER,
    executionDelegateRecord: RECORD,
    feePayer: createNoopSigner(publicKey(OWNER)),
    executive: createNoopSigner(publicKey(EXECUTIVE)),
  };

  it('builds exactly one asserted TransferChecked CPI inside Core Execute', () => {
    const built = buildMainnetUsdcTransfer(umi, intent, policy, accounts);
    expect(Array.from(built.innerInstruction.data)).toEqual([
      12,
      160,
      134,
      1,
      0,
      0,
      0,
      0,
      0,
      6,
    ]);
    expect(built.innerInstruction.keys).toHaveLength(5);
    expect(built.builder.getInstructions()).toHaveLength(1);
    expect(built.builder.getInstructions()[0]?.keys).toHaveLength(12);
  });

  it('rejects a non-canonical ATA, wrong Asset Signer, and tampered bytes', () => {
    expect(() =>
      buildMainnetUsdcTransfer(
        umi,
        intent,
        { ...policy, sourceTokenAccount: RECORD },
        accounts,
      ),
    ).toThrow(MainnetUsdcBuildError);
    expect(() =>
      buildMainnetUsdcTransfer(umi, intent, policy, {
        ...accounts,
        assetSigner: RECOVERY,
      }),
    ).toThrow(MainnetUsdcBuildError);

    const built = buildMainnetUsdcTransfer(umi, intent, policy, accounts);
    expect(() =>
      assertMainnetUsdcInnerInstruction(
        {
          ...built.innerInstruction,
          data: new Uint8Array([
            ...built.innerInstruction.data.slice(0, 9),
            9,
          ]),
        },
        {
          executionDelegateRecord: RECORD,
          sourceTokenAccount: policy.sourceTokenAccount,
          mint: policy.mint,
          destinationTokenAccount: policy.allowedDestinationTokenAccount,
          assetSigner: ASSET_SIGNER,
          amountBaseUnits: GOAL_9E_ACTION_BASE_UNITS,
        },
      ),
    ).toThrow(MainnetUsdcBuildError);
  });

  it('contains no RPC, key loading, simulation, signing, or send path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal9e/policy.ts', 'utf8'),
        readFile('src/actions/mainnet-usdc-transfer.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /fetch\(|createUmi\(|loadOrCreate|simulateTransaction|signTransaction|sendTransaction|sendAndConfirm|\.sendAndConfirm\(/i,
    );
  });
});
