import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../src/chain/network.js';
import {
  GOAL_9L_FUNDING_SOURCE,
  GOAL_9L_FUNDING_SOURCE_USDC_ATA,
} from '../src/goal9l/funding-route.js';
import {
  GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS,
} from '../src/goal9m/bootstrap-fee.js';
import {
  buildUnsignedUsdcFundingMessage,
  GOAL_9O_ASSET_SIGNER,
  GOAL_9O_ASSET_SIGNER_USDC_ATA,
  GOAL_9O_USDC_FUNDING_FEE_LAMPORTS,
  quoteUnsignedUsdcFundingFee,
  UsdcFundingFeeError,
} from '../src/goal9o/usdc-funding-fee.js';
import {
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
} from '../src/mainnet/readiness.js';

const BLOCKHASH = '11111111111111111111111111111111';
const config = {
  rpcUrl: 'https://mainnet.example.test/private?credential=hidden',
  rpcOrigin: 'https://mainnet.example.test',
};

function genesisPayload(result = SOLANA_MAINNET_BETA_GENESIS_HASH): unknown {
  return { jsonrpc: '2.0', id: 1, result };
}

function blockhashPayload(slot = 441_650_000): unknown {
  return {
    jsonrpc: '2.0',
    id: 2,
    result: {
      context: { slot },
      value: { blockhash: BLOCKHASH, lastValidBlockHeight: 429_010_000 },
    },
  };
}

function feePayload(value: number | null = 5_000, slot = 441_650_001): unknown {
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

describe('Goal 9O unsigned Mainnet USDC funding fee', () => {
  it('builds one exact unsigned legacy TransferChecked message', () => {
    const built = buildUnsignedUsdcFundingMessage(BLOCKHASH);
    expect(built).toMatchObject({
      sourceOwner: GOAL_9L_FUNDING_SOURCE,
      sourceTokenAccount: GOAL_9L_FUNDING_SOURCE_USDC_ATA,
      destinationOwner: GOAL_9O_ASSET_SIGNER,
      destinationTokenAccount: GOAL_9O_ASSET_SIGNER_USDC_ATA,
      mint: SOLANA_MAINNET_USDC_MINT,
      amountBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
      messageSha256:
        '6453c5a6a63eb8fa1cb0d491b2ba80d0b9f8da07ec731eb35d461013c2d972d8',
    });
    expect(built.transaction.message).toMatchObject({
      version: 'legacy',
      header: {
        numRequiredSignatures: 1,
        numReadonlySignedAccounts: 0,
        numReadonlyUnsignedAccounts: 2,
      },
      accounts: [
        GOAL_9L_FUNDING_SOURCE,
        GOAL_9L_FUNDING_SOURCE_USDC_ATA,
        GOAL_9O_ASSET_SIGNER_USDC_ATA,
        SOLANA_LEGACY_TOKEN_PROGRAM_ID,
        SOLANA_MAINNET_USDC_MINT,
      ],
      blockhash: BLOCKHASH,
    });
    expect(built.transaction.message.instructions).toHaveLength(1);
  });

  it('quotes the exact message at a non-stale finalized context', async () => {
    const fetchMock = mockRpc([
      genesisPayload(),
      blockhashPayload(),
      feePayload(),
    ]);
    const evidence = await quoteUnsignedUsdcFundingFee(config, fetchMock);
    expect(evidence).toMatchObject({
      network: 'mainnet-beta',
      rpcOrigin: config.rpcOrigin,
      blockhashContextSlot: 441_650_000,
      feeContextSlot: 441_650_001,
      sourceOwner: GOAL_9L_FUNDING_SOURCE,
      sourceTokenAccount: GOAL_9L_FUNDING_SOURCE_USDC_ATA,
      destinationOwner: GOAL_9O_ASSET_SIGNER,
      destinationTokenAccount: GOAL_9O_ASSET_SIGNER_USDC_ATA,
      mint: SOLANA_MAINNET_USDC_MINT,
      amountBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
      quotedFeeLamports: GOAL_9O_USDC_FUNDING_FEE_LAMPORTS,
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
  });

  it('rejects another cluster, null/changed fee, or stale fee context', async () => {
    for (const payloads of [
      [genesisPayload('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')],
      [genesisPayload(), blockhashPayload(), feePayload(null)],
      [genesisPayload(), blockhashPayload(), feePayload(5_001)],
      [genesisPayload(), blockhashPayload(), feePayload(5_000, 441_649_999)],
    ]) {
      await expect(
        quoteUnsignedUsdcFundingFee(config, mockRpc(payloads)),
      ).rejects.toThrow(UsdcFundingFeeError);
    }
  });

  it('closes the exact fee reserve without changing it', () => {
    expect(GOAL_9O_USDC_FUNDING_FEE_LAMPORTS).toBe(
      GOAL_9M_FUTURE_USDC_FUNDING_FEE_RESERVE_LAMPORTS,
    );
  });

  it('has no private-key generation, signing, simulation, or send path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal9o/usdc-funding-fee.ts', 'utf8'),
        readFile('src/cli/quote-usdc-funding-mainnet.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /generateSigner|keypairIdentity|buildAndSign|signTransaction|simulateTransaction|sendTransaction|sendAndConfirm/i,
    );
    expect(sources).not.toMatch(/console\.(?:info|log)\([^\n]*messageBase64/i);
  });

  it('publishes only the expiring digest and public account contract', async () => {
    const [artifact, identity] = await Promise.all([
      readFile(
        'artifacts/wallet-child-001.goal9o.usdc-funding-fee.json',
        'utf8',
      ).then((value) => JSON.parse(value) as Record<string, unknown>),
      readFile(
        'artifacts/wallet-child-001.goal9n.identity-addresses.json',
        'utf8',
      ).then(
        (value) =>
          JSON.parse(value) as { addresses: Record<string, string> },
      ),
    ]);
    expect(identity.addresses['assetSignerPda']).toBe(GOAL_9O_ASSET_SIGNER);
    expect(identity.addresses['assetSignerUsdcAta']).toBe(
      GOAL_9O_ASSET_SIGNER_USDC_ATA,
    );
    expect(artifact).toMatchObject({
      goal: '9O',
      network: 'mainnet-beta',
      message: {
        sourceOwner: GOAL_9L_FUNDING_SOURCE,
        sourceTokenAccount: GOAL_9L_FUNDING_SOURCE_USDC_ATA,
        destinationOwner: GOAL_9O_ASSET_SIGNER,
        destinationTokenAccount: GOAL_9O_ASSET_SIGNER_USDC_ATA,
        mint: SOLANA_MAINNET_USDC_MINT,
        amountBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS.toString(),
        program: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
        serializedBytesPublished: false,
        reusableForSigning: false,
      },
      fee: {
        quotedLamports: GOAL_9O_USDC_FUNDING_FEE_LAMPORTS.toString(),
        matchesReservedLamports: true,
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
