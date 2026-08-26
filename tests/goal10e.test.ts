import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  type MetadataPublicationPlan,
  GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
} from '../src/goal10d/metadata-publication-plan.js';
import {
  createIrysFundingActionReview,
  GOAL_10E_SOLANA_INTEGRITY,
  GOAL_10E_SOLANA_VERSION,
  GOAL_10E_LOCKFILE_SHA256,
  GOAL_10E_UPLOAD_INTEGRITY,
  GOAL_10E_UPLOAD_VERSION,
  IrysActionReviewError,
  verifyInstalledIrysSdkContract,
} from '../src/goal10e/irys-action-review.js';
import { GOAL_9P_OWNER } from '../src/goal9p/final-contract.js';

const plan = Object.freeze({
  network: 'mainnet-beta',
  rpcOrigin: 'https://mainnet.example.test',
  finalizedSlot: 441_813_007,
  owner: GOAL_9P_OWNER,
  ownerBalanceLamports: 19_985_000n,
  metadataSha256:
    '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
  metadataByteLength: 351,
  irysVersion: '0.2.0',
  irysFundingAddress: GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
  irysGatewayOrigin: 'https://gateway.irys.xyz',
  irysExistingBalanceLamports: 0n,
  storageQuoteLamports: 3_208n,
  fundingTransferLamports: 3_208n,
  fundingFeeLamports: 5_000n,
  fundingMessageSha256:
    '916e8f4e97514dd179f41b2e7bef1a052f1f6bb73c3fd931097757498be4bbf9',
  blockhashContextSlot: 441_813_009,
  feeContextSlot: 441_813_009,
  lastValidBlockHeight: 419_861_684,
  fixedRentLamports: 8_477_280n,
  internalFeeLamports: 40_000n,
  metadataPublicationLamports: 8_208n,
  knownOwnerCostsLamports: 8_525_488n,
  ownerAfterKnownCostsLamports: 11_459_512n,
  actualAcquisitionAllocationLamports: 19_995_001n,
  unallocatedAcquisitionBoundaryLamports: 4_999n,
  missing: {
    coreAssetRentAndIdentityPluginTopUp: true,
    uriDependentAssetAndIdentityFees: true,
    liveSolRescueFeeAndAmount: true,
    sameSignedBytesSimulations: true,
  },
  unsigned: true,
  keyLoaded: false,
  fundingAttempted: false,
  uploadAttempted: false,
  transactionSubmitted: false,
  verdict: 'STOP_READY_FOR_GOAL_10E_IMPLEMENTATION_REVIEW',
} satisfies MetadataPublicationPlan);

