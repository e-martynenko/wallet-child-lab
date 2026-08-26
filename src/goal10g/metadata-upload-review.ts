import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import { verifyInstalledIrysSdkContract } from '../goal10e/irys-action-review.js';
import { verifyGoal9CMetadataIntegrity } from '../goal9c/metadata.js';
import {
  IRYS_MAINNET_ORIGIN,
  IRYS_METADATA_CONTENT_TYPE,
  quoteFrozenMetadataOnIrys,
} from '../goal9k/irys-quote.js';
import { GOAL_9P_OWNER } from '../goal9p/final-contract.js';

export const GOAL_10G_METADATA_SHA256 =
  '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c';
export const GOAL_10G_METADATA_BYTE_LENGTH = 351;
export const GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS = 3_208n;
export const GOAL_10G_UPLOAD_CORE_VERSION = '0.0.10';
export const GOAL_10G_UPLOAD_CORE_INTEGRITY =
  'sha512-E7kCNSOTPqwBbnd2wnnklPrR0HtLnENmu5NVhgs+B9cUeyN9AcvzRDOJLKNmYS6q514bDwb/PUgB+vP/070now==';
export const GOAL_10G_CONFIRMATION =
  'CONFIRM PERMANENT PUBLIC IRYS METADATA UPLOAD 351 BYTES WITH SHA256 ' +
  `${GOAL_10G_METADATA_SHA256} FROM OWNER ${GOAL_9P_OWNER} USING AT MOST ` +
  '3208 LAMPORTS OF EXISTING IRYS CREDIT WITH CONTENT-TYPE application/json';

const EXPECTED_CORE_SOURCE_HASHES = Object.freeze({
  irys: 'c4321e59ad2cf03bb5dd534addc66a018a596e6425478d080e013358287c5e8d',
  upload: '223f26b926f69a289e81b5b36d2ae55faa71d9867d539de2285ccdaddde80037',
  utils: '22431befe1ad1c6c754f69a18f69be6c502af1cfd57de30fd19b2c9bfd5b9c2b',
});

const CorePackageSchema = z.object({
  name: z.literal('@irys/upload-core'),
  version: z.literal(GOAL_10G_UPLOAD_CORE_VERSION),
  sideEffects: z.literal(false),
});
const IrysBalanceSchema = z.object({
  balance: z.string().regex(/^(0|[1-9][0-9]*)$/),
});
const Goal10FFundingReceiptSchema = z.object({
  goal: z.literal('10F'),
  network: z.literal('mainnet-beta'),
  status: z.literal('FINALIZED_IRYS_FUNDING_CREDITED'),
  actionTimeConfirmation: z.object({
    uploadIncluded: z.literal(false),
  }),
  irysCredit: z.object({
    owner: z.literal(GOAL_9P_OWNER),
    token: z.literal('solana'),
    creditedLamports: z.literal('3208'),
    registered: z.literal(true),
  }),
  checks: z.object({
    sdkWalletInitialized: z.literal(false),
    uploadAttempted: z.literal(false),
    topUpAllowed: z.literal(false),
  }),
  verdict: z.literal('IRYS_FUNDING_PASS_STOP_BEFORE_UPLOAD'),
});

export type IrysUploadSourceEvidence = Readonly<{
  uploadCoreVersion: typeof GOAL_10G_UPLOAD_CORE_VERSION;
  uploadCoreRegistryIntegrityVerified: true;
  directBufferUploadAvailable: true;
  bufferSignedAsOneDataItem: true;
  uploadPostsToSolanaTokenEndpoint: true;
  contentTypeTagIncludedInQuote: true;
  receiptSignatureVerificationAvailable: true;
  sourceHashesVerified: true;
}>;

export type IrysMetadataUploadReview = Readonly<{
  network: 'mainnet';
  owner: typeof GOAL_9P_OWNER;
  metadataSha256: typeof GOAL_10G_METADATA_SHA256;
  metadataByteLength: typeof GOAL_10G_METADATA_BYTE_LENGTH;
  contentType: typeof IRYS_METADATA_CONTENT_TYPE;
  irysCreditLamports: typeof GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS;
  freshTaggedQuoteLamports: bigint;
  maximumCreditSpendLamports: typeof GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS;
  topUpAllowed: false;
  solanaTransactionIncluded: false;
  uploadMethod: 'irys.upload(exactBuffer, { tags: [Content-Type] })';
  dataItems: 1;
  publicUpload: true;
  intendedPermanentUpload: true;
  receiptSignatureVerificationRequired: true;
  exactGatewayReadbackRequired: true;
  twoOriginDurabilityVerificationRequired: true;
  confirmationPhrase: typeof GOAL_10G_CONFIRMATION;
  confirmationReceived: false;
  keyLoaded: false;
  sdkWalletInitialized: false;
  uploadAttempted: false;
  networkWrite: false;
  verdict: 'STOP_AWAITING_EXACT_PERMANENT_UPLOAD_CONFIRMATION';
}>;

