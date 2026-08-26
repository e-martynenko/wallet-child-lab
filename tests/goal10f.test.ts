import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  addTransactionSignature,
  base58,
  lamports,
  publicKey,
  type TransactionWithMeta,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { describe, expect, it, vi } from 'vitest';

import { buildUnsignedIrysFundingMessage } from '../src/goal10d/metadata-publication-plan.js';
import {
  assertGoal10FConfirmation,
  assertGoal10FSimulation,
  GOAL_10F_CONFIRMATION,
  GOAL_10F_EXPECTED_OWNER_AFTER_LAMPORTS,
  GOAL_10F_IRYS_FUND_SOURCE_SHA256,
  IrysFundingExecutionError,
  registerAndVerifyIrysCredit,
  verifyIrysCreditRegistrationContract,
  verifyFinalizedFundingTransaction,
} from '../src/goal10f/irys-funding-execution.js';
import { GOAL_9P_OWNER } from '../src/goal9p/final-contract.js';

const BLOCKHASH = '11111111111111111111111111111111';

function finalizedFixture() {
  const umi = createUmi('http://127.0.0.1:8899');
  const unsigned = buildUnsignedIrysFundingMessage(BLOCKHASH, 3_208n).transaction;
  const signed = addTransactionSignature(
    unsigned,
    new Uint8Array(64).fill(1),
    publicKey(GOAL_9P_OWNER),
  );
  const serialized = umi.transactions.serialize(signed);
  const transaction = {
    ...signed,
    meta: {
      fee: lamports(5_000n),
      logs: [],
      preBalances: [lamports(19_985_000n), lamports(50_000n), lamports(1n)],
      postBalances: [
        lamports(GOAL_10F_EXPECTED_OWNER_AFTER_LAMPORTS),
        lamports(53_208n),
        lamports(1n),
      ],
      preTokenBalances: [],
      postTokenBalances: [],
      innerInstructions: null,
      loadedAddresses: { writable: [], readonly: [] },
      computeUnitsConsumed: 150n,
      costUnits: null,
      err: null,
    },
    response: { slot: 441_900_000n },
  } satisfies TransactionWithMeta & { response: { slot: bigint } };
  return {
    transaction,
    serialized,
    signature: base58.deserialize(signed.signatures[0]!)[0],
    signedSha256: createHash('sha256').update(serialized).digest('hex'),
  };
}

