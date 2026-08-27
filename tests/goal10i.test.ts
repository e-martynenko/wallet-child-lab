import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  GOAL_10I_ARWEAVE_PROBE_URL,
  GOAL_10I_ARWEAVE_GRAPHQL_URL,
  GOAL_10I_ARWEAVE_INFO_URL,
  GOAL_10I_CANONICAL_URI,
  GOAL_10I_DATA_URL,
  GOAL_10I_GRAPHQL_URL,
  GOAL_10I_IRYS_ID,
  GOAL_10I_PUBLIC_KEY_URL,
  GOAL_10I_STATUS_URL,
  Goal10IVerificationError,
  verifyGoal10IIrysTransaction,
} from '../src/goal10i/irys-transaction-verification.js';
import { GOAL_9P_OWNER } from '../src/goal9p/final-contract.js';

type Goal10HReceipt = Readonly<{
  public: string;
  signature: string;
  deadlineHeight: number;
  timestamp: number;
  version: string;
}>;

function responseAt(
  body: BodyInit,
  url: string,
  init: ResponseInit = {},
): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

async function context(
  options: { driftData?: boolean; wrongOwner?: boolean; settled?: boolean } = {},
) {
  const [bytes, artifactRaw] = await Promise.all([
    readFile('metadata/wallet-child-001.mainnet-candidate.json'),
    readFile(
      'artifacts/wallet-child-001.goal10h.metadata-upload-receipt.json',
      'utf8',
    ),
  ]);
  const artifact = JSON.parse(artifactRaw) as { receipt: Goal10HReceipt };
  const calls: Array<Readonly<{ url: string; method: string }>> = [];
  const fetchImpl = (async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    calls.push(Object.freeze({ url: url.toString(), method }));
    if (url.toString() === GOAL_10I_CANONICAL_URI && method === 'GET') {
      return responseAt(
        bytes,
        `https://gateway-cache.datasprite-cdn.com/${GOAL_10I_IRYS_ID}/`,
        { headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.toString() === GOAL_10I_DATA_URL && method === 'GET') {
      return responseAt(
        options.driftData ? Buffer.from(`${bytes.toString()} `) : bytes,
        `https://data-cache.datasprite-cdn.com/${GOAL_10I_IRYS_ID}`,
        { headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.toString() === GOAL_10I_PUBLIC_KEY_URL && method === 'GET') {
      return new Response(artifact.receipt.public, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }
    if (url.toString() === GOAL_10I_GRAPHQL_URL && method === 'POST') {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: { ids: string[] };
      };
      expect(request.query).toContain('transactions');
      expect(request.query).not.toContain('mutation');
      expect(request.variables.ids).toEqual([GOAL_10I_IRYS_ID]);
      return Response.json({
        data: {
          transactions: {
            edges: [
              {
                node: {
                  id: GOAL_10I_IRYS_ID,
                  address: options.wrongOwner ? 'wrong-owner' : GOAL_9P_OWNER,
                  timestamp: artifact.receipt.timestamp,
                  token: 'solana',
                  size: '531',
                  fee: '3208',
                  tags: [{ name: 'Content-Type', value: 'application/json' }],
                  receipt: {
                    version: artifact.receipt.version,
                    signature: artifact.receipt.signature,
                    timestamp: artifact.receipt.timestamp,
                    deadlineHeight: artifact.receipt.deadlineHeight,
                  },
                },
              },
            ],
          },
        },
      });
    }
    if (url.toString() === GOAL_10I_ARWEAVE_PROBE_URL && method === 'GET') {
      if (options.settled) {
        return new Response(bytes, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      });
    }
    if (url.toString() === GOAL_10I_STATUS_URL && method === 'GET') {
      return Response.json({
        status: 'CONFIRMED',
        seededTo: options.settled
          ? ['miner-1', 'miner-2', 'miner-3', 'miner-4', 'miner-5']
          : [],
      });
    }
    if (url.toString() === GOAL_10I_ARWEAVE_GRAPHQL_URL && method === 'POST') {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: { ids: string[] };
      };
      expect(request.query).toContain('bundledIn');
      expect(request.query).not.toContain('mutation');
      expect(request.variables.ids).toEqual([GOAL_10I_IRYS_ID]);
      return Response.json({
        data: {
          transactions: {
            edges: options.settled
              ? [
                  {
                    node: {
                      id: GOAL_10I_IRYS_ID,
                      bundledIn: { id: 'bundle-id' },
                      block: { height: 900, timestamp: 1_700_000_000 },
                    },
                  },
                ]
              : [],
          },
        },
      });
    }
    if (url.toString() === GOAL_10I_ARWEAVE_INFO_URL && method === 'GET') {
      return Response.json({ height: options.settled ? 950 : 1_988_517 });
    }
    throw new Error(`Unexpected Goal 10I request: ${method} ${url}`);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('Goal 10I canonical Irys transaction verification', () => {
  it('verifies the accepted item but keeps settlement pending when it is not seeded', async () => {
    const test = await context();
    const evidence = await verifyGoal10IIrysTransaction(test.fetchImpl);
    expect(evidence).toMatchObject({
      id: GOAL_10I_IRYS_ID,
      canonicalIrysUri: GOAL_10I_CANONICAL_URI,
      metadataSha256:
        '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
      metadataByteLength: 351,
      indexer: {
        owner: GOAL_9P_OWNER,
        token: 'solana',
        dataItemSize: '531',
        indexedFeeLamports: '3208',
        contentType: 'application/json',
      },
      receipt: {
        version: '1.0.0',
        deadlineHeight: 0,
        publicKeyMatchesNode: true,
        signatureMatchesIndexer: true,
        signatureVerifiedNow: true,
      },
      uriCorrection: {
        rejectedAlias: `ar://${GOAL_10I_IRYS_ID}`,
        canonicalPattern: 'https://gateway.irys.xyz/:transactionId',
        arweaveProbeStatus: 404,
        arweaveProbeExactBytes: false,
      },
      settlement: {
        uploaderStatus: 'CONFIRMED',
        seededTo: [],
        seededMinerCount: 0,
        requiredSeededMinerCount: 5,
        bundleId: null,
        blockHeight: null,
        networkHeight: 1_988_517,
        confirmations: 0,
        requiredConfirmations: 50,
        arweaveFinalizationVerified: false,
        state: 'PENDING',
      },
      canonicalIrysTransactionVerified: true,
      ownerKeyLoaded: false,
      uploadAttempted: false,
      solanaTransactionSubmitted: false,
      onChainBindingAttempted: false,
    });
    expect(evidence.retrievals).toHaveLength(2);
    expect(new Set(evidence.retrievals.map((item) => item.finalOrigin)).size).toBe(
      2,
    );
    expect(test.calls).toHaveLength(8);
    expect(test.calls.filter((call) => call.method === 'POST')).toEqual([
      { url: GOAL_10I_GRAPHQL_URL, method: 'POST' },
      { url: GOAL_10I_ARWEAVE_GRAPHQL_URL, method: 'POST' },
    ]);
  });

  it('settles only with exact Arweave bytes, a bundle, 50 blocks, and five miners', async () => {
    const test = await context({ settled: true });
    const evidence = await verifyGoal10IIrysTransaction(test.fetchImpl);
    expect(evidence.settlement).toMatchObject({
      uploaderStatus: 'CONFIRMED',
      seededMinerCount: 5,
      requiredSeededMinerCount: 5,
      bundleId: 'bundle-id',
      blockHeight: 900,
      networkHeight: 950,
      confirmations: 50,
      requiredConfirmations: 50,
      arweaveFinalizationVerified: true,
      state: 'SETTLED',
    });
    expect(evidence.uriCorrection).toMatchObject({
      arweaveProbeStatus: 200,
      arweaveProbeExactBytes: true,
    });
  });

  it('rejects byte drift from either Irys retrieval route', async () => {
    const test = await context({ driftData: true });
    await expect(verifyGoal10IIrysTransaction(test.fetchImpl)).rejects.toThrow(
      Goal10IVerificationError,
    );
  });

  it('rejects an indexed owner mismatch', async () => {
    const test = await context({ wrongOwner: true });
    await expect(verifyGoal10IIrysTransaction(test.fetchImpl)).rejects.toThrow(
      /owner, token, or content-type/i,
    );
  });

  it('records the corrected HTTPS Irys URI in both public manifests', async () => {
    const [integrity, receipt] = await Promise.all([
      readFile(
        'metadata/wallet-child-001.mainnet-candidate.integrity.json',
        'utf8',
      ),
      readFile(
        'artifacts/wallet-child-001.goal10h.metadata-upload-receipt.json',
        'utf8',
      ),
    ]);
    expect(JSON.parse(integrity)).toMatchObject({
      durableUri: GOAL_10I_CANONICAL_URI,
    });
    expect(JSON.parse(receipt)).toMatchObject({
      upload: { durableUri: GOAL_10I_CANONICAL_URI },
    });
    expect(`${integrity}\n${receipt}`).not.toContain(`ar://${GOAL_10I_IRYS_ID}`);
  });

  it('contains no wallet, funding, upload call, signing, or chain-write path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal10i/irys-transaction-verification.ts', 'utf8'),
        readFile('src/cli/verify-irys-transaction.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /withWallet|loadOwner|privateKey|secretKey|Keypair|\.upload\s*\(|\.fund\s*\(|signTransaction|sendTransaction|sendAndConfirm|SystemProgram/i,
    );
  });
});
