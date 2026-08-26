import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const SOURCE = '8W7sQKSRuYAdev3qcZCm9rrs4DDKbnEgD4fA8kvENvxt';
const OWNER = '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';
const SIGNATURE =
  '5sB41GfGqTbPjiz4FZKia3TnoicCDTEW81yDCZeW7AoEZSKxTsDriYzjeTcaXjdw2Xx9p3pRgWEZtSRmwvih8sVq';

async function readArtifact() {
  return JSON.parse(
    await readFile(
      'artifacts/wallet-child-001.goal10c.bootstrap-receipt.json',
      'utf8',
    ),
  ) as Record<string, unknown>;
}

describe('Goal 10C finalized bootstrap receipt', () => {
  it('binds the exact confirmation to a drift-free finalized preflight', async () => {
    expect(await readArtifact()).toMatchObject({
      status: 'FINALIZED_RECONCILED',
      actionTimeConfirmation: {
        exactPhrase: `CONFIRM BOOTSTRAP 0.019985 SOL WITH FEE CAP 0.00001 SOL TO ${OWNER}`,
        received: true,
        matchedReworkedContract: true,
        scope: 'ONE_EXTERNAL_SOURCE_TO_OWNER_SOL_BOOTSTRAP',
      },
      finalizedPreflight: {
        slot: 441800275,
        source: SOURCE,
        sourceSolLamports: '88698606',
        sourceUsdcBaseUnits: '1078695',
        ownerSolLamports: '0',
        walletChildAccountsChecked: 10,
        allWalletChildAccountsAbsent: true,
      },
    });
  });

  it('records a matching official-Jupiter preview and finalized receipt', async () => {
    expect(await readArtifact()).toMatchObject({
      liveJupiterPreview: {
        origin: 'https://jup.ag',
        path: '/send',
        sourceMatchesConnectedWallet: true,
        destination: OWNER,
        transferLamports: '19985000',
        visibleFeeLamports: '5001',
        maximumAllowedFeeLamports: '10000',
        previewPassed: true,
      },
      finalizedTransaction: {
        signature: SIGNATURE,
        slot: 441800468,
        confirmationStatus: 'finalized',
        error: null,
        version: 'legacy',
        requiredSignatures: 1,
        addressTableLookups: 0,
        feeLamports: '5001',
        baseFeeLamports: '5000',
        priorityFeeLamports: '1',
        computeUnitsConsumed: 450,
      },
    });
  });

  it('allows only bounded compute settings and the exact System transfer', async () => {
    const artifact = await readArtifact();
    const transaction = artifact['finalizedTransaction'] as Record<
      string,
      unknown
    >;
    expect(transaction['instructions']).toEqual([
      {
        index: 0,
        program: 'ComputeBudget111111111111111111111111111111',
        type: 'SET_COMPUTE_UNIT_LIMIT',
        units: 500,
        accounts: [],
      },
      {
        index: 1,
        program: 'ComputeBudget111111111111111111111111111111',
        type: 'SET_COMPUTE_UNIT_PRICE',
        microLamports: '1602',
        accounts: [],
      },
      {
        index: 2,
        program: '11111111111111111111111111111111',
        type: 'SYSTEM_TRANSFER',
        source: SOURCE,
        destination: OWNER,
        lamports: '19985000',
      },
    ]);
    expect(transaction['accounts']).toEqual([
      { pubkey: SOURCE, signer: true, writable: true },
      { pubkey: OWNER, signer: false, writable: true },
      {
        pubkey: '11111111111111111111111111111111',
        signer: false,
        writable: false,
      },
      {
        pubkey: 'ComputeBudget111111111111111111111111111111',
        signer: false,
        writable: false,
      },
    ]);
    expect(transaction['preBalancesLamports']).toEqual([
      '88698606',
      '0',
      '1',
      '1',
    ]);
    expect(transaction['postBalancesLamports']).toEqual([
      '68708605',
      '19985000',
      '1',
      '1',
    ]);
  });

  it('reconciles finalized balances and preserves the hard SOL boundary', async () => {
    const artifact = await readArtifact();
    expect(artifact).toMatchObject({
      finalizedReadback: {
        slot: 441800651,
        sourceSolLamports: '68708605',
        ownerSolLamports: '19985000',
        sourceUsdcBaseUnits: '1078695',
        sourceUsdcChanged: false,
        remainingWalletChildAccountsChecked: 9,
        allRemainingWalletChildAccountsAbsent: true,
      },
      reconciliation: {
        sourceSolDeltaLamports: '19990001',
        ownerSolDeltaLamports: '19985000',
        transactionFeeLamports: '5001',
        sourceUsdcDeltaBaseUnits: '0',
        futureUsdcFundingFeeReserveLamports: '5000',
        actualBootstrapPlusFutureReserveLamports: '19995001',
        maximumExperimentSolBoundaryLamports: '20000000',
        unallocatedBoundaryLamports: '4999',
        topUpAllowed: false,
        passed: true,
      },
    });
    const balance = artifact['reconciliation'] as Record<string, string>;
    expect(
      BigInt(balance['ownerSolDeltaLamports']!) +
        BigInt(balance['transactionFeeLamports']!),
    ).toBe(BigInt(balance['sourceSolDeltaLamports']!));
    expect(
      BigInt(balance['ownerSolDeltaLamports']!) +
        BigInt(balance['transactionFeeLamports']!) +
        BigInt(balance['futureUsdcFundingFeeReserveLamports']!) +
        BigInt(balance['unallocatedBoundaryLamports']!),
    ).toBe(BigInt(balance['maximumExperimentSolBoundaryLamports']!));
  });

  it('publishes no secret and stops before every next write', async () => {
    const artifact = await readArtifact();
    expect(artifact).toMatchObject({
      verification: {
        testFiles: 33,
        tests: 253,
        typecheckPassed: true,
        dependencyAuditClean: false,
        unchangedModerateUuidAdvisory: true,
        sourceKeyLoadedByLab: false,
        externalWalletSignatureObserved: true,
        transactionSubmitted: true,
        networkWrite: true,
        fundsMoved: true,
        finalizedDecodePassed: true,
        finalizedBalanceReconciliationPassed: true,
      },
      nextGate: {
        nextFinancialActionAuthorized: false,
        treasuryActionAuthorized: false,
        treasuryActionVerdict: 'NO_GO',
      },
      verdict: 'BOOTSTRAP_PASS_STOP_BEFORE_NEXT_WRITE',
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /messageBase64|serializedMessage|privateKey|secretKey|seed|mnemonic|api[_-]?key|rpcUrl/i,
    );
  });
});
