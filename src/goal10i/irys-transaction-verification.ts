import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  deepHash,
  getCryptoDriver,
  stringToBuffer,
} from '@irys/upload/esm/utils';
import { z } from 'zod';

import { assertPublicArtifact } from '../goal3/artifact.js';
import { verifyGoal9CMetadataIntegrity } from '../goal9c/metadata.js';
import { GOAL_9P_OWNER } from '../goal9p/final-contract.js';
import {
  GOAL_10G_METADATA_BYTE_LENGTH,
  GOAL_10G_METADATA_SHA256,
} from '../goal10g/metadata-upload-review.js';

export const GOAL_10I_IRYS_ID =
  '2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL';
export const GOAL_10I_CANONICAL_URI =
  `https://gateway.irys.xyz/${GOAL_10I_IRYS_ID}`;
export const GOAL_10I_DATA_URL =
  `https://uploader.irys.xyz/tx/${GOAL_10I_IRYS_ID}/data`;
export const GOAL_10I_GRAPHQL_URL = 'https://uploader.irys.xyz/graphql';
export const GOAL_10I_PUBLIC_KEY_URL = 'https://uploader.irys.xyz/public';
export const GOAL_10I_STATUS_URL =
  `https://uploader.irys.xyz/tx/${GOAL_10I_IRYS_ID}/status`;
export const GOAL_10I_ARWEAVE_PROBE_URL =
  `https://arweave.net/${GOAL_10I_IRYS_ID}`;
export const GOAL_10I_ARWEAVE_GRAPHQL_URL = 'https://arweave.net/graphql';
export const GOAL_10I_ARWEAVE_INFO_URL = 'https://arweave.net/info';
export const GOAL_10I_ARTIFACT_PATH =
  'artifacts/wallet-child-001.goal10h.metadata-upload-receipt.json';

const ReceiptSchema = z
  .object({
    public: z.string().min(1),
    signature: z.string().min(1),
    deadlineHeight: z.number().int().nonnegative(),
    timestamp: z.number().int().positive(),
    version: z.literal('1.0.0'),
    signatureVerified: z.literal(true),
  })
  .strict();

const Goal10HArtifactSchema = z.object({
  goal: z.literal('10H'),
  status: z.literal('IRYS_METADATA_UPLOAD_VERIFIED'),
  metadata: z.object({
    sha256: z.literal(GOAL_10G_METADATA_SHA256),
    byteLength: z.literal(GOAL_10G_METADATA_BYTE_LENGTH),
    contentType: z.literal('application/json'),
    owner: z.literal(GOAL_9P_OWNER),
  }),
  upload: z.object({
    id: z.literal(GOAL_10I_IRYS_ID),
    durableUri: z.literal(GOAL_10I_CANONICAL_URI),
    gatewayUrl: z.literal(GOAL_10I_CANONICAL_URI),
    uploadCalls: z.literal(1),
    exactGatewayBytesVerified: z.literal(true),
    twoOriginExactBytesVerified: z.literal(true),
  }),
  receipt: ReceiptSchema,
  recovery: z.object({
    secondUploadAttempted: z.literal(false),
  }),
  checks: z.object({
    uploadSubmittedOnce: z.literal(true),
    solanaTransactionSubmitted: z.literal(false),
    treasuryActionAuthorized: z.literal(false),
  }),
});

const GraphqlResponseSchema = z.object({
  data: z.object({
    transactions: z.object({
      edges: z.array(
        z.object({
          node: z.object({
            id: z.string(),
            address: z.string(),
            timestamp: z.number().int().positive(),
            token: z.string(),
            size: z.string().regex(/^\d+$/),
            fee: z.string().regex(/^\d+$/),
            tags: z.array(z.object({ name: z.string(), value: z.string() })),
            receipt: z.object({
              version: z.string(),
              signature: z.string(),
              timestamp: z.number().int().positive(),
              deadlineHeight: z.number().int().nonnegative(),
            }),
          }),
        }),
      ),
    }),
  }),
});

