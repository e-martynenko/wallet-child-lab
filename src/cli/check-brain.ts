import {
  gateAgentDecision,
  runMinimalBrain,
} from '../brain/decision-gate.js';
import type { MinimalBrainProvider } from '../brain/minimal-brain.js';
import { loadWalletChildGoal6Policy } from '../policy/wallet-child-policy.js';

async function main(): Promise<void> {
  const configured = await loadWalletChildGoal6Policy();
  const holdProvider: MinimalBrainProvider = async () => ({ decision: 'HOLD' });
  const requestProvider: MinimalBrainProvider = async () => ({
    decision: 'REQUEST_TRANSFER',
  });
  const context = {
    allowance: 'AVAILABLE',
    task: 'CONSIDER_PERMITTED_TEST_PAYMENT',
  } as const;

  const [hold, request] = await Promise.all([
    runMinimalBrain(
      holdProvider,
      'offline-test-provider',
      context,
      configured.exampleIntent,
      configured.policy,
    ),
    runMinimalBrain(
      requestProvider,
      'offline-test-provider',
      context,
      configured.exampleIntent,
      configured.policy,
    ),
  ]);
  const malformed = gateAgentDecision(
    { decision: 'TRANSFER', amountLamports: 1_000_000_000 },
    configured.exampleIntent,
    configured.policy,
  );
  if (
    hold.outcome !== 'NO_ACTION' ||
    request.outcome !== 'POLICY_ALLOWED' ||
    malformed.outcome !== 'DENY' ||
    malformed.reason !== 'MALFORMED_MODEL_OUTPUT'
  ) {
    throw new Error('Minimal brain fail-closed checks did not pass.');
  }

  console.info('Goal 8 minimal brain: PASS');
  console.info('Model outputs: HOLD | REQUEST_TRANSFER only');
  console.info('Structured output: strict JSON Schema');
  console.info('Model tools: NONE');
  console.info(`HOLD -> ${hold.outcome}`);
  console.info(
    `REQUEST_TRANSFER -> ${request.outcome} -> ${request.intent.amountLamports} fixed lamports`,
  );
  console.info(`Malformed output -> ${malformed.outcome}`);
  console.info('API request sent: NO');
  console.info('RPC used: NO');
  console.info('Keys loaded: NO');
  console.info('Transaction built/signed/submitted: NO');
  console.info('Execution delegation remains: REVOKED');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Brain check stopped: ${message}`);
  process.exitCode = 1;
});
