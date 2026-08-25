import { createHash } from 'node:crypto';

import { verifyGoal9CMetadataIntegrity } from '../goal9c/metadata.js';

export type DurableMetadataVerificationConfig = Readonly<{
  durableUri: string;
  retrievalUrls: readonly [string, string];
  retrievalOrigins: readonly [string, string];
}>;

export type DurableMetadataVerificationEvidence = Readonly<{
  durableUri: string;
  sha256: string;
  byteLength: number;
  retrievals: readonly [
    Readonly<{ origin: string; sha256: string; byteLength: number }>,
    Readonly<{ origin: string; sha256: string; byteLength: number }>,
  ];
  exactBytesMatch: true;
  transactionSubmitted: false;
}>;

export class DurableMetadataVerificationError extends Error {
  override readonly name = 'DurableMetadataVerificationError';
}

function parseHttpsRetrievalUrl(value: unknown): URL {
  if (typeof value !== 'string') {
    throw new DurableMetadataVerificationError('Retrieval URL must be a string.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DurableMetadataVerificationError('Retrieval URL is invalid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new DurableMetadataVerificationError(
      'Retrieval URLs must be credential-free HTTPS URLs.',
    );
  }
  return url;
}

export function parseDurableMetadataVerificationConfig(
  env: NodeJS.ProcessEnv,
): DurableMetadataVerificationConfig {
  const durableUri = env['WALLET_CHILD_METADATA_DURABLE_URI'];
  const rawRetrievals = env['WALLET_CHILD_METADATA_RETRIEVAL_URLS'];
  if (!durableUri || !rawRetrievals) {
    throw new DurableMetadataVerificationError(
      'Durable URI and exactly two retrieval URLs are required.',
    );
  }
  let durable: URL;
  try {
    durable = new URL(durableUri);
  } catch {
    throw new DurableMetadataVerificationError('Durable metadata URI is invalid.');
  }
  if (!['https:', 'ar:', 'ipfs:'].includes(durable.protocol)) {
    throw new DurableMetadataVerificationError(
      'Durable metadata URI must use HTTPS, ar://, or ipfs://.',
    );
  }
  let parsedRetrievals: unknown;
  try {
    parsedRetrievals = JSON.parse(rawRetrievals);
  } catch {
    throw new DurableMetadataVerificationError(
      'Retrieval URLs must be a JSON array.',
    );
  }
  if (!Array.isArray(parsedRetrievals) || parsedRetrievals.length !== 2) {
    throw new DurableMetadataVerificationError(
      'Exactly two retrieval URLs are required.',
    );
  }
  const first = parseHttpsRetrievalUrl(parsedRetrievals[0]);
  const second = parseHttpsRetrievalUrl(parsedRetrievals[1]);
  if (first.origin === second.origin) {
    throw new DurableMetadataVerificationError(
      'Retrieval URLs must use two independent origins.',
    );
  }
  const retrievalUrls = Object.freeze([
    first.toString(),
    second.toString(),
  ] as const);
  const retrievalOrigins = Object.freeze([
    first.origin,
    second.origin,
  ] as const);
  return Object.freeze({
    durableUri: durable.toString(),
    retrievalUrls,
    retrievalOrigins,
  });
}

async function retrieveExactBytes(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new DurableMetadataVerificationError(
        `Metadata retrieval failed with HTTP ${response.status}.`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 10_000) {
      throw new DurableMetadataVerificationError(
        'Retrieved metadata byte length is outside the safe bound.',
      );
    }
    return bytes;
  } catch (error) {
    if (error instanceof DurableMetadataVerificationError) throw error;
    throw new DurableMetadataVerificationError('Metadata retrieval failed.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyDurableMetadataCopies(
  config: DurableMetadataVerificationConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<DurableMetadataVerificationEvidence> {
  const local = await verifyGoal9CMetadataIntegrity();
  const expectedBytes = new TextEncoder().encode(
    `${JSON.stringify(local.metadata, null, 2)}\n`,
  );
  const [first, second] = await Promise.all([
    retrieveExactBytes(config.retrievalUrls[0], fetchImpl),
    retrieveExactBytes(config.retrievalUrls[1], fetchImpl),
  ]);
  const verifyCopy = (bytes: Uint8Array, origin: string, index: number) => {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (
      bytes.length !== expectedBytes.length ||
      bytes.some((byte, byteIndex) => byte !== expectedBytes[byteIndex]) ||
      sha256 !== local.sha256
    ) {
      throw new DurableMetadataVerificationError(
        `Retrieved metadata from origin ${index + 1} does not match frozen bytes.`,
      );
    }
    return Object.freeze({
      origin,
      sha256,
      byteLength: bytes.length,
    });
  };
  const retrievals = Object.freeze([
    verifyCopy(first, config.retrievalOrigins[0], 0),
    verifyCopy(second, config.retrievalOrigins[1], 1),
  ] as const);
  return Object.freeze({
    durableUri: config.durableUri,
    sha256: local.sha256,
    byteLength: local.byteLength,
    retrievals,
    exactBytesMatch: true,
    transactionSubmitted: false,
  });
}
