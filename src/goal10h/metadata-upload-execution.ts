import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { z } from 'zod';

import {
  GOAL_10G_CONFIRMATION,
  GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS,
  GOAL_10G_METADATA_BYTE_LENGTH,
  GOAL_10G_METADATA_SHA256,
  readExactIrysCredit,
  reviewIrysMetadataUpload,
} from '../goal10g/metadata-upload-review.js';
import { verifyGoal9CMetadataIntegrity } from '../goal9c/metadata.js';
import { IRYS_METADATA_CONTENT_TYPE } from '../goal9k/irys-quote.js';
import { GOAL_9P_OWNER } from '../goal9p/final-contract.js';
import { loadExistingIsolatedSigner } from '../keys/isolated-key.js';
import { DEFAULT_MAINNET_READINESS_OWNER_PATH } from '../mainnet/wallets.js';

export const GOAL_10H_CONFIRMATION = GOAL_10G_CONFIRMATION;
export const GOAL_10H_ATTEMPT_PATH = resolve(
  '.wallet-child/mainnet-readiness/goal10h-upload-attempt.json',
);
export const GOAL_10H_GATEWAY_ORIGIN = 'https://gateway.irys.xyz';
export const GOAL_10H_DATA_ORIGIN = 'https://uploader.irys.xyz';

type AtomicValue = Readonly<{
  toFixed(decimalPlaces?: number): string;
}>;

type IrysUploadReceipt = Readonly<{
  id: string;
  public: string;
  signature: string;
  deadlineHeight: number;
  timestamp: number;
  version: string;
  verify(): Promise<boolean>;
}>;

export type Goal10HIrysClient = Readonly<{
  address: string;
  getBalance(address?: string): Promise<AtomicValue>;
  getPrice(
    bytes: number,
    options: {
      tags: { name: string; value: string }[];
      address: string;
    },
  ): Promise<AtomicValue>;
  upload(
    data: Buffer,
    options: { tags: { name: string; value: string }[] },
  ): Promise<IrysUploadReceipt>;
}>;

export type Goal10HUploadResult = Readonly<{
  id: string;
  durableUri: string;
  gatewayUrl: string;
  metadataSha256: typeof GOAL_10G_METADATA_SHA256;
  metadataByteLength: typeof GOAL_10G_METADATA_BYTE_LENGTH;
  contentType: typeof IRYS_METADATA_CONTENT_TYPE;
  owner: typeof GOAL_9P_OWNER;
  quoteLamports: bigint;
  creditBeforeLamports: typeof GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS;
  creditAfterLamports: bigint;
  creditSpentLamports: bigint;
  receipt: Readonly<{
    public: string;
    signature: string;
    deadlineHeight: number;
    timestamp: number;
    version: '1.0.0';
    signatureVerified: true;
  }>;
  uploadCalls: 1;
  exactGatewayBytesVerified: true;
  retrievals: readonly [Goal10HRetrieval, Goal10HRetrieval];
  twoOriginExactBytesVerified: true;
  topUpAttempted: false;
  solanaTransactionSubmitted: false;
  treasuryActionAuthorized: false;
}>;

export type Goal10HRetrieval = Readonly<{
  requestedUrl: string;
  requestedOrigin: string;
  finalUrl: string;
  finalOrigin: string;
  sha256: typeof GOAL_10G_METADATA_SHA256;
  byteLength: typeof GOAL_10G_METADATA_BYTE_LENGTH;
}>;

type OwnerMaterial = Readonly<{
  address: string;
  secretKey: Uint8Array;
}>;

type BuildIrysClient = (secretKey: Uint8Array) => Promise<Goal10HIrysClient>;
type LoadOwnerMaterial = (ownerPath: string) => Promise<OwnerMaterial>;
type ReadIrysReceipt = (id: string) => Promise<IrysUploadReceipt>;

