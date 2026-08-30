import { readFile } from 'node:fs/promises';

import {
  getExecutionDelegateRecordV1AccountDataSerializer,
  getExecutiveProfileV1AccountDataSerializer,
  tools as mplAgentToolsTypes,
} from '@metaplex-foundation/mpl-agent-registry';
import {
  getTokenAccountDataSerializer,
  TokenState,
} from '@metaplex-foundation/mpl-toolbox';
import { none, publicKey } from '@metaplex-foundation/umi';
import { describe, expect, it, vi } from 'vitest';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../src/chain/network.js';
import {
  GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS,
} from '../src/goal10l/mainnet-birth-execution.js';
import {
  GOAL_10N_ACTIVATION_RENT_LAMPORTS,
  GOAL_10N_CONSERVATIVE_OWNER_AFTER_LAMPORTS,
  GOAL_10N_CONSERVATIVE_OWNER_DEBIT_LAMPORTS,
  GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS,
  GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS,
  GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS,
  type PostBirthActivationReview,
} from '../src/goal10n/post-birth-activation-review.js';
import {
  GOAL_10O_CONFIRMATION,
  GOAL_10O_EXPECTED_OWNER_AFTER_LAMPORTS,
  GOAL_10O_MAX_FEE_LAMPORTS,
  GOAL_10O_TOTAL_DEBIT_LAMPORTS,
  GOAL_10O_TRANSACTION_BYTE_LENGTH,
  MainnetActivationWriteReviewError,
  buildUnsignedMainnetActivation,
  reviewMainnetActivationWrite,
} from '../src/goal10o/mainnet-activation-write-review.js';
import {
  GOAL_9P_ASSET_SIGNER,
  GOAL_9P_ASSET_SIGNER_USDC_ATA,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_EXECUTION_DELEGATE_RECORD,
  GOAL_9P_EXECUTIVE,
  GOAL_9P_EXECUTIVE_PROFILE,
  GOAL_9P_OWNER,
  GOAL_9P_RECOVERY,
  GOAL_9P_RECOVERY_USDC_ATA,
} from '../src/goal9p/final-contract.js';
import {
  MPL_AGENT_TOOLS_PROGRAM_ID,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
} from '../src/mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../src/policy/policy.js';

const BLOCKHASH = '11111111111111111111111111111111';
const config = {
  rpcUrl: 'https://mainnet.example.test/private?credential=hidden',
  rpcOrigin: 'https://mainnet.example.test',
};

function preflight(): PostBirthActivationReview {
  return {
    finalizedSlotFloor: 100,
    accounts: {
      ownerLamports: GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS,
      childAccountsAbsent: true,
      activeExecutionDelegates: 0,
    },
    activation: {
      totalRentLamports: GOAL_10N_ACTIVATION_RENT_LAMPORTS,
    },
    checks: {
      identityAndOwnerReadbackPassed: true,
      freshExactFeesQuoted: true,
    },
    verdict: 'PASS_STOP_BEFORE_ATA_PERMISSION_OR_FUNDING_WRITE',
  } as PostBirthActivationReview;
}

function base64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

function tokenData(owner: string): string {
  return base64(
    getTokenAccountDataSerializer().serialize({
      mint: publicKey(SOLANA_MAINNET_USDC_MINT),
      owner: publicKey(owner),
      amount: 0n,
      delegate: none(),
      state: TokenState.Initialized,
      isNative: none(),
      delegatedAmount: 0n,
      closeAuthority: none(),
    }),
  );
}

function profileData(): string {
  return base64(
    getExecutiveProfileV1AccountDataSerializer().serialize({
      key: mplAgentToolsTypes.Key.ExecutiveProfileV1,
      authority: publicKey(GOAL_9P_EXECUTIVE),
    }),
  );
}

function delegateData(): string {
  return base64(
    getExecutionDelegateRecordV1AccountDataSerializer().serialize({
      key: mplAgentToolsTypes.Key.ExecutionDelegateRecordV1,
      bump: 255,
      executiveProfile: publicKey(GOAL_9P_EXECUTIVE_PROFILE),
      authority: publicKey(GOAL_9P_EXECUTIVE),
      agentAsset: publicKey(GOAL_9P_CORE_ASSET),
    }),
  );
}

