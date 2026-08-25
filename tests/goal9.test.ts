import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { afterEach, describe, expect, it } from 'vitest';

import {
  readGoal9ReadinessArtifact,
  writeGoal9ReadinessArtifact,
} from '../src/mainnet/artifact.js';
import {
  BPF_UPGRADEABLE_LOADER_ID,
  GOAL_9_MAX_ACQUISITION_COST_USD_CENTS,
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
  MainnetReadinessError,
  MPL_AGENT_TOOLS_PROGRAM_ID,
  parseMainnetReadinessConfig,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
  verifyMainnetReadiness,
} from '../src/mainnet/readiness.js';
import {
  MainnetReadinessWalletError,
  prepareMainnetReadinessWallets,
} from '../src/mainnet/wallets.js';

const MAINNET_GENESIS =
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const DEVNET_GENESIS =
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const DEVNET_OWNER = '7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c';
const READINESS_OWNER = '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';
const READINESS_EXECUTIVE =
  'EJQcuD9FtJ33c2wA7GM6HzvmJJJbPsYnmH5ZjTDdhbjF';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function genesisPayload(result = MAINNET_GENESIS): unknown {
  return { jsonrpc: '2.0', id: 1, result };
}

function mintPayload(
  overrides: Readonly<{
    decimals?: number;
    initialized?: boolean;
    owner?: string;
  }> = {},
): unknown {
  return {
    jsonrpc: '2.0',
    id: 2,
    result: {
      value: {
        executable: false,
        owner: overrides.owner ?? SOLANA_LEGACY_TOKEN_PROGRAM_ID,
        data: {
          program: 'spl-token',
          parsed: {
            type: 'mint',
            info: {
              decimals: overrides.decimals ?? 6,
              isInitialized: overrides.initialized ?? true,
              supply: '8154169223220682',
            },
          },
        },
      },
    },
  };
}

function programPayload(executable = true): unknown {
  return {
    jsonrpc: '2.0',
    id: 3,
    result: {
      value: {
        executable,
        owner: BPF_UPGRADEABLE_LOADER_ID,
      },
    },
  };
}

function mockRpc(
  payloads: readonly unknown[],
  calls: Array<Record<string, unknown>> = [],
): typeof fetch {
  let index = 0;
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push(body);
    const payload = payloads[index];
    index += 1;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

describe('Goal 9 Mainnet read-only verification', () => {
  it('verifies cluster, authoritative USDC mint, and Agent Tools program', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const verified = await verifyMainnetReadiness(
      {
        rpcUrl: 'https://api.mainnet.solana.com/',
        rpcOrigin: 'https://api.mainnet.solana.com',
      },
      mockRpc(
        [genesisPayload(), mintPayload(), programPayload()],
        calls,
      ),
    );

    expect(verified).toMatchObject({
      network: 'mainnet-beta',
      genesisHash: MAINNET_GENESIS,
      usdc: {
        mint: SOLANA_MAINNET_USDC_MINT,
        owner: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
        decimals: 6,
        initialized: true,
      },
      agentTools: {
        programId: MPL_AGENT_TOOLS_PROGRAM_ID,
        executable: true,
      },
    });
    expect(calls.map((call) => call['method'])).toEqual([
      'getGenesisHash',
      'getAccountInfo',
      'getAccountInfo',
    ]);
    expect(JSON.stringify(calls)).not.toMatch(
      /sendTransaction|simulateTransaction|signature|secret|keypair/i,
    );
  });

  it('rejects Devnet or another cluster', async () => {
    await expect(
      verifyMainnetReadiness(
        {
          rpcUrl: 'https://api.mainnet.solana.com/',
          rpcOrigin: 'https://api.mainnet.solana.com',
        },
        mockRpc([genesisPayload(DEVNET_GENESIS)]),
      ),
    ).rejects.toThrow(MainnetReadinessError);
  });

  it.each([
    mintPayload({ decimals: 9 }),
    mintPayload({ initialized: false }),
    mintPayload({ owner: MPL_AGENT_TOOLS_PROGRAM_ID }),
  ])('rejects a wrong USDC mint account shape', async (mint) => {
    await expect(
      verifyMainnetReadiness(
        {
          rpcUrl: 'https://api.mainnet.solana.com/',
          rpcOrigin: 'https://api.mainnet.solana.com',
        },
        mockRpc([genesisPayload(), mint]),
      ),
    ).rejects.toThrow(MainnetReadinessError);
  });

  it('rejects a non-executable Agent Tools program', async () => {
    await expect(
      verifyMainnetReadiness(
        {
          rpcUrl: 'https://api.mainnet.solana.com/',
          rpcOrigin: 'https://api.mainnet.solana.com',
        },
        mockRpc([genesisPayload(), mintPayload(), programPayload(false)]),
      ),
    ).rejects.toThrow(MainnetReadinessError);
  });

  it('requires HTTPS and redacts RPC credentials from reported origin', () => {
    expect(() =>
      parseMainnetReadinessConfig({
        WALLET_CHILD_MAINNET_READ_RPC_URL: 'http://api.mainnet.solana.com',
      }),
    ).toThrow(MainnetReadinessError);
    expect(
      parseMainnetReadinessConfig({
        WALLET_CHILD_MAINNET_READ_RPC_URL:
          'https://user:pass@example.com/private?api-key=hidden',
      }).rpcOrigin,
    ).toBe('https://example.com');
  });
});