describe('Goal 10E Irys SDK and action review', () => {
  it('pins the exact registry packages, integrity, and reviewed source', async () => {
    const sdk = await verifyInstalledIrysSdkContract();
    expect(sdk).toMatchObject({
      packages: {
        upload: GOAL_10E_UPLOAD_VERSION,
        solana: GOAL_10E_SOLANA_VERSION,
        exactRegistryIntegrityVerified: true,
        installedProductionPackagesAdded: 204,
      },
      sourceContract: {
        mainnetDefault: true,
        finalizedDefault: true,
        nativeSolanaEntrypointExcludesSplAdapter: true,
        fundingUsesSystemTransfer: true,
        priorityFeesCanBeDisabled: true,
        uploadFileAvailable: true,
        completeLockfileHashVerified: true,
        sourceHashesVerified: true,
      },
      sdkImportedByLab: false,
      walletProvidedToSdk: false,
      keyLoaded: false,
    });
    const lockfile = await readFile('pnpm-lock.yaml', 'utf8');
    expect(lockfile).toContain(`integrity: ${GOAL_10E_UPLOAD_INTEGRITY}`);
    expect(lockfile).toContain(`integrity: ${GOAL_10E_SOLANA_INTEGRITY}`);
    expect(GOAL_10E_LOCKFILE_SHA256).toBe(
      '25cfa944c94962b4d39a2c9ecbc7de1d5fc57dbc05ffff104ce27da5f1da50f6',
    );
  });

  it('builds one exact funding confirmation and excludes upload', async () => {
    const sdk = await verifyInstalledIrysSdkContract();
    const review = createIrysFundingActionReview(plan, sdk);
    expect(review).toEqual({
      network: 'mainnet-beta',
      owner: GOAL_9P_OWNER,
      destination: GOAL_10D_EXPECTED_IRYS_FUNDING_ADDRESS,
      metadataSha256: plan.metadataSha256,
      metadataByteLength: 351,
      fundingLamports: 3_208n,
      feeCapLamports: 5_000n,
      maximumOwnerOutflowLamports: 8_208n,
      confirmationPhrase:
        'CONFIRM IRYS METADATA FUNDING 3208 LAMPORTS WITH FEE CAP 5000 ' +
        'LAMPORTS FROM 6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385 ' +
        'TO 9NERQjLetzquGwdKt3X4gZ8fE8fPfSkj2xo2esmUjWsz FOR SHA256 ' +
        '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
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
  });

  it('fails closed on funding amount, fee, balance, or destination drift', async () => {
    const sdk = await verifyInstalledIrysSdkContract();
    for (const changed of [
      { fundingTransferLamports: 3_209n },
      { fundingFeeLamports: 5_001n },
      { irysExistingBalanceLamports: 1n },
      { irysFundingAddress: GOAL_9P_OWNER },
    ]) {
      expect(() =>
        createIrysFundingActionReview(
          { ...plan, ...changed } as MetadataPublicationPlan,
          sdk,
        ),
      ).toThrow(IrysActionReviewError);
    }
  });

  it('probes the exact native-SOL import reachability without a wallet', () => {
    const probe = [
      "import Module from 'node:module';",
      'const seen=[];',
      'const original=Module._load;',
      'Module._load=function(request,parent,isMain){',
      "if(['ws','bigint-buffer','elliptic','@solana/spl-token'].includes(request)){",
      "let resolved='unresolved';",
      'try{resolved=Module._resolveFilename(request,parent,isMain)}catch{}',
      "seen.push(request+'=>'+resolved)",
      '}',
      'return original.call(this,request,parent,isMain)',
      '};',
      "await import('@irys/upload-solana');",
      "console.log(seen.join('\\n'));",
    ].join('');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ws@8.21.3');
    expect(result.stdout).toContain('elliptic@6.6.1');
    expect(result.stdout).not.toContain('ws@8.18.0');
    expect(result.stdout).not.toContain('bigint-buffer=>');
    expect(result.stdout).not.toContain('@solana/spl-token=>');
  });

  it('keeps signer-capable packages outside the lab runtime in this goal', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal10e/irys-action-review.ts', 'utf8'),
        readFile('src/cli/review-irys-action-mainnet.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(/^\s*import .*@irys\/upload/m);
    expect(sources).not.toMatch(
      /\bawait\s+\w+\.(?:fund|uploadFile|signTransaction|sendTransaction|simulateTransaction)\s*\(/i,
    );
    expect(sources).not.toMatch(/readFile\([^)]*(?:owner|\.wallet-child)/i);
  });

  it('publishes a public STOP artifact with the exact scope and audit truth', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal10e.irys-action-review.json',
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      goal: '10E',
      status: 'READ_ONLY_ACTION_REVIEW_COMPLETE',
      productionAudit: {
        clean: false,
        findings: 5,
        severity: { high: 2, moderate: 2, low: 1 },
        unsupportedOverrideUsed: false,
        acceptance: 'BOUNDED_TO_EXACT_SOLANA_PATH_RECHECK_BEFORE_KEY_LOAD',
      },
      fundingActionReview: {
        fundingLamports: '3208',
        feeCapLamports: '5000',
        maximumOwnerOutflowLamports: '8208',
        confirmationReceived: false,
        uploadIncluded: false,
        uploadConfirmationDeferred: true,
      },
      checks: {
        ownerKeyLoaded: false,
        sdkWalletInitialized: false,
        messageSigned: false,
        fundingAttempted: false,
        uploadAttempted: false,
        transactionSubmitted: false,
        networkWrite: false,
        fundsMoved: false,
      },
      verdict: 'STOP_AWAITING_EXACT_IRYS_FUNDING_CONFIRMATION',
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /privateKey|seed|mnemonic|api[_-]?key|messageBase64/i,
    );
  });
});
