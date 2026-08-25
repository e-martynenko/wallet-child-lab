import {
  type PolicyDecision,
  TransferIntentSchema,
  TransferPolicySchema,
} from './types.js';

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

export function validateAction(
  action: unknown,
  policyInput: unknown,
): PolicyDecision {
  const parsedPolicy = TransferPolicySchema.safeParse(policyInput);
  if (!parsedPolicy.success) {
    return Object.freeze({
      decision: 'DENY',
      reason: 'MALFORMED_POLICY',
    });
  }
  const policy = Object.freeze(parsedPolicy.data);

  if (policy.allowedProgram !== SYSTEM_PROGRAM_ID) {
    return Object.freeze({
      decision: 'DENY',
      reason: 'PROGRAM_NOT_ALLOWED',
    });
  }
  if (policy.sourceAssetSigner === policy.allowedDestination) {
    return Object.freeze({
      decision: 'DENY',
      reason: 'INVALID_SOURCE_DESTINATION_RELATIONSHIP',
    });
  }

  const parsedAction = TransferIntentSchema.safeParse(action);
  if (!parsedAction.success) {
    return Object.freeze({
      decision: 'DENY',
      reason: 'MALFORMED_ACTION',
    });
  }
  const intent = Object.freeze(parsedAction.data);

  if (intent.network !== policy.network) {
    return Object.freeze({ decision: 'DENY', reason: 'WRONG_NETWORK' });
  }
  if (intent.token !== policy.token) {
    return Object.freeze({ decision: 'DENY', reason: 'TOKEN_NOT_ALLOWED' });
  }
  if (intent.amountLamports <= 0n) {
    return Object.freeze({ decision: 'DENY', reason: 'INVALID_AMOUNT' });
  }
  if (intent.amountLamports > policy.maximumLamports) {
    return Object.freeze({ decision: 'DENY', reason: 'AMOUNT_OVER_LIMIT' });
  }
  if (intent.destination !== policy.allowedDestination) {
    return Object.freeze({
      decision: 'DENY',
      reason: 'DESTINATION_NOT_ALLOWED',
    });
  }

  return Object.freeze({ decision: 'ALLOW', intent, policy });
}
