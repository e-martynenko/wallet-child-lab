import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  gateAgentDecision,
  runMinimalBrain,
} from '../src/brain/decision-gate.js';
import {
  AgentDecisionSchema,
  buildMinimalBrainRequest,
  MinimalBrainContractError,
  type MinimalBrainProvider,
} from '../src/brain/minimal-brain.js';
import { SYSTEM_PROGRAM_ID } from '../src/policy/policy.js';
import type { TransferIntent, TransferPolicy } from '../src/policy/types.js';

const ASSET_SIGNER = '5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD';
const RECEIVER = 'B96kUFzEvVzmW9DKfg3VDV9ZagXXjZ9rc3vyZeMk5svy';
const OWNER = '7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c';
const EXECUTIVE = 'ET7sHJiBdS5VgXfQvgzenS9U1iPAa5b3dUZKotCDW2dn';

const fixedIntent: TransferIntent = {
  kind: 'TRANSFER',
  network: 'devnet',
  token: 'SOL',
  destination: RECEIVER,
  amountLamports: 100_000n,
};

const policy: TransferPolicy = {
  network: 'devnet',
  token: 'SOL',
  sourceAssetSigner: ASSET_SIGNER,
  allowedDestination: RECEIVER,
  maximumLamports: 1_000_000n,
  maximumFeePayerSpendLamports: 100_000n,
  allowedProgram: SYSTEM_PROGRAM_ID,
};

const context = {
  allowance: 'AVAILABLE',
  task: 'CONSIDER_PERMITTED_TEST_PAYMENT',
} as const;

describe('Goal 8 model output contract', () => {
  it.each([
    { decision: 'HOLD' },
    { decision: 'REQUEST_TRANSFER' },
  ])('accepts only an exact decision object: $decision', (decision) => {
    expect(AgentDecisionSchema.safeParse(decision).success).toBe(true);
  });

  it.each([
    'HOLD',
    { decision: 'TRANSFER' },
    { decision: 'hold' },
    { decision: 'REQUEST_TRANSFER', amountLamports: 100_000 },
    { decision: 'REQUEST_TRANSFER', destination: RECEIVER },
    { decision: 'REQUEST_TRANSFER', program: SYSTEM_PROGRAM_ID },
    { decision: 'REQUEST_TRANSFER', instructions: [] },
    { decision: 'HOLD', reason: 'because' },
    null,
  ])('rejects malformed or expanded model output', (output) => {
    expect(AgentDecisionSchema.safeParse(output).success).toBe(false);
    expect(gateAgentDecision(output, fixedIntent, policy)).toEqual({
      outcome: 'DENY',
      reason: 'MALFORMED_MODEL_OUTPUT',
    });
  });
});

describe('Goal 8 structured request', () => {
  it('uses strict JSON Schema and gives the model no tools', () => {
    const request = buildMinimalBrainRequest('offline-test-provider', context);
    expect(request).toMatchObject({
      store: false,
      tools: [],
      tool_choice: 'none',
      text: {
        format: {
          type: 'json_schema',
          name: 'wallet_child_decision',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              decision: {
                type: 'string',
                enum: ['HOLD', 'REQUEST_TRANSFER'],
              },
            },
            required: ['decision'],
            additionalProperties: false,
          },
        },
      },
    });

    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain(OWNER);
    expect(serialized).not.toContain(EXECUTIVE);
    expect(serialized).not.toContain(ASSET_SIGNER);
    expect(serialized).not.toContain(RECEIVER);
  });

  it('rejects unknown context fields and missing model names', () => {
    expect(() =>
      buildMinimalBrainRequest('offline-test-provider', {
        ...context,
        destination: RECEIVER,
      }),
    ).toThrow(MinimalBrainContractError);
    expect(() => buildMinimalBrainRequest(' ', context)).toThrow(
      MinimalBrainContractError,
    );
  });
});

describe('Goal 8 deterministic policy handoff', () => {
  it('turns HOLD into no action', () => {
    expect(gateAgentDecision({ decision: 'HOLD' }, fixedIntent, policy)).toEqual({
      outcome: 'NO_ACTION',
      decision: { decision: 'HOLD' },
    });
  });

  it('maps REQUEST_TRANSFER to the fixed intent, then applies policy', () => {
    expect(
      gateAgentDecision(
        { decision: 'REQUEST_TRANSFER' },
        fixedIntent,
        policy,
      ),
    ).toEqual({
      outcome: 'POLICY_ALLOWED',
      decision: { decision: 'REQUEST_TRANSFER' },
      intent: fixedIntent,
    });
  });

  it('cannot override a policy denial', () => {
    expect(
      gateAgentDecision(
        { decision: 'REQUEST_TRANSFER' },
        fixedIntent,
        { ...policy, allowedProgram: EXECUTIVE },
      ),
    ).toEqual({ outcome: 'DENY', reason: 'PROGRAM_NOT_ALLOWED' });
  });

  it('fails closed when the provider is unavailable', async () => {
    const provider: MinimalBrainProvider = async () => {
      throw new Error('provider unavailable');
    };
    await expect(
      runMinimalBrain(
        provider,
        'offline-test-provider',
        context,
        fixedIntent,
        policy,
      ),
    ).resolves.toEqual({ outcome: 'DENY', reason: 'MODEL_UNAVAILABLE' });
  });

  it('passes only the tiny request contract to the provider', async () => {
    let received: unknown;
    const provider: MinimalBrainProvider = async (request) => {
      received = request;
      return { decision: 'REQUEST_TRANSFER' };
    };
    const result = await runMinimalBrain(
      provider,
      'offline-test-provider',
      context,
      fixedIntent,
      policy,
    );
    expect(result.outcome).toBe('POLICY_ALLOWED');
    expect(JSON.stringify(received)).not.toMatch(
      /7Pz13|ET7sH|5ZaoS|B96kU|secret|keypair|signer|rpc/i,
    );
  });
});

describe('Goal 8 source isolation', () => {
  it('keeps chain, key, signer, transaction, and RPC capabilities out of brain code', async () => {
    const sources = (
      await Promise.all([
        readFile('src/brain/minimal-brain.ts', 'utf8'),
        readFile('src/brain/decision-gate.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /@metaplex|\.\.\/chain|\.\.\/keys|\.\.\/actions|KeypairSigner|TransactionBuilder|buildBoundedTransfer|sendTransaction|\.rpc\b/i,
    );
  });
});
