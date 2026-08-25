import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import {
  readGoal9AArtifact,
  type Goal9AArtifact,
  writeGoal9AArtifact,
} from '../src/goal9a/artifact.js';
import {
  assertGoal9AConfirmation,
  GOAL_9A_CONFIRMATION,
  Goal9AExecutionError,
  proveGoal9AForbiddenActions,
} from '../src/goal9a/execute.js';
import {
  findAssociatedTokenPda,
  mplToolbox,
} from '@metaplex-foundation/mpl-toolbox';
import { createNoopSigner, publicKey } from '@metaplex-foundation/umi';
import { describe, expect, it } from 'vitest';

import {
  assertDelegatedTestTokenInner,
  assertTestTokenActionDeltas,
  assertTestTokenRescueDeltas,
  buildDelegatedTestTokenTransfer,
  buildOwnerTestTokenRescue,
  TestTokenBalanceError,
  TestTokenBuildError,
} from '../src/actions/test-token-transfer.js';
import {
  CIRCLE_DEVNET_USDC_MINT,
  CIRCLE_MAINNET_USDC_MINT,
  GOAL_9A_ACTION_BASE_UNITS,
  GOAL_9A_DECIMALS,
  GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS,
  GOAL_9A_MAX_TRANSFER_BASE_UNITS,
  GOAL_9A_RESCUE_BASE_UNITS,
  GOAL_9A_TEST_TOKEN_LABEL,
  LEGACY_TOKEN_PROGRAM_ID,
  type TestTokenTransferPolicy,
  validateTestTokenAction,
} from '../src/goal9a/policy.js';

const OWNER = '7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c';
const RECEIVER = 'B96kUFzEvVzmW9DKfg3VDV9ZagXXjZ9rc3vyZeMk5svy';
const EXECUTIVE = 'ET7sHJiBdS5VgXfQvgzenS9U1iPAa5b3dUZKotCDW2dn';
const ASSET = '66aw2vNMJHk4xPjc6VAE9CPPahkEaj7EfpQFFuQuvTd2';
const COLLECTION = 'csuvrVdZYpgVT5dVH9LYfdzQuWzXBYwL1xWDkcenThX';
const ASSET_SIGNER = '5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD';
const RECORD = '4nzrCQWJNXRdyd7To3vtzMQioNkDrn4RduW4g3QcqFaH';
const TEST_MINT = '7XenUrVx3RKPfRCqRdo8hjUMJn7HTGwZU5uHh1nH7V2n';

const umi = createUmi('http://127.0.0.1:8899')
  .use(mplToolbox())
  .use(mplCore());
const ownerSigner = createNoopSigner(publicKey(OWNER));
const executiveSigner = createNoopSigner(publicKey(EXECUTIVE));

function associatedToken(owner: string): string {
  return String(
    findAssociatedTokenPda(umi, {
      mint: publicKey(TEST_MINT),
      owner: publicKey(owner),
    })[0],
  );
}

const policy: TestTokenTransferPolicy = {
  network: 'devnet',
  token: GOAL_9A_TEST_TOKEN_LABEL,
  mint: TEST_MINT,
  decimals: GOAL_9A_DECIMALS,
  sourceAssetSigner: ASSET_SIGNER,
  sourceTokenAccount: associatedToken(ASSET_SIGNER),
  allowedDestinationOwner: RECEIVER,
  allowedDestinationTokenAccount: associatedToken(RECEIVER),
  recoveryOwner: OWNER,
  recoveryTokenAccount: associatedToken(OWNER),
  maximumBaseUnits: GOAL_9A_MAX_TRANSFER_BASE_UNITS,
  maximumFeePayerSpendLamports: GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS,
  allowedProgram: LEGACY_TOKEN_PROGRAM_ID,
};

const intent = {
  kind: 'TRANSFER_TEST_TOKEN',
  network: 'devnet',
  token: GOAL_9A_TEST_TOKEN_LABEL,
  destinationOwner: RECEIVER,
  amountBaseUnits: GOAL_9A_ACTION_BASE_UNITS,
} as const;

const delegatedAccounts = {
  asset: ASSET,
  collection: COLLECTION,
  assetSigner: ASSET_SIGNER,
  executionDelegateRecord: RECORD,
  feePayer: ownerSigner,
  executive: executiveSigner,
};