describe('Goal 9 isolated unfunded wallets', () => {
  it('creates distinct mode-0600 wallets and reloads them idempotently', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9-'));
    temporaryDirectories.push(directory);
    const ownerPath = join(directory, 'owner.json');
    const executivePath = join(directory, 'executive.json');
    const umi = createUmi('http://127.0.0.1:8899');

    const first = await prepareMainnetReadinessWallets(
      umi,
      [DEVNET_OWNER],
      ownerPath,
      executivePath,
    );
    const second = await prepareMainnetReadinessWallets(
      umi,
      [DEVNET_OWNER],
      ownerPath,
      executivePath,
    );

    expect(first.owner.created).toBe(true);
    expect(first.executive.created).toBe(true);
    expect(second.owner.created).toBe(false);
    expect(second.executive.created).toBe(false);
    expect(second.owner.publicKey).toBe(first.owner.publicKey);
    expect(second.executive.publicKey).toBe(first.executive.publicKey);
    expect(first.owner.publicKey).not.toBe(first.executive.publicKey);
    expect((await stat(ownerPath)).mode & 0o777).toBe(0o600);
    expect((await stat(executivePath)).mode & 0o777).toBe(0o600);
  });

  it('rejects a wallet that appears in the forbidden Devnet set', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9-'));
    temporaryDirectories.push(directory);
    const ownerPath = join(directory, 'owner.json');
    const executivePath = join(directory, 'executive.json');
    const umi = createUmi('http://127.0.0.1:8899');
    const wallets = await prepareMainnetReadinessWallets(
      umi,
      [],
      ownerPath,
      executivePath,
    );

    await expect(
      prepareMainnetReadinessWallets(
        umi,
        [wallets.owner.publicKey],
        ownerPath,
        executivePath,
      ),
    ).rejects.toThrow(MainnetReadinessWalletError);
  });

  it('writes only public, explicitly unfunded readiness evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9-'));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, 'goal9.json');
    const artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: 9,
      network: 'mainnet-beta',
      status: 'unfunded',
      createdAt: '2026-08-25T00:00:00.000Z',
      addresses: {
        owner: READINESS_OWNER,
        executive: READINESS_EXECUTIVE,
      },
      checks: {
        distinctFromEachOther: true,
        distinctFromDevnet: true,
        funded: false,
      },
    } as const;

    await writeGoal9ReadinessArtifact(artifact, artifactPath);
    expect(await readGoal9ReadinessArtifact(artifactPath)).toEqual(artifact);
    expect(await readFile(artifactPath, 'utf8')).not.toMatch(
      /secret|seed|private|keypair|\[\s*\d+(?:\s*,\s*\d+){63}\s*\]/i,
    );
  });
});

describe('Goal 9 hard boundary and source isolation', () => {
  it('fixes both asset caps and total acquisition-cost cap', () => {
    expect(GOAL_9_MAX_USDC_BASE_UNITS).toBe(1_000_000n);
    expect(GOAL_9_MAX_SOL_RESERVE_LAMPORTS).toBe(20_000_000n);
    expect(GOAL_9_MAX_ACQUISITION_COST_USD_CENTS).toBe(1_000n);
  });

  it('keeps transaction and signer capabilities out of the read-only verifier', async () => {
    const sources = (
      await Promise.all([
        readFile('src/mainnet/readiness.ts', 'utf8'),
        readFile('src/cli/check-mainnet-readiness.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /sendTransaction|signTransaction|sendAndConfirm|KeypairSigner|TransactionBuilder|buildBoundedTransfer|buildUsdcTransfer|\.use\(signerIdentity/i,
    );
  });
});