export class IrysMetadataUploadReviewError extends Error {
  override readonly name = 'IrysMetadataUploadReviewError';
}

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new IrysMetadataUploadReviewError(`${label} is not valid JSON.`);
  }
}

function assertIncludes(raw: string, values: readonly string[], label: string): void {
  if (values.some((value) => !raw.includes(value))) {
    throw new IrysMetadataUploadReviewError(`${label} contract changed.`);
  }
}

export async function verifyIrysUploadSourceContract(
  projectRoot = process.cwd(),
): Promise<IrysUploadSourceEvidence> {
  let coreRoot: string;
  try {
    const uploadPackage = await realpath(
      resolve(projectRoot, 'node_modules/@irys/upload/package.json'),
    );
    const requireFromUpload = createRequire(uploadPackage);
    const coreEntrypoint = requireFromUpload.resolve('@irys/upload-core');
    coreRoot = resolve(dirname(coreEntrypoint), '../..');
  } catch {
    throw new IrysMetadataUploadReviewError(
      'Pinned Irys upload-core installation is unavailable.',
    );
  }

  let packageRaw: string;
  let lockfile: string;
  let irysSource: string;
  let uploadSource: string;
  let utilsSource: string;
  try {
    [packageRaw, lockfile, irysSource, uploadSource, utilsSource] =
      await Promise.all([
        readFile(resolve(coreRoot, 'package.json'), 'utf8'),
        readFile(resolve(projectRoot, 'pnpm-lock.yaml'), 'utf8'),
        readFile(resolve(coreRoot, 'src/irys.ts'), 'utf8'),
        readFile(resolve(coreRoot, 'src/upload.ts'), 'utf8'),
        readFile(resolve(coreRoot, 'src/utils.ts'), 'utf8'),
      ]);
  } catch {
    throw new IrysMetadataUploadReviewError(
      'Reviewed Irys upload source is incomplete.',
    );
  }

  const parsedPackage = CorePackageSchema.safeParse(
    parseJson(packageRaw, 'Irys upload-core package'),
  );
  if (
    !parsedPackage.success ||
    !lockfile.includes(`'@irys/upload-core@${GOAL_10G_UPLOAD_CORE_VERSION}':`) ||
    !lockfile.includes(`integrity: ${GOAL_10G_UPLOAD_CORE_INTEGRITY}`)
  ) {
    throw new IrysMetadataUploadReviewError(
      'Pinned Irys upload-core version or registry integrity changed.',
    );
  }

  const hashes = {
    irys: sha256(irysSource),
    upload: sha256(uploadSource),
    utils: sha256(utilsSource),
  };
  if (
    Object.entries(EXPECTED_CORE_SOURCE_HASHES).some(
      ([name, hash]) => hashes[name as keyof typeof hashes] !== hash,
    )
  ) {
    throw new IrysMetadataUploadReviewError(
      'Reviewed Irys upload-core source changed.',
    );
  }

  assertIncludes(
    irysSource,
    [
      'async upload(',
      'return this.uploader.uploadData(data, opts)',
      'return Utils.verifyReceipt(this.bundles, receipt)',
    ],
    'Irys direct upload',
  );
  assertIncludes(
    uploadSource,
    [
      'if (Buffer.isBuffer(data))',
      'this.bundles.createData(',
      'await dataItem.sign(this.tokenConfig.getSigner())',
      'new URL(`/tx/${this.token}`, url)',
      "'Content-Type': 'application/octet-stream'",
      'this.utils.verifyReceipt(res.data as UploadReceipt)',
    ],
    'Irys signed data-item upload',
  );
  assertIncludes(
    utilsSource,
    [
      'path + `?address=${address}`',
      'b + `&tags=${t.name}|${t.value}`',
      'static async verifyReceipt(',
    ],
    'Irys tagged quote and receipt verification',
  );

  return Object.freeze({
    uploadCoreVersion: GOAL_10G_UPLOAD_CORE_VERSION,
    uploadCoreRegistryIntegrityVerified: true,
    directBufferUploadAvailable: true,
    bufferSignedAsOneDataItem: true,
    uploadPostsToSolanaTokenEndpoint: true,
    contentTypeTagIncludedInQuote: true,
    receiptSignatureVerificationAvailable: true,
    sourceHashesVerified: true,
  });
}

