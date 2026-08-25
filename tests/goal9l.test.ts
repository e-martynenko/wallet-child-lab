import { readFile } from 'node:fs/promises';

import { findAssociatedTokenPda, mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { describe, expect, it } from 'vitest';

import {
  FundingRouteError,
  type FundingRouteSnapshot,
  GOAL_9L_EXECUTIVE,
  GOAL_9L_FUNDING_SOURCE,
  GOAL_9L_FUNDING_SOURCE_USDC_ATA,
  GOAL_9L_RECOVERY,
  GOAL_9L_WALLET_CHILD_OWNER,
  validateFundingTransferIntent,
  verifyFundingRouteSnapshot,
} from '../src/goal9l/funding-route.js';
import {
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
} from '../src/mainnet/readiness.js';

const snapshot: FundingRouteSnapshot = {
  sourceFinalizedSlot: 441_631_349,
  walletChildFinalizedSlot: 441_632_634,
  source: {
    address: GOAL_9L_FUNDING_SOURCE,
    solLamports: 88_698_606n,
    usdcAccount: {
      address: GOAL_9L_FUNDING_SOURCE_USDC_ATA,
      programOwner: SOLANA_LEGACY_TOKEN_PROGRAM_ID,
      mint: SOLANA_MAINNET_USDC_MINT,
      tokenOwner: GOAL_9L_FUNDING_SOURCE,
      amountBaseUnits: 1_078_695n,
      delegate: null,
      closeAuthority: null,
      state: 'initialized',
    },
  },
  walletChild: {
    owner: GOAL_9L_WALLET_CHILD_OWNER,
    ownerSolLamports: 0n,
    ownerUsdcAccountCount: 0,
    executive: GOAL_9L_EXECUTIVE,
    executiveSolLamports: 0n,
    executiveUsdcAccountCount: 0,
    recovery: GOAL_9L_RECOVERY,
    recoverySolLamports: 0n,
    recoveryUsdcAccountCount: 0,
  },
};

const umi = createUmi('http://127.0.0.1:8899').use(mplToolbox());

function usdcAta(owner: string): string {
  return String(
    findAssociatedTokenPda(umi, {
      mint: publicKey(SOLANA_MAINNET_USDC_MINT),
      owner: publicKey(owner),
    })[0],
  );
}

describe('Goal 9L isolated funding route', () => {
  it('fixes the canonical source USDC account', () => {
    expect(GOAL_9L_FUNDING_SOURCE_USDC_ATA).toBe(
      usdcAta(GOAL_9L_FUNDING_SOURCE),
    );
  });

  it('accepts the finalized post-swap snapshot while Wallet Child stays unfunded', () => {
    expect(verifyFundingRouteSnapshot(snapshot)).toMatchObject({
      network: 'mainnet-beta',
      sourceFinalizedSlot: 441_631_349,
      walletChildFinalizedSlot: 441_632_634,
      source: GOAL_9L_FUNDING_SOURCE,
      sourceUsdcAccount: GOAL_9L_FUNDING_SOURCE_USDC_ATA,
      bootstrapSolDestination: GOAL_9L_WALLET_CHILD_OWNER,
      futureUsdcDestination: null,
      availableSolLamports: 88_698_606n,
      availableUsdcBaseUnits: 1_078_695n,
      maximumPermittedSolLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
      exactPermittedUsdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS,
      stagedOutsideWalletChild: true,
      walletChildStillUnfunded: true,
      fundingSourceKeyLoadedByLab: false,
      transactionBuilt: false,
      transactionSubmitted: false,
    });
  });

  it('rejects insufficient source SOL or USDC', () => {
    expect(() =>
      verifyFundingRouteSnapshot({
        ...snapshot,
        source: {
          ...snapshot.source,
          solLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS - 1n,
        },
      }),
    ).toThrow(FundingRouteError);
    expect(() =>
      verifyFundingRouteSnapshot({
        ...snapshot,
        source: {
          ...snapshot.source,
          usdcAccount: {
            ...snapshot.source.usdcAccount,
            amountBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS - 1n,
          },
        },
      }),
    ).toThrow(FundingRouteError);
  });

  it('rejects a delegated, closable, wrong-mint, or wrong-owner source account', () => {
    for (const usdcAccount of [
      { ...snapshot.source.usdcAccount, delegate: GOAL_9L_EXECUTIVE },
      { ...snapshot.source.usdcAccount, closeAuthority: GOAL_9L_FUNDING_SOURCE },
      { ...snapshot.source.usdcAccount, mint: GOAL_9L_EXECUTIVE },
      { ...snapshot.source.usdcAccount, tokenOwner: GOAL_9L_EXECUTIVE },
    ]) {
      expect(() =>
        verifyFundingRouteSnapshot({
          ...snapshot,
          source: { ...snapshot.source, usdcAccount },
        }),
      ).toThrow(FundingRouteError);
    }
  });

  it('rejects a Wallet Child principal that is already funded', () => {
    for (const walletChild of [
      { ...snapshot.walletChild, ownerSolLamports: 1n },
      { ...snapshot.walletChild, ownerUsdcAccountCount: 1 },
      { ...snapshot.walletChild, executiveSolLamports: 1n },
      { ...snapshot.walletChild, executiveUsdcAccountCount: 1 },
      { ...snapshot.walletChild, recoverySolLamports: 1n },
      { ...snapshot.walletChild, recoveryUsdcAccountCount: 1 },
    ]) {
      expect(() => verifyFundingRouteSnapshot({ ...snapshot, walletChild })).toThrow(
        FundingRouteError,
      );
    }
  });

  it('rejects a Wallet Child read-back older than the source snapshot', () => {
    expect(() =>
      verifyFundingRouteSnapshot({
        ...snapshot,
        walletChildFinalizedSlot: snapshot.sourceFinalizedSlot - 1,
      }),
    ).toThrow(FundingRouteError);
  });

  it('permits at most 0.02 SOL and zero USDC to the isolated bootstrap owner', () => {
    const intent = {
      network: 'mainnet-beta',
      source: GOAL_9L_FUNDING_SOURCE,
      destinationOwner: GOAL_9L_WALLET_CHILD_OWNER,
      usdcBaseUnits: 0n,
      solLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
    } as const;
    expect(validateFundingTransferIntent(intent)).toEqual(intent);

    for (const changed of [
      { ...intent, usdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS },
      { ...intent, solLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS + 1n },
      { ...intent, destinationOwner: GOAL_9L_EXECUTIVE },
      { ...intent, source: GOAL_9L_WALLET_CHILD_OWNER },
    ]) {
      expect(() => validateFundingTransferIntent(changed)).toThrow(
        FundingRouteError,
      );
    }
  });

  it('contains no RPC, key loading, builder, signing, simulation, or send path', async () => {
    const source = await readFile('src/goal9l/funding-route.ts', 'utf8');
    expect(source).not.toMatch(
      /fetch\(|createUmi\(|Keypair|Signer|TransactionBuilder|simulateTransaction|signTransaction|sendTransaction|sendAndConfirm/i,
    );
  });

  it('publishes only bounded public snapshot evidence', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal9l.funding-route.json',
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      schemaVersion: 1,
      goal: '9L',
      status: 'STAGED_OUTSIDE_WALLET_CHILD',
      source: {
        address: GOAL_9L_FUNDING_SOURCE,
        solLamports: '88698606',
        usdcBaseUnits: '1078695',
      },
      permittedRoute: {
        bootstrap: {
          destinationOwner: GOAL_9L_WALLET_CHILD_OWNER,
          usdcBaseUnits: '0',
          maximumSolLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS.toString(),
        },
        treasury: {
          destinationAssetSigner: null,
          usdcBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS.toString(),
          status: 'BLOCKED_UNTIL_FINAL_ASSET_AND_AUDIT',
        },
      },
      checks: {
        walletChildStillUnfunded: true,
        fundingSourceKeyLoadedByLab: false,
        transactionBuilt: false,
        transactionSubmittedByLab: false,
      },
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /secret|privateKey|seed|mnemonic|api[_-]?key/i,
    );
  });
});