describe('Goal 10F exact Irys funding execution', () => {
  it('pins the official Irys credit-registration endpoint and source', async () => {
    await expect(verifyIrysCreditRegistrationContract()).resolves.toBeUndefined();
    expect(GOAL_10F_IRYS_FUND_SOURCE_SHA256).toBe(
      'cf6fbed46e74e17bf32dfaf6b08a99c6bd56a897e8278d3686608dbb6b2a7fcf',
    );
  });

  it('accepts only the exact action-time confirmation', () => {
    expect(() => assertGoal10FConfirmation([GOAL_10F_CONFIRMATION])).not.toThrow();
    for (const changed of [
      [],
      [GOAL_10F_CONFIRMATION, 'extra'],
      [GOAL_10F_CONFIRMATION.replace('3208', '3209')],
      [GOAL_10F_CONFIRMATION.replace('5000', '5001')],
    ]) {
      expect(() => assertGoal10FConfirmation(changed)).toThrow(
        IrysFundingExecutionError,
      );
    }
  });

  it('requires exact post-simulation owner accounting', () => {
    const passing = {
      err: null,
      logs: [],
      accounts: [
        {
          executable: false,
          owner: '11111111111111111111111111111111',
          lamports: Number(GOAL_10F_EXPECTED_OWNER_AFTER_LAMPORTS),
          data: ['', 'base64'],
        },
      ],
    };
    expect(() => assertGoal10FSimulation(passing)).not.toThrow();
    expect(() =>
      assertGoal10FSimulation({
        ...passing,
        accounts: [{ ...passing.accounts[0]!, lamports: 19_976_791 }],
      }),
    ).toThrow(IrysFundingExecutionError);
    expect(() =>
      assertGoal10FSimulation({ ...passing, err: 'failure' }),
    ).toThrow(IrysFundingExecutionError);
  });

  it('decodes the finalized one-instruction receipt and exact balance deltas', () => {
    const fixture = finalizedFixture();
    expect(
      verifyFinalizedFundingTransaction(
        fixture.transaction,
        fixture.signature,
        fixture.signedSha256,
        fixture.serialized,
      ),
    ).toMatchObject({
      signature: fixture.signature,
      slot: 441_900_000n,
      feeLamports: 5_000n,
      transferLamports: 3_208n,
      ownerPreLamports: 19_985_000n,
      ownerPostLamports: 19_976_792n,
      destinationPreLamports: 50_000n,
      destinationPostLamports: 53_208n,
      sdkWalletInitialized: false,
      uploadAttempted: false,
    });
    expect(() =>
      verifyFinalizedFundingTransaction(
        {
          ...fixture.transaction,
          meta: { ...fixture.transaction.meta, fee: lamports(5_001n) },
        },
        fixture.signature,
        fixture.signedSha256,
        fixture.serialized,
      ),
    ).toThrow(IrysFundingExecutionError);
  });

  it('registers only the finalized transaction id and verifies exact credit', async () => {
    const signature = finalizedFixture().signature;
    let reads = 0;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === 'POST') {
        expect(init.body).toBe(JSON.stringify({ tx_id: signature }));
        return new Response('', { status: 202 });
      }
      reads += 1;
      return Response.json({ balance: reads < 3 ? '0' : '3208' });
    });
    await expect(
      registerAndVerifyIrysCredit(signature, fetchMock, async () => {}),
    ).resolves.toBe(3_208n);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('fails closed on pre-existing excess Irys credit', async () => {
    const signature = finalizedFixture().signature;
    await expect(
      registerAndVerifyIrysCredit(
        signature,
        vi.fn<typeof fetch>(async () => Response.json({ balance: '3209' })),
        async () => {},
      ),
    ).rejects.toThrow(IrysFundingExecutionError);
  });

  it('keeps upload and Irys SDK wallet initialization out of the executor', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal10f/irys-funding-execution.ts', 'utf8'),
        readFile('src/cli/fund-irys-mainnet.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(/^\s*import .*@irys\/upload/m);
    expect(sources).not.toMatch(/\.upload(?:File|Data)?\s*\(/i);
    expect(sources).not.toMatch(/withWallet|sdkWallet\s*=|privateKey|mnemonic/i);
  });

  it('publishes a finalized public receipt and stops before upload', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal10f.irys-funding-receipt.json',
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      goal: '10F',
      status: 'FINALIZED_IRYS_FUNDING_CREDITED',
      finalizedTransaction: {
        signature:
          '4zHdifUiB1jHxYGuVo5s3EkSkQAEvXeKKmyJkV6wsGqY5mZeuwMaz8LvPN77yKtH4eZPp385nQYTawSfeiECcFER',
        slot: '441857234',
        transferLamports: '3208',
        feeLamports: '5000',
        ownerPostLamports: '19976792',
        confirmationStatus: 'finalized',
        error: null,
      },
      irysCredit: { creditedLamports: '3208', registered: true },
      checks: {
        sameSignedBytesSimulationPassed: true,
        transactionSubmittedOnce: true,
        sdkWalletInitialized: false,
        uploadAttempted: false,
        treasuryActionAuthorized: false,
      },
      verification: {
        testFiles: 36,
        tests: 273,
        testsPassedAfterWrite: true,
        typecheckPassedAfterWrite: true,
        productionAuditClean: false,
        productionAuditFindings: 5,
        independentPublicSignatureStatus: 'finalized',
        independentIrysCreditLamports: '3208',
      },
      verdict: 'IRYS_FUNDING_PASS_STOP_BEFORE_UPLOAD',
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /messageBase64|serializedTransaction|privateKey|secretKey|seed|mnemonic|api[_-]?key|rpcUrl/i,
    );
  });
});
