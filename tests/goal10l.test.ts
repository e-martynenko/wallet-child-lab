import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  MPL_AGENT_IDENTITY_PROGRAM_ID,
} from '@metaplex-foundation/mpl-agent-registry';
import { MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { base58, lamports } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { describe, expect, it } from 'vitest';

import {
  assertGoal10LConfirmation,
  assertGoal10LSignedSimulation,
  GOAL_10L_CONFIRMATION,
  GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS,
  MainnetBirthExecutionError,
  verifyFinalizedBirthTransaction,
} from '../src/goal10l/mainnet-birth-execution.js';
import {
  buildUnsignedMainnetBirth,
  GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS,
  GOAL_10K_CORE_ASSET_RENT_LAMPORTS,
  GOAL_10K_MAX_FEE_LAMPORTS,
} from '../src/goal10k/mainnet-birth-write-review.js';
import { GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS } from '../src/goal10j/mainnet-birth-preflight.js';
import {
  GOAL_9P_AGENT_IDENTITY,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_OWNER,
} from '../src/goal9p/final-contract.js';

const BLOCKHASH = '11111111111111111111111111111111';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function validSimulation() {
  return {
    err: null,
    logs: ['simulation passed'],
    accounts: [
      {
        executable: false,
        owner: '11111111111111111111111111111111',
        lamports: Number(GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS),
        data: ['', 'base64'],
      },
      {
        executable: false,
        owner: String(MPL_CORE_PROGRAM_ID),
        lamports: Number(GOAL_10K_CORE_ASSET_RENT_LAMPORTS),
        data: ['', 'base64'],
      },
      {
        executable: false,
        owner: String(MPL_AGENT_IDENTITY_PROGRAM_ID),
        lamports: Number(GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS),
        data: ['', 'base64'],
      },
    ],
    unitsConsumed: 44_039,
  };
}

describe('Goal 10L locked Mainnet birth execution', () => {
  it('accepts only the literal reviewed action-time phrase', () => {
    expect(() => assertGoal10LConfirmation([GOAL_10L_CONFIRMATION])).not.toThrow();
    expect(() => assertGoal10LConfirmation(['proceed'])).toThrow(
      MainnetBirthExecutionError,
    );
    expect(() =>
      assertGoal10LConfirmation([
        GOAL_10L_CONFIRMATION.replace(
          'https://gateway.irys.xyz/',
          '[https://gateway.irys.xyz/](https://gateway.irys.xyz/)',
        ),
      ]),
    ).toThrow(MainnetBirthExecutionError);
  });

  it('requires exact signed simulation balances, owners, and compute cap', () => {
    expect(assertGoal10LSignedSimulation(validSimulation())).toBe(44_039);
    const drifted = validSimulation();
    drifted.accounts[0]!.lamports += 1;
    expect(() => assertGoal10LSignedSimulation(drifted)).toThrow(
      MainnetBirthExecutionError,
    );
  });

  it('decodes the exact finalized transaction and balance receipt', () => {
    const umi = createUmi('http://127.0.0.1:8899');
    const unsigned = buildUnsignedMainnetBirth(BLOCKHASH);
    const ownerSignature = new Uint8Array(64).fill(7);
    const coreSignature = new Uint8Array(64).fill(9);
    const signed = {
      ...unsigned.transaction,
      signatures: [ownerSignature, coreSignature],
    };
    const pre = signed.message.accounts.map(() => lamports(0));
    const post = signed.message.accounts.map(() => lamports(0));
    const ownerIndex = signed.message.accounts.findIndex(
      (account) => String(account) === GOAL_9P_OWNER,
    );
    const coreIndex = signed.message.accounts.findIndex(
      (account) => String(account) === GOAL_9P_CORE_ASSET,
    );
    const identityIndex = signed.message.accounts.findIndex(
      (account) => String(account) === GOAL_9P_AGENT_IDENTITY,
    );
    pre[ownerIndex] = lamports(GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS);
    post[ownerIndex] = lamports(GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS);
    post[coreIndex] = lamports(GOAL_10K_CORE_ASSET_RENT_LAMPORTS);
    post[identityIndex] = lamports(GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS);
    const finalized = {
      ...signed,
      meta: {
        fee: lamports(GOAL_10K_MAX_FEE_LAMPORTS),
        logs: [],
        preBalances: pre,
        postBalances: post,
        preTokenBalances: [],
        postTokenBalances: [],
        innerInstructions: null,
        loadedAddresses: { writable: [], readonly: [] },
        computeUnitsConsumed: 44_039n,
        costUnits: null,
        err: null,
      },
      response: { slot: 100n },
    };
    const serialized = umi.transactions.serialize(signed);
    expect(() =>
      verifyFinalizedBirthTransaction(
        finalized,
        base58.deserialize(ownerSignature)[0],
        unsigned.messageSha256,
        sha256(serialized),
        serialized,
      ),
    ).not.toThrow();
  });

  it('keeps key loading after every public gate and submits serialized bytes once', async () => {
    const source = await readFile(
      'src/goal10l/mainnet-birth-execution.ts',
      'utf8',
    );
    const durability = source.lastIndexOf('verifyGoal10IIrysTransaction(');
    const preflight = source.lastIndexOf('verifyMainnetBirthPreflight(');
    const review = source.lastIndexOf('reviewMainnetBirthWrite(');
    const fee = source.lastIndexOf('prepareExactBirthTransaction(');
    const keys = source.lastIndexOf('loadBirthSigners(');
    const simulation = source.lastIndexOf('simulateTransaction(');
    const submission = source.lastIndexOf('submitExactSerializedBirth(');
    expect(durability).toBeLessThan(preflight);
    expect(preflight).toBeLessThan(review);
    expect(review).toBeLessThan(fee);
    expect(fee).toBeLessThan(keys);
    expect(keys).toBeLessThan(simulation);
    expect(simulation).toBeLessThan(submission);
    expect(source).not.toMatch(/loadOrCreateIsolatedSigner|generateSigner/);
  });

  it('writes only a new public receipt after finalized read-back', async () => {
    const source = await readFile('src/cli/birth-mainnet.ts', 'utf8');
    expect(source).toContain("flag: 'wx'");
    expect(source).toContain('finalizedIdentityReadbackPassed');
    expect(source).not.toMatch(
      /secretKey|privateKey|mnemonic|messageBase64|transactionBase64|rpcUrl:/i,
    );
  });
});
