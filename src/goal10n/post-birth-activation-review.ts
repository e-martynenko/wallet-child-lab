import {
  fetchAgentIdentityV2,
  MPL_AGENT_IDENTITY_PROGRAM_ID,
  mplAgentIdentity,
} from '@metaplex-foundation/mpl-agent-registry';
import {
  fetchAssetV1,
  MPL_CORE_PROGRAM_ID,
  mplCore,
} from '@metaplex-foundation/mpl-core';
import { publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { z } from 'zod';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../chain/network.js';
import { GOAL_10I_CANONICAL_URI } from '../goal10i/irys-transaction-verification.js';
import { GOAL_10K_AGENT_NAME } from '../goal10k/mainnet-birth-write-review.js';
import { GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS } from '../goal10l/mainnet-birth-execution.js';
import {
  GOAL_10D_ACTUAL_BOOTSTRAP_FEE_LAMPORTS,
  GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS,
} from '../goal10d/metadata-publication-plan.js';
import {
  auditMainnetDelegates,
  type MainnetDelegateAuditConfig,
} from '../goal9i/mainnet-delegates.js';
import {
  GOAL_9L_FUNDING_SOURCE,
  GOAL_9L_FUNDING_SOURCE_USDC_ATA,
} from '../goal9l/funding-route.js';
import type { BootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';
import {
  GOAL_9O_USDC_FUNDING_FEE_LAMPORTS,
  quoteUnsignedUsdcFundingFee,
} from '../goal9o/usdc-funding-fee.js';
import {
  GOAL_9P_AGENT_IDENTITY,
  GOAL_9P_ASSET_SIGNER,
  GOAL_9P_ASSET_SIGNER_USDC_ATA,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_EXECUTION_DELEGATE_RECORD,
  GOAL_9P_EXECUTIVE,
  GOAL_9P_EXECUTIVE_PROFILE,
  GOAL_9P_OWNER,
  GOAL_9P_RECOVERY,
  GOAL_9P_RECOVERY_USDC_ATA,
} from '../goal9p/final-contract.js';
import {
  GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS,
  quoteUnsignedInternalMessageFees,
} from '../goal9r/internal-message-fees.js';
import {
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
  USDC_DECIMALS,
} from '../mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';

export const GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS = 1_169_280n;
export const GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS = 1_614_720n;
export const GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280n;
export const GOAL_10N_ACTIVATION_RENT_LAMPORTS =
  GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS +
  GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS +
  2n * GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS;
export const GOAL_10N_CONSERVATIVE_OWNER_DEBIT_LAMPORTS =
  GOAL_10N_ACTIVATION_RENT_LAMPORTS +
  GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS;
export const GOAL_10N_CONSERVATIVE_OWNER_AFTER_LAMPORTS =
  GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS -
  GOAL_10N_CONSERVATIVE_OWNER_DEBIT_LAMPORTS;
export const GOAL_10N_MAX_ACTIVATION_DEBIT_LAMPORTS = 7_000_000n;
export const GOAL_10N_ACTUAL_ACQUISITION_ALLOCATION_LAMPORTS =
  GOAL_10D_EXPECTED_OWNER_BALANCE_LAMPORTS +
  GOAL_10D_ACTUAL_BOOTSTRAP_FEE_LAMPORTS +
  GOAL_9O_USDC_FUNDING_FEE_LAMPORTS;
export const GOAL_10N_UNALLOCATED_ACQUISITION_LAMPORTS =
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS -
  GOAL_10N_ACTUAL_ACQUISITION_ALLOCATION_LAMPORTS;

const RpcErrorSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});
const RpcEnvelopeSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.number().int(),
  result: z.unknown(),
});
const AccountSchema = z.object({
  lamports: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  owner: z.string(),
  executable: z.boolean(),
  data: z.unknown(),
  space: z.number().int().nonnegative(),
});
const AccountsSchema = z.object({
  context: z.object({ slot: z.number().int().positive() }),
  value: z.array(AccountSchema.nullable()),
});
const ParsedTokenAccountSchema = z.object({
  program: z.literal('spl-token'),
  parsed: z.object({
    type: z.literal('account'),
    info: z.object({
      isNative: z.literal(false),
      mint: z.literal(SOLANA_MAINNET_USDC_MINT),
      owner: z.literal(GOAL_9L_FUNDING_SOURCE),
      state: z.literal('initialized'),
      tokenAmount: z.object({
        amount: z.string().regex(/^\d+$/),
        decimals: z.literal(USDC_DECIMALS),
      }),
      delegate: z.never().optional(),
      delegatedAmount: z.never().optional(),
      closeAuthority: z.never().optional(),
    }),
  }),
});

