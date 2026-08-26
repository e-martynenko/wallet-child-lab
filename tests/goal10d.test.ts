import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../src/chain/network.js';
import {
  buildUnsignedIrysFundingMessage,
  GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
  GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS,
  MetadataPublicationPlanError,
  prepareMetadataPublicationPlan,
} from '../src/goal10d/metadata-publication-plan.js';
import { GOAL_9P_OWNER } from '../src/goal9p/final-contract.js';
import { SYSTEM_PROGRAM_ID } from '../src/policy/policy.js';

const BLOCKHASH = '11111111111111111111111111111111';
const config = {
  rpcUrl: 'https://mainnet.example.test/private?credential=hidden',
  rpcOrigin: 'https://mainnet.example.test',
};

function rpc(id: number, result: unknown): unknown {
  return { jsonrpc: '2.0', id, result };
}

function mockReads(options: Readonly<{
  ownerBalance?: number;
  irysBalance?: string;
  fundingAddress?: string;
  fee?: number | null;
}> = {}): typeof fetch {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.includes('/price/solana/351')) return new Response('3208');
    if (url.endsWith('/info')) {
      return Response.json({
        version: '0.2.0',
        addresses: {
          solana:
            options.fundingAddress ?? GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
        },
      });
    }
    if (url.includes('/account/balance/solana')) {
      return Response.json({ balance: options.irysBalance ?? '0' });
    }
    const body = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
    };
    const results: Record<number, unknown> = {
      1: SOLANA_MAINNET_BETA_GENESIS_HASH,
      2: 441_811_496,
      3: {
        context: { slot: 441_811_497 },
        value: options.ownerBalance ?? Number(GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS),
      },
      4: 1_614_720,
      5: 1_169_280,
      6: 2_039_280,
      7: {
        context: { slot: 441_811_498 },
        value: { blockhash: BLOCKHASH, lastValidBlockHeight: 429_100_000 },
      },
      8: {
        context: { slot: 441_811_499 },
        value: options.fee === undefined ? 5_000 : options.fee,
      },
    };
    expect(body.method).toBeTruthy();
    return Response.json(rpc(body.id, results[body.id]));
  });
}

describe('Goal 10D metadata publication plan', () => {
  it('builds one exact unsigned legacy System transfer', () => {
    const built = buildUnsignedIrysFundingMessage(BLOCKHASH, 3_208n);
    expect(built).toMatchObject({
      source: GOAL_9P_OWNER,
      destination: GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
      transferLamports: 3_208n,
      messageSha256:
        'e59429dfb5293793ea1e6a87f7899d6c445bf0870459a65e41b76845babc26ec',
    });
    expect(built.transaction.message).toMatchObject({
      version: 'legacy',
      header: {
        numRequiredSignatures: 1,
        numReadonlySignedAccounts: 0,
        numReadonlyUnsignedAccounts: 1,
      },
      accounts: [GOAL_9P_OWNER, GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS, SYSTEM_PROGRAM_ID],
      blockhash: BLOCKHASH,
    });
    expect(built.transaction.message.instructions).toHaveLength(1);
  });

  it('refreshes only public reads and closes the known budget slice', async () => {
    const fetchMock = mockReads();
    const plan = await prepareMetadataPublicationPlan(config, fetchMock);
    expect(plan).toMatchObject({
      network: 'mainnet-beta',
      rpcOrigin: config.rpcOrigin,
      finalizedSlot: 441_811_497,
      ownerBalanceLamports: 19_985_000n,
      metadataSha256:
        '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
      metadataByteLength: 351,
      irysExistingBalanceLamports: 0n,
      storageQuoteLamports: 3_208n,
      fundingTransferLamports: 3_208n,
      fundingFeeLamports: 5_000n,
      fixedRentLamports: 8_477_280n,
      internalFeeLamports: 40_000n,
      metadataPublicationLamports: 8_208n,
      knownOwnerCostsLamports: 8_525_488n,
      ownerAfterKnownCostsLamports: 11_459_512n,
      actualAcquisitionAllocationLamports: 19_995_001n,
      unallocatedAcquisitionBoundaryLamports: 4_999n,
      unsigned: true,
      keyLoaded: false,
      fundingAttempted: false,
      uploadAttempted: false,
      transactionSubmitted: false,
      verdict: 'STOP_READY_FOR_GOAL_10E_IMPLEMENTATION_REVIEW',
    });
    const rpcMethods = vi
      .mocked(fetchMock)
      .mock.calls.filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => (JSON.parse(String(init?.body)) as { method: string }).method);
    expect(rpcMethods).toEqual([
      'getGenesisHash',
      'getSlot',
      'getBalance',
      'getMinimumBalanceForRentExemption',
      'getMinimumBalanceForRentExemption',
      'getMinimumBalanceForRentExemption',
      'getLatestBlockhash',
      'getFeeForMessage',
    ]);
  });

  it('fails closed on Irys state, owner drift, or fee drift', async () => {
    for (const fetchMock of [
      mockReads({ irysBalance: '1' }),
      mockReads({ fundingAddress: GOAL_9P_OWNER }),
      mockReads({ ownerBalance: 19_984_999 }),
      mockReads({ fee: null }),
      mockReads({ fee: 5_001 }),
    ]) {
      await expect(
        prepareMetadataPublicationPlan(config, fetchMock),
      ).rejects.toThrow(MetadataPublicationPlanError);
    }
  });

  it('retries only a transient minimum-context RPC lag', async () => {
    const stable = mockReads();
    let lagInjected = false;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { id: number };
        if (body.id === 8 && !lagInjected) {
          lagInjected = true;
          return Response.json({
            jsonrpc: '2.0',
            id: 8,
            error: { code: -32016, message: 'Minimum context slot not reached' },
          });
        }
      }
      return stable(input, init);
    });
    await expect(
      prepareMetadataPublicationPlan(config, fetchMock),
    ).resolves.toMatchObject({ feeContextSlot: 441_811_499 });
    expect(lagInjected).toBe(true);
  });

  it('contains no key, sign, funding, upload, simulation, or send path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal10d/metadata-publication-plan.ts', 'utf8'),
        readFile('src/cli/plan-metadata-mainnet.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /generateSigner|keypairIdentity|buildAndSign|signTransaction|simulateTransaction|sendTransaction|sendAndConfirm|\.fund\s*\(|\.upload(?:File)?\s*\(/i,
    );
    expect(sources).not.toMatch(/console\.(?:info|log)\([^\n]*messageBase64/i);
  });

  it('publishes a public STOP artifact without secrets or reusable bytes', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal10d.metadata-publication-plan.json',
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      goal: '10D',
      status: 'READ_ONLY_PLAN_COMPLETE',
      budget: {
        metadataPublicationLamports: '8208',
        knownOwnerCostsAfterPublicationLamports: '8525488',
        ownerAfterKnownCostsLamports: '11459512',
        actualAcquisitionAllocationLamports: '19995001',
        unallocatedAcquisitionBoundaryLamports: '4999',
        topUpAllowed: false,
      },
      checks: {
        keyLoaded: false,
        messageSigned: false,
        fundingAttempted: false,
        uploadAttempted: false,
        transactionSubmitted: false,
        networkWrite: false,
        fundsMoved: false,
      },
      verification: {
        testFiles: 34,
        tests: 259,
        typecheckPassed: true,
        dependencyAuditClean: false,
        unchangedModerateUuidAdvisory: true,
      },
      verdict: 'STOP_READY_FOR_GOAL_10E_IMPLEMENTATION_REVIEW',
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /secret|privateKey|seed|mnemonic|api[_-]?key|messageBase64/i,
    );
  });
});
