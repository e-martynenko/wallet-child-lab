import { verifyGoal9CMetadataIntegrity } from '../goal9c/metadata.js';
import { readGoal9EArtifact } from '../goal9e/artifact.js';

export const IRYS_MAINNET_ORIGIN = 'https://uploader.irys.xyz';
export const IRYS_SOLANA_TOKEN = 'solana';
export const IRYS_METADATA_CONTENT_TYPE = 'application/json';
export const GOAL_9K_MAX_STORAGE_QUOTE_LAMPORTS = 100_000n;

const LAMPORTS_PER_SOL = 1_000_000_000n;

export type IrysMetadataQuoteEvidence = Readonly<{
  provider: 'Irys';
  network: 'mainnet';
  paymentToken: 'SOL';
  owner: string;
  metadataSha256: string;
  metadataByteLength: number;
  contentType: typeof IRYS_METADATA_CONTENT_TYPE;
  quoteLamports: bigint;
  quoteSol: string;
  maximumStorageQuoteLamports: bigint;
  remainingStorageQuoteLamports: bigint;
  requestMethod: 'GET';
  keyLoaded: false;
  fundingAttempted: false;
  uploadAttempted: false;
  transactionSubmitted: false;
}>;

export class IrysMetadataQuoteError extends Error {
  override readonly name = 'IrysMetadataQuoteError';
}

export function buildIrysMetadataQuoteUrl(input: Readonly<{
  owner: string;
  byteLength: number;
}>): URL {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.owner)) {
    throw new IrysMetadataQuoteError('Irys quote owner is not a Solana public key.');
  }
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0) {
    throw new IrysMetadataQuoteError('Irys quote byte length is invalid.');
  }
  const url = new URL(
    `/price/${IRYS_SOLANA_TOKEN}/${input.byteLength}`,
    IRYS_MAINNET_ORIGIN,
  );
  url.searchParams.set('address', input.owner);
  url.searchParams.append(
    'tags',
    `Content-Type|${IRYS_METADATA_CONTENT_TYPE}`,
  );
  return url;
}

export function formatLamportsAsSol(lamports: bigint): string {
  if (lamports < 0n) {
    throw new IrysMetadataQuoteError('Cannot format a negative lamport amount.');
  }
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL)
    .toString()
    .padStart(9, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function parseAtomicQuote(raw: string): bigint {
  const value = raw.trim();
  if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > 30) {
    throw new IrysMetadataQuoteError(
      'Irys returned a malformed atomic SOL quote.',
    );
  }
  return BigInt(value);
}

export async function quoteFrozenMetadataOnIrys(
  fetchImpl: typeof fetch = fetch,
): Promise<IrysMetadataQuoteEvidence> {
  const [metadata, policyArtifact] = await Promise.all([
    verifyGoal9CMetadataIntegrity(),
    readGoal9EArtifact(),
  ]);
  if (!policyArtifact) {
    throw new IrysMetadataQuoteError(
      'Goal 9E public policy artifact is required for the quote owner.',
    );
  }
  const quoteUrl = buildIrysMetadataQuoteUrl({
    owner: policyArtifact.addresses.owner,
    byteLength: metadata.byteLength,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let rawQuote: string;
  try {
    const response = await fetchImpl(quoteUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: 'text/plain' },
    });
    if (!response.ok) {
      throw new IrysMetadataQuoteError(
        `Irys storage quote failed with HTTP ${response.status}.`,
      );
    }
    rawQuote = await response.text();
    if (rawQuote.length > 64) {
      throw new IrysMetadataQuoteError('Irys storage quote response is too large.');
    }
  } catch (error) {
    if (error instanceof IrysMetadataQuoteError) throw error;
    throw new IrysMetadataQuoteError('Irys storage quote request failed.');
  } finally {
    clearTimeout(timeout);
  }
  const quoteLamports = parseAtomicQuote(rawQuote);
  if (quoteLamports > GOAL_9K_MAX_STORAGE_QUOTE_LAMPORTS) {
    throw new IrysMetadataQuoteError(
      'Irys storage quote exceeds the fixed metadata storage allowance.',
    );
  }
  return Object.freeze({
    provider: 'Irys',
    network: 'mainnet',
    paymentToken: 'SOL',
    owner: policyArtifact.addresses.owner,
    metadataSha256: metadata.sha256,
    metadataByteLength: metadata.byteLength,
    contentType: IRYS_METADATA_CONTENT_TYPE,
    quoteLamports,
    quoteSol: formatLamportsAsSol(quoteLamports),
    maximumStorageQuoteLamports: GOAL_9K_MAX_STORAGE_QUOTE_LAMPORTS,
    remainingStorageQuoteLamports:
      GOAL_9K_MAX_STORAGE_QUOTE_LAMPORTS - quoteLamports,
    requestMethod: 'GET',
    keyLoaded: false,
    fundingAttempted: false,
    uploadAttempted: false,
    transactionSubmitted: false,
  });
}