const StatusResponseSchema = z
  .object({
    status: z.string().min(1),
    seededTo: z.array(z.string().min(1)),
  })
  .strict();

const ArweaveTransactionResponseSchema = z.object({
  data: z.object({
    transactions: z.object({
      edges: z.array(
        z.object({
          node: z.object({
            id: z.string(),
            bundledIn: z.object({ id: z.string() }).nullable(),
            block: z
              .object({
                height: z.number().int().nonnegative(),
                timestamp: z.number().int().positive(),
              })
              .nullable(),
          }),
        }),
      ),
    }),
  }),
});

const ArweaveInfoSchema = z.object({
  height: z.number().int().nonnegative(),
});

export type Goal10IRetrieval = Readonly<{
  requestedUrl: string;
  finalUrl: string;
  finalOrigin: string;
  contentType: string;
  byteLength: number;
  sha256: string;
}>;

export type Goal10IVerification = Readonly<{
  id: string;
  canonicalIrysUri: string;
  metadataSha256: string;
  metadataByteLength: number;
  retrievals: readonly [Goal10IRetrieval, Goal10IRetrieval];
  indexer: Readonly<{
    owner: string;
    token: 'solana';
    timestamp: number;
    dataItemSize: string;
    indexedFeeLamports: string;
    contentType: 'application/json';
  }>;
  receipt: Readonly<{
    version: '1.0.0';
    timestamp: number;
    deadlineHeight: number;
    publicKeyMatchesNode: true;
    signatureMatchesIndexer: true;
    signatureVerifiedNow: true;
  }>;
  uriCorrection: Readonly<{
    rejectedAlias: string;
    canonicalPattern: 'https://gateway.irys.xyz/:transactionId';
    arweaveProbeStatus: 404 | 200;
    arweaveProbeExactBytes: boolean;
  }>;
  settlement: Readonly<{
    uploaderStatus: string;
    seededTo: readonly string[];
    seededMinerCount: number;
    requiredSeededMinerCount: 5;
    bundleId: string | null;
    blockHeight: number | null;
    networkHeight: number;
    confirmations: number;
    requiredConfirmations: 50;
    arweaveFinalizationVerified: boolean;
    state: 'PENDING' | 'SETTLED';
  }>;
  canonicalIrysTransactionVerified: true;
  ownerKeyLoaded: false;
  uploadAttempted: false;
  solanaTransactionSubmitted: false;
  onChainBindingAttempted: false;
}>;

export class Goal10IVerificationError extends Error {
  override readonly name = 'Goal10IVerificationError';
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    timingSafeEqual(Buffer.from(left), Buffer.from(right))
  );
}

async function readGoal10HArtifact(): Promise<z.infer<typeof Goal10HArtifactSchema>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(GOAL_10I_ARTIFACT_PATH, 'utf8')) as unknown;
  } catch {
    throw new Goal10IVerificationError('Goal 10H public receipt could not be read.');
  }
  assertPublicArtifact(parsed);
  const artifact = Goal10HArtifactSchema.safeParse(parsed);
  if (!artifact.success) {
    throw new Goal10IVerificationError(
      'Goal 10H public receipt no longer matches the accepted upload.',
    );
  }
  return artifact.data;
}

function isAllowedFinalUrl(requestedUrl: string, finalUrl: string): boolean {
  let requested: URL;
  let final: URL;
  try {
    requested = new URL(requestedUrl);
    final = new URL(finalUrl);
  } catch {
    return false;
  }
  return (
    final.protocol === 'https:' &&
    !final.username &&
    !final.password &&
    (final.origin === requested.origin ||
      final.hostname.endsWith('.datasprite-cdn.com'))
  );
}