const RecoveryTransactionSchema = z.object({
  data: z.object({
    transactions: z.object({
      edges: z.array(
        z.object({
          node: z.object({
            id: z.string(),
            address: z.string(),
            currency: z.string(),
            timestamp: z.number().int().positive(),
            tags: z.array(z.object({ name: z.string(), value: z.string() })),
          }),
        }),
      ),
    }),
  }),
});

export class IrysMetadataUploadExecutionError extends Error {
  override readonly name = 'IrysMetadataUploadExecutionError';
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function toAtomicBigint(value: AtomicValue, label: string): bigint {
  const raw = value.toFixed(0);
  if (!/^(0|[1-9][0-9]*)$/.test(raw) || raw.length > 30) {
    throw new IrysMetadataUploadExecutionError(`${label} is malformed.`);
  }
  return BigInt(raw);
}

export function assertGoal10HConfirmation(arguments_: readonly string[]): void {
  if (arguments_.length !== 1 || arguments_[0] !== GOAL_10H_CONFIRMATION) {
    throw new IrysMetadataUploadExecutionError(
      'Goal 10H upload is locked: the exact permanent-upload confirmation is required.',
    );
  }
}

async function assertUploadAttemptNotClaimed(attemptPath: string): Promise<void> {
  try {
    await lstat(attemptPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new IrysMetadataUploadExecutionError(
      'Goal 10H attempt marker cannot be inspected; upload stopped.',
    );
  }
  throw new IrysMetadataUploadExecutionError(
    'Goal 10H attempt marker already exists; do not retry blindly.',
  );
}

async function claimUploadAttempt(attemptPath: string): Promise<void> {
  const marker = {
    schemaVersion: 1,
    goal: '10H',
    state: 'PREPARED_NOT_SUBMITTED',
    metadataSha256: GOAL_10G_METADATA_SHA256,
    metadataByteLength: GOAL_10G_METADATA_BYTE_LENGTH,
    owner: GOAL_9P_OWNER,
    createdAt: new Date().toISOString(),
  };
  try {
    await writeFile(attemptPath, `${JSON.stringify(marker, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch {
    throw new IrysMetadataUploadExecutionError(
      'Goal 10H attempt marker already exists or cannot be created; do not retry blindly.',
    );
  }
}

async function updateUploadAttempt(
  attemptPath: string,
  state: string,
  id?: string,
): Promise<void> {
  let stats;
  try {
    stats = await lstat(attemptPath);
  } catch {
    throw new IrysMetadataUploadExecutionError(
      'Goal 10H attempt marker disappeared; upload stopped.',
    );
  }
  if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o077) !== 0) {
    throw new IrysMetadataUploadExecutionError(
      'Goal 10H attempt marker is not a private regular file.',
    );
  }
  const marker = {
    schemaVersion: 1,
    goal: '10H',
    state,
    metadataSha256: GOAL_10G_METADATA_SHA256,
    metadataByteLength: GOAL_10G_METADATA_BYTE_LENGTH,
    owner: GOAL_9P_OWNER,
    id: id ?? null,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(attemptPath, `${JSON.stringify(marker, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w',
    mode: 0o600,
  });
}

async function defaultLoadOwnerMaterial(ownerPath: string): Promise<OwnerMaterial> {
  const umi = createUmi('https://api.mainnet-beta.solana.com');
  const owner = await loadExistingIsolatedSigner(
    umi,
    ownerPath,
    'Mainnet-readiness owner',
    (message) => new IrysMetadataUploadExecutionError(message),
  );
  const address = String(owner.publicKey);
  if (address !== GOAL_9P_OWNER) {
    throw new IrysMetadataUploadExecutionError(
      'Loaded owner key does not match the confirmed Irys credit owner.',
    );
  }
  return Object.freeze({ address, secretKey: owner.secretKey });
}

async function defaultBuildIrysClient(
  secretKey: Uint8Array,
): Promise<Goal10HIrysClient> {
  const [{ Uploader }, { Solana }] = await Promise.all([
    import('@irys/upload'),
    import('@irys/upload-solana'),
  ]);
  return await Uploader(Solana)
    .mainnet()
    .withWallet(secretKey)
    .withTokenOptions({ finality: 'finalized', disablePriorityFees: true })
    .timeout(30_000);
}

async function defaultReadIrysReceipt(id: string): Promise<IrysUploadReceipt> {
  const umi = createUmi('https://api.mainnet-beta.solana.com');
  const irys = await defaultBuildIrysClient(umi.eddsa.generateKeypair().secretKey);
  const client = irys as Goal10HIrysClient & {
    utils: { getReceipt(transactionId: string): Promise<IrysUploadReceipt> };
  };
  return client.utils.getReceipt(id);
}

async function retrieveExactCopy(
  requestedUrl: string,
  expectedBytes: Buffer,
  fetchImpl: typeof fetch,
  wait: (milliseconds: number) => Promise<void>,
): Promise<Goal10HRetrieval> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetchImpl(requestedUrl, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (
          bytes.length === expectedBytes.length &&
          bytes.equals(expectedBytes) &&
          sha256(bytes) === GOAL_10G_METADATA_SHA256
        ) {
          const finalUrl = new URL(response.url || requestedUrl);
          const requested = new URL(requestedUrl);
          if (
            finalUrl.protocol !== 'https:' ||
            finalUrl.username ||
            finalUrl.password ||
            (finalUrl.origin !== requested.origin &&
              !finalUrl.hostname.endsWith('.datasprite-cdn.com'))
          ) {
            throw new IrysMetadataUploadExecutionError(
              'Irys retrieval redirected outside the reviewed HTTPS CDN boundary.',
            );
          }
          return Object.freeze({
            requestedUrl,
            requestedOrigin: requested.origin,
            finalUrl: finalUrl.toString(),
            finalOrigin: finalUrl.origin,
            sha256: GOAL_10G_METADATA_SHA256,
            byteLength: GOAL_10G_METADATA_BYTE_LENGTH,
          });
        }
        throw new IrysMetadataUploadExecutionError(
          'Irys gateway returned bytes that do not match the confirmed metadata.',
        );
      }
    } catch (error) {
      if (error instanceof IrysMetadataUploadExecutionError) throw error;
    }
    await wait(1_000);
  }
  throw new IrysMetadataUploadExecutionError(
    'Exact Irys readback is not available yet; do not upload again.',
  );
}

async function retrieveExactCopies(
  id: string,
  expectedBytes: Buffer,
  fetchImpl: typeof fetch,
  wait: (milliseconds: number) => Promise<void>,
): Promise<readonly [Goal10HRetrieval, Goal10HRetrieval]> {
  const gatewayUrl = new URL(`/${id}`, GOAL_10H_GATEWAY_ORIGIN).toString();
  const dataUrl = new URL(`/tx/${id}/data`, GOAL_10H_DATA_ORIGIN).toString();
  const copies = await Promise.all([
    retrieveExactCopy(gatewayUrl, expectedBytes, fetchImpl, wait),
    retrieveExactCopy(dataUrl, expectedBytes, fetchImpl, wait),
  ]);
  if (
    copies[0].requestedOrigin === copies[1].requestedOrigin ||
    copies[0].finalOrigin === copies[1].finalOrigin
  ) {
    throw new IrysMetadataUploadExecutionError(
      'Irys exact-byte readback did not use two distinct origins.',
    );
  }
  return Object.freeze(copies as [Goal10HRetrieval, Goal10HRetrieval]);
}

async function waitForCreditAfterUpload(
  minimum: bigint,
  maximum: bigint,
  fetchImpl: typeof fetch,
  wait: (milliseconds: number) => Promise<void>,
): Promise<bigint> {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const credit = await readExactIrysCredit(fetchImpl);
    if (credit >= minimum && credit <= maximum) return credit;
    if (credit > GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS) {
      throw new IrysMetadataUploadExecutionError(
        'Irys credit increased unexpectedly after upload.',
      );
    }
    await wait(1_000);
  }
  throw new IrysMetadataUploadExecutionError(
    'Irys credit readback is outside the confirmed spend bound; do not upload again.',
  );
}

