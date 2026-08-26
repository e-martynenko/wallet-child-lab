import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../src/chain/network.js';
import {
  BootstrapSimulationError,
  simulateUnsignedBootstrap,
} from '../src/goal10a/bootstrap-simulation.js';
import { buildUnsignedBootstrapMessage } from '../src/goal9m/bootstrap-fee.js';

const SOURCE = '8W7sQKSRuYAdev3qcZCm9rrs4DDKbnEgD4fA8kvENvxt';
const OWNER = '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BLOCKHASH = '11111111111111111111111111111111';
const config = {
  rpcUrl: 'https://mainnet.example.test/private?credential=hidden',
  rpcOrigin: 'https://mainnet.example.test',
};

function account(lamports: number) {
  return {
    lamports,
    owner: '11111111111111111111111111111111',
    executable: false,
    data: ['', 'base64'],
    rentEpoch: 0,
    space: 0,
  };
}

function mockSimulationRpc(
  change?: 'source' | 'fee' | 'simulation' | 'post-balance' | 'lag-once',
) {
  let lagReturned = false;
  return async (_url: string | URL | Request, init?: RequestInit) => {
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
        context: { slot: 500 },
        value: { blockhash: BLOCKHASH, lastValidBlockHeight: 900 },
      };
    } else if (request.method === 'getMultipleAccounts') {
      result = {
        context: { slot: 501 },
        value: [account(change === 'source' ? 88_698_605 : 88_698_606), null],
      };
    } else if (request.method === 'getFeeForMessage') {
      result = {
        context: { slot: 501 },
        value: change === 'fee' ? 5_001 : 5_000,
      };
    } else {
      if (change === 'lag-once' && !lagReturned) {
        lagReturned = true;
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32016, message: 'Minimum context slot not reached' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      const [transaction, options] = request.params as [
        string,
        Record<string, unknown>,
      ];
      const bytes = Buffer.from(transaction, 'base64');
      const reviewed = buildUnsignedBootstrapMessage(BLOCKHASH).transaction;
      expect(bytes).toHaveLength(215);
      expect(bytes[0]).toBe(1);
      expect(bytes.subarray(1, 65).equals(Buffer.alloc(64))).toBe(true);
      expect(
        bytes.subarray(65).equals(Buffer.from(reviewed.serializedMessage)),
      ).toBe(true);
      expect(options).toMatchObject({
        encoding: 'base64',
        sigVerify: false,
        replaceRecentBlockhash: false,
        minContextSlot: 501,
        accounts: {
          encoding: 'base64',
          addresses: [SOURCE, OWNER],
        },
      });
      result = {
        context: { slot: 502 },
        value: {
          err: change === 'simulation' ? { InstructionError: [0, 'Fail'] } : null,
          logs: [],
          unitsConsumed: 150,
          accounts: [
            account(change === 'post-balance' ? 68_703_605 : 68_703_606),
            account(19_990_000),
          ],
        },
      };
    }
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: request.id, result }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
}

async function readArtifact() {
  return JSON.parse(
    await readFile(
      'artifacts/wallet-child-001.goal10a.bootstrap-review.json',
      'utf8',
    ),
  ) as Record<string, unknown>;
}