async function retrieveExactMetadata(
  url: string,
  expectedBytes: Uint8Array,
  fetchImpl: typeof fetch,
): Promise<Goal10IRetrieval> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Goal10IVerificationError(`Irys retrieval failed for ${url}.`);
  }
  if (!response.ok || !isAllowedFinalUrl(url, response.url)) {
    throw new Goal10IVerificationError(
      `Irys retrieval returned an invalid response for ${url}.`,
    );
  }
  const contentType = response.headers.get('content-type') ?? '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    !contentType.toLowerCase().startsWith('application/json') ||
    bytes.byteLength !== GOAL_10G_METADATA_BYTE_LENGTH ||
    sha256(bytes) !== GOAL_10G_METADATA_SHA256 ||
    !bytesEqual(bytes, expectedBytes)
  ) {
    throw new Goal10IVerificationError(
      `Irys retrieval bytes or content type drifted for ${url}.`,
    );
  }
  const final = new URL(response.url);
  return Object.freeze({
    requestedUrl: url,
    finalUrl: final.toString(),
    finalOrigin: final.origin,
    contentType,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  });
}

async function queryIndexedTransaction(fetchImpl: typeof fetch) {
  const query =
    'query ($ids: [String!]) { transactions(ids: $ids) { edges { node { ' +
    'id address timestamp token size fee tags { name value } ' +
    'receipt { version signature timestamp deadlineHeight } } } } }';
  let response: Response;
  try {
    response = await fetchImpl(GOAL_10I_GRAPHQL_URL, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query, variables: { ids: [GOAL_10I_IRYS_ID] } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Goal10IVerificationError('Irys read-only index query failed.');
  }
  if (!response.ok) {
    throw new Goal10IVerificationError(
      `Irys read-only index query returned HTTP ${response.status}.`,
    );
  }
  const parsed = GraphqlResponseSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.data.transactions.edges.length !== 1) {
    throw new Goal10IVerificationError(
      'Irys index did not return exactly one accepted transaction.',
    );
  }
  const node = parsed.data.data.transactions.edges[0]?.node;
  if (
    !node ||
    node.id !== GOAL_10I_IRYS_ID ||
    node.address !== GOAL_9P_OWNER ||
    node.token !== 'solana' ||
    node.tags.length !== 1 ||
    node.tags[0]?.name !== 'Content-Type' ||
    node.tags[0]?.value !== 'application/json'
  ) {
    throw new Goal10IVerificationError(
      'Irys indexed owner, token, or content-type tag drifted.',
    );
  }
  return node;
}

async function readNodePublicKey(fetchImpl: typeof fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(GOAL_10I_PUBLIC_KEY_URL, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Goal10IVerificationError('Irys public receipt key read failed.');
  }
  const publicKey = (await response.text()).trim();
  if (!response.ok || !/^[A-Za-z0-9_-]+$/.test(publicKey)) {
    throw new Goal10IVerificationError('Irys public receipt key is malformed.');
  }
  return publicKey;
}

async function verifyReceiptSignature(
  publicKey: string,
  receipt: Readonly<{
    signature: string;
    deadlineHeight: number;
    timestamp: number;
    version: string;
  }>,
): Promise<boolean> {
  const digest = await deepHash([
    stringToBuffer('Bundlr'),
    stringToBuffer(receipt.version),
    stringToBuffer(GOAL_10I_IRYS_ID),
    stringToBuffer(receipt.deadlineHeight.toString()),
    stringToBuffer(receipt.timestamp.toString()),
  ]);
  return getCryptoDriver().verify(
    publicKey,
    digest,
    Buffer.from(receipt.signature, 'base64url'),
  );
}