describe('Goal 9A TEST-token policy', () => {
  it('allows only the exact bounded TEST-token intent', () => {
    expect(validateTestTokenAction(intent, policy)).toEqual({
      decision: 'ALLOW',
      intent,
      policy,
    });
  });

  it.each([
    [{ ...intent, amountBaseUnits: 0n }, 'INVALID_AMOUNT'],
    [
      { ...intent, amountBaseUnits: GOAL_9A_MAX_TRANSFER_BASE_UNITS + 1n },
      'AMOUNT_OVER_LIMIT',
    ],
    [{ ...intent, destinationOwner: EXECUTIVE }, 'DESTINATION_NOT_ALLOWED'],
    [{ ...intent, mint: TEST_MINT }, 'MALFORMED_ACTION'],
    [{ ...intent, program: LEGACY_TOKEN_PROGRAM_ID }, 'MALFORMED_ACTION'],
    [{ ...intent, instructions: [] }, 'MALFORMED_ACTION'],
  ])('denies forbidden action input as %s', (action, reason) => {
    expect(validateTestTokenAction(action, policy)).toEqual({
      decision: 'DENY',
      reason,
    });
  });

  it.each([CIRCLE_MAINNET_USDC_MINT, CIRCLE_DEVNET_USDC_MINT])(
    'explicitly refuses official USDC mint %s',
    (mint) => {
      expect(validateTestTokenAction(intent, { ...policy, mint })).toEqual({
        decision: 'DENY',
        reason: 'OFFICIAL_USDC_FORBIDDEN',
      });
    },
  );

  it('denies the wrong program and unsafe account reuse', () => {
    expect(
      validateTestTokenAction(intent, {
        ...policy,
        allowedProgram: EXECUTIVE,
      }),
    ).toEqual({ decision: 'DENY', reason: 'PROGRAM_NOT_ALLOWED' });
    expect(
      validateTestTokenAction(intent, {
        ...policy,
        recoveryTokenAccount: policy.sourceTokenAccount,
      }),
    ).toEqual({
      decision: 'DENY',
      reason: 'INVALID_ACCOUNT_RELATIONSHIP',
    });
  });
});

describe('Goal 9A live write gate and forbidden proof', () => {
  it('accepts only the exact Goal 9A confirmation', () => {
    expect(() =>
      assertGoal9AConfirmation([GOAL_9A_CONFIRMATION]),
    ).not.toThrow();
    expect(() => assertGoal9AConfirmation([])).toThrow(Goal9AExecutionError);
    expect(() =>
      assertGoal9AConfirmation([GOAL_9A_CONFIRMATION, '--extra']),
    ).toThrow(Goal9AExecutionError);
  });

  it('proves official USDC, excess, wrong recipient, and injection denials', () => {
    expect(proveGoal9AForbiddenActions(intent, policy)).toEqual({
      officialMainnetUsdc: 'OFFICIAL_USDC_FORBIDDEN',
      officialDevnetUsdc: 'OFFICIAL_USDC_FORBIDDEN',
      overLimit: 'AMOUNT_OVER_LIMIT',
      unknownDestination: 'DESTINATION_NOT_ALLOWED',
      injectedInstruction: 'MALFORMED_ACTION',
    });
  });
});

describe('Goal 9A exact delegated TransferChecked builder', () => {
  it('builds exactly one asserted Token Program CPI inside Core Execute', () => {
    const built = buildDelegatedTestTokenTransfer(
      umi,
      intent,
      policy,
      delegatedAccounts,
    );
    expect(String(built.innerInstruction.programId)).toBe(
      LEGACY_TOKEN_PROGRAM_ID,
    );
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
    expect(built.builder.getInstructions()).toHaveLength(1);
    expect(built.builder.getInstructions()[0]?.keys).toHaveLength(12);
  });

  it('rejects non-canonical token accounts before building', () => {
    expect(() =>
      buildDelegatedTestTokenTransfer(
        umi,
        intent,
        { ...policy, sourceTokenAccount: RECORD },
        delegatedAccounts,
      ),
    ).toThrow(TestTokenBuildError);
  });

  it('rejects tampered instruction data or metas', () => {
    const built = buildDelegatedTestTokenTransfer(
      umi,
      intent,
      policy,
      delegatedAccounts,
    );
    const wrongData = {
      ...built.innerInstruction,
      data: new Uint8Array([
        ...built.innerInstruction.data.slice(0, 9),
        9,
      ]),
    };
    expect(() =>
      assertDelegatedTestTokenInner([wrongData], {
        executionDelegateRecord: RECORD,
        sourceTokenAccount: policy.sourceTokenAccount,
        mint: policy.mint,
        destinationTokenAccount: policy.allowedDestinationTokenAccount,
        assetSigner: ASSET_SIGNER,
        amountBaseUnits: GOAL_9A_ACTION_BASE_UNITS,
      }),
    ).toThrow(TestTokenBuildError);
    expect(() =>
      assertDelegatedTestTokenInner(
        [
          {
            ...built.innerInstruction,
            keys: [
              ...built.innerInstruction.keys,
              built.innerInstruction.keys[0]!,
            ],
          },
        ],
        {
          executionDelegateRecord: RECORD,
          sourceTokenAccount: policy.sourceTokenAccount,
          mint: policy.mint,
          destinationTokenAccount: policy.allowedDestinationTokenAccount,
          assetSigner: ASSET_SIGNER,
          amountBaseUnits: GOAL_9A_ACTION_BASE_UNITS,
        },
      ),
    ).toThrow(TestTokenBuildError);
  });
});

