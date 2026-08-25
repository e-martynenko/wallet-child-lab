import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  buildIrysMetadataQuoteUrl,
  formatLamportsAsSol,
  GOAL_9K_MAX_STORAGE_QUOTE_LAMPORTS,
  IrysMetadataQuoteError,
  quoteFrozenMetadataOnIrys,
} from '../src/goal9k/irys-quote.js';

const owner = '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';

describe('Goal 9K fixed Irys Mainnet metadata quote', () => {
  it('builds only the tagged SOL quote URL for the frozen byte length', () => {
    expect(buildIrysMetadataQuoteUrl({ owner, byteLength: 351 }).toString()).toBe(
      'https://uploader.irys.xyz/price/solana/351?address=6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385&tags=Content-Type%7Capplication%2Fjson',
    );
  });

  it('returns bounded quote evidence without loading a key or mutating state', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response('3208', { status: 200 }),
    );
    const evidence = await quoteFrozenMetadataOnIrys(fetchMock);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
    });
    expect(evidence).toMatchObject({
      provider: 'Irys',
      network: 'mainnet',
      paymentToken: 'SOL',
      owner,
      metadataSha256:
        '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
      metadataByteLength: 351,
      contentType: 'application/json',
      quoteLamports: 3_208n,
      quoteSol: '0.000003208',
      maximumStorageQuoteLamports: GOAL_9K_MAX_STORAGE_QUOTE_LAMPORTS,
      remainingStorageQuoteLamports: 96_792n,
      requestMethod: 'GET',
      keyLoaded: false,
      fundingAttempted: false,
      uploadAttempted: false,
      transactionSubmitted: false,
    });
  });

  it('rejects malformed, failed, or over-cap responses', async () => {
    for (const response of [
      new Response('3.208', { status: 200 }),
      new Response('unavailable', { status: 503 }),
      new Response('1'.repeat(65), { status: 200 }),
      new Response((GOAL_9K_MAX_STORAGE_QUOTE_LAMPORTS + 1n).toString(), {
        status: 200,
      }),
    ]) {
      await expect(
        quoteFrozenMetadataOnIrys(async () => response),
      ).rejects.toThrow(IrysMetadataQuoteError);
    }
  });

  it('formats atomic SOL without floating-point conversion', () => {
    expect(formatLamportsAsSol(0n)).toBe('0');
    expect(formatLamportsAsSol(3_208n)).toBe('0.000003208');
    expect(formatLamportsAsSol(1_500_000_000n)).toBe('1.5');
    expect(() => formatLamportsAsSol(-1n)).toThrow(IrysMetadataQuoteError);
  });

  it('contains no key import, signer, upload, funding, signing, or send call', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal9k/irys-quote.ts', 'utf8'),
        readFile('src/cli/quote-irys-metadata.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /Keypair|Signer|withWallet|\.fund\(|\.upload(?:File)?\(|signTransaction|sendTransaction|sendAndConfirm|method:\s*['"](?:POST|PUT|PATCH|DELETE)/i,
    );
    expect(sources).toMatch(/method:\s*'GET'/);
  });
});
