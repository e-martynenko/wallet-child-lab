import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  GOAL_10G_CONFIRMATION,
  GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS,
  GOAL_10G_METADATA_BYTE_LENGTH,
  GOAL_10G_METADATA_SHA256,
  GOAL_10G_UPLOAD_CORE_INTEGRITY,
  GOAL_10G_UPLOAD_CORE_VERSION,
  IrysMetadataUploadReviewError,
  reviewIrysMetadataUpload,
  verifyIrysUploadSourceContract,
} from '../src/goal10g/metadata-upload-review.js';
import { GOAL_9P_OWNER } from '../src/goal9p/final-contract.js';

function createIrysFetch(
  quote = '3208',
  credit = '3208',
): typeof fetch {
  return (async (input: URL | RequestInfo) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (url.pathname === '/price/solana/351') {
      expect(url.searchParams.get('address')).toBe(GOAL_9P_OWNER);
      expect(url.searchParams.getAll('tags')).toEqual([
        'Content-Type|application/json',
      ]);
      return new Response(quote, { status: 200 });
    }
    if (url.pathname === '/account/balance/solana') {
      expect(url.searchParams.get('address')).toBe(GOAL_9P_OWNER);
      return Response.json({ balance: credit });
    }
    throw new Error(`Unexpected Irys URL: ${url}`);
  }) as typeof fetch;
}

describe('Goal 10G Irys permanent metadata upload review', () => {
  it('pins the exact direct-buffer upload and receipt contract', async () => {
    await expect(verifyIrysUploadSourceContract()).resolves.toEqual({
      uploadCoreVersion: GOAL_10G_UPLOAD_CORE_VERSION,
      uploadCoreRegistryIntegrityVerified: true,
      directBufferUploadAvailable: true,
      bufferSignedAsOneDataItem: true,
      uploadPostsToSolanaTokenEndpoint: true,
      contentTypeTagIncludedInQuote: true,
      receiptSignatureVerificationAvailable: true,
      sourceHashesVerified: true,
    });
    expect(GOAL_10G_UPLOAD_CORE_INTEGRITY).toContain('sha512-');
  });

  it('builds one exact upload-only confirmation from current funded credit', async () => {
    const review = await reviewIrysMetadataUpload(createIrysFetch());
    expect(review).toEqual({
      network: 'mainnet',
      owner: GOAL_9P_OWNER,
      metadataSha256: GOAL_10G_METADATA_SHA256,
      metadataByteLength: GOAL_10G_METADATA_BYTE_LENGTH,
      contentType: 'application/json',
      irysCreditLamports: GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS,
      freshTaggedQuoteLamports: 3_208n,
      maximumCreditSpendLamports: 3_208n,
      topUpAllowed: false,
      solanaTransactionIncluded: false,
      uploadMethod: 'irys.upload(exactBuffer, { tags: [Content-Type] })',
      dataItems: 1,
      publicUpload: true,
      intendedPermanentUpload: true,
      receiptSignatureVerificationRequired: true,
      exactGatewayReadbackRequired: true,
      twoOriginDurabilityVerificationRequired: true,
      confirmationPhrase: GOAL_10G_CONFIRMATION,
      confirmationReceived: false,
      keyLoaded: false,
      sdkWalletInitialized: false,
      uploadAttempted: false,
      networkWrite: false,
      verdict: 'STOP_AWAITING_EXACT_PERMANENT_UPLOAD_CONFIRMATION',
    });
  });

  it('fails closed instead of topping up on quote or credit drift', async () => {
    await expect(
      reviewIrysMetadataUpload(createIrysFetch('3209', '3208')),
    ).rejects.toThrow(IrysMetadataUploadReviewError);
    await expect(
      reviewIrysMetadataUpload(createIrysFetch('3208', '3209')),
    ).rejects.toThrow(IrysMetadataUploadReviewError);
  });

  it('keeps the read-only review outside the signer-capable runtime', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal10g/metadata-upload-review.ts', 'utf8'),
        readFile('src/cli/review-metadata-upload-mainnet.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(/^\s*import .*@irys\/upload/m);
    expect(sources).not.toMatch(/\bawait\s+\w+\.upload\s*\(/);
    expect(sources).not.toMatch(/\bUploader\([^)]*\)\.withWallet\s*\(/);
    expect(sources).not.toMatch(/readFile\([^)]*(?:owner\.json|\.wallet-child)/i);
    expect(sources).not.toMatch(/method:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
  });

  it('publishes a public STOP artifact without credentials', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal10g.metadata-upload-review.json',
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      goal: '10G',
      status: 'READ_ONLY_UPLOAD_REVIEW_COMPLETE',
      uploadActionReview: {
        metadataSha256: GOAL_10G_METADATA_SHA256,
        metadataByteLength: 351,
        existingIrysCreditLamports: '3208',
        freshTaggedQuoteLamports: '3208',
        maximumCreditSpendLamports: '3208',
        confirmationReceived: false,
        topUpAllowed: false,
        solanaTransactionIncluded: false,
        uploadAttempted: false,
      },
      checks: {
        ownerKeyLoaded: false,
        sdkWalletInitialized: false,
        uploadAttempted: false,
        networkWrite: false,
        fundsMoved: false,
      },
      verdict: 'STOP_AWAITING_EXACT_PERMANENT_UPLOAD_CONFIRMATION',
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /privateKey|secretKey|seed|mnemonic|api[_-]?key/i,
    );
  });
});