async function probeArweaveAlias(
  expectedBytes: Uint8Array,
  fetchImpl: typeof fetch,
): Promise<Readonly<{ status: 404 | 200; exactBytes: boolean }>> {
  let response: Response;
  try {
    response = await fetchImpl(GOAL_10I_ARWEAVE_PROBE_URL, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Goal10IVerificationError('Non-canonical Arweave alias probe failed.');
  }
  if (response.status === 404) {
    return Object.freeze({ status: 404 as const, exactBytes: false });
  }
  if (response.status !== 200) {
    throw new Goal10IVerificationError(
      `Non-canonical Arweave alias returned HTTP ${response.status}.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytesEqual(bytes, expectedBytes)) {
    throw new Goal10IVerificationError(
      'Non-canonical Arweave alias returned unexpected bytes.',
    );
  }
  return Object.freeze({ status: 200 as const, exactBytes: true });
}

async function readSettlementStatus(fetchImpl: typeof fetch) {
  let response: Response;
  try {
    response = await fetchImpl(GOAL_10I_STATUS_URL, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Goal10IVerificationError('Irys settlement status read failed.');
  }
  if (!response.ok) {
    throw new Goal10IVerificationError(
      `Irys settlement status returned HTTP ${response.status}.`,
    );
  }
  const parsed = StatusResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Goal10IVerificationError('Irys settlement status is malformed.');
  }
  return parsed.data;
}

async function readArweaveSettlement(fetchImpl: typeof fetch) {
  const query =
    'query ($ids: [ID!]) { transactions(ids: $ids) { edges { node { ' +
    'id bundledIn { id } block { height timestamp } } } } }';
  let transactionResponse: Response;
  let infoResponse: Response;
  try {
    [transactionResponse, infoResponse] = await Promise.all([
      fetchImpl(GOAL_10I_ARWEAVE_GRAPHQL_URL, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query, variables: { ids: [GOAL_10I_IRYS_ID] } }),
        signal: AbortSignal.timeout(15_000),
      }),
      fetchImpl(GOAL_10I_ARWEAVE_INFO_URL, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      }),
    ]);
  } catch {
    throw new Goal10IVerificationError('Arweave settlement reads failed.');
  }
  if (!transactionResponse.ok || !infoResponse.ok) {
    throw new Goal10IVerificationError(
      'Arweave settlement reads returned a non-success response.',
    );
  }
  const transaction = ArweaveTransactionResponseSchema.safeParse(
    await transactionResponse.json(),
  );
  const info = ArweaveInfoSchema.safeParse(await infoResponse.json());
  if (
    !transaction.success ||
    !info.success ||
    transaction.data.data.transactions.edges.length > 1
  ) {
    throw new Goal10IVerificationError('Arweave settlement evidence is malformed.');
  }
  const node = transaction.data.data.transactions.edges[0]?.node ?? null;
  if (node && node.id !== GOAL_10I_IRYS_ID) {
    throw new Goal10IVerificationError('Arweave returned the wrong transaction.');
  }
  const blockHeight = node?.block?.height ?? null;
  const confirmations =
    blockHeight === null ? 0 : Math.max(0, info.data.height - blockHeight);
  return Object.freeze({
    bundleId: node?.bundledIn?.id ?? null,
    blockHeight,
    networkHeight: info.data.height,
    confirmations,
  });
}

export async function verifyGoal10IIrysTransaction(
  fetchImpl: typeof fetch = fetch,
): Promise<Goal10IVerification> {
  const [metadata, artifact, expectedBytes] = await Promise.all([
    verifyGoal9CMetadataIntegrity(),
    readGoal10HArtifact(),
    readFile('metadata/wallet-child-001.mainnet-candidate.json'),
  ]);
  if (
    metadata.manifest.durableUri !== GOAL_10I_CANONICAL_URI ||
    metadata.sha256 !== GOAL_10G_METADATA_SHA256 ||
    expectedBytes.byteLength !== GOAL_10G_METADATA_BYTE_LENGTH ||
    sha256(expectedBytes) !== GOAL_10G_METADATA_SHA256
  ) {
    throw new Goal10IVerificationError(
      'Frozen metadata or canonical Irys URI drifted before verification.',
    );
  }

  const [
    gateway,
    dataRoute,
    node,
    publicKey,
    arweaveProbe,
    settlementStatus,
    arweaveSettlement,
  ] = await Promise.all([
    retrieveExactMetadata(GOAL_10I_CANONICAL_URI, expectedBytes, fetchImpl),
    retrieveExactMetadata(GOAL_10I_DATA_URL, expectedBytes, fetchImpl),
    queryIndexedTransaction(fetchImpl),
    readNodePublicKey(fetchImpl),
    probeArweaveAlias(expectedBytes, fetchImpl),
    readSettlementStatus(fetchImpl),
    readArweaveSettlement(fetchImpl),
  ]);
  if (gateway.finalOrigin === dataRoute.finalOrigin) {
    throw new Goal10IVerificationError(
      'Irys canonical and data retrievals resolved to the same final origin.',
    );
  }
  const storedReceipt = artifact.receipt;
  if (
    publicKey !== storedReceipt.public ||
    node.receipt.signature !== storedReceipt.signature ||
    node.receipt.version !== storedReceipt.version ||
    node.receipt.timestamp !== storedReceipt.timestamp ||
    node.receipt.timestamp !== node.timestamp ||
    node.receipt.deadlineHeight !== storedReceipt.deadlineHeight ||
    !(await verifyReceiptSignature(publicKey, node.receipt))
  ) {
    throw new Goal10IVerificationError(
      'Irys live receipt no longer matches or verifies against the accepted upload.',
    );
  }

  const seededMinerCount = new Set(settlementStatus.seededTo).size;
  const settlementComplete =
    settlementStatus.status === 'CONFIRMED' &&
    seededMinerCount >= 5 &&
    arweaveProbe.exactBytes &&
    arweaveSettlement.bundleId !== null &&
    arweaveSettlement.blockHeight !== null &&
    arweaveSettlement.confirmations >= 50;

  return Object.freeze({
    id: GOAL_10I_IRYS_ID,
    canonicalIrysUri: GOAL_10I_CANONICAL_URI,
    metadataSha256: GOAL_10G_METADATA_SHA256,
    metadataByteLength: GOAL_10G_METADATA_BYTE_LENGTH,
    retrievals: Object.freeze([gateway, dataRoute] as const),
    indexer: Object.freeze({
      owner: GOAL_9P_OWNER,
      token: 'solana' as const,
      timestamp: node.timestamp,
      dataItemSize: node.size,
      indexedFeeLamports: node.fee,
      contentType: 'application/json' as const,
    }),
    receipt: Object.freeze({
      version: '1.0.0' as const,
      timestamp: node.receipt.timestamp,
      deadlineHeight: node.receipt.deadlineHeight,
      publicKeyMatchesNode: true as const,
      signatureMatchesIndexer: true as const,
      signatureVerifiedNow: true as const,
    }),
    uriCorrection: Object.freeze({
      rejectedAlias: `ar://${GOAL_10I_IRYS_ID}`,
      canonicalPattern: 'https://gateway.irys.xyz/:transactionId' as const,
      arweaveProbeStatus: arweaveProbe.status,
      arweaveProbeExactBytes: arweaveProbe.exactBytes,
    }),
    settlement: Object.freeze({
      uploaderStatus: settlementStatus.status,
      seededTo: Object.freeze([...settlementStatus.seededTo]),
      seededMinerCount,
      requiredSeededMinerCount: 5 as const,
      bundleId: arweaveSettlement.bundleId,
      blockHeight: arweaveSettlement.blockHeight,
      networkHeight: arweaveSettlement.networkHeight,
      confirmations: arweaveSettlement.confirmations,
      requiredConfirmations: 50 as const,
      arweaveFinalizationVerified: settlementComplete,
      state: settlementComplete ? ('SETTLED' as const) : ('PENDING' as const),
    }),
    canonicalIrysTransactionVerified: true as const,
    ownerKeyLoaded: false as const,
    uploadAttempted: false as const,
    solanaTransactionSubmitted: false as const,
    onChainBindingAttempted: false as const,
  });
}
