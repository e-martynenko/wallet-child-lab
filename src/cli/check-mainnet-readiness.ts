import { readGoal5Artifact } from '../goal5/artifact.js';
import { readGoal9ReadinessArtifact } from '../mainnet/artifact.js';
import {
  GOAL_9_MAX_ACQUISITION_COST_USD_CENTS,
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
  parseMainnetReadinessConfig,
  verifyMainnetReadiness,
} from '../mainnet/readiness.js';

async function main(): Promise<void> {
  const artifact = await readGoal9ReadinessArtifact();
  if (!artifact || artifact.status !== 'unfunded') {
    throw new Error('Prepare the isolated Goal 9 wallets first.');
  }
  const devnet = await readGoal5Artifact();
  if (
    !devnet ||
    devnet.status !== 'complete' ||
    devnet.checks.final?.activeDelegate !== false
  ) {
    throw new Error(
      'Devnet lifecycle evidence must be complete with delegation revoked.',
    );
  }
  const allPrincipals = [
    artifact.addresses.owner,
    artifact.addresses.executive,
    ...Object.values(devnet.addresses),
  ];
  if (new Set(allPrincipals).size !== allPrincipals.length) {
    throw new Error(
      'Readiness owner/executive must remain distinct from every Devnet principal.',
    );
  }
  const config = parseMainnetReadinessConfig(process.env);
  const verified = await verifyMainnetReadiness(config);

  console.info('Goal 9 Mainnet read-only facts: PASS');
  console.info(`Network: ${verified.network}`);
  console.info(`Genesis hash: ${verified.genesisHash}`);
  console.info(`RPC origin: ${verified.rpcOrigin}`);
  console.info(`USDC mint: ${verified.usdc.mint}`);
  console.info(`USDC decimals: ${verified.usdc.decimals}`);
  console.info(`USDC Token Program: ${verified.usdc.owner}`);
  console.info(`Agent Tools: ${verified.agentTools.programId}`);
  console.info('Readiness wallets: ISOLATED + UNFUNDED');
  console.info(
    `Hard asset caps: ${GOAL_9_MAX_USDC_BASE_UNITS} USDC base units + ${GOAL_9_MAX_SOL_RESERVE_LAMPORTS} lamports`,
  );
  console.info(
    `Hard acquisition-cost cap: USD ${Number(GOAL_9_MAX_ACQUISITION_COST_USD_CENTS) / 100}`,
  );
  console.info('Transaction built/signed/submitted: NO');
  console.info('Mainnet write capability: NOT IMPLEMENTED');
  console.info('GO/NO-GO: NO-GO');
  console.info(
    'Blocker: the fixed policy/builder has not implemented or Devnet-tested a USDC transfer.',
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Mainnet readiness check stopped: ${message}`);
  process.exitCode = 1;
});
