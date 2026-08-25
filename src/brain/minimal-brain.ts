import { z } from 'zod';

export const HoldDecisionSchema = z
  .object({ decision: z.literal('HOLD') })
  .strict();

export const RequestTransferDecisionSchema = z
  .object({ decision: z.literal('REQUEST_TRANSFER') })
  .strict();

export const AgentDecisionSchema = z.discriminatedUnion('decision', [
  HoldDecisionSchema,
  RequestTransferDecisionSchema,
]);

export type AgentDecision = Readonly<z.infer<typeof AgentDecisionSchema>>;

export const MinimalBrainContextSchema = z
  .object({
    allowance: z.enum(['AVAILABLE', 'UNAVAILABLE']),
    task: z.enum(['WAIT', 'CONSIDER_PERMITTED_TEST_PAYMENT']),
  })
  .strict();

export type MinimalBrainContext = Readonly<
  z.infer<typeof MinimalBrainContextSchema>
>;

export const MINIMAL_BRAIN_JSON_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    decision: Object.freeze({
      type: 'string',
      enum: Object.freeze(['HOLD', 'REQUEST_TRANSFER']),
    }),
  }),
  required: Object.freeze(['decision']),
  additionalProperties: false,
});

export type MinimalBrainRequest = Readonly<{
  model: string;
  store: false;
  tools: readonly [];
  tool_choice: 'none';
  input: readonly [
    Readonly<{ role: 'developer'; content: string }>,
    Readonly<{ role: 'user'; content: string }>,
  ];
  text: Readonly<{
    format: Readonly<{
      type: 'json_schema';
      name: 'wallet_child_decision';
      strict: true;
      schema: typeof MINIMAL_BRAIN_JSON_SCHEMA;
    }>;
  }>;
}>;

export type MinimalBrainProvider = (
  request: MinimalBrainRequest,
) => Promise<unknown>;

export class MinimalBrainContractError extends Error {
  override readonly name = 'MinimalBrainContractError';
}

export function buildMinimalBrainRequest(
  model: string,
  contextInput: unknown,
): MinimalBrainRequest {
  const modelName = model.trim();
  if (modelName.length === 0 || modelName.length > 100) {
    throw new MinimalBrainContractError('Model name is missing or invalid.');
  }
  const parsedContext = MinimalBrainContextSchema.safeParse(contextInput);
  if (!parsedContext.success) {
    throw new MinimalBrainContractError('Minimal brain context is malformed.');
  }

  const noTools = Object.freeze([]) as readonly [];
  const input = Object.freeze([
    Object.freeze({
      role: 'developer' as const,
      content:
        'Choose whether Wallet Child should hold or request the one permitted test payment. Do not invent transaction details.',
    }),
    Object.freeze({
      role: 'user' as const,
      content: JSON.stringify(parsedContext.data),
    }),
  ]) as MinimalBrainRequest['input'];

  return Object.freeze({
    model: modelName,
    store: false,
    tools: noTools,
    tool_choice: 'none',
    input,
    text: Object.freeze({
      format: Object.freeze({
        type: 'json_schema',
        name: 'wallet_child_decision',
        strict: true,
        schema: MINIMAL_BRAIN_JSON_SCHEMA,
      }),
    }),
  });
}

export function parseAgentDecision(value: unknown): AgentDecision | null {
  const parsed = AgentDecisionSchema.safeParse(value);
  return parsed.success ? Object.freeze(parsed.data) : null;
}
