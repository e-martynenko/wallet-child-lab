import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { publicKey } from '@metaplex-foundation/umi';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readGoal4Artifact,
  type Goal4Artifact,
  writeGoal4Artifact,
} from '../src/goal4/artifact.js';
import {
  assertGoal4Confirmation,
  GOAL_4_CONFIRMATION,
  Goal4FundingError,
} from '../src/goal4/fund.js';
import {
  assertGoal4FundingDelta,
  fetchTokenAccountsByOwner,
  Goal4WalletError,
  SPL_TOKEN_PROGRAM_ID,
} from '../src/goal4/wallet.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Goal 4 write gate', () => {
  it('accepts only the exact Goal 4 confirmation', () => {
    expect(() => assertGoal4Confirmation([GOAL_4_CONFIRMATION])).not.toThrow();
    expect(() => assertGoal4Confirmation([])).toThrow(Goal4FundingError);
    expect(() =>
      assertGoal4Confirmation([GOAL_4_CONFIRMATION, '--extra']),
    ).toThrow(Goal4FundingError);
  });
});

describe('Goal 4 balance reconciliation', () => {
  it('requires the exact expected Asset Signer increase', () => {
    expect(() => assertGoal4FundingDelta(0n, 10_000_000n, 10_000_000n)).not.toThrow();
    expect(() => assertGoal4FundingDelta(0n, 9_999_999n, 10_000_000n)).toThrow(
      Goal4WalletError,
    );
  });
});

describe('SPL token-account read', () => {
  it('parses public token-account summaries and sends the canonical filter', async () => {
    const fetchRpc = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            value: [
              {
                pubkey: 'token-account',
                account: {
                  data: {
                    parsed: {
                      info: {
                        mint: 'test-mint',
                        tokenAmount: { amount: '42', decimals: 6 },
                      },
                    },
                  },
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      fetchTokenAccountsByOwner(
        'https://example.test',
        publicKey('11111111111111111111111111111111'),
        publicKey(SPL_TOKEN_PROGRAM_ID),
        'spl-token',
        fetchRpc,
      ),
    ).resolves.toEqual([
      {
        address: 'token-account',
        mint: 'test-mint',
        amount: '42',
        decimals: 6,
        program: 'spl-token',
      },
    ]);

    const request = JSON.parse(String(fetchRpc.mock.calls[0]?.[1]?.body));
    expect(request.method).toBe('getTokenAccountsByOwner');
    expect(request.params[1].programId).toBe(SPL_TOKEN_PROGRAM_ID);
    expect(request.params[2].commitment).toBe('finalized');
  });

  it('fails closed on a token-account RPC error', async () => {
    const fetchRpc = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: 429, message: 'rate limited' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      fetchTokenAccountsByOwner(
        'https://example.test',
        publicKey('11111111111111111111111111111111'),
        publicKey(SPL_TOKEN_PROGRAM_ID),
        'spl-token',
        fetchRpc,
      ),
    ).rejects.toThrow('RPC 429');
  });
});

describe('public Goal 4 artifact', () => {
  it('round-trips the public funding record', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal4-'));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, 'goal4.json');
    const artifact: Goal4Artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: 4,
      network: 'devnet',
      status: 'in-progress',
      startedAt: '2026-08-24T00:00:00.000Z',
      rpcOrigin: 'https://api.devnet.solana.com',
      addresses: {
        owner: 'owner',
        collection: 'collection',
        asset: 'asset',
        agentIdentity: 'identity',
        assetSigner: 'asset-signer',
      },
      funding: {
        amountLamports: '10000000',
        ownerBeforeLamports: '1000000000',
        beforeLamports: '0',
      },
    };

    await writeGoal4Artifact(artifact, artifactPath);
    await expect(readGoal4Artifact(artifactPath)).resolves.toEqual(artifact);
  });
});
