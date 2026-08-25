import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../src/chain/network.js';
import {
  BootstrapFeeError,
  buildUnsignedBootstrapMessage,
  GOAL_9M_BOOTSTRAP_FEE_LAMPORTS,
  GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS,
  GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS,
  parseBootstrapFeeConfig,
  quoteUnsignedBootstrapFee,
} from '../src/goal9m/bootstrap-fee.js';
import {
  GOAL_9L_FUNDING_SOURCE,
  GOAL_9L_WALLET_CHILD_OWNER,
} from '../src/goal9l/funding-route.js';
import { GOAL_9_MAX_SOL_RESERVE_LAMPORTS } from '../src/mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../src/policy/policy.js';

const BLOCKHASH = '11111111111111111111111111111111';
const config = {
  rpcUrl: 'https://mainnet.example.test/private?credential=hidden',
  rpcOrigin: 'https://mainnet.example.test',
};

function genesisPayload(result = SOLANA_MAINNET_BETA_GENESIS_HASH): unknown {
  return { jsonrpc: '2.0', id: 1, result };
}

function blockhashPayload(slot = 441_640_000): unknown {
  return {
    jsonrpc: '2.0',
    id: 2,
    result: {
      context: { slot },
      value: { blockhash: BLOCKHASH, lastValidBlockHeight: 429_000_000 },
    },
  };
}

function feePayload(value: number | null = 5_000, slot = 441_640_001): unknown {
  return {
    jsonrpc: '2.0',
    id: 3,
    result: { context: { slot }, value },
  };
}