function simulatedAccount(lamportValue: bigint, owner: string, data = '') {
  return {
    lamports: Number(lamportValue),
    owner,
    executable: false,
    data: [data, 'base64'],
  };
}

function mockRpc(change?: 'fee' | 'owner' | 'token' | 'profile' | 'stale') {
  return vi.fn<typeof fetch>(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
      params: unknown[];
    };
    let result: unknown;
    if (request.method === 'getGenesisHash') {
      result = SOLANA_MAINNET_BETA_GENESIS_HASH;
    } else if (request.method === 'getLatestBlockhash') {
      result = {
        context: { slot: 200 },
        value: { blockhash: BLOCKHASH, lastValidBlockHeight: 900 },
      };
    } else if (request.method === 'getFeeForMessage') {
      result = {
        context: { slot: 201 },
        value: Number(
          change === 'fee'
            ? GOAL_10O_MAX_FEE_LAMPORTS + 1n
            : GOAL_10O_MAX_FEE_LAMPORTS,
        ),
      };
    } else if (request.method === 'simulateTransaction') {
      const sourceOwner = change === 'token' ? GOAL_9P_RECOVERY : GOAL_9P_ASSET_SIGNER;
      const profileAuthority =
        change === 'profile' ? GOAL_9P_OWNER : GOAL_9P_EXECUTIVE;
      const profileBytes = base64(
        getExecutiveProfileV1AccountDataSerializer().serialize({
          key: mplAgentToolsTypes.Key.ExecutiveProfileV1,
          authority: publicKey(profileAuthority),
        }),
      );
      result = {
        context: { slot: change === 'stale' ? 99 : 202 },
        value: {
          err: null,
          logs: ['simulation passed'],
          accounts: [
            simulatedAccount(
              GOAL_10O_EXPECTED_OWNER_AFTER_LAMPORTS,
              change === 'owner' ? SOLANA_LEGACY_TOKEN_PROGRAM_ID : SYSTEM_PROGRAM_ID,
            ),
            simulatedAccount(
              GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS,
              SOLANA_LEGACY_TOKEN_PROGRAM_ID,
              tokenData(sourceOwner),
            ),
            simulatedAccount(
              GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS,
              SOLANA_LEGACY_TOKEN_PROGRAM_ID,
              tokenData(GOAL_9P_RECOVERY),
            ),
            simulatedAccount(
              GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS,
              MPL_AGENT_TOOLS_PROGRAM_ID,
              profileBytes,
            ),
            simulatedAccount(
              GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS,
              MPL_AGENT_TOOLS_PROGRAM_ID,
              delegateData(),
            ),
          ],
          unitsConsumed: 70_000,
        },
      };
    } else {
      throw new Error(`Unexpected Goal 10O RPC method: ${request.method}`);
    }
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  });
}