const ACCOUNT_ADDRESSES = Object.freeze([
  GOAL_9P_OWNER,
  GOAL_9L_FUNDING_SOURCE,
  GOAL_9L_FUNDING_SOURCE_USDC_ATA,
  GOAL_9P_ASSET_SIGNER,
  GOAL_9P_ASSET_SIGNER_USDC_ATA,
  GOAL_9P_RECOVERY,
  GOAL_9P_RECOVERY_USDC_ATA,
  GOAL_9P_EXECUTIVE,
  GOAL_9P_EXECUTIVE_PROFILE,
  GOAL_9P_EXECUTION_DELEGATE_RECORD,
] as const);

export type PostBirthActivationSnapshot = Readonly<{
  finalizedSlot: number;
  ownerLamports: bigint;
  fundingSourceLamports: bigint;
  fundingSourceUsdcBaseUnits: bigint;
  assetSignerAbsent: boolean;
  assetSignerUsdcAtaAbsent: boolean;
  recoveryAbsent: boolean;
  recoveryUsdcAtaAbsent: boolean;
  executiveAbsent: boolean;
  executiveProfileAbsent: boolean;
  executionDelegateRecordAbsent: boolean;
  executiveProfileRentLamports: bigint;
  executionDelegateRentLamports: bigint;
  tokenAccountRentLamports: bigint;
}>;

export type PostBirthIdentityBaseline = Readonly<{
  finalizedSlot: number;
  coreAsset: typeof GOAL_9P_CORE_ASSET;
  agentIdentity: typeof GOAL_9P_AGENT_IDENTITY;
  owner: typeof GOAL_9P_OWNER;
  assetSigner: typeof GOAL_9P_ASSET_SIGNER;
  metadataUri: typeof GOAL_10I_CANONICAL_URI;
  noDangerousCoreDelegate: true;
}>;

export type PostBirthActivationReview = Readonly<{
  network: 'mainnet-beta';
  rpcOrigin: string;
  finalizedSlotFloor: number;
  identity: PostBirthIdentityBaseline;
  accounts: Readonly<{
    ownerLamports: typeof GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS;
    fundingSourceSolSufficient: true;
    fundingSourceUsdcSufficient: true;
    childAccountsAbsent: true;
    activeExecutionDelegates: 0;
  }>;
  funding: Readonly<{
    exactUsdcBaseUnits: typeof GOAL_9_MAX_USDC_BASE_UNITS;
    externalFeeLamports: typeof GOAL_9O_USDC_FUNDING_FEE_LAMPORTS;
    actualAcquisitionAllocationLamports: typeof GOAL_10N_ACTUAL_ACQUISITION_ALLOCATION_LAMPORTS;
    unallocatedAcquisitionLamports: typeof GOAL_10N_UNALLOCATED_ACQUISITION_LAMPORTS;
    totalExperimentSolBoundaryLamports: typeof GOAL_9_MAX_SOL_RESERVE_LAMPORTS;
    boundaryStillClosed: true;
  }>;
  activation: Readonly<{
    executiveProfileRentLamports: typeof GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS;
    executionDelegateRentLamports: typeof GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS;
    tokenAccountRentLamports: typeof GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS;
    tokenAccountCount: 2;
    totalRentLamports: typeof GOAL_10N_ACTIVATION_RENT_LAMPORTS;
    totalInternalFeesLamports: typeof GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS;
    conservativeOwnerDebitLamports: typeof GOAL_10N_CONSERVATIVE_OWNER_DEBIT_LAMPORTS;
    conservativeOwnerAfterLamports: typeof GOAL_10N_CONSERVATIVE_OWNER_AFTER_LAMPORTS;
  }>;
  checks: Readonly<{
    identityAndOwnerReadbackPassed: true;
    zeroActiveDelegates: true;
    sourceCanFundExactOneUsdc: true;
    childAtasAbsent: true;
    executiveProfileAbsent: true;
    executionDelegateRecordAbsent: true;
    freshExactFeesQuoted: true;
    keyLoaded: false;
    transactionSigned: false;
    simulationAttempted: false;
    transactionSubmitted: false;
  }>;
  nextRequiredAction: 'SEPARATE_ATA_AND_PERMISSION_WRITE_REVIEW';
  verdict: 'PASS_STOP_BEFORE_ATA_PERMISSION_OR_FUNDING_WRITE';
}>;