function mockRpc(payloads: readonly unknown[]): typeof fetch {
  let index = 0;
  return vi.fn<typeof fetch>(async () => {
    const payload = payloads[index];
    index += 1;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('Goal 9M unsigned Mainnet bootstrap fee', () => {
  it('requires a dedicated HTTPS endpoint and reports only its origin', () => {
    expect(
      parseBootstrapFeeConfig({
        WALLET_CHILD_MAINNET_RPC_URL:
          'https://user:pass@mainnet.example.test/private?credential=hidden',
      }),
    ).toEqual({
      rpcUrl:
        'https://user:pass@mainnet.example.test/private?credential=hidden',
      rpcOrigin: 'https://mainnet.example.test',
    });
    expect(
      parseBootstrapFeeConfig({
        WALLET_CHILD_MAINNET_RPC_URL:
          'https://mainnet.example.test//?credential=hidden',
      }),
    ).toEqual({
      rpcUrl: 'https://mainnet.example.test/?credential=hidden',
      rpcOrigin: 'https://mainnet.example.test',
    });
    for (const rpcUrl of [
      'http://mainnet.example.test',
      'https://api.mainnet-beta.solana.com',
      'https://api.mainnet.solana.com',
    ]) {
      expect(() =>
        parseBootstrapFeeConfig({ WALLET_CHILD_MAINNET_RPC_URL: rpcUrl }),
      ).toThrow(BootstrapFeeError);
    }
  });

  it('builds one exact unsigned legacy System transfer message', () => {
    const built = buildUnsignedBootstrapMessage(BLOCKHASH);
    expect(built).toMatchObject({
      source: GOAL_9L_FUNDING_SOURCE,
      destination: GOAL_9L_WALLET_CHILD_OWNER,
      transferLamports: 19_990_000n,
      messageSha256:
        '736ff83ad71a2fa0fc5f38db2b42db31edc759000048e933394470c62471b5e8',
    });
    expect(built.transaction.message).toMatchObject({
      version: 'legacy',
      header: {
        numRequiredSignatures: 1,
        numReadonlySignedAccounts: 0,
        numReadonlyUnsignedAccounts: 1,
      },
      accounts: [
        GOAL_9L_FUNDING_SOURCE,
        GOAL_9L_WALLET_CHILD_OWNER,
        SYSTEM_PROGRAM_ID,
      ],
      blockhash: BLOCKHASH,
    });
    expect(built.transaction.message.instructions).toHaveLength(1);
    expect(built.messageBase64).toBe(
      'AQABA293azNJvsVK0uvfP1EjyPGdY2l61ySay4dZsZN9WKWVT2+a+wa/jUPpcyNLqhj45SkSb0Qks+hLgOh4tFT91SIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQICAAEMAgAAAPAFMQEAAAAA',
    );
  });

  it('quotes the exact message at a non-stale finalized context', async () => {
    const fetchMock = mockRpc([
      genesisPayload(),
      blockhashPayload(),
      feePayload(),
    ]);
    const evidence = await quoteUnsignedBootstrapFee(config, fetchMock);
    expect(evidence).toMatchObject({
      network: 'mainnet-beta',
      rpcOrigin: config.rpcOrigin,
      blockhashContextSlot: 441_640_000,
      feeContextSlot: 441_640_001,
      source: GOAL_9L_FUNDING_SOURCE,
      destination: GOAL_9L_WALLET_CHILD_OWNER,
      transferLamports: GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS,
      quotedFeeLamports: GOAL_9M_BOOTSTRAP_FEE_LAMPORTS,
      futureUsdcFundingFeeReserveLamports:
        GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS,
      totalExperimentSolBoundaryLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
      unsigned: true,
      keyLoaded: false,
      simulationAttempted: false,
      transactionSubmitted: false,
    });
    const calls = vi.mocked(fetchMock).mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    ) as Array<Record<string, unknown>>;
    expect(calls.map((call) => call['method'])).toEqual([
      'getGenesisHash',
      'getLatestBlockhash',
      'getFeeForMessage',
    ]);
    expect(calls[2]?.['params']).toEqual([
      expect.any(String),
      { commitment: 'finalized', minContextSlot: 441_640_000 },
    ]);
  });

  it('rejects another cluster, a null/changed fee, or stale fee context', async () => {
    for (const payloads of [
      [genesisPayload('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')],
      [genesisPayload(), blockhashPayload(), feePayload(null)],
      [genesisPayload(), blockhashPayload(), feePayload(5_001)],
      [genesisPayload(), blockhashPayload(), feePayload(5_000, 441_639_999)],
    ]) {
      await expect(
        quoteUnsignedBootstrapFee(config, mockRpc(payloads)),
      ).rejects.toThrow(BootstrapFeeError);
    }
  });

  it('reserves both external funding fees inside the 0.02 SOL cap', () => {
    expect(
      GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS +
        GOAL_9M_BOOTSTRAP_FEE_LAMPORTS +
        GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS,
    ).toBe(GOAL_9_MAX_SOL_RESERVE_LAMPORTS);
  });

  it('has no private-key generation, signing, simulation, or send path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal9m/bootstrap-fee.ts', 'utf8'),
        readFile('src/cli/quote-bootstrap-mainnet.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /generateSigner|keypairIdentity|buildAndSign|signTransaction|simulateTransaction|sendTransaction|sendAndConfirm/i,
    );
    expect(sources).not.toMatch(/console\.(?:info|log)\([^\n]*messageBase64/i);
  });

  it('publishes the expiring quote digest without message bytes or secrets', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal9m.bootstrap-fee.json',
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      goal: '9M',
      network: 'mainnet-beta',
      message: {
        source: GOAL_9L_FUNDING_SOURCE,
        destination: GOAL_9L_WALLET_CHILD_OWNER,
        transferLamports: GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS.toString(),
        serializedBytesPublished: false,
        reusableForSigning: false,
      },
      allocation: {
        quotedBootstrapFeeLamports: GOAL_9M_BOOTSTRAP_FEE_LAMPORTS.toString(),
        futureUsdcFundingFeeReserveLamports:
          GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS.toString(),
        totalExperimentSolBoundaryLamports:
          GOAL_9_MAX_SOL_RESERVE_LAMPORTS.toString(),
      },
      checks: {
        unsigned: true,
        keyLoaded: false,
        simulationAttempted: false,
        transactionSubmitted: false,
      },
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /secret|privateKey|seed|mnemonic|api[_-]?key/i,
    );
  });
});