export async function readExactIrysCredit(
  fetchImpl: typeof fetch = fetch,
): Promise<bigint> {
  const url = new URL('/account/balance/solana', IRYS_MAINNET_ORIGIN);
  url.searchParams.set('address', GOAL_9P_OWNER);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new IrysMetadataUploadReviewError('Irys credit read failed.');
  }
  if (!response.ok) {
    throw new IrysMetadataUploadReviewError(
      `Irys credit read returned HTTP ${response.status}.`,
    );
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new IrysMetadataUploadReviewError('Irys credit read returned invalid JSON.');
  }
  const parsed = IrysBalanceSchema.safeParse(value);
  if (!parsed.success) {
    throw new IrysMetadataUploadReviewError('Irys credit read is malformed.');
  }
  return BigInt(parsed.data.balance);
}

async function verifyGoal10FFundingReceipt(projectRoot: string): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(
      resolve(
        projectRoot,
        'artifacts/wallet-child-001.goal10f.irys-funding-receipt.json',
      ),
      'utf8',
    );
  } catch {
    throw new IrysMetadataUploadReviewError(
      'Finalized Goal 10F funding receipt is unavailable.',
    );
  }
  const parsed = Goal10FFundingReceiptSchema.safeParse(
    parseJson(raw, 'Goal 10F funding receipt'),
  );
  if (!parsed.success) {
    throw new IrysMetadataUploadReviewError(
      'Finalized Goal 10F funding receipt changed.',
    );
  }
}

export async function reviewIrysMetadataUpload(
  fetchImpl: typeof fetch = fetch,
  projectRoot = process.cwd(),
): Promise<IrysMetadataUploadReview> {
  const [metadata, sdk, source, quote, credit] = await Promise.all([
    verifyGoal9CMetadataIntegrity(
      resolve(projectRoot, 'metadata/wallet-child-001.mainnet-candidate.json'),
      resolve(
        projectRoot,
        'metadata/wallet-child-001.mainnet-candidate.integrity.json',
      ),
    ),
    verifyInstalledIrysSdkContract(projectRoot),
    verifyIrysUploadSourceContract(projectRoot),
    quoteFrozenMetadataOnIrys(fetchImpl),
    readExactIrysCredit(fetchImpl),
    verifyGoal10FFundingReceipt(projectRoot),
  ]);

  if (
    metadata.sha256 !== GOAL_10G_METADATA_SHA256 ||
    metadata.byteLength !== GOAL_10G_METADATA_BYTE_LENGTH ||
    quote.owner !== GOAL_9P_OWNER ||
    quote.metadataSha256 !== GOAL_10G_METADATA_SHA256 ||
    quote.metadataByteLength !== GOAL_10G_METADATA_BYTE_LENGTH ||
    quote.contentType !== IRYS_METADATA_CONTENT_TYPE ||
    quote.quoteLamports > GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS ||
    credit !== GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS ||
    source.uploadCoreVersion !== GOAL_10G_UPLOAD_CORE_VERSION ||
    sdk.audit.acceptance !==
      'BOUNDED_TO_EXACT_SOLANA_PATH_RECHECK_BEFORE_KEY_LOAD'
  ) {
    throw new IrysMetadataUploadReviewError(
      'Permanent upload review stopped because metadata, quote, credit, or SDK drifted.',
    );
  }

  return Object.freeze({
    network: 'mainnet',
    owner: GOAL_9P_OWNER,
    metadataSha256: GOAL_10G_METADATA_SHA256,
    metadataByteLength: GOAL_10G_METADATA_BYTE_LENGTH,
    contentType: IRYS_METADATA_CONTENT_TYPE,
    irysCreditLamports: GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS,
    freshTaggedQuoteLamports: quote.quoteLamports,
    maximumCreditSpendLamports: GOAL_10G_EXISTING_IRYS_CREDIT_LAMPORTS,
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
}