function assertReceiptShape(uploaded: IrysUploadReceipt): void {
  if (
    !/^[A-Za-z0-9_-]{43,44}$/.test(uploaded.id) ||
    uploaded.version !== '1.0.0' ||
    !Number.isSafeInteger(uploaded.deadlineHeight) ||
    uploaded.deadlineHeight < 0 ||
    !Number.isSafeInteger(uploaded.timestamp) ||
    uploaded.timestamp <= 0 ||
    !uploaded.public ||
    !uploaded.signature
  ) {
    throw new IrysMetadataUploadExecutionError(
      'Irys upload returned a malformed receipt; do not upload again.',
    );
  }
}

export async function executeGoal10HIrysMetadataUpload(
  arguments_: readonly string[],
  fetchImpl: typeof fetch = fetch,
  ownerPath = DEFAULT_MAINNET_READINESS_OWNER_PATH,
  attemptPath = GOAL_10H_ATTEMPT_PATH,
  buildIrysClient: BuildIrysClient = defaultBuildIrysClient,
  loadOwnerMaterial: LoadOwnerMaterial = defaultLoadOwnerMaterial,
  wait: (milliseconds: number) => Promise<void> =
    (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<Goal10HUploadResult> {
  assertGoal10HConfirmation(arguments_);
  await assertUploadAttemptNotClaimed(attemptPath);

  // All public and source-contract checks must pass before the attempt marker
  // is claimed and before the SDK wallet or local owner key is touched.
  const [review, metadata, metadataBytes] = await Promise.all([
    reviewIrysMetadataUpload(fetchImpl),
    verifyGoal9CMetadataIntegrity(),
    readFile('metadata/wallet-child-001.mainnet-candidate.json'),
  ]);
  if (
    review.confirmationPhrase !== GOAL_10H_CONFIRMATION ||
    review.freshTaggedQuoteLamports > GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS ||
    metadata.sha256 !== GOAL_10G_METADATA_SHA256 ||
    metadata.byteLength !== GOAL_10G_METADATA_BYTE_LENGTH ||
    metadataBytes.length !== GOAL_10G_METADATA_BYTE_LENGTH ||
    sha256(metadataBytes) !== GOAL_10G_METADATA_SHA256
  ) {
    throw new IrysMetadataUploadExecutionError(
      'Goal 10H metadata, quote, credit, or confirmation contract drifted.',
    );
  }

  await claimUploadAttempt(attemptPath);
  const owner = await loadOwnerMaterial(ownerPath);
  if (owner.address !== GOAL_9P_OWNER || owner.secretKey.length !== 64) {
    throw new IrysMetadataUploadExecutionError(
      'Goal 10H owner material does not match the confirmed owner.',
    );
  }
  const irys = await buildIrysClient(owner.secretKey);
  if (irys.address !== GOAL_9P_OWNER) {
    throw new IrysMetadataUploadExecutionError(
      'Initialized Irys wallet address does not match the funded owner.',
    );
  }
  const tags = [
    { name: 'Content-Type', value: IRYS_METADATA_CONTENT_TYPE },
  ];
  const sdkCredit = toAtomicBigint(
    await irys.getBalance(GOAL_9P_OWNER),
    'Irys SDK credit',
  );
  const sdkQuote = toAtomicBigint(
    await irys.getPrice(GOAL_10G_METADATA_BYTE_LENGTH, {
      tags,
      address: GOAL_9P_OWNER,
    }),
    'Irys SDK tagged quote',
  );
  if (
    sdkCredit !== GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS ||
    sdkQuote !== review.freshTaggedQuoteLamports ||
    sdkQuote > sdkCredit
  ) {
    throw new IrysMetadataUploadExecutionError(
      'Irys SDK credit or tagged quote changed after wallet initialization.',
    );
  }

  await updateUploadAttempt(attemptPath, 'UPLOAD_CALL_STARTED_RESULT_UNKNOWN');
  let uploaded: IrysUploadReceipt;
  try {
    // Exactly one upload call. Never retry this call automatically because a
    // transport error can be ambiguous after the uploader accepted the item.
    uploaded = await irys.upload(metadataBytes, { tags });
  } catch {
    throw new IrysMetadataUploadExecutionError(
      'Irys upload returned an error with an ambiguous submission state; do not retry.',
    );
  }
  assertReceiptShape(uploaded);
  await updateUploadAttempt(attemptPath, 'UPLOAD_RECEIPT_RETURNED', uploaded.id);
  if (!(await uploaded.verify())) {
    throw new IrysMetadataUploadExecutionError(
      'Irys upload receipt signature verification failed; do not upload again.',
    );
  }

  const minimumCreditAfter = sdkCredit - sdkQuote;
  const [retrievals, creditAfterLamports] = await Promise.all([
    retrieveExactCopies(uploaded.id, metadataBytes, fetchImpl, wait),
    waitForCreditAfterUpload(
      minimumCreditAfter,
      GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS,
      fetchImpl,
      wait,
    ),
  ]);
  await updateUploadAttempt(attemptPath, 'UPLOAD_VERIFIED', uploaded.id);

  return Object.freeze({
    id: uploaded.id,
    durableUri: `${GOAL_10H_GATEWAY_ORIGIN}/${uploaded.id}`,
    gatewayUrl: retrievals[0].requestedUrl,
    metadataSha256: GOAL_10G_METADATA_SHA256,
    metadataByteLength: GOAL_10G_METADATA_BYTE_LENGTH,
    contentType: IRYS_METADATA_CONTENT_TYPE,
    owner: GOAL_9P_OWNER,
    quoteLamports: sdkQuote,
    creditBeforeLamports: GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS,
    creditAfterLamports,
    creditSpentLamports:
      GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS - creditAfterLamports,
    receipt: Object.freeze({
      public: uploaded.public,
      signature: uploaded.signature,
      deadlineHeight: uploaded.deadlineHeight,
      timestamp: uploaded.timestamp,
      version: '1.0.0',
      signatureVerified: true,
    }),
    uploadCalls: 1,
    exactGatewayBytesVerified: true,
    retrievals,
    twoOriginExactBytesVerified: true,
    topUpAttempted: false,
    solanaTransactionSubmitted: false,
    treasuryActionAuthorized: false,
  });
}

async function readRecoveryTransaction(
  id: string,
  fetchImpl: typeof fetch,
): Promise<number> {
  const response = await fetchImpl(new URL('/graphql', GOAL_10H_DATA_ORIGIN), {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      query:
        'query ($ids: [String!]) { transactions(ids: $ids) { edges { node { ' +
        'id address currency timestamp tags { name value } } } } }',
      variables: { ids: [id] },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new IrysMetadataUploadExecutionError(
      `Irys recovery query returned HTTP ${response.status}.`,
    );
  }
  const parsed = RecoveryTransactionSchema.safeParse(await response.json());
  const node = parsed.success ? parsed.data.data.transactions.edges[0]?.node : null;
  if (
    !node ||
    node.id !== id ||
    node.address !== GOAL_9P_OWNER ||
    node.currency !== 'solana' ||
    node.tags.length !== 1 ||
    node.tags[0]?.name !== 'Content-Type' ||
    node.tags[0]?.value !== IRYS_METADATA_CONTENT_TYPE
  ) {
    throw new IrysMetadataUploadExecutionError(
      'Recovered Irys transaction does not match the confirmed owner and tag.',
    );
  }
  return node.timestamp;
}

export async function recoverGoal10HAcceptedUpload(
  id: string,
  fetchImpl: typeof fetch = fetch,
  attemptPath = GOAL_10H_ATTEMPT_PATH,
  readIrysReceipt: ReadIrysReceipt = defaultReadIrysReceipt,
  wait: (milliseconds: number) => Promise<void> =
    (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<Goal10HUploadResult> {
  if (!/^[A-Za-z0-9_-]{43,44}$/.test(id)) {
    throw new IrysMetadataUploadExecutionError('Recovered Irys ID is malformed.');
  }
  let marker: unknown;
  try {
    marker = JSON.parse(await readFile(attemptPath, 'utf8')) as unknown;
  } catch {
    throw new IrysMetadataUploadExecutionError(
      'Goal 10H recovery requires the private attempt marker.',
    );
  }
  const parsedMarker = z
    .object({
      goal: z.literal('10H'),
      state: z.literal('UPLOAD_CALL_STARTED_RESULT_UNKNOWN'),
      metadataSha256: z.literal(GOAL_10G_METADATA_SHA256),
      metadataByteLength: z.literal(GOAL_10G_METADATA_BYTE_LENGTH),
      owner: z.literal(GOAL_9P_OWNER),
    })
    .safeParse(marker);
  if (!parsedMarker.success) {
    throw new IrysMetadataUploadExecutionError(
      'Goal 10H attempt marker is not in the recoverable state.',
    );
  }

  const metadataBytes = await readFile(
    'metadata/wallet-child-001.mainnet-candidate.json',
  );
  if (
    metadataBytes.length !== GOAL_10G_METADATA_BYTE_LENGTH ||
    sha256(metadataBytes) !== GOAL_10G_METADATA_SHA256
  ) {
    throw new IrysMetadataUploadExecutionError(
      'Frozen metadata changed before Goal 10H recovery.',
    );
  }

  const [review, uploaded, transactionTimestamp] = await Promise.all([
    reviewIrysMetadataUpload(fetchImpl),
    readIrysReceipt(id),
    readRecoveryTransaction(id, fetchImpl),
  ]);
  assertReceiptShape(uploaded);
  if (
    uploaded.id !== id ||
    uploaded.timestamp !== transactionTimestamp ||
    !(await uploaded.verify())
  ) {
    throw new IrysMetadataUploadExecutionError(
      'Recovered Irys receipt signature verification failed.',
    );
  }
  const [retrievals, creditAfterLamports] = await Promise.all([
    retrieveExactCopies(id, metadataBytes, fetchImpl, wait),
    waitForCreditAfterUpload(
      0n,
      GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS,
      fetchImpl,
      wait,
    ),
  ]);
  await updateUploadAttempt(attemptPath, 'UPLOAD_VERIFIED_RECOVERED', id);

  return Object.freeze({
    id,
    durableUri: `${GOAL_10H_GATEWAY_ORIGIN}/${id}`,
    gatewayUrl: retrievals[0].requestedUrl,
    metadataSha256: GOAL_10G_METADATA_SHA256,
    metadataByteLength: GOAL_10G_METADATA_BYTE_LENGTH,
    contentType: IRYS_METADATA_CONTENT_TYPE,
    owner: GOAL_9P_OWNER,
    quoteLamports: review.freshTaggedQuoteLamports,
    creditBeforeLamports: GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS,
    creditAfterLamports,
    creditSpentLamports:
      GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS - creditAfterLamports,
    receipt: Object.freeze({
      public: uploaded.public,
      signature: uploaded.signature,
      deadlineHeight: uploaded.deadlineHeight,
      timestamp: uploaded.timestamp,
      version: '1.0.0',
      signatureVerified: true,
    }),
    uploadCalls: 1,
    exactGatewayBytesVerified: true,
    retrievals,
    twoOriginExactBytesVerified: true,
    topUpAttempted: false,
    solanaTransactionSubmitted: false,
    treasuryActionAuthorized: false,
  });
}