describe('Goal 10O keyless atomic activation write review', () => {
  it('freezes one four-instruction transaction with two zero signatures', () => {
    const unsigned = buildUnsignedMainnetActivation(BLOCKHASH);
    expect(unsigned).toMatchObject({
      transactionByteLength: GOAL_10O_TRANSACTION_BYTE_LENGTH,
      instructionCount: 4,
      signatureCount: 2,
      signaturesAllZero: true,
      requiredSigners: [GOAL_9P_OWNER, GOAL_9P_EXECUTIVE],
      messageSha256:
        '74f06a41420df7504a1566aedc8574490d2ee7976e643a937374dd58dde0756b',
    });
  });

  it('quotes and simulates the exact empty activation without funding', async () => {
    await expect(
      reviewMainnetActivationWrite(config, preflight(), mockRpc()),
    ).resolves.toMatchObject({
      quotedFeeLamports: GOAL_10O_MAX_FEE_LAMPORTS,
      totalActivationRentLamports: GOAL_10N_ACTIVATION_RENT_LAMPORTS,
      simulatedOwnerDebitLamports: GOAL_10O_TOTAL_DEBIT_LAMPORTS,
      simulatedOwnerAfterLamports: GOAL_10O_EXPECTED_OWNER_AFTER_LAMPORTS,
      createdAccountsEmpty: true,
      broadExecutionDelegateCreated: true,
      fundingIncluded: false,
      usdcTransferIncluded: false,
      externalActionIncluded: false,
      simulationPassed: true,
      keyLoaded: false,
      messageSigned: false,
      transactionSubmitted: false,
      requiredExactConfirmation: GOAL_10O_CONFIRMATION,
      verdict: 'STOP_READY_FOR_EXACT_UNFUNDED_ACTIVATION_CONFIRMATION',
    });
  });

  it.each(['fee', 'owner', 'token', 'profile', 'stale'] as const)(
    'fails closed on %s drift',
    async (change) => {
      await expect(
        reviewMainnetActivationWrite(config, preflight(), mockRpc(change)),
      ).rejects.toThrow(MainnetActivationWriteReviewError);
    },
  );

  it('keeps the atomic write cheaper than the earlier conservative plan', () => {
    expect(GOAL_10O_TOTAL_DEBIT_LAMPORTS).toBe(6_872_560n);
    expect(GOAL_10O_EXPECTED_OWNER_AFTER_LAMPORTS).toBe(7_105_032n);
    expect(GOAL_10O_TOTAL_DEBIT_LAMPORTS).toBeLessThan(
      GOAL_10N_CONSERVATIVE_OWNER_DEBIT_LAMPORTS,
    );
    expect(GOAL_10O_EXPECTED_OWNER_AFTER_LAMPORTS).toBeGreaterThan(
      GOAL_10N_CONSERVATIVE_OWNER_AFTER_LAMPORTS,
    );
  });

  it('contains no key load, signing, or transaction submission path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal10o/mainnet-activation-write-review.ts', 'utf8'),
        readFile('src/cli/review-mainnet-activation-write.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /generateSigner|keypairIdentity|loadExistingIsolatedSigner|buildAndSign|signTransaction|sendTransaction|sendAndConfirm/i,
    );
    expect(sources).not.toMatch(/console\.(?:info|log)\([^\n]*(?:messageBase64|transactionBase64)/i);
  });

  it('publishes a STOP artifact without reusable transaction bytes', async () => {
    const raw = await readFile(
      'artifacts/wallet-child-001.goal10o.mainnet-activation-write-review.json',
      'utf8',
    );
    expect(JSON.parse(raw)).toMatchObject({
      status: 'KEYLESS_MAINNET_ACTIVATION_WRITE_REVIEW_PASSED',
      activation: {
        atomicTransactionCount: 1,
        transactionByteLength: GOAL_10O_TRANSACTION_BYTE_LENGTH,
        instructionCount: 4,
        requiredSigners: [GOAL_9P_OWNER, GOAL_9P_EXECUTIVE],
        assetSignerUsdcAta: GOAL_9P_ASSET_SIGNER_USDC_ATA,
        recoveryUsdcAta: GOAL_9P_RECOVERY_USDC_ATA,
        executiveProfile: GOAL_9P_EXECUTIVE_PROFILE,
        executionDelegateRecord: GOAL_9P_EXECUTION_DELEGATE_RECORD,
      },
      checks: {
        broadExecutionDelegateCreated: true,
        fundingIncluded: false,
        usdcTransferIncluded: false,
        externalActionIncluded: false,
        keyLoaded: false,
        messageSigned: false,
        simulationPassed: true,
        transactionSubmitted: false,
      },
      actionTimeConfirmation: {
        received: false,
        requiredExactPhrase: GOAL_10O_CONFIRMATION,
      },
      verdict: 'STOP_READY_FOR_EXACT_UNFUNDED_ACTIVATION_CONFIRMATION',
    });
    expect(raw).not.toMatch(
      /messageBase64|transactionBase64|serializedMessage|secretKey|privateKey|mnemonic|api[_-]?key|rpcUrl/i,
    );
  });
});
