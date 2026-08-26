import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { z } from 'zod';

import {
  type MetadataPublicationPlan,
  GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS,
  GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
} from '../goal10d/metadata-publication-plan.js';
import { GOAL_9P_OWNER } from '../goal9p/final-contract.js';

export const GOAL_10E_UPLOAD_VERSION = '0.0.15';
export const GOAL_10E_SOLANA_VERSION = '0.1.8';
export const GOAL_10E_UPLOAD_INTEGRITY =
  'sha512-VS1ieI8Hipv7F/odL2rDfn0S9VCwj3GFhROI8el0RjzpcaXCobezP0V4yuvppyB+E4Oiu6xQTXooaIBh/S7xPA==';
export const GOAL_10E_SOLANA_INTEGRITY =
  'sha512-pJyG8uJ3NIpbIGDA9hYRHij5xF1DrU0QMa4i2mVJlYwbSdQfNdcJ8SdT4ZsrTh1g/+OWMzbo2l/ziMY1Js9HGA==';
export const GOAL_10E_LOCKFILE_SHA256 =
  '25cfa944c94962b4d39a2c9ecbc7de1d5fc57dbc05ffff104ce27da5f1da50f6';

const EXPECTED_SOURCE_HASHES = Object.freeze({
  uploadBuilder:
    'bbab908e36f7a5037db98a5a39fa0d0f3d8b4c48c928f4b5929d6092b700d9e9',
  uploadImplementation:
    'e9c2cf32bffed84fd4d8525752bb7c9139562e9b8505cdb7be0ec522f21c3719',
  solanaEntrypoint:
    '03598434835ef3170307201949ce77aebc1f7ee78556266fe327bdbfb8ecec40',
  solanaToken:
    'd94d768639b5fc08af7caf4bd0559fc0f935f405c879aff7e09ea8d126766caa',
});

const PackageSchema = z.object({
  name: z.string(),
  version: z.string(),
  sideEffects: z.literal(false),
});

export type IrysSdkReviewEvidence = Readonly<{
  packages: Readonly<{
    upload: typeof GOAL_10E_UPLOAD_VERSION;
    solana: typeof GOAL_10E_SOLANA_VERSION;
    exactRegistryIntegrityVerified: true;
    installedProductionPackagesAdded: 204;
    ignoredNativeBuildScripts: readonly [
      'bigint-buffer@1.1.5',
      'keccak@3.0.4',
      'secp256k1@5.0.2',
    ];
  }>;
  sourceContract: Readonly<{
    mainnetDefault: true;
    finalizedDefault: true;
    nativeSolanaEntrypointExcludesSplAdapter: true;
    fundingUsesSystemTransfer: true;
    priorityFeesCanBeDisabled: true;
    uploadFileAvailable: true;
    completeLockfileHashVerified: true;
    sourceHashesVerified: true;
  }>;
  audit: Readonly<{
    clean: false;
    findings: 5;
    high: 2;
    moderate: 2;
    low: 1;
    vulnerableBigintBufferNotImportedByNativeSolanaEntrypoint: true;
    vulnerableWs818NotLoadedByReviewedImport: true;
    loadedWs8213PatchedForReportedAdvisories: true;
    ellipticLoadedButSolanaSignerUsesNobleEd25519: true;
    uuid8LoadedButReviewedJaysonPathUsesV4Only: true;
    acceptance: 'BOUNDED_TO_EXACT_SOLANA_PATH_RECHECK_BEFORE_KEY_LOAD';
  }>;
  sdkImportedByLab: false;
  walletProvidedToSdk: false;
  keyLoaded: false;
}>;

export type IrysFundingActionReview = Readonly<{
  network: 'mainnet-beta';
  owner: typeof GOAL_9P_OWNER;
  destination: typeof GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS;
  metadataSha256: string;
  metadataByteLength: number;
  fundingLamports: bigint;
  feeCapLamports: typeof GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS;
  maximumOwnerOutflowLamports: bigint;
  confirmationPhrase: string;
  confirmationReceived: false;
  fundingScope: 'ONE_EXACT_SOLANA_TRANSFER_AND_IRYS_CREDIT_REGISTRATION';
  uploadIncluded: false;
  uploadConfirmationDeferred: true;
  unsigned: true;
  keyLoaded: false;
  sdkWalletInitialized: false;
  fundingAttempted: false;
  uploadAttempted: false;
  transactionSubmitted: false;
  verdict: 'STOP_AWAITING_EXACT_IRYS_FUNDING_CONFIRMATION';
}>;

