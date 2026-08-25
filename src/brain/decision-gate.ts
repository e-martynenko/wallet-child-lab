import { validateAction } from '../policy/policy.js';
import type {
  PolicyDenialReason,
  TransferIntent,
  TransferPolicy,
} from '../policy/types.js';
import {
  buildMinimalBrainRequest,
  parseAgentDecision,
  type AgentDecision,
  type MinimalBrainContext,
  type MinimalBrainProvider,
} from './minimal-brain.js';

export type BrainDenialReason =
  | 'MALFORMED_MODEL_OUTPUT'
  | 'MODEL_UNAVAILABLE'
  | PolicyDenialReason;

export type BrainGateResult =
  | Readonly<{
      outcome: 'NO_ACTION';
      decision: Readonly<{ decision: 'HOLD' }>;
    }>
  | Readonly<{
      outcome: 'POLICY_ALLOWED';
      decision: Readonly<{ decision: 'REQUEST_TRANSFER' }>;
      intent: TransferIntent;
    }>
  | Readonly<{
      outcome: 'DENY';
      reason: BrainDenialReason;
    }>;

export function gateAgentDecision(
  modelOutput: unknown,
  fixedIntent: TransferIntent,
  policy: TransferPolicy,
): BrainGateResult {
  const decision = parseAgentDecision(modelOutput);
  if (!decision) {
    return Object.freeze({
      outcome: 'DENY',
      reason: 'MALFORMED_MODEL_OUTPUT',
    });
  }
  if (decision.decision === 'HOLD') {
    return Object.freeze({ outcome: 'NO_ACTION', decision });
  }

  const policyDecision = validateAction(fixedIntent, policy);
  if (policyDecision.decision === 'DENY') {
    return Object.freeze({
      outcome: 'DENY',
      reason: policyDecision.reason,
    });
  }
  return Object.freeze({
    outcome: 'POLICY_ALLOWED',
    decision: decision as Extract<
      AgentDecision,
      { decision: 'REQUEST_TRANSFER' }
    >,
    intent: policyDecision.intent,
  });
}

export async function runMinimalBrain(
  provider: MinimalBrainProvider,
  model: string,
  context: MinimalBrainContext,
  fixedIntent: TransferIntent,
  policy: TransferPolicy,
): Promise<BrainGateResult> {
  const request = buildMinimalBrainRequest(model, context);
  let modelOutput: unknown;
  try {
    modelOutput = await provider(request);
  } catch {
    return Object.freeze({
      outcome: 'DENY',
      reason: 'MODEL_UNAVAILABLE',
    });
  }
  return gateAgentDecision(modelOutput, fixedIntent, policy);
}
