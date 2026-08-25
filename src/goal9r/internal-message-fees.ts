import { createHash } from 'node:crypto';

import {
  delegateExecutionV1,
  mplAgentTools,
  registerExecutiveV1,
  revokeExecutionV1,
} from '@metaplex-foundation/mpl-agent-registry';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import {
  createNoopSigner,
  publicKey,
  type Transaction,
  type TransactionBuilder,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { z } from 'zod';

import {
  buildOwnerMainnetUsdcRescue,
} from '../actions/mainnet-rescue.js';
import { buildMainnetUsdcTransfer } from '../actions/mainnet-usdc-transfer.js';
import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../chain/network.js';
import { GOAL_9E_ACTION_BASE_UNITS } from '../goal9e/artifact.js';
import { buildMainnetUsdcAtaSetup } from '../goal9g/usdc-ata-setup.js';
import {
  type BootstrapFeeConfig,
} from '../goal9m/bootstrap-fee.js';
import {
  createFinalMainnetContract,
  GOAL_9P_AGENT_IDENTITY,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_EXECUTION_DELEGATE_RECORD,
  GOAL_9P_EXECUTIVE,
  GOAL_9P_EXECUTIVE_PROFILE,
  GOAL_9P_OWNER,
} from '../goal9p/final-contract.js';
import { assertSafePhaseOrder } from '../goal9q/fixed-rent-plan.js';
import { GOAL_9_MAX_USDC_BASE_UNITS } from '../mainnet/readiness.js';

export type InternalMessageName =
  | 'ATA_SETUP'
  | 'REGISTER_EXECUTIVE'
  | 'DELEGATE_EXECUTION'
  | 'ACTION_0_1_USDC'
  | 'REVOKE_EXECUTION'
  | 'RESCUE_REMAINING_0_9_USDC';

export const GOAL_9R_EXPECTED_FEES = Object.freeze({
  ATA_SETUP: 5_000n,
  REGISTER_EXECUTIVE: 10_000n,
  DELEGATE_EXECUTION: 5_000n,
  ACTION_0_1_USDC: 10_000n,
  REVOKE_EXECUTION: 5_000n,
  RESCUE_REMAINING_0_9_USDC: 5_000n,
} satisfies Record<InternalMessageName, bigint>);
export const GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS = 40_000n;

const RpcErrorSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});
const GenesisResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(1),
  result: z.string(),
});
const LatestBlockhashResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(2),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.object({
      blockhash: z.string().min(32).max(44),
      lastValidBlockHeight: z.number().int().positive(),
    }),
  }),
});
const FeeResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.number().int().min(3).max(8),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  }),
});

export type UnsignedInternalMessage = Readonly<{
  name: InternalMessageName;
  transaction: Transaction;
  messageBase64: string;
  messageSha256: string;
  requiredSignatures: 1 | 2;
  expectedFeeLamports: bigint;
}>;

export class InternalMessageFeeError extends Error {
  override readonly name = 'InternalMessageFeeError';
}

function compileMessage(
  umi: ReturnType<typeof createUmi>,
  blockhash: string,
  name: InternalMessageName,
  builder: TransactionBuilder,
  requiredSignatures: 1 | 2,
): UnsignedInternalMessage {
  const transaction = builder
    .setFeePayer(createNoopSigner(publicKey(GOAL_9P_OWNER)))
    .useLegacyVersion()
    .setBlockhash(blockhash)
    .build(umi);
  if (
    transaction.message.version !== 'legacy' ||
    transaction.message.blockhash !== blockhash ||
    transaction.message.header.numRequiredSignatures !== requiredSignatures ||
    String(transaction.message.accounts[0]) !== GOAL_9P_OWNER ||
    transaction.message.instructions.length === 0
  ) {
    throw new InternalMessageFeeError(`${name} compiled message shape changed.`);
  }
  const messageBase64 = Buffer.from(transaction.serializedMessage).toString(
    'base64',
  );
  return Object.freeze({
    name,
    transaction,
    messageBase64,
    messageSha256: createHash('sha256')
      .update(transaction.serializedMessage)
      .digest('hex'),
    requiredSignatures,
    expectedFeeLamports: GOAL_9R_EXPECTED_FEES[name],
  });
}

