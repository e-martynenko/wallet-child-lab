import { readFile } from 'node:fs/promises';

import {
  getAgentIdentityV2Size,
  getExecutionDelegateRecordV1Size,
  getExecutiveProfileV1Size,
} from '@metaplex-foundation/mpl-agent-registry';
import { describe, expect, it } from 'vitest';

import { GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS } from '../src/goal9m/bootstrap-fee.js';
import {
  assertSafePhaseOrder,
  FixedRentPlanError,
  GOAL_9Q_PHASE_ORDER,
  SPL_TOKEN_ACCOUNT_SIZE,
  verifyFixedRentPlan,
} from '../src/goal9q/fixed-rent-plan.js';

const quote = {
  finalizedSlot: 441_646_119,
  agentIdentityLamports: 1_614_720n,
  executiveProfileLamports: 1_169_280n,
  executionDelegateRecordLamports: 1_614_720n,
  tokenAccountLamports: 2_039_280n,
} as const;

describe('Goal 9Q fixed Mainnet rents and phased bootstrap', () => {
  it('uses the exact installed fixed account sizes', () => {
    expect(getAgentIdentityV2Size()).toBe(104);
    expect(getExecutiveProfileV1Size()).toBe(40);
    expect(getExecutionDelegateRecordV1Size()).toBe(104);
    expect(SPL_TOKEN_ACCOUNT_SIZE).toBe(165);
  });

  it('accepts the finalized quotes and keeps unknown costs explicit', () => {
    expect(verifyFixedRentPlan(quote)).toMatchObject({
      finalizedSlot: 441_646_119,
      fixedRentLamports: 8_477_280n,
      remainingBootstrapLamports: 11_512_720n,
      missing: {
        coreAssetRentAndIdentityPluginTopUp: true,
        metadataFundingTransactionFee: true,
        exactInternalTransactionFees: true,
        sameBytesSimulations: true,
      },
      go: false,
    });
    expect(
      verifyFixedRentPlan(quote).fixedRentLamports +
        verifyFixedRentPlan(quote).remainingBootstrapLamports,
    ).toBe(GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS);
  });

  it('rejects malformed, excessive, or changed fixed quotes', () => {
    for (const changed of [
      { ...quote, finalizedSlot: 0 },
      { ...quote, agentIdentityLamports: 0n },
      { ...quote, tokenAccountLamports: 2_500_001n },
      { ...quote, executionDelegateRecordLamports: 9_000_000n },
    ]) {
      expect(() => verifyFixedRentPlan(changed)).toThrow(FixedRentPlanError);
    }
  });

  it('keeps funding after audit/static review and simulations after funding', () => {
    expect(() => assertSafePhaseOrder()).not.toThrow();
    const unsafe = [...GOAL_9Q_PHASE_ORDER];
    const funding = unsafe.indexOf('SOURCE_TO_ASSET_SIGNER_USDC_FUNDING');
    unsafe.splice(funding, 1);
    unsafe.splice(4, 0, 'SOURCE_TO_ASSET_SIGNER_USDC_FUNDING');
    expect(() => assertSafePhaseOrder(unsafe)).toThrow(FixedRentPlanError);
    const impossible = [...GOAL_9Q_PHASE_ORDER];
    const simulation = impossible.indexOf(
      'SIMULATE_ACTION_REVOKE_AND_RESCUES',
    );
    impossible.splice(simulation, 1);
    impossible.splice(6, 0, 'SIMULATE_ACTION_REVOKE_AND_RESCUES');
    expect(() => assertSafePhaseOrder(impossible)).toThrow(FixedRentPlanError);
  });

  it('contains no RPC, key loading, transaction builder, or send path', async () => {
    const source = await readFile('src/goal9q/fixed-rent-plan.ts', 'utf8');
    expect(source).not.toMatch(
      /fetch\(|createUmi\(|createNoopSigner|generateSigner|keypairIdentity|TransactionBuilder|loadOrCreate|signTransaction|simulateTransaction|sendTransaction|sendAndConfirm/i,
    );
  });

  it('publishes fixed facts without turning unknowns into estimates', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal9q.fixed-rent-plan.json',
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(artifact).toMatchObject({
      goal: '9Q',
      network: 'mainnet-beta',
      fixedRentLamports: '8477280',
      remainingBootstrapLamports: '11512720',
      phaseOrder: GOAL_9Q_PHASE_ORDER,
      missing: {
        coreAssetRentAndIdentityPluginTopUp: true,
        metadataFundingTransactionFee: true,
        exactInternalTransactionFees: true,
        sameBytesSimulations: true,
      },
      verdict: 'NO_GO',
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /secret|privateKey|seed|mnemonic|api[_-]?key/i,
    );
  });
});