export class PostBirthActivationReviewError extends Error {
  override readonly name = 'PostBirthActivationReviewError';
}

async function quoteFreshFees(
  config: BootstrapFeeConfig,
  minContextSlot: number,
  fetchImpl: typeof fetch,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [fundingFee, internalFees] = await Promise.all([
      quoteUnsignedUsdcFundingFee(config, fetchImpl),
      quoteUnsignedInternalMessageFees(config, fetchImpl),
    ]);
    if (
      fundingFee.blockhashContextSlot >= minContextSlot &&
      internalFees.blockhashContextSlot >= minContextSlot
    ) {
      return Object.freeze({ fundingFee, internalFees });
    }
  }
  throw new PostBirthActivationReviewError(
    'Fresh fee quotes did not reach the finalized account snapshot.',
  );
}

async function rpcRead(
  config: BootstrapFeeConfig,
  id: number,
  method:
    | 'getGenesisHash'
    | 'getSlot'
    | 'getMultipleAccounts'
    | 'getMinimumBalanceForRentExemption',
  params: readonly unknown[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PostBirthActivationReviewError(
      `Mainnet RPC ${method} read failed at ${config.rpcOrigin}.`,
    );
  }
  if (!response.ok) {
    throw new PostBirthActivationReviewError(
      `Mainnet RPC ${method} returned HTTP ${response.status}.`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PostBirthActivationReviewError(
      `Mainnet RPC ${method} returned invalid JSON.`,
    );
  }
  const rpcError = RpcErrorSchema.safeParse(payload);
  if (rpcError.success) {
    throw new PostBirthActivationReviewError(
      `Mainnet RPC ${method} failed with code ${rpcError.data.error.code}.`,
    );
  }
  const envelope = RpcEnvelopeSchema.safeParse(payload);
  if (!envelope.success || envelope.data.id !== id) {
    throw new PostBirthActivationReviewError(
      `Mainnet RPC ${method} response is malformed.`,
    );
  }
  return envelope.data.result;
}

function parseResult<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new PostBirthActivationReviewError(`${label} is malformed.`);
  }
  return parsed.data;
}

export function verifyPostBirthActivationSnapshot(
  snapshot: PostBirthActivationSnapshot,
): void {
  if (
    !Number.isSafeInteger(snapshot.finalizedSlot) ||
    snapshot.finalizedSlot <= 0 ||
    snapshot.ownerLamports !== GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS ||
    snapshot.fundingSourceLamports < GOAL_9O_USDC_FUNDING_FEE_LAMPORTS ||
    snapshot.fundingSourceUsdcBaseUnits < GOAL_9_MAX_USDC_BASE_UNITS ||
    !snapshot.assetSignerAbsent ||
    !snapshot.assetSignerUsdcAtaAbsent ||
    !snapshot.recoveryAbsent ||
    !snapshot.recoveryUsdcAtaAbsent ||
    !snapshot.executiveAbsent ||
    !snapshot.executiveProfileAbsent ||
    !snapshot.executionDelegateRecordAbsent ||
    snapshot.executiveProfileRentLamports !==
      GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS ||
    snapshot.executionDelegateRentLamports !==
      GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS ||
    snapshot.tokenAccountRentLamports !==
      GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS ||
    GOAL_10N_CONSERVATIVE_OWNER_DEBIT_LAMPORTS >
      GOAL_10N_MAX_ACTIVATION_DEBIT_LAMPORTS ||
    GOAL_10N_CONSERVATIVE_OWNER_AFTER_LAMPORTS <= 0n
  ) {
    throw new PostBirthActivationReviewError(
      'Post-birth account, balance, rent, or budget baseline changed.',
    );
  }
}