export function buildUnsignedInternalMessages(
  blockhash: string,
): readonly UnsignedInternalMessage[] {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(blockhash)) {
    throw new InternalMessageFeeError('Latest blockhash is malformed.');
  }
  assertSafePhaseOrder();
  const umi = createUmi('http://127.0.0.1:8899')
    .use(mplCore())
    .use(mplToolbox())
    .use(mplAgentTools());
  const contract = createFinalMainnetContract(umi);
  const owner = createNoopSigner(publicKey(GOAL_9P_OWNER));
  const executive = createNoopSigner(publicKey(GOAL_9P_EXECUTIVE));
  const ataSetup = buildMainnetUsdcAtaSetup(
    umi,
    contract.ataSetupPolicy,
    owner,
  ).builder;
  const registerExecutive = registerExecutiveV1(umi, {
    payer: owner,
    authority: executive,
  });
  const delegate = delegateExecutionV1(umi, {
    executiveProfile: publicKey(GOAL_9P_EXECUTIVE_PROFILE),
    agentAsset: publicKey(GOAL_9P_CORE_ASSET),
    agentIdentity: publicKey(GOAL_9P_AGENT_IDENTITY),
    executionDelegateRecord: publicKey(GOAL_9P_EXECUTION_DELEGATE_RECORD),
    payer: owner,
    authority: owner,
  });
  const action = buildMainnetUsdcTransfer(
    umi,
    contract.action.intent,
    contract.action.policy,
    {
      asset: contract.addresses.coreAsset,
      collection: null,
      assetSigner: contract.addresses.assetSigner,
      executionDelegateRecord: contract.addresses.executionDelegateRecord,
      feePayer: owner,
      executive,
    },
  ).builder;
  const revoke = revokeExecutionV1(umi, {
    executionDelegateRecord: publicKey(GOAL_9P_EXECUTION_DELEGATE_RECORD),
    agentAsset: publicKey(GOAL_9P_CORE_ASSET),
    destination: publicKey(GOAL_9P_OWNER),
    payer: owner,
    authority: owner,
  });
  const rescue = buildOwnerMainnetUsdcRescue(
    umi,
    contract.rescuePolicy,
    {
      asset: contract.addresses.coreAsset,
      collection: null,
      assetSigner: contract.addresses.assetSigner,
      owner,
    },
    GOAL_9_MAX_USDC_BASE_UNITS - GOAL_9E_ACTION_BASE_UNITS,
  ).builder;
  return Object.freeze([
    compileMessage(umi, blockhash, 'ATA_SETUP', ataSetup, 1),
    compileMessage(
      umi,
      blockhash,
      'REGISTER_EXECUTIVE',
      registerExecutive,
      2,
    ),
    compileMessage(umi, blockhash, 'DELEGATE_EXECUTION', delegate, 1),
    compileMessage(umi, blockhash, 'ACTION_0_1_USDC', action, 2),
    compileMessage(umi, blockhash, 'REVOKE_EXECUTION', revoke, 1),
    compileMessage(
      umi,
      blockhash,
      'RESCUE_REMAINING_0_9_USDC',
      rescue,
      1,
    ),
  ]);
}

async function rpcRequest(
  config: BootstrapFeeConfig,
  id: number,
  method: 'getGenesisHash' | 'getLatestBlockhash' | 'getFeeForMessage',
  params: readonly unknown[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new InternalMessageFeeError(`Mainnet RPC read failed at ${config.rpcOrigin}.`);
  }
  if (!response.ok) {
    throw new InternalMessageFeeError(`Mainnet RPC read failed with HTTP ${response.status}.`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new InternalMessageFeeError('Mainnet RPC returned invalid JSON.');
  }
  const rpcError = RpcErrorSchema.safeParse(payload);
  if (rpcError.success) {
    throw new InternalMessageFeeError(
      `Mainnet RPC read failed with code ${rpcError.data.error.code}.`,
    );
  }
  return payload;
}

export async function quoteUnsignedInternalMessageFees(
  config: BootstrapFeeConfig,
  fetchImpl: typeof fetch = fetch,
) {
  const genesisPayload = await rpcRequest(
    config,
    1,
    'getGenesisHash',
    [],
    fetchImpl,
  );
  const genesis = GenesisResponseSchema.safeParse(genesisPayload);
  if (
    !genesis.success ||
    genesis.data.result !== SOLANA_MAINNET_BETA_GENESIS_HASH
  ) {
    throw new InternalMessageFeeError('RPC genesis hash is not Solana Mainnet.');
  }
  const blockhashPayload = await rpcRequest(
    config,
    2,
    'getLatestBlockhash',
    [{ commitment: 'finalized' }],
    fetchImpl,
  );
  const blockhash = LatestBlockhashResponseSchema.safeParse(blockhashPayload);
  if (!blockhash.success) {
    throw new InternalMessageFeeError('Mainnet RPC returned an invalid blockhash.');
  }
  const messages = buildUnsignedInternalMessages(
    blockhash.data.result.value.blockhash,
  );
  const quoted = await Promise.all(
    messages.map(async (message, index) => {
      const payload = await rpcRequest(
        config,
        index + 3,
        'getFeeForMessage',
        [
          message.messageBase64,
          {
            commitment: 'finalized',
            minContextSlot: blockhash.data.result.context.slot,
          },
        ],
        fetchImpl,
      );
      const fee = FeeResponseSchema.safeParse(payload);
      if (
        !fee.success ||
        fee.data.id !== index + 3 ||
        fee.data.result.value === null ||
        fee.data.result.context.slot < blockhash.data.result.context.slot ||
        BigInt(fee.data.result.value) !== message.expectedFeeLamports
      ) {
        throw new InternalMessageFeeError(`${message.name} fee quote changed.`);
      }
      return Object.freeze({
        name: message.name,
        requiredSignatures: message.requiredSignatures,
        messageSha256: message.messageSha256,
        feeContextSlot: fee.data.result.context.slot,
        quotedFeeLamports: message.expectedFeeLamports,
      });
    }),
  );
  const totalFeeLamports = quoted.reduce(
    (total, message) => total + message.quotedFeeLamports,
    0n,
  );
  if (totalFeeLamports !== GOAL_9R_TOTAL_INTERNAL_FEES_LAMPORTS) {
    throw new InternalMessageFeeError('URI-independent fee total changed.');
  }
  return Object.freeze({
    network: 'mainnet-beta' as const,
    rpcOrigin: config.rpcOrigin,
    blockhashContextSlot: blockhash.data.result.context.slot,
    lastValidBlockHeight: blockhash.data.result.value.lastValidBlockHeight,
    messages: Object.freeze(quoted),
    totalFeeLamports,
    unsigned: true as const,
    keyLoaded: false as const,
    simulationAttempted: false as const,
    transactionSubmitted: false as const,
  });
}
