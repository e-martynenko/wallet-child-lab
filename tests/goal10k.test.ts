import { readFile } from 'node:fs/promises';

import {
  MPL_AGENT_IDENTITY_PROGRAM_ID,
} from '@metaplex-foundation/mpl-agent-registry';
import { MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { describe, expect, it, vi } from 'vitest';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../src/chain/network.js';
import type { MainnetBirthPreflight } from '../src/goal10j/mainnet-birth-preflight.js';
import {
  GOAL_10K_MAX_FEE_LAMPORTS,
  GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS,
  GOAL_10K_CORE_ASSET_RENT_LAMPORTS,
  GOAL_10K_CONFIRMATION,
  GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS,
  GOAL_10K_TOTAL_BIRTH_RENT_LAMPORTS,
  GOAL_10K_TRANSACTION_BYTE_LENGTH,
  MainnetBirthWriteReviewError,
  buildUnsignedMainnetBirth,
  reviewMainnetBirthWrite,
} from '../src/goal10k/mainnet-birth-write-review.js';
import {
  GOAL_9P_AGENT_IDENTITY,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_OWNER,
} from '../src/goal9p/final-contract.js';

const BLOCKHASH = '11111111111111111111111111111111';
const CORE_RENT = Number(GOAL_10K_CORE_ASSET_RENT_LAMPORTS);
const IDENTITY_RENT = Number(GOAL_10K_AGENT_IDENTITY_RENT_LAMPORTS);
const OWNER_BALANCE = 19_976_792;
const config = {
  rpcUrl: 'https://mainnet.example.test/private?credential=hidden',
  rpcOrigin: 'https://mainnet.example.test',
};

function preflight(): MainnetBirthPreflight {
  return {
    finalizedSlot: 100,
    metadata: { durability: 'IRYS_DURABLE_ACCEPTED' },
    accounts: {
      ownerBalanceLamports: BigInt(OWNER_BALANCE),
      allAbsent: true,
    },
    fixedRent: { agentIdentityLamports: BigInt(IDENTITY_RENT) },
    verdict: 'STOP_READY_FOR_MAINNET_BIRTH_WRITE_REVIEW',
  } as MainnetBirthPreflight;
}

function simulatedAccount(lamports: number, owner: string) {
  return {
    lamports,
    owner,
    executable: false,
    data: ['', 'base64'],
  };
}

function mockRpc(change?: 'fee' | 'owner' | 'rent' | 'stale') {
  return vi.fn<typeof fetch>(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
      params: unknown[];
    };
    let result: unknown;
    if (request.method === 'getGenesisHash') {
      result = SOLANA_MAINNET_BETA_GENESIS_HASH;
    } else if (request.method === 'getLatestBlockhash') {
      result = {
        context: { slot: 200 },
        value: { blockhash: BLOCKHASH, lastValidBlockHeight: 900 },
      };
    } else if (request.method === 'getFeeForMessage') {
      result = {
        context: { slot: 201 },
        value: Number(
          change === 'fee'
            ? GOAL_10K_MAX_FEE_LAMPORTS + 1n
            : GOAL_10K_MAX_FEE_LAMPORTS,
        ),
      };
    } else if (request.method === 'simulateTransaction') {
      const options = request.params[1] as {
        sigVerify: boolean;
        accounts: { addresses: string[] };
      };
      expect(options.sigVerify).toBe(false);
      expect(options.accounts.addresses).toEqual([
        GOAL_9P_OWNER,
        GOAL_9P_CORE_ASSET,
        GOAL_9P_AGENT_IDENTITY,
      ]);
      result = {
        context: { slot: change === 'stale' ? 200 : 202 },
        value: {
          err: null,
          logs: ['simulation passed'],
          accounts: [
            simulatedAccount(
              OWNER_BALANCE - Number(GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS),
              change === 'owner'
                ? String(MPL_CORE_PROGRAM_ID)
                : '11111111111111111111111111111111',
            ),
            simulatedAccount(
              change === 'rent' ? CORE_RENT + 1 : CORE_RENT,
              String(MPL_CORE_PROGRAM_ID),
            ),
            simulatedAccount(
              IDENTITY_RENT,
              String(MPL_AGENT_IDENTITY_PROGRAM_ID),
            ),
          ],
          unitsConsumed: 100_000,
        },
      };
    } else {
      throw new Error(`Unexpected Goal 10K RPC method: ${request.method}`);
    }
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  });
}