async function readPostBirthActivationSnapshot(
  config: BootstrapFeeConfig,
  minContextSlot: number,
  fetchImpl: typeof fetch,
): Promise<PostBirthActivationSnapshot> {
  const genesis = await rpcRead(config, 1, 'getGenesisHash', [], fetchImpl);
  if (genesis !== SOLANA_MAINNET_BETA_GENESIS_HASH) {
    throw new PostBirthActivationReviewError(
      'RPC genesis hash is not Solana Mainnet.',
    );
  }
  const finalizedSlot = parseResult(
    z.number().int().positive(),
    await rpcRead(
      config,
      2,
      'getSlot',
      [{ commitment: 'finalized' }],
      fetchImpl,
    ),
    'Finalized slot',
  );
  if (finalizedSlot < minContextSlot) {
    throw new PostBirthActivationReviewError(
      'Finalized account snapshot precedes the delegate audit.',
    );
  }
  const accounts = parseResult(
    AccountsSchema,
    await rpcRead(
      config,
      3,
      'getMultipleAccounts',
      [
        ACCOUNT_ADDRESSES,
        {
          encoding: 'jsonParsed',
          commitment: 'finalized',
          minContextSlot: finalizedSlot,
        },
      ],
      fetchImpl,
    ),
    'Post-birth accounts',
  );
  if (accounts.context.slot < finalizedSlot || accounts.value.length !== 10) {
    throw new PostBirthActivationReviewError(
      'Post-birth account snapshot is stale or incomplete.',
    );
  }
  const [owner, source, sourceAta, ...futureAccounts] = accounts.value;
  const tokenData = ParsedTokenAccountSchema.safeParse(sourceAta?.data);
  if (
    !owner ||
    owner.owner !== SYSTEM_PROGRAM_ID ||
    owner.executable ||
    owner.space !== 0 ||
    !source ||
    source.owner !== SYSTEM_PROGRAM_ID ||
    source.executable ||
    source.space !== 0 ||
    !sourceAta ||
    sourceAta.owner !== SOLANA_LEGACY_TOKEN_PROGRAM_ID ||
    sourceAta.executable ||
    sourceAta.space !== 165 ||
    !tokenData.success
  ) {
    throw new PostBirthActivationReviewError(
      'Owner or experimental funding-source account shape changed.',
    );
  }
  const rents = await Promise.all(
    [40, 104, 165].map((size, index) =>
      rpcRead(
        config,
        4 + index,
        'getMinimumBalanceForRentExemption',
        [size, { commitment: 'finalized' }],
        fetchImpl,
      ),
    ),
  );
  const [profileRent, delegateRent, tokenRent] = rents.map((value) =>
    BigInt(
      parseResult(z.number().int().positive(), value, 'Activation rent quote'),
    ),
  );
  if (
    profileRent === undefined ||
    delegateRent === undefined ||
    tokenRent === undefined
  ) {
    throw new PostBirthActivationReviewError(
      'Activation rent quote is incomplete.',
    );
  }
  const snapshot = Object.freeze({
    finalizedSlot: accounts.context.slot,
    ownerLamports: BigInt(owner.lamports),
    fundingSourceLamports: BigInt(source.lamports),
    fundingSourceUsdcBaseUnits: BigInt(
      tokenData.data.parsed.info.tokenAmount.amount,
    ),
    assetSignerAbsent: futureAccounts[0] === null,
    assetSignerUsdcAtaAbsent: futureAccounts[1] === null,
    recoveryAbsent: futureAccounts[2] === null,
    recoveryUsdcAtaAbsent: futureAccounts[3] === null,
    executiveAbsent: futureAccounts[4] === null,
    executiveProfileAbsent: futureAccounts[5] === null,
    executionDelegateRecordAbsent: futureAccounts[6] === null,
    executiveProfileRentLamports: profileRent,
    executionDelegateRentLamports: delegateRent,
    tokenAccountRentLamports: tokenRent,
  });
  verifyPostBirthActivationSnapshot(snapshot);
  return snapshot;
}