describe('Goal 9A owner rescue', () => {
  it('builds the fixed remaining-balance rescue without a delegate record', () => {
    const built = buildOwnerTestTokenRescue(umi, policy, {
      asset: ASSET,
      collection: COLLECTION,
      assetSigner: ASSET_SIGNER,
      owner: ownerSigner,
    });
    expect(built.innerInstruction.keys).toHaveLength(4);
    expect(Array.from(built.innerInstruction.data)).toEqual([
      12,
      224,
      253,
      28,
      0,
      0,
      0,
      0,
      0,
      6,
    ]);
    const outer = built.builder.getInstructions()[0];
    expect(outer?.keys).toHaveLength(11);
    expect(outer?.keys.some((meta) => String(meta.pubkey) === RECORD)).toBe(
      false,
    );
  });

  it('fails closed for malformed rescue policy', () => {
    expect(() =>
      buildOwnerTestTokenRescue(umi, null, {
        asset: ASSET,
        collection: COLLECTION,
        assetSigner: ASSET_SIGNER,
        owner: ownerSigner,
      }),
    ).toThrow(TestTokenBuildError);
  });
});

describe('public Goal 9A artifact', () => {
  it('round-trips resumable evidence without private material', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9a-'));
    const artifactPath = join(directory, 'goal9a.json');
    const artifact: Goal9AArtifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: '9A',
      network: 'devnet',
      status: 'in-progress',
      startedAt: '2026-08-25T00:00:00.000Z',
      rpcOrigin: 'https://api.devnet.solana.com',
      addresses: {
        owner: OWNER,
        executiveAuthority: EXECUTIVE,
        executiveProfile: '5JCE3kBRz6U9hGWdEjAoPKrieucfgrnZ9n66Fz3R2Ymq',
        executionDelegateRecord: RECORD,
        collection: COLLECTION,
        asset: ASSET,
        agentIdentity: '2n9Xko2hRYp7yRxGJCn72RQXdDfXwdpfTMC3ea2zbh57',
        assetSigner: ASSET_SIGNER,
        testReceiver: RECEIVER,
        testMint: TEST_MINT,
        sourceAta: policy.sourceTokenAccount,
        destinationAta: policy.allowedDestinationTokenAccount,
        recoveryOwner: OWNER,
        recoveryAta: policy.recoveryTokenAccount,
      },
      policy: {
        token: GOAL_9A_TEST_TOKEN_LABEL,
        decimals: 6,
        initialSupplyBaseUnits: '2000000',
        actionBaseUnits: '100000',
        maximumTransferBaseUnits: '1000000',
        rescueBaseUnits: '1900000',
        maximumFeePayerSpendLamports: '100000',
        allowedProgram: LEGACY_TOKEN_PROGRAM_ID,
      },
      ownerStartingLamports: '1000000000',
      transactions: {
        boundedTransfer: [
          {
            signature: 'public-signature',
            blockhash: 'public-blockhash',
            lastValidBlockHeight: 123,
            status: 'prepared',
          },
        ],
      },
      checks: {},
    };
    try {
      await writeGoal9AArtifact(artifact, artifactPath);
      await expect(readGoal9AArtifact(artifactPath)).resolves.toEqual(artifact);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('Goal 9A token accounting', () => {
  it('reconciles the bounded action and owner rescue exactly', () => {
    expect(() =>
      assertTestTokenActionDeltas(
        {
          sourceBefore: 2_000_000n,
          sourceAfter: 1_900_000n,
          destinationBefore: 0n,
          destinationAfter: 100_000n,
          recoveryBefore: 0n,
          recoveryAfter: 0n,
          feePayerBeforeLamports: 1_000_000n,
          feePayerAfterLamports: 950_000n,
        },
        GOAL_9A_ACTION_BASE_UNITS,
        GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS,
      ),
    ).not.toThrow();
    expect(() =>
      assertTestTokenRescueDeltas(
        {
          sourceBefore: 1_900_000n,
          sourceAfter: 0n,
          destinationBefore: 100_000n,
          destinationAfter: 100_000n,
          recoveryBefore: 0n,
          recoveryAfter: 1_900_000n,
          feePayerBeforeLamports: 950_000n,
          feePayerAfterLamports: 900_000n,
        },
        GOAL_9A_RESCUE_BASE_UNITS,
        GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS,
      ),
    ).not.toThrow();
  });

  it('rejects unexplained token or fee-payer deltas', () => {
    expect(() =>
      assertTestTokenActionDeltas(
        {
          sourceBefore: 2_000_000n,
          sourceAfter: 1_800_000n,
          destinationBefore: 0n,
          destinationAfter: 100_000n,
          recoveryBefore: 0n,
          recoveryAfter: 0n,
          feePayerBeforeLamports: 1_000_000n,
          feePayerAfterLamports: 950_000n,
        },
        GOAL_9A_ACTION_BASE_UNITS,
        GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS,
      ),
    ).toThrow(TestTokenBalanceError);
    expect(() =>
      assertTestTokenRescueDeltas(
        {
          sourceBefore: 1_900_000n,
          sourceAfter: 0n,
          destinationBefore: 100_000n,
          destinationAfter: 100_000n,
          recoveryBefore: 0n,
          recoveryAfter: 1_900_000n,
          feePayerBeforeLamports: 1_000_000n,
          feePayerAfterLamports: 800_000n,
        },
        GOAL_9A_RESCUE_BASE_UNITS,
        GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS,
      ),
    ).toThrow(TestTokenBalanceError);
  });
});
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
