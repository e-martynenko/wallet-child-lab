import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  DurableMetadataVerificationError,
  parseDurableMetadataVerificationConfig,
  verifyDurableMetadataCopies,
} from '../src/goal9j/durable-metadata.js';

const retrievalUrls = JSON.stringify([
  'https://gateway-one.example/content',
  'https://gateway-two.example/content',
]);

function config() {
  return parseDurableMetadataVerificationConfig({
    WALLET_CHILD_METADATA_DURABLE_URI: 'ar://example-transaction-id',
    WALLET_CHILD_METADATA_RETRIEVAL_URLS: retrievalUrls,
  });
}

describe('Goal 9J durable metadata retrieval config', () => {
  it('accepts one durable URI and exactly two independent HTTPS origins', () => {
    expect(config()).toEqual({
      durableUri: 'ar://example-transaction-id',
      retrievalUrls: [
        'https://gateway-one.example/content',
        'https://gateway-two.example/content',
      ],
      retrievalOrigins: [
        'https://gateway-one.example',
        'https://gateway-two.example',
      ],
    });
  });

  it('rejects missing, insecure, credential-bearing, same-origin, or extra URLs', () => {
    const cases = [
      {},
      {
        WALLET_CHILD_METADATA_DURABLE_URI: 'file:///metadata.json',
        WALLET_CHILD_METADATA_RETRIEVAL_URLS: retrievalUrls,
      },
      {
        WALLET_CHILD_METADATA_DURABLE_URI: 'ipfs://cid',
        WALLET_CHILD_METADATA_RETRIEVAL_URLS: JSON.stringify([
          'http://gateway-one.example/content',
          'https://gateway-two.example/content',
        ]),
      },
      {
        WALLET_CHILD_METADATA_DURABLE_URI: 'ipfs://cid',
        WALLET_CHILD_METADATA_RETRIEVAL_URLS: JSON.stringify([
          'https://user:secret@gateway-one.example/content',
          'https://gateway-two.example/content',
        ]),
      },
      {
        WALLET_CHILD_METADATA_DURABLE_URI: 'ipfs://cid',
        WALLET_CHILD_METADATA_RETRIEVAL_URLS: JSON.stringify([
          'https://gateway-one.example/a',
          'https://gateway-one.example/b',
        ]),
      },
      {
        WALLET_CHILD_METADATA_DURABLE_URI: 'ipfs://cid',
        WALLET_CHILD_METADATA_RETRIEVAL_URLS: JSON.stringify([
          'https://one.example',
          'https://two.example',
          'https://three.example',
        ]),
      },
    ];
    for (const env of cases) {
      expect(() => parseDurableMetadataVerificationConfig(env)).toThrow(
        DurableMetadataVerificationError,
      );
    }
  });
});

describe('Goal 9J exact remote byte verification', () => {
  it('accepts two exact copies of the frozen candidate', async () => {
    const bytes = await readFile(
      'metadata/wallet-child-001.mainnet-candidate.json',
    );
    const evidence = await verifyDurableMetadataCopies(
      config(),
      async () => new Response(bytes, { status: 200 }),
    );
    expect(evidence).toMatchObject({
      durableUri: 'ar://example-transaction-id',
      sha256: '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
      byteLength: 351,
      exactBytesMatch: true,
      transactionSubmitted: false,
    });
    expect(evidence.retrievals).toHaveLength(2);
  });

  it('rejects byte drift or an HTTP failure from either origin', async () => {
    const bytes = await readFile(
      'metadata/wallet-child-001.mainnet-candidate.json',
    );
    let call = 0;
    await expect(
      verifyDurableMetadataCopies(config(), async () => {
        call += 1;
        return new Response(call === 1 ? bytes : Buffer.from(`${bytes} `), {
          status: 200,
        });
      }),
    ).rejects.toThrow(DurableMetadataVerificationError);
    await expect(
      verifyDurableMetadataCopies(
        config(),
        async () => new Response('missing', { status: 404 }),
      ),
    ).rejects.toThrow(DurableMetadataVerificationError);
  });

  it('contains no key, signer, builder, upload, signing, or send path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal9j/durable-metadata.ts', 'utf8'),
        readFile('src/cli/verify-durable-metadata.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /Keypair|Signer|TransactionBuilder|upload|POST|PUT|signTransaction|sendTransaction|sendAndConfirm/i,
    );
  });
});