describe('Goal 10K keyless Mainnet birth write review', () => {
  it('builds one bounded two-instruction transaction with two zero signatures', () => {
    const unsigned = buildUnsignedMainnetBirth(BLOCKHASH);
    expect(unsigned).toMatchObject({
      instructionCount: 2,
      signatureCount: 2,
      signaturesAllZero: true,
      requiredSigners: [GOAL_9P_OWNER, GOAL_9P_CORE_ASSET],
      programs: [
        String(MPL_CORE_PROGRAM_ID),
        String(MPL_AGENT_IDENTITY_PROGRAM_ID),
      ],
    });
    expect(unsigned.messageSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(unsigned.transactionByteLength).toBe(GOAL_10K_TRANSACTION_BYTE_LENGTH);
  });

  it('quotes and simulates the exact unsigned transaction without a key or write', async () => {
    const fetchMock = mockRpc();
    await expect(
      reviewMainnetBirthWrite(config, preflight(), fetchMock),
    ).resolves.toMatchObject({
      network: 'mainnet-beta',
      rpcOrigin: config.rpcOrigin,
      blockhashContextSlot: 200,
      simulationSlot: 202,
      quotedFeeLamports: GOAL_10K_MAX_FEE_LAMPORTS,
      coreAssetRentLamports: BigInt(CORE_RENT),
      agentIdentityRentLamports: BigInt(IDENTITY_RENT),
      totalBirthRentLamports: GOAL_10K_TOTAL_BIRTH_RENT_LAMPORTS,
      simulatedOwnerDebitLamports: GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS,
      simulationPostBalanceIncludesFee: true,
      simulationPassed: true,
      keyLoaded: false,
      messageSigned: false,
      transactionSubmitted: false,
      actionTimeConfirmationRequired: true,
      requiredExactConfirmation: GOAL_10K_CONFIRMATION,
      verdict: 'STOP_READY_FOR_EXACT_BIRTH_CONFIRMATION',
    });
    expect(
      vi.mocked(fetchMock).mock.calls.map(([, init]) =>
        (JSON.parse(String(init?.body)) as { method: string }).method,
      ),
    ).toEqual([
      'getGenesisHash',
      'getLatestBlockhash',
      'getFeeForMessage',
      'simulateTransaction',
    ]);
  });

  it.each(['fee', 'owner', 'rent', 'stale'] as const)(
    'fails closed on %s drift',
    async (change) => {
      await expect(
        reviewMainnetBirthWrite(config, preflight(), mockRpc(change)),
      ).rejects.toThrow(MainnetBirthWriteReviewError);
    },
  );

  it('contains no key load, signing, or transaction submission path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal10k/mainnet-birth-write-review.ts', 'utf8'),
        readFile('src/cli/review-mainnet-birth-write.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /generateSigner|keypairIdentity|loadOrCreate|buildAndSign|signTransaction|sendTransaction|sendAndConfirm/i,
    );
    expect(sources).not.toMatch(/console\.(?:info|log)\([^\n]*(?:messageBase64|transactionBase64)/i);
  });

  it('publishes only public review evidence and no reusable transaction bytes', async () => {
    const raw = await readFile(
      'artifacts/wallet-child-001.goal10k.mainnet-birth-write-review.json',
      'utf8',
    );
    expect(JSON.parse(raw)).toMatchObject({
      status: 'KEYLESS_MAINNET_BIRTH_WRITE_REVIEW_PASSED',
      birth: {
        atomicTransactionCount: 1,
        instructionCount: 2,
        coreAsset: GOAL_9P_CORE_ASSET,
        agentIdentity: GOAL_9P_AGENT_IDENTITY,
        collection: null,
      },
      caps: {
        feeLamports: GOAL_10K_MAX_FEE_LAMPORTS.toString(),
        totalBirthDebitLamports:
          GOAL_10K_TOTAL_BIRTH_DEBIT_LAMPORTS.toString(),
      },
      actionTimeConfirmation: {
        received: false,
        requiredExactPhrase: GOAL_10K_CONFIRMATION,
      },
      verdict: 'STOP_READY_FOR_EXACT_BIRTH_CONFIRMATION',
    });
    expect(raw).not.toMatch(
      /messageBase64|transactionBase64|serializedMessage|secretKey|privateKey|mnemonic|api[_-]?key|rpcUrl/i,
    );
  });
});