export class IrysActionReviewError extends Error {
  override readonly name = 'IrysActionReviewError';
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new IrysActionReviewError(`${label} is not valid JSON.`);
  }
}

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function assertIncludes(raw: string, values: readonly string[], label: string): void {
  if (values.some((value) => !raw.includes(value))) {
    throw new IrysActionReviewError(`${label} contract changed.`);
  }
}

export async function verifyInstalledIrysSdkContract(
  projectRoot = process.cwd(),
): Promise<IrysSdkReviewEvidence> {
  const paths = {
    packageJson: resolve(projectRoot, 'package.json'),
    lockfile: resolve(projectRoot, 'pnpm-lock.yaml'),
    uploadPackage: resolve(projectRoot, 'node_modules/@irys/upload/package.json'),
    solanaPackage: resolve(
      projectRoot,
      'node_modules/@irys/upload-solana/package.json',
    ),
    uploadBuilder: resolve(
      projectRoot,
      'node_modules/@irys/upload/src/builder.ts',
    ),
    uploadImplementation: resolve(
      projectRoot,
      'node_modules/@irys/upload/src/upload.ts',
    ),
    solanaEntrypoint: resolve(
      projectRoot,
      'node_modules/@irys/upload-solana/src/index.ts',
    ),
    solanaToken: resolve(
      projectRoot,
      'node_modules/@irys/upload-solana/src/token.ts',
    ),
  };
  let values: string[];
  try {
    values = await Promise.all(Object.values(paths).map((path) => readFile(path, 'utf8')));
  } catch {
    throw new IrysActionReviewError('Pinned Irys installation is incomplete.');
  }
  const [rootRaw, lockfile, uploadPackageRaw, solanaPackageRaw, uploadBuilder,
    uploadImplementation, solanaEntrypoint, solanaToken] = values;
  if (
    !rootRaw ||
    !lockfile ||
    !uploadPackageRaw ||
    !solanaPackageRaw ||
    !uploadBuilder ||
    !uploadImplementation ||
    !solanaEntrypoint ||
    !solanaToken
  ) {
    throw new IrysActionReviewError('Pinned Irys installation is incomplete.');
  }
  const root = z
    .object({
      dependencies: z.object({
        '@irys/upload': z.literal(GOAL_10E_UPLOAD_VERSION),
        '@irys/upload-solana': z.literal(GOAL_10E_SOLANA_VERSION),
      }),
    })
    .safeParse(parseJson(rootRaw, 'Project package'));
  const uploadPackage = PackageSchema.safeParse(
    parseJson(uploadPackageRaw, 'Irys upload package'),
  );
  const solanaPackage = PackageSchema.safeParse(
    parseJson(solanaPackageRaw, 'Irys Solana package'),
  );
  if (
    !root.success ||
    !uploadPackage.success ||
    uploadPackage.data.name !== '@irys/upload' ||
    uploadPackage.data.version !== GOAL_10E_UPLOAD_VERSION ||
    !solanaPackage.success ||
    solanaPackage.data.name !== '@irys/upload-solana' ||
    solanaPackage.data.version !== GOAL_10E_SOLANA_VERSION
  ) {
    throw new IrysActionReviewError('Pinned Irys package versions changed.');
  }
  assertIncludes(
    lockfile,
    [
      `'@irys/upload@${GOAL_10E_UPLOAD_VERSION}':`,
      `integrity: ${GOAL_10E_UPLOAD_INTEGRITY}`,
      `'@irys/upload-solana@${GOAL_10E_SOLANA_VERSION}':`,
      `integrity: ${GOAL_10E_SOLANA_INTEGRITY}`,
    ],
    'Irys lockfile integrity',
  );
  if (sha256(lockfile) !== GOAL_10E_LOCKFILE_SHA256) {
    throw new IrysActionReviewError('Complete production lockfile changed.');
  }
  const hashes = {
    uploadBuilder: sha256(uploadBuilder),
    uploadImplementation: sha256(uploadImplementation),
    solanaEntrypoint: sha256(solanaEntrypoint),
    solanaToken: sha256(solanaToken),
  };
  if (
    Object.entries(EXPECTED_SOURCE_HASHES).some(
      ([name, hash]) => hashes[name as keyof typeof hashes] !== hash,
    )
  ) {
    throw new IrysActionReviewError('Reviewed Irys package source changed.');
  }
  assertIncludes(
    uploadBuilder,
    ["url: 'mainnet'", 'withWallet(wallet: any)', 'withRpc(rpcUrl: string)',
      'withTokenOptions(opts: any)'],
    'Irys builder',
  );
  assertIncludes(
    uploadImplementation,
    ['uploadFile(', 'return await this.uploadData(data, opts)'],
    'Irys upload',
  );
  assertIncludes(
    solanaToken,
    [
      "protected finality: Finality = 'finalized'",
      'SystemProgram.transfer({',
      'disablePriorityFees',
      'sendAndConfirmTransaction(',
      'new HexSolanaSigner(',
    ],
    'Irys native SOL adapter',
  );
  if (
    solanaEntrypoint.includes('@solana/spl-token') ||
    solanaToken.includes('@solana/spl-token') ||
    solanaToken.includes('bigint-buffer') ||
    solanaToken.includes('elliptic')
  ) {
    throw new IrysActionReviewError(
      'Native Solana entrypoint dependency boundary changed.',
    );
  }

  return Object.freeze({
    packages: Object.freeze({
      upload: GOAL_10E_UPLOAD_VERSION,
      solana: GOAL_10E_SOLANA_VERSION,
      exactRegistryIntegrityVerified: true,
      installedProductionPackagesAdded: 204,
      ignoredNativeBuildScripts: [
        'bigint-buffer@1.1.5',
        'keccak@3.0.4',
        'secp256k1@5.0.2',
      ] as const,
    }),
    sourceContract: Object.freeze({
      mainnetDefault: true,
      finalizedDefault: true,
      nativeSolanaEntrypointExcludesSplAdapter: true,
      fundingUsesSystemTransfer: true,
      priorityFeesCanBeDisabled: true,
      uploadFileAvailable: true,
      completeLockfileHashVerified: true,
      sourceHashesVerified: true,
    }),
    audit: Object.freeze({
      clean: false,
      findings: 5,
      high: 2,
      moderate: 2,
      low: 1,
      vulnerableBigintBufferNotImportedByNativeSolanaEntrypoint: true,
      vulnerableWs818NotLoadedByReviewedImport: true,
      loadedWs8213PatchedForReportedAdvisories: true,
      ellipticLoadedButSolanaSignerUsesNobleEd25519: true,
      uuid8LoadedButReviewedJaysonPathUsesV4Only: true,
      acceptance: 'BOUNDED_TO_EXACT_SOLANA_PATH_RECHECK_BEFORE_KEY_LOAD',
    }),
    sdkImportedByLab: false,
    walletProvidedToSdk: false,
    keyLoaded: false,
  });
}

