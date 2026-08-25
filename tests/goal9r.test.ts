import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../src/chain/network.js';
import {
  buildUnsignedInternalMessages,
  GOAL_9R_EXPECTED_FEES,
  GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS,
  InternalMessageFeeError,
  quoteUnsignedInternalMessageFees,
} from '../src/goal9r/internal-message-fees.js';

const BLOCKHASH = '11111111111111111111111111111111';
const config = {
  rpcUrl: 'https://mainnet.example.test/private?credential=hidden',
  rpcOrigin: 'https://mainnet.example.test',
};
const expectedDigests = [
  'b4430316072d43a5c18b8c2f8f8f315d1b4cf38d8e366b4485bc2390127d1235',
  '220f080147367cc786f6cf6af7c9e3b73688479977460695187918cbf2dfac30',
  'e0cc243aaad6afe31abb27d78f91baa3094fe19c7f5c0a564b7f40b4d3b3eb0b',
  'd338f953ca57a596289f9bd5b8543c8047b626fa5d60db1820b4605c37b3015a',
  'd96e945c59bcacb03926e8ed31119c467ff37bde1c1e8a942ea3c6eb21093603',
  '7759e2197d9288e93ca5c619b07bad7e3ce47af9e2481d8be417bb149bc319b8',
] as const;

function mockRpc(options?: Readonly<{ wrongFeeIndex?: number; stale?: boolean }>) {
  return vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
    };
    let payload: unknown;
    if (body.method === 'getGenesisHash') {
      payload = { jsonrpc: '2.0', id: 1, result: SOLANA_MAINNET_BETA_GENESIS_HASH };
    } else if (body.method === 'getLatestBlockhash') {
      payload = {
        jsonrpc: '2.0',
        id: 2,
        result: {
          context: { slot: 441_650_000 },
          value: { blockhash: BLOCKHASH, lastValidBlockHeight: 419_700_000 },
        },
      };
    } else {
      const messageIndex = body.id - 3;
      const message = buildUnsignedInternalMessages(BLOCKHASH)[messageIndex]!;
      payload = {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          context: { slot: options?.stale ? 441_649_999 : 441_650_001 },
          value:
            options?.wrongFeeIndex === messageIndex
              ? Number(message.expectedFeeLamports + 1n)
              : Number(message.expectedFeeLamports),
        },
      };
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('Goal 9R URI-independent unsigned Mainnet message fees', () => {
  it('compiles the exact six final-address legacy messages', () => {
    const messages = buildUnsignedInternalMessages(BLOCKHASH);
    expect(messages.map((message) => message.name)).toEqual([
      'ATA_SETUP',
      'REGISTER_EXECUTIVE',
      'DELEGATE_EXECUTION',
      'ACTION_0_1_USDC',
      'REVOKE_EXECUTION',
      'RESCUE_REMAINING_0_9_USDC',
    ]);
    expect(messages.map((message) => message.requiredSignatures)).toEqual([
      1, 2, 1, 2, 1, 1,
    ]);
    expect(messages.map((message) => message.messageSha256)).toEqual(
      expectedDigests,
    );
    expect(messages[0]?.transaction.message.instructions).toHaveLength(2);
    expect(
      messages.slice(1).every(
        (message) => message.transaction.message.instructions.length === 1,
      ),
    ).toBe(true);
  });

  it('quotes every exact message and closes the 40,000-lamport total', async () => {
    const fetchMock = mockRpc();
    const evidence = await quoteUnsignedInternalMessageFees(config, fetchMock);
    expect(evidence).toMatchObject({
      network: 'mainnet-beta',
      rpcOrigin: config.rpcOrigin,
      blockhashContextSlot: 441_650_000,
      lastValidBlockHeight: 419_700_000,
      totalFeeLamports: GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS,
      unsigned: true,
      keyLoaded: false,
      simulationAttempted: false,
      transactionSubmitted: false,
    });
    expect(evidence.messages.map((message) => message.quotedFeeLamports)).toEqual(
      Object.values(GOAL_9R_EXPECTED_FEES),
    );
    const calls = vi.mocked(fetchMock).mock.calls.map(([, init]) =>
      (JSON.parse(String(init?.body)) as { method: string }).method,
    );
    expect(calls).toEqual([
      'getGenesisHash',
      'getLatestBlockhash',
      'getFeeForMessage',
      'getFeeForMessage',
      'getFeeForMessage',
      'getFeeForMessage',
      'getFeeForMessage',
      'getFeeForMessage',
    ]);
  });

  it('rejects a changed fee, stale context, or wrong cluster', async () => {
    await expect(
      quoteUnsignedInternalMessageFees(config, mockRpc({ wrongFeeIndex: 3 })),
    ).rejects.toThrow(InternalMessageFeeError);
    await expect(
      quoteUnsignedInternalMessageFees(config, mockRpc({ stale: true })),
    ).rejects.toThrow(InternalMessageFeeError);
    const wrongCluster = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'wrong-cluster' }),
        { status: 200 },
      ),
    );
    await expect(
      quoteUnsignedInternalMessageFees(config, wrongCluster),
    ).rejects.toThrow(InternalMessageFeeError);
  });

  it('contains no local key loading, signing, simulation, or submission path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal9r/internal-message-fees.ts', 'utf8'),
        readFile('src/cli/quote-internal-mainnet.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /generateSigner|keypairIdentity|loadOrCreate|buildAndSign|signTransaction|simulateTransaction|sendTransaction|sendAndConfirm/i,
    );
    expect(sources).not.toMatch(/console\.(?:info|log)\([^\n]*messageBase64/i);
  });

  it('publishes only expiring digests and fee facts', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal9r.internal-message-fees.json',
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      goal: '9R',
      network: 'mainnet-beta',
      messageCount: 6,
      totalFeeLamports: GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS.toString(),
      excluded: {
        createAssetAndRegisterIdentity: 'BLOCKED_DURABLE_URI_REQUIRED',
        solRescue: 'BLOCKED_LIVE_BALANCE_REQUIRED',
      },
      checks: {
        unsigned: true,
        keyLoaded: false,
        simulationAttempted: false,
        transactionSubmitted: false,
      },
      verdict: 'NO_GO',
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /messageBase64|serializedMessage|secret|privateKey|seed|mnemonic|api[_-]?key/i,
    );
  });
});
