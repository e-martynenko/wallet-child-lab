import {
  findExecutionDelegateRecordV1Pda,
  findExecutiveProfileV1Pda,
} from '@metaplex-foundation/mpl-agent-registry';
import { findAssetSignerPda } from '@metaplex-foundation/mpl-core';
import { findAssociatedTokenPda } from '@metaplex-foundation/mpl-toolbox';
import { publicKey, type Umi } from '@metaplex-foundation/umi';

import { GOAL_9E_ACTION_BASE_UNITS } from '../goal9e/artifact.js';
import { GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS } from '../goal9e/policy.js';
import { GOAL_9F_MAX_FEE_PAYER_SPEND_LAMPORTS } from '../goal9f/policy.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  GOAL_9G_MAX_ATA_SETUP_SPEND_LAMPORTS,
} from '../goal9g/usdc-ata-setup.js';
import {
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
  USDC_DECIMALS,
} from '../mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';

export const GOAL_9P_OWNER =
  '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';
export const GOAL_9P_EXECUTIVE =
  'EJQcuD9FtJ33c2wA7GM6HzvmJJJbPsYnmH5ZjTDdhbjF';
export const GOAL_9P_RECOVERY =
  'ABZePapHbYaTg7GU4LGQNcYmfURvue5uVrrf4FUa4x3j';
export const GOAL_9P_CORE_ASSET =
  'HPaGuhYf2qu8UQ7ofJsfjiEzhnoqVmTN9WrGWmuC1Uty';
export const GOAL_9P_ASSET_SIGNER =
  '5Snge43iBczUT16b4ndffdgB4xxR2Bev9vxvLRe5YWyu';
export const GOAL_9P_ASSET_SIGNER_USDC_ATA =
  'hCmisMZFRL7SWKvgdtFWXMTDW3PY858Kmvg6dQ8GQMU';
export const GOAL_9P_RECOVERY_USDC_ATA =
  '8dbJMqCGAMTuJZ5ZZZeQMT43WqkkrwmBiyEJRH8szAd';
export const GOAL_9P_EXECUTIVE_PROFILE =
  '3Uy4XhPJLAdFRyFLAfJM7ruNc3Td5Ld1258Gx5z2WYXo';
export const GOAL_9P_EXECUTION_DELEGATE_RECORD =
  'Fr2yQyG7gEQYjL6Sr8sYXrS2n21bfjod5rKQDdo7bgcm';

export class FinalMainnetContractError extends Error {
  override readonly name = 'FinalMainnetContractError';
}

export function createFinalMainnetContract(umi: Umi) {
  const asset = publicKey(GOAL_9P_CORE_ASSET);
  const executiveProfile = findExecutiveProfileV1Pda(umi, {
    authority: publicKey(GOAL_9P_EXECUTIVE),
  });
  const executionDelegateRecord = findExecutionDelegateRecordV1Pda(umi, {
    executiveProfile: executiveProfile[0],
    agentAsset: asset,
  });
  const assetSigner = findAssetSignerPda(umi, { asset });
  const assetSignerAta = findAssociatedTokenPda(umi, {
    mint: publicKey(SOLANA_MAINNET_USDC_MINT),
    owner: assetSigner[0],
  });
  const recoveryAta = findAssociatedTokenPda(umi, {
    mint: publicKey(SOLANA_MAINNET_USDC_MINT),
    owner: publicKey(GOAL_9P_RECOVERY),
  });
  const derived = [
    String(executiveProfile[0]),
    String(executionDelegateRecord[0]),
    String(assetSigner[0]),
    String(assetSignerAta[0]),
    String(recoveryAta[0]),
  ];
  const expected = [
    GOAL_9P_EXECUTIVE_PROFILE,
    GOAL_9P_EXECUTION_DELEGATE_RECORD,
    GOAL_9P_ASSET_SIGNER,
    GOAL_9P_ASSET_SIGNER_USDC_ATA,
    GOAL_9P_RECOVERY_USDC_ATA,
  ];
  if (derived.some((address, index) => address !== expected[index])) {
    throw new FinalMainnetContractError('A final Mainnet PDA or ATA changed.');
  }

  return Object.freeze({
    architecture: Object.freeze({ standaloneCoreAsset: true, collection: null }),
    addresses: Object.freeze({
      owner: GOAL_9P_OWNER,
      executive: GOAL_9P_EXECUTIVE,
      recovery: GOAL_9P_RECOVERY,
      coreAsset: GOAL_9P_CORE_ASSET,
      assetSigner: GOAL_9P_ASSET_SIGNER,
      assetSignerUsdcAta: GOAL_9P_ASSET_SIGNER_USDC_ATA,
      recoveryUsdcAta: GOAL_9P_RECOVERY_USDC_ATA,
      executiveProfile: GOAL_9P_EXECUTIVE_PROFILE,
      executionDelegateRecord: GOAL_9P_EXECUTION_DELEGATE_RECORD,
    }),
    action: Object.freeze({
      intent: Object.freeze({
        kind: 'TRANSFER_USDC' as const,
        network: 'mainnet-beta' as const,
        token: 'USDC' as const,
        destinationOwner: GOAL_9P_RECOVERY,
        amountBaseUnits: GOAL_9E_ACTION_BASE_UNITS,
      }),
      policy: Object.freeze({
        network: 'mainnet-beta' as const,
        token: 'USDC' as const,
        mint: SOLANA_MAINNET_USDC_MINT,
        decimals: USDC_DECIMALS,
        sourceAssetSigner: GOAL_9P_ASSET_SIGNER,
        sourceTokenAccount: GOAL_9P_ASSET_SIGNER_USDC_ATA,
        allowedDestinationOwner: GOAL_9P_RECOVERY,
        allowedDestinationTokenAccount: GOAL_9P_RECOVERY_USDC_ATA,
        actionBaseUnits: GOAL_9E_ACTION_BASE_UNITS,
        maximumTreasuryBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
        maximumFeePayerSpendLamports:
          GOAL_9E_MAX_FEE_PAYER_SPEND_LAMPORTS,
        allowedProgram: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
      }),
    }),
    ataSetupPolicy: Object.freeze({
      network: 'mainnet-beta' as const,
      payer: GOAL_9P_OWNER,
      assetSigner: GOAL_9P_ASSET_SIGNER,
      recoveryOwner: GOAL_9P_RECOVERY,
      mint: SOLANA_MAINNET_USDC_MINT,
      sourceAta: GOAL_9P_ASSET_SIGNER_USDC_ATA,
      recoveryAta: GOAL_9P_RECOVERY_USDC_ATA,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
      systemProgram: SYSTEM_PROGRAM_ID,
      maximumSetupSpendLamports: GOAL_9G_MAX_ATA_SETUP_SPEND_LAMPORTS,
    }),
    rescuePolicy: Object.freeze({
      network: 'mainnet-beta' as const,
      owner: GOAL_9P_OWNER,
      sourceAssetSigner: GOAL_9P_ASSET_SIGNER,
      recoveryOwner: GOAL_9P_RECOVERY,
      usdcMint: SOLANA_MAINNET_USDC_MINT,
      usdcDecimals: USDC_DECIMALS,
      sourceUsdcAccount: GOAL_9P_ASSET_SIGNER_USDC_ATA,
      recoveryUsdcAccount: GOAL_9P_RECOVERY_USDC_ATA,
      maximumUsdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
      maximumSolLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
      maximumFeePayerSpendLamports:
        GOAL_9F_MAX_FEE_PAYER_SPEND_LAMPORTS,
      tokenProgram: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
      systemProgram: SYSTEM_PROGRAM_ID,
    }),
  });
}