async function readPostBirthIdentityBaseline(
  config: BootstrapFeeConfig,
  minContextSlot: number,
): Promise<PostBirthIdentityBaseline> {
  const umi = createUmi(config.rpcUrl).use(mplCore()).use(mplAgentIdentity());
  const asset = await fetchAssetV1(umi, publicKey(GOAL_9P_CORE_ASSET), {
    commitment: 'finalized',
    minContextSlot,
  });
  const identity = await fetchAgentIdentityV2(
    umi,
    publicKey(GOAL_9P_AGENT_IDENTITY),
    { commitment: 'finalized', minContextSlot },
  );
  const finalizedSlot = await umi.rpc.getSlot({ commitment: 'finalized' });
  const dangerousPlugins = [
    asset.freezeDelegate,
    asset.burnDelegate,
    asset.transferDelegate,
    asset.updateDelegate,
    asset.permanentFreezeDelegate,
    asset.permanentTransferDelegate,
    asset.permanentBurnDelegate,
    asset.addBlocker,
    asset.freezeExecute,
    asset.permanentFreezeExecute,
  ];
  if (
    finalizedSlot < minContextSlot ||
    String(asset.publicKey) !== GOAL_9P_CORE_ASSET ||
    String(asset.header.owner) !== String(MPL_CORE_PROGRAM_ID) ||
    String(asset.owner) !== GOAL_9P_OWNER ||
    asset.updateAuthority.type !== 'Address' ||
    String(asset.updateAuthority.address) !== GOAL_9P_OWNER ||
    asset.name !== GOAL_10K_AGENT_NAME ||
    asset.uri !== GOAL_10I_CANONICAL_URI ||
    dangerousPlugins.some(Boolean) ||
    (asset.lifecycleHooks?.length ?? 0) !== 0 ||
    (asset.oracles?.length ?? 0) !== 0 ||
    (asset.appDatas?.length ?? 0) !== 0 ||
    (asset.linkedLifecycleHooks?.length ?? 0) !== 0 ||
    (asset.linkedAppDatas?.length ?? 0) !== 0 ||
    (asset.dataSections?.length ?? 0) !== 0 ||
    (asset.agentIdentities?.length ?? 0) !== 1 ||
    asset.agentIdentities?.[0]?.uri !== GOAL_10I_CANONICAL_URI ||
    String(identity.publicKey) !== GOAL_9P_AGENT_IDENTITY ||
    String(identity.header.owner) !== String(MPL_AGENT_IDENTITY_PROGRAM_ID) ||
    String(identity.asset) !== GOAL_9P_CORE_ASSET ||
    identity.agentToken.__option !== 'None'
  ) {
    throw new PostBirthActivationReviewError(
      'Finalized Wallet Child identity or owner baseline changed.',
    );
  }
  return Object.freeze({
    finalizedSlot,
    coreAsset: GOAL_9P_CORE_ASSET,
    agentIdentity: GOAL_9P_AGENT_IDENTITY,
    owner: GOAL_9P_OWNER,
    assetSigner: GOAL_9P_ASSET_SIGNER,
    metadataUri: GOAL_10I_CANONICAL_URI,
    noDangerousCoreDelegate: true,
  });
}

