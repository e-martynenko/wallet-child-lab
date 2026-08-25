import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import {
  createNoopSigner,
  publicKey,
  type Instruction,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { describe, expect, it } from 'vitest';

import {
  assertBoundedExecuteBuilder,
  assertBoundedInnerTransfer,
  assertBoundedTransferBalanceDeltas,
  BalanceReconciliationError,
  buildBoundedTransfer,
  PolicyBuildError,
} from '../src/actions/transfer.js';
import { SYSTEM_PROGRAM_ID, validateAction } from '../src/policy/policy.js';
import type {
  TransferIntent,
  TransferPolicy,
} from '../src/policy/types.js';

const ASSET = '66aw2vNMJHk4xPjc6VAE9CPPahkEaj7EfpQFFuQuvTd2';
const COLLECTION = 'csuvrVdZYpgVT5dVH9LYfdzQuWzXBYwL1xWDkcenThX';
const ASSET_SIGNER = '5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD';
const DELEGATE_RECORD = '4nzrCQWJNXRdyd7To3vtzMQioNkDrn4RduW4g3QcqFaH';
const OWNER = '7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c';
const EXECUTIVE = 'ET7sHJiBdS5VgXfQvgzenS9U1iPAa5b3dUZKotCDW2dn';
const DESTINATION = 'B96kUFzEvVzmW9DKfg3VDV9ZagXXjZ9rc3vyZeMk5svy';

const policy: TransferPolicy = {
  network: 'devnet',
  token: 'SOL',
  sourceAssetSigner: ASSET_SIGNER,
  allowedDestination: DESTINATION,
  maximumLamports: 1_000_000n,
  maximumFeePayerSpendLamports: 100_000n,
  allowedProgram: SYSTEM_PROGRAM_ID,
};

const intent: TransferIntent = {
  kind: 'TRANSFER',
  network: 'devnet',
  token: 'SOL',
  destination: DESTINATION,
  amountLamports: 100_000n,
};

function createOfflineUmi() {
  return createUmi('http://127.0.0.1:8899')
    .use(mplToolbox())
    .use(mplCore());
}

function buildValidTransfer() {
  const umi = createOfflineUmi();
  return buildBoundedTransfer(umi, intent, policy, {
    asset: ASSET,
    collection: COLLECTION,
    assetSigner: ASSET_SIGNER,
    executionDelegateRecord: DELEGATE_RECORD,
    feePayer: createNoopSigner(publicKey(OWNER)),
    executive: createNoopSigner(publicKey(EXECUTIVE)),
  });
}

const expectedInner = {
  executionDelegateRecord: DELEGATE_RECORD,
  source: ASSET_SIGNER,
  destination: DESTINATION,
  amountLamports: 100_000n,
};

const expectedOuter = {
  asset: ASSET,
  collection: COLLECTION,
  assetSigner: ASSET_SIGNER,
  feePayer: OWNER,
  executive: EXECUTIVE,
  executionDelegateRecord: DELEGATE_RECORD,
  destination: DESTINATION,
  amountLamports: 100_000n,
};

describe('Goal 6 policy decision', () => {
  it('allows only the exact bounded Devnet SOL intent', () => {
    expect(validateAction(intent, policy)).toMatchObject({
      decision: 'ALLOW',
      intent,
    });
  });

  it.each([
    [{ ...intent, network: 'mainnet-beta' }, 'WRONG_NETWORK'],
    [{ ...intent, token: 'USDC' }, 'TOKEN_NOT_ALLOWED'],
    [{ ...intent, amountLamports: 0n }, 'INVALID_AMOUNT'],
    [{ ...intent, amountLamports: -1n }, 'INVALID_AMOUNT'],
    [{ ...intent, amountLamports: 1_000_001n }, 'AMOUNT_OVER_LIMIT'],
    [
      { ...intent, destination: OWNER },
      'DESTINATION_NOT_ALLOWED',
    ],
  ])('denies a forbidden policy value', (action, reason) => {
    expect(validateAction(action, policy)).toEqual({
      decision: 'DENY',
      reason,
    });
  });

  it.each([
    { ...intent, amountLamports: 100_000 },
    { ...intent, amountLamports: 0.0001 },
    { ...intent, source: ASSET_SIGNER },
    { ...intent, program: SYSTEM_PROGRAM_ID },
    { ...intent, instructions: [] },
    { ...intent, approve: OWNER },
    { ...intent, newAuthority: OWNER },
    { ...intent, closeAccount: true },
  ])('denies malformed or transaction-shaped input', (action) => {
    expect(validateAction(action, policy)).toEqual({
      decision: 'DENY',
      reason: 'MALFORMED_ACTION',
    });
  });

  it('fails closed for a malformed or non-System policy', () => {
    expect(validateAction(intent, { ...policy, network: 'mainnet-beta' })).toEqual({
      decision: 'DENY',
      reason: 'MALFORMED_POLICY',
    });
    expect(
      validateAction(intent, { ...policy, allowedProgram: EXECUTIVE }),
    ).toEqual({ decision: 'DENY', reason: 'PROGRAM_NOT_ALLOWED' });
  });
});

describe('Goal 6 fixed transaction builder', () => {
  it('builds one exact System transfer inside one exact Core Execute', () => {
    const result = buildValidTransfer();
    expect(() =>
      assertBoundedInnerTransfer([result.innerInstruction], expectedInner),
    ).not.toThrow();
    expect(() =>
      assertBoundedExecuteBuilder(result.builder, expectedOuter),
    ).not.toThrow();
  });

  it('rejects a source mismatch or recipient colliding with a signer', () => {
    const umi = createOfflineUmi();
    expect(() =>
      buildBoundedTransfer(umi, intent, policy, {
        asset: ASSET,
        collection: COLLECTION,
        assetSigner: OWNER,
        executionDelegateRecord: DELEGATE_RECORD,
        feePayer: createNoopSigner(publicKey(OWNER)),
        executive: createNoopSigner(publicKey(EXECUTIVE)),
      }),
    ).toThrow(PolicyBuildError);

    const ownerDestinationPolicy = {
      ...policy,
      allowedDestination: OWNER,
    };
    expect(() =>
      buildBoundedTransfer(
        umi,
        { ...intent, destination: OWNER },
        ownerDestinationPolicy,
        {
          asset: ASSET,
          collection: COLLECTION,
          assetSigner: ASSET_SIGNER,
          executionDelegateRecord: DELEGATE_RECORD,
          feePayer: createNoopSigner(publicKey(OWNER)),
          executive: createNoopSigner(publicKey(EXECUTIVE)),
        },
      ),
    ).toThrow(PolicyBuildError);
  });

  it.each([
    'unknown-program',
    'extra-account',
    'wrong-source',
    'wrong-destination',
    'wrong-amount',
    'wrong-writable-flag',
  ])('rejects tampered inner instruction: %s', (tamper) => {
    const valid = buildValidTransfer().innerInstruction;
    const instruction: Instruction = {
      ...valid,
      keys: valid.keys.map((meta) => ({ ...meta })),
      data: new Uint8Array(valid.data),
    };

    if (tamper === 'unknown-program') {
      instruction.programId = publicKey(
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      );
    } else if (tamper === 'extra-account') {
      instruction.keys.push({
        pubkey: publicKey(OWNER),
        isSigner: false,
        isWritable: true,
      });
    } else if (tamper === 'wrong-source') {
      instruction.keys[1] = {
        pubkey: publicKey(OWNER),
        isSigner: true,
        isWritable: true,
      };
    } else if (tamper === 'wrong-destination') {
      instruction.keys[2] = {
        pubkey: publicKey(OWNER),
        isSigner: false,
        isWritable: true,
      };
    } else if (tamper === 'wrong-amount') {
      instruction.data[4] = (instruction.data[4] ?? 0) + 1;
    } else {
      instruction.keys[2] = {
        pubkey: publicKey(DESTINATION),
        isSigner: false,
        isWritable: false,
      };
    }

    expect(() =>
      assertBoundedInnerTransfer([instruction], expectedInner),
    ).toThrow(PolicyBuildError);
  });

  it('rejects an extra inner instruction and a tampered outer message', () => {
    const result = buildValidTransfer();
    expect(() =>
      assertBoundedInnerTransfer(
        [result.innerInstruction, result.innerInstruction],
        expectedInner,
      ),
    ).toThrow(PolicyBuildError);

    const item = result.builder.items[0];
    expect(item).toBeDefined();
    if (!item) return;
    const tampered = result.builder.setItems([
      {
        ...item,
        instruction: {
          ...item.instruction,
          programId: publicKey(SYSTEM_PROGRAM_ID),
        },
      },
    ]);
    expect(() =>
      assertBoundedExecuteBuilder(tampered, expectedOuter),
    ).toThrow(PolicyBuildError);
  });
});

describe('Goal 6 balance reconciliation', () => {
  it('accepts exact source/destination deltas and a bounded payer fee', () => {
    expect(() =>
      assertBoundedTransferBalanceDeltas(
        {
          sourceBeforeLamports: 10_000_000n,
          sourceAfterLamports: 9_900_000n,
          destinationBeforeLamports: 0n,
          destinationAfterLamports: 100_000n,
          feePayerBeforeLamports: 1_000_000n,
          feePayerAfterLamports: 940_000n,
        },
        100_000n,
        100_000n,
      ),
    ).not.toThrow();
  });

  it.each([
    {
      sourceBeforeLamports: 10_000_000n,
      sourceAfterLamports: 9_899_999n,
      destinationBeforeLamports: 0n,
      destinationAfterLamports: 100_000n,
      feePayerBeforeLamports: 1_000_000n,
      feePayerAfterLamports: 940_000n,
    },
    {
      sourceBeforeLamports: 10_000_000n,
      sourceAfterLamports: 9_900_000n,
      destinationBeforeLamports: 0n,
      destinationAfterLamports: 99_999n,
      feePayerBeforeLamports: 1_000_000n,
      feePayerAfterLamports: 940_000n,
    },
    {
      sourceBeforeLamports: 10_000_000n,
      sourceAfterLamports: 9_900_000n,
      destinationBeforeLamports: 0n,
      destinationAfterLamports: 100_000n,
      feePayerBeforeLamports: 1_000_000n,
      feePayerAfterLamports: 899_999n,
    },
  ])('rejects unexplained balance deltas', (evidence) => {
    expect(() =>
      assertBoundedTransferBalanceDeltas(evidence, 100_000n, 100_000n),
    ).toThrow(BalanceReconciliationError);
  });
});