export function createIrysFundingActionReview(
  plan: MetadataPublicationPlan,
  sdk: IrysSdkReviewEvidence,
): IrysFundingActionReview {
  if (
    plan.owner !== GOAL_9P_OWNER ||
    plan.irysFundingAddress !== GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS ||
    plan.irysExistingBalanceLamports !== 0n ||
    plan.fundingTransferLamports <= 0n ||
    plan.fundingTransferLamports !== plan.storageQuoteLamports ||
    plan.fundingFeeLamports !== GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS ||
    sdk.audit.acceptance !==
      'BOUNDED_TO_EXACT_SOLANA_PATH_RECHECK_BEFORE_KEY_LOAD'
  ) {
    throw new IrysActionReviewError('Irys funding action inputs changed.');
  }
  const confirmationPhrase =
    `CONFIRM IRYS METADATA FUNDING ${plan.fundingTransferLamports} LAMPORTS ` +
    `WITH FEE CAP ${plan.fundingFeeLamports} LAMPORTS FROM ${plan.owner} ` +
    `TO ${plan.irysFundingAddress} FOR SHA256 ${plan.metadataSha256}`;
  return Object.freeze({
    network: 'mainnet-beta',
    owner: GOAL_9P_OWNER,
    destination: GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
    metadataSha256: plan.metadataSha256,
    metadataByteLength: plan.metadataByteLength,
    fundingLamports: plan.fundingTransferLamports,
    feeCapLamports: GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS,
    maximumOwnerOutflowLamports:
      plan.fundingTransferLamports + GOAL_10D_EXPECTED_FUNDING_FEE_LAMPORTS,
    confirmationPhrase,
    confirmationReceived: false,
    fundingScope: 'ONE_EXACT_SOLANA_TRANSFER_AND_IRYS_CREDIT_REGISTRATION',
    uploadIncluded: false,
    uploadConfirmationDeferred: true,
    unsigned: true,
    keyLoaded: false,
    sdkWalletInitialized: false,
    fundingAttempted: false,
    uploadAttempted: false,
    transactionSubmitted: false,
    verdict: 'STOP_AWAITING_EXACT_IRYS_FUNDING_CONFIRMATION',
  });
}
