import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  assertGoal10HConfirmation,
  executeGoal10HIrysMetadataUpload,
  GOAL_10H_CONFIRMATION,
  IrysMetadataUploadExecutionError,
  recoverGoal10HAcceptedUpload,
  type Goal10HIrysClient,
} from '../src/goal10h/metadata-upload-execution.js';
import { GOAL_9P_OWNER } from '../src/goal9p/final-contract.js';

const ID = 'a'.repeat(44);
const atomic = (value: string) => ({ toFixed: () => value });

function responseAt(body: BodyInit, url: string): Response {
  const response = new Response(body, { status: 200 });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

async function setup(verifyReceipt = true) {
  const bytes = await readFile(
    'metadata/wallet-child-001.mainnet-candidate.json',
  );
  const directory = await mkdtemp(join(tmpdir(), 'goal10h-test-'));
  let uploaded = false;
  const upload = vi.fn(async (data: Buffer, options: unknown) => {
    expect(data.equals(bytes)).toBe(true);
    expect(options).toEqual({
      tags: [{ name: 'Content-Type', value: 'application/json' }],
    });
    uploaded = true;
    return {
      id: ID,
      public: 'public-receipt-key',
      signature: 'receipt-signature',
      deadlineHeight: 0,
      timestamp: 1_700_000_000_000,
      version: '1.0.0',
      verify: async () => verifyReceipt,
    };
  });
  const client: Goal10HIrysClient = {
    address: GOAL_9P_OWNER,
    getBalance: async () => atomic('3208'),
    getPrice: async (_bytes, options) => {
      expect(options).toEqual({
        tags: [{ name: 'Content-Type', value: 'application/json' }],
        address: GOAL_9P_OWNER,
      });
      return atomic('3208');
    },
    upload,
  };
  const fetchImpl = (async (input: URL | RequestInfo) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === '/price/solana/351') {
      return new Response('3208', { status: 200 });
    }
    if (url.pathname === '/account/balance/solana') {
      return Response.json({ balance: uploaded ? '0' : '3208' });
    }
    if (url.origin === 'https://gateway.irys.xyz' && url.pathname === `/${ID}`) {
      return responseAt(
        bytes,
        `https://gateway-cache.datasprite-cdn.com/${ID}/`,
      );
    }
    if (
      url.origin === 'https://uploader.irys.xyz' &&
      url.pathname === `/tx/${ID}/data`
    ) {
      return responseAt(
        bytes,
        `https://data-cache.datasprite-cdn.com/${ID}`,
      );
    }
    if (url.pathname === '/graphql') {
      return Response.json({
        data: {
          transactions: {
            edges: [
              {
                node: {
                  id: ID,
                  address: GOAL_9P_OWNER,
                  currency: 'solana',
                  timestamp: 1_700_000_000_000,
                  tags: [{ name: 'Content-Type', value: 'application/json' }],
                },
              },
            ],
          },
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  return {
    attemptPath: join(directory, 'attempt.json'),
    client,
    fetchImpl,
    upload,
  };
}

describe('Goal 10H exact Irys metadata upload', () => {
  it('requires the exact permanent public upload confirmation', () => {
    expect(() => assertGoal10HConfirmation([GOAL_10H_CONFIRMATION])).not.toThrow();
    expect(() => assertGoal10HConfirmation([])).toThrow(
      IrysMetadataUploadExecutionError,
    );
    expect(() => assertGoal10HConfirmation([`${GOAL_10H_CONFIRMATION} `])).toThrow(
      IrysMetadataUploadExecutionError,
    );
  });

  it('uploads the exact buffer once and verifies receipt, bytes, and credit', async () => {
    const context = await setup();
    const result = await executeGoal10HIrysMetadataUpload(
      [GOAL_10H_CONFIRMATION],
      context.fetchImpl,
      'unused-owner-path',
      context.attemptPath,
      async () => context.client,
      async () => ({ address: GOAL_9P_OWNER, secretKey: new Uint8Array(64) }),
      async () => {},
    );
    expect(context.upload).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      id: ID,
      durableUri: `ar://${ID}`,
      gatewayUrl: `https://gateway.irys.xyz/${ID}`,
      metadataByteLength: 351,
      quoteLamports: 3_208n,
      creditBeforeLamports: 3_208n,
      creditAfterLamports: 0n,
      creditSpentLamports: 3_208n,
      uploadCalls: 1,
      exactGatewayBytesVerified: true,
      twoOriginExactBytesVerified: true,
      topUpAttempted: false,
      solanaTransactionSubmitted: false,
      treasuryActionAuthorized: false,
    });
    expect(JSON.parse(await readFile(context.attemptPath, 'utf8'))).toMatchObject({
      state: 'UPLOAD_VERIFIED',
      id: ID,
    });
  });

  it('recovers an accepted upload by public ID without a second upload', async () => {
    const context = await setup();
    await writeFile(
      context.attemptPath,
      `${JSON.stringify({
        goal: '10H',
        state: 'UPLOAD_CALL_STARTED_RESULT_UNKNOWN',
        metadataSha256:
          '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
        metadataByteLength: 351,
        owner: GOAL_9P_OWNER,
      })}\n`,
      { mode: 0o600 },
    );
    const recovered = await recoverGoal10HAcceptedUpload(
      ID,
      context.fetchImpl,
      context.attemptPath,
      async () => ({
        id: ID,
        public: 'public-receipt-key',
        signature: 'receipt-signature',
        deadlineHeight: 0,
        timestamp: 1_700_000_000_000,
        version: '1.0.0',
        verify: async () => true,
      }),
      async () => {},
    );
    expect(recovered).toMatchObject({
      id: ID,
      creditAfterLamports: 3_208n,
      creditSpentLamports: 0n,
      uploadCalls: 1,
      twoOriginExactBytesVerified: true,
    });
    expect(context.upload).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(context.attemptPath, 'utf8'))).toMatchObject({
      state: 'UPLOAD_VERIFIED_RECOVERED',
      id: ID,
    });
  });

  it('blocks a second attempt instead of risking a duplicate upload', async () => {
    const context = await setup();
    const run = () =>
      executeGoal10HIrysMetadataUpload(
        [GOAL_10H_CONFIRMATION],
        context.fetchImpl,
        'unused-owner-path',
        context.attemptPath,
        async () => context.client,
        async () => ({ address: GOAL_9P_OWNER, secretKey: new Uint8Array(64) }),
        async () => {},
      );
    await expect(run()).resolves.toBeDefined();
    await expect(run()).rejects.toThrow(/do not retry blindly/i);
    expect(context.upload).toHaveBeenCalledTimes(1);
  });

  it('fails after one call if receipt verification fails and never retries', async () => {
    const context = await setup(false);
    await expect(
      executeGoal10HIrysMetadataUpload(
        [GOAL_10H_CONFIRMATION],
        context.fetchImpl,
        'unused-owner-path',
        context.attemptPath,
        async () => context.client,
        async () => ({ address: GOAL_9P_OWNER, secretKey: new Uint8Array(64) }),
        async () => {},
      ),
    ).rejects.toThrow(/receipt signature verification failed/i);
    expect(context.upload).toHaveBeenCalledTimes(1);
  });

  it('keeps key loading after confirmation, public review, and attempt claim', async () => {
    const source = await readFile(
      'src/goal10h/metadata-upload-execution.ts',
      'utf8',
    );
    expect(source.indexOf('assertGoal10HConfirmation(arguments_)')).toBeLessThan(
      source.indexOf('await claimUploadAttempt(attemptPath)'),
    );
    expect(source.indexOf('await claimUploadAttempt(attemptPath)')).toBeLessThan(
      source.indexOf('await loadOwnerMaterial(ownerPath)'),
    );
    expect(source).not.toMatch(/loadOrCreateIsolatedSigner/);
    expect(source).not.toMatch(/\.fund\s*\(|sendTransaction|SystemProgram\.transfer/);
  });

  it('publishes the verified one-upload receipt without reusable credentials', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal10h.metadata-upload-receipt.json',
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      goal: '10H',
      status: 'IRYS_METADATA_UPLOAD_VERIFIED',
      upload: {
        id: '2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL',
        uploadCalls: 1,
        exactGatewayBytesVerified: true,
        twoOriginExactBytesVerified: true,
      },
      irysCredit: {
        beforeLamports: '3208',
        afterLamports: '3208',
        spentLamports: '0',
        topUpAttempted: false,
      },
      recovery: {
        used: true,
        secondUploadAttempted: false,
      },
      checks: {
        receiptSignatureVerified: true,
        uploadSubmittedOnce: true,
        solanaTransactionSubmitted: false,
        treasuryActionAuthorized: false,
      },
      verdict: 'UPLOAD_PASS_STOP_BEFORE_ON_CHAIN_BINDING',
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /privateKey|secretKey|seed|mnemonic|api[_-]?key|rpcUrl/i,
    );
  });
});