export async function reviewPostBirthActivation(
  config: BootstrapFeeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<PostBirthActivationReview> {
  const delegateConfig: MainnetDelegateAuditConfig = Object.freeze({
    rpcUrl: config.rpcUrl,
    rpcOrigin: config.rpcOrigin,
    asset: GOAL_9P_CORE_ASSET,
    expectedOwner: GOAL_9P_OWNER,
  });
  const delegateAudit = await auditMainnetDelegates(delegateConfig);
  const snapshot = await readPostBirthActivationSnapshot(
    config,
    delegateAudit.finalizedSlotAfter,
    fetchImpl,
  );
  const identity = await readPostBirthIdentityBaseline(
    config,
    snapshot.finalizedSlot,
  );
  if (delegateAudit.counts.matchingAssetDelegates !== 0) {
    throw new PostBirthActivationReviewError(
      'An active execution delegate appeared during activation review.',
    );
  }
  if (identity.finalizedSlot < snapshot.finalizedSlot) {
    throw new PostBirthActivationReviewError(
      'Finalized identity read-back precedes the account snapshot.',
    );
  }
  const { fundingFee, internalFees } = await quoteFreshFees(
    config,
    snapshot.finalizedSlot,
    fetchImpl,
  );
  if (
    fundingFee.amountBaseUnits !== GOAL_9_MAX_USDC_BASE_UNITS ||
    fundingFee.quotedFeeLamports !== GOAL_9O_USDC_FUNDING_FEE_LAMPORTS ||
    internalFees.totalFeeLamports !== GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS
  ) {
    throw new PostBirthActivationReviewError(
      'Exact funding or internal message fee contract changed.',
    );
  }
  if (
    GOAL_10N_ACTUAL_ACQUISITION_ALLOCATION_LAMPORTS >
      GOAL_9_MAX_SOL_RESERVE_LAMPORTS ||
    GOAL_10N_UNALLOCATED_ACQUISITION_LAMPORTS !== 4_999n
  ) {
    throw new PostBirthActivationReviewError(
      'Actual total SOL acquisition boundary changed.',
    );
  }

  return Object.freeze({
    network: 'mainnet-beta',
    rpcOrigin: config.rpcOrigin,
    finalizedSlotFloor: snapshot.finalizedSlot,
    identity,
    accounts: Object.freeze({
      ownerLamports: GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS,
      fundingSourceSolSufficient: true,
      fundingSourceUsdcSufficient: true,
      childAccountsAbsent: true,
      activeExecutionDelegates: 0,
    }),
    funding: Object.freeze({
      exactUsdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
      externalFeeLamports: GOAL_9O_USDC_FUNDING_FEE_LAMPORTS,
      actualAcquisitionAllocationLamports:
        GOAL_10N_ACTUAL_ACQUISITION_ALLOCATION_LAMPORTS,
      unallocatedAcquisitionLamports:
        GOAL_10N_UNALLOCATED_ACQUISITION_LAMPORTS,
      totalExperimentSolBoundaryLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
      boundaryStillClosed: true,
    }),
    activation: Object.freeze({
      executiveProfileRentLamports:
        GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS,
      executionDelegateRentLamports:
        GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS,
      tokenAccountRentLamports: GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS,
      tokenAccountCount: 2,
      totalRentLamports: GOAL_10N_ACTIVATION_RENT_LAMPORTS,
      totalInternalFeesLamports: GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS,
      conservativeOwnerDebitLamports:
        GOAL_10N_CONSERVATIVE_OWNER_DEBIT_LAMPORTS,
      conservativeOwnerAfterLamports:
        GOAL_10N_CONSERVATIVE_OWNER_AFTER_LAMPORTS,
    }),
    checks: Object.freeze({
      identityAndOwnerReadbackPassed: true,
      zeroActiveDelegates: true,
      sourceCanFundExactOneUsdc: true,
      childAtasAbsent: true,
      executiveProfileAbsent: true,
      executionDelegateRecordAbsent: true,
      freshExactFeesQuoted: true,
      keyLoaded: false,
      transactionSigned: false,
      simulationAttempted: false,
      transactionSubmitted: false,
    }),
    nextRequiredAction: 'SEPARATE_ATA_AND_PERMISSION_WRITE_REVIEW',
    verdict: 'PASS_STOP_BEFORE_ATA_PERMISSION_OR_FUNDING_WRITE',
  });
}
