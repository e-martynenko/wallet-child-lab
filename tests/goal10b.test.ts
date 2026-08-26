import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const SOURCE = '8W7sQKSRuYAdev3qcZCm9rrs4DDKbnEgD4fA8kvENvxt';
const OWNER = '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';

async function readArtifact() {
  return JSON.parse(
    await readFile(
      'artifacts/wallet-child-001.goal10b.jupiter-fee-rework.json',
      'utf8',
    ),
  ) as Record<string, unknown>;
}

describe('Goal 10B Jupiter fee mismatch rework', () => {
  it('records a fail-closed stop before any financial action', async () => {
    expect(await readArtifact()).toMatchObject({
      originalActionTimeConfirmation: {
        received: true,
        invalidatedByLiveFeeMismatch: true,
        submissionAuthorized: false,
      },
      liveJupiterPreview: {
        site: 'https://jup.ag/send',
        source: SOURCE,
        destination: OWNER,
        transferLamports: '19990000',
        observedFeeLamports: ['5001', '5003'],
        feeWasDynamic: true,
        expectedExactFeeLamports: '5000',
        stopReason: 'LIVE_FEE_DID_NOT_MATCH_CONFIRMED_EXACT_CONTRACT',
        sendClicked: false,
        walletPromptOpened: false,
        messageSigned: false,
        transactionSubmitted: false,
        fundsMoved: false,
      },
    });
  });

  it('keeps bootstrap, fee cap, and future USDC fee reserve at 0.02 SOL', async () => {
    const artifact = await readArtifact();
    const action = artifact['reworkedBootstrap'] as Record<string, string>;
    expect(action).toMatchObject({
      source: SOURCE,
      destination: OWNER,
      transferLamports: '19985000',
      maximumAllowedBootstrapFeeLamports: '10000',
      maximumBootstrapOutflowLamports: '19995000',
      futureUsdcFundingFeeReserveLamports: '5000',
      totalExperimentSolBoundaryLamports: '20000000',
      sourceSolBeforeLamports: '88698606',
      sourceSolAfterAtMinimumFeeLamports: '68708606',
      sourceSolAfterAtMaximumFeeLamports: '68703606',
      ownerSolAfterLamports: '19985000',
      sourceUsdcBeforeBaseUnits: '1078695',
      sourceUsdcAfterBaseUnits: '1078695',
      topUpAllowed: false,
    });
    expect(
      BigInt(action['transferLamports']!) +
        BigInt(action['maximumAllowedBootstrapFeeLamports']!) +
        BigInt(action['futureUsdcFundingFeeReserveLamports']!),
    ).toBe(BigInt(action['totalExperimentSolBoundaryLamports']!));
    expect(
      BigInt(action['sourceSolBeforeLamports']!) -
        BigInt(action['transferLamports']!) -
        BigInt(action['maximumAllowedBootstrapFeeLamports']!),
    ).toBe(BigInt(action['sourceSolAfterAtMaximumFeeLamports']!));
  });

  it('limits the closed-source UI exception to bootstrap and requires post-readback', async () => {
    expect(await readArtifact()).toMatchObject({
      executionBoundary: {
        mode: 'OFFICIAL_JUPITER_SEND_UI',
        limitedToExternalSourceToOwnerBootstrap: true,
        allowedForTreasuryOrDelegateActions: false,
        closedSourcePreSignMessageBytesInspectable: false,
        requireOfficialJupiterOrigin: true,
        requireExactVisibleDestination: true,
        requireExactVisibleTransferLamports: true,
        requireVisibleFeeAtOrBelowCap: true,
        requireFreshFinalizedBalancePreflight: true,
        requireFinalizedGetTransactionDecodeAfterSubmission: true,
        stopIfVisibleFeeExceedsCapOrCannotBeRead: true,
      },
    });
  });

  it('requires a new exact confirmation and publishes no secret or reusable bytes', async () => {
    const artifact = await readArtifact();
    expect(artifact).toMatchObject({
      status: 'AWAITING_REWORKED_ACTION_TIME_CONFIRMATION',
      actionTimeGate: {
        requiredPhrase: `CONFIRM BOOTSTRAP 0.019985 SOL WITH FEE CAP 0.00001 SOL TO ${OWNER}`,
        received: false,
        submissionAuthorized: false,
      },
      verification: {
        testFiles: 32,
        tests: 248,
        typecheckPassed: true,
        dependencyAuditClean: false,
        unchangedModerateUuidAdvisory: true,
        keyLoaded: false,
        messageSigned: false,
        transactionSubmitted: false,
        networkWrite: false,
        fundsMoved: false,
      },
      verdict: 'REWORKED_READY_FOR_NEW_CONFIRMATION_NOT_SUBMISSION',
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /messageBase64|serializedMessage|privateKey|secretKey|seed|mnemonic|api[_-]?key|rpcUrl/i,
    );
  });
});