describe('Goal 10A Mainnet activation and bootstrap preview', () => {
  it('simulates the exact unsigned message and reconciles both SOL balances', async () => {
    const fetchMock = mockSimulationRpc();
    await expect(
      simulateUnsignedBootstrap(config, fetchMock),
    ).resolves.toMatchObject({
      blockhashContextSlot: 500,
      accountContextSlot: 501,
      feeContextSlot: 501,
      simulationContextSlot: 502,
      serializedTransactionBytes: 215,
      sourceBeforeLamports: 88_698_606n,
      ownerBeforeLamports: 0n,
      quotedFeeLamports: 5_000n,
      sourceAfterLamports: 68_703_606n,
      ownerAfterLamports: 19_990_000n,
      unitsConsumed: 150,
      signatureVerification: false,
      unsigned: true,
      simulationSucceeded: true,
      transactionSubmitted: false,
    });
  });

  it.each(['source', 'fee', 'simulation', 'post-balance'] as const)(
    'stops when %s evidence changes',
    async (change) => {
      await expect(
        simulateUnsignedBootstrap(config, mockSimulationRpc(change)),
      ).rejects.toThrow(BootstrapSimulationError);
    },
  );

  it('retries only the bounded minimum-context lag response', async () => {
    await expect(
      simulateUnsignedBootstrap(config, mockSimulationRpc('lag-once')),
    ).resolves.toMatchObject({ simulationSucceeded: true });
  });

  it('keeps the simulation path unsigned and send-free', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal10a/bootstrap-simulation.ts', 'utf8'),
        readFile('src/cli/simulate-bootstrap-mainnet.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /loadOrCreate|keypairIdentity|signTransaction|sendTransaction|sendAndConfirm/i,
    );
    expect(buildUnsignedBootstrapMessage(BLOCKHASH).transaction.signatures[0]).toEqual(
      new Uint8Array(64),
    );
  });

  it('records the exact project gate but keeps submission separately gated', async () => {
    expect(await readArtifact()).toMatchObject({
      status: 'AWAITING_ACTION_TIME_CONFIRMATION',
      approval: {
        exactPhrase: 'ENABLE MAINNET EXPERIMENT',
        received: true,
        matchedProjectContract: true,
        scope: 'PHASED_MAINNET_EXPERIMENT',
        submissionAuthorized: false,
      },
      actionTimeGate: {
        requiredPhrase: `CONFIRM BOOTSTRAP 0.01999 SOL TO ${OWNER}`,
        received: false,
        executionMode: 'OFFICIAL_JUPITER_SEND_UI_MANUAL_CONFIRMATION',
      },
      externalWalletInterface: {
        site: 'https://jup.ag',
        officialJupiterWalletConnected: true,
        connectedSourceMatches: true,
        builtInSendAvailable: true,
        genericInjectedSolanaProviderAvailable: false,
        decision: 'USE_OFFICIAL_JUPITER_SEND_UI_AND_INSPECT_FINAL_PREVIEW',
        transactionDataEntered: false,
        walletPromptOpened: false,
      },
      verdict: 'READY_FOR_CONFIRMATION_NOT_SUBMISSION',
    });
  });

  it('closes the exact first-action arithmetic under the hard SOL boundary', async () => {
    const artifact = await readArtifact();
    expect(artifact).toMatchObject({
      preflight: {
        source: SOURCE,
        sourceSolLamports: '88698606',
        sourceUsdcBaseUnits: '1078695',
        sourceUsdcMint: USDC_MINT,
        sourceUsdcOwnerMatches: true,
        walletChildAccountsChecked: 10,
        allWalletChildAccountsAbsent: true,
      },
      candidateAction: {
        type: 'LEGACY_SYSTEM_TRANSFER',
        source: SOURCE,
        destination: OWNER,
        program: '11111111111111111111111111111111',
        transferLamports: '19990000',
        quotedFeeLamports: '5000',
        maximumAllowedFeeLamports: '5000',
        maximumSourceOutflowLamports: '19995000',
        expectedSourceSolAfterLamports: '68703606',
        expectedOwnerSolAfterLamports: '19990000',
        expectedSourceUsdcAfterBaseUnits: '1078695',
        futureUsdcFundingFeeReserveLamports: '5000',
        totalExperimentSolBoundaryLamports: '20000000',
      },
    });
    const action = artifact['candidateAction'] as Record<string, string>;
    const preflight = artifact['preflight'] as Record<string, string>;
    expect(
      BigInt(action['transferLamports']!) +
        BigInt(action['quotedFeeLamports']!),
    ).toBe(BigInt(action['maximumSourceOutflowLamports']!));
    expect(
      BigInt(preflight['sourceSolLamports']!) -
        BigInt(action['maximumSourceOutflowLamports']!),
    ).toBe(BigInt(action['expectedSourceSolAfterLamports']!));
    expect(
      BigInt(action['transferLamports']!) +
        BigInt(action['quotedFeeLamports']!) +
        BigInt(action['futureUsdcFundingFeeReserveLamports']!),
    ).toBe(BigInt(action['totalExperimentSolBoundaryLamports']!));
  });

  it('fails closed on drift and publishes no signing material', async () => {
    const artifact = await readArtifact();
    expect(artifact).toMatchObject({
      actionTimeGate: {
        stopIfSourceBalanceChanges: true,
        stopIfDestinationBalanceChanges: true,
        stopIfFeeIsNotExactly5000Lamports: true,
        stopIfWalletAddsPriorityOrOtherFee: true,
        stopIfMessageShapeChanges: true,
      },
      verification: {
        dependencyAuditClean: false,
        unchangedModerateUuidAdvisory: true,
        keyLoaded: false,
        messageSigned: false,
        simulationAttempted: true,
        unsignedSimulationSucceeded: true,
        transactionSubmitted: false,
        networkWrite: false,
        fundsMoved: false,
      },
      unsignedSimulation: {
        signatureVerification: false,
        result: 'PASS',
        unitsConsumed: 150,
        sourceAfterLamports: '68703606',
        ownerAfterLamports: '19990000',
        transactionSubmitted: false,
      },
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /messageBase64|serializedMessage|privateKey|secretKey|seed|mnemonic|api[_-]?key|rpcUrl/i,
    );
  });
});
