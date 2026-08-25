import {
  getAgentIdentityV2Size,
  getExecutionDelegateRecordV1Size,
  getExecutiveProfileV1Size,
} from '@metaplex-foundation/mpl-agent-registry';

import { GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS } from '../goal9m/bootstrap-fee.js';

export const SPL_TOKEN_ACCOUNT_SIZE = 165;
export const GOAL_9Q_MAX_FIXED_RENT_LAMPORTS = 9_000_000n;

export type FixedRentQuoteInput = Readonly<{
  finalizedSlot: number;
  agentIdentityLamports: bigint;
  executiveProfileLamports: bigint;
  executionDelegateRecordLamports: bigint;
  tokenAccountLamports: bigint;
}>;

export class FixedRentPlanError extends Error {
  override readonly name = 'FixedRentPlanError';
}

export function verifyFixedRentPlan(input: FixedRentQuoteInput) {
  const sizes = Object.freeze({
    agentIdentity: getAgentIdentityV2Size(),
    executiveProfile: getExecutiveProfileV1Size(),
    executionDelegateRecord: getExecutionDelegateRecordV1Size(),
    tokenAccount: SPL_TOKEN_ACCOUNT_SIZE,
  });
  if (
    !Number.isSafeInteger(input.finalizedSlot) ||
    input.finalizedSlot <= 0 ||
    sizes.agentIdentity !== 104 ||
    sizes.executiveProfile !== 40 ||
    sizes.executionDelegateRecord !== 104
  ) {
    throw new FixedRentPlanError('Fixed Mainnet account sizes changed.');
  }
  const quotes = [
    input.agentIdentityLamports,
    input.executiveProfileLamports,
    input.executionDelegateRecordLamports,
    input.tokenAccountLamports,
  ];
  if (quotes.some((quote) => quote <= 0n || quote > 2_500_000n)) {
    throw new FixedRentPlanError('A fixed Mainnet rent quote is invalid.');
  }
  const fixedRentLamports =
    input.agentIdentityLamports +
    input.executiveProfileLamports +
    input.executionDelegateRecordLamports +
    2n * input.tokenAccountLamports;
  if (
    fixedRentLamports > GOAL_9Q_MAX_FIXED_RENT_LAMPORTS ||
    fixedRentLamports >= GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS
  ) {
    throw new FixedRentPlanError('Known fixed rents leave no safe bootstrap room.');
  }
  return Object.freeze({
    finalizedSlot: input.finalizedSlot,
    sizes,
    rents: Object.freeze({
      agentIdentityLamports: input.agentIdentityLamports,
      executiveProfileLamports: input.executiveProfileLamports,
      executionDelegateRecordLamports: input.executionDelegateRecordLamports,
      tokenAccountLamports: input.tokenAccountLamports,
      tokenAccountCount: 2 as const,
    }),
    fixedRentLamports,
    remainingBootstrapLamports:
      GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS - fixedRentLamports,
    missing: Object.freeze({
      coreAssetRentAndIdentityPluginTopUp: true,
      metadataFundingTransactionFee: true,
      exactInternalTransactionFees: true,
      sameBytesSimulations: true,
    }),
    go: false as const,
  });
}

export const GOAL_9Q_PHASE_ORDER = Object.freeze([
  'PRE_APPROVAL_READ_ONLY',
  'SOURCE_TO_OWNER_SOL_BOOTSTRAP',
  'DURABLE_METADATA_UPLOAD_AND_TWO_ORIGIN_VERIFY',
  'CREATE_STANDALONE_ASSET_AND_REGISTER_IDENTITY',
  'LIVE_ASSET_IDENTITY_AND_DELEGATE_AUDIT',
  'CREATE_ATAS_REGISTER_EXECUTIVE_AND_DELEGATE',
  'SIMULATE_ACTION_REVOKE_AND_RESCUES',
  'SOURCE_TO_ASSET_SIGNER_USDC_FUNDING',
  'EXECUTE_0_1_USDC_REVOKE_AND_FINAL_AUDIT',
] as const);

export function assertSafePhaseOrder(
  phases: readonly string[] = GOAL_9Q_PHASE_ORDER,
): void {
  if (
    phases.join('|') !== GOAL_9Q_PHASE_ORDER.join('|') ||
    phases.indexOf('SOURCE_TO_ASSET_SIGNER_USDC_FUNDING') <
      phases.indexOf('LIVE_ASSET_IDENTITY_AND_DELEGATE_AUDIT') ||
    phases.indexOf('SOURCE_TO_ASSET_SIGNER_USDC_FUNDING') <
      phases.indexOf('SIMULATE_ACTION_REVOKE_AND_RESCUES')
  ) {
    throw new FixedRentPlanError('Mainnet phase order is unsafe.');
  }
}
