import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { z } from 'zod';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../chain/network.js';
import {
  buildUnsignedBootstrapMessage,
  GOAL_9M_BOOTSTRAP_FEE_LAMPORTS,
  GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS,
  type BootstrapFeeConfig,
} from '../goal9m/bootstrap-fee.js';
import {
  GOAL_9L_FUNDING_SOURCE,
  GOAL_9L_WALLET_CHILD_OWNER,
} from '../goal9l/funding-route.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';

export const GOAL_10A_EXPECTED_SOURCE_SOL_LAMPORTS = 88_698_606n;
export const GOAL_10A_EXPECTED_OWNER_SOL_LAMPORTS = 0n;
export const GOAL_10A_EXPECTED_SOURCE_AFTER_LAMPORTS =
  GOAL_10A_EXPECTED_SOURCE_SOL_LAMPORTS -
  GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS -
  GOAL_9M_BOOTSTRAP_FEE_LAMPORTS;

const RpcErrorSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});

const GenesisSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(1),
  result: z.string(),
});

const BlockhashSchema = z.object({
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

const AccountSchema = z.object({
  lamports: z.number().int().nonnegative(),
  owner: z.string(),
  executable: z.boolean(),
});

const AccountsSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(3),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.tuple([AccountSchema.nullable(), AccountSchema.nullable()]),
  }),
});

const FeeSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(4),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.number().int().nonnegative().nullable(),
  }),
});

const SimulationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(5),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.object({
      err: z.unknown().nullable(),
      logs: z.array(z.string()).nullable(),
      unitsConsumed: z.number().int().nonnegative().optional(),
      accounts: z.tuple([AccountSchema.nullable(), AccountSchema.nullable()]),
    }),
  }),
});

export type BootstrapSimulationEvidence = Readonly<{
  network: 'mainnet-beta';
  rpcOrigin: string;
  blockhashContextSlot: number;
  accountContextSlot: number;
  feeContextSlot: number;
  simulationContextSlot: number;
  lastValidBlockHeight: number;
  messageSha256: string;
  serializedTransactionBytes: number;
  sourceBeforeLamports: typeof GOAL_10A_EXPECTED_SOURCE_SOL_LAMPORTS;
  ownerBeforeLamports: typeof GOAL_10A_EXPECTED_OWNER_SOL_LAMPORTS;
  quotedFeeLamports: typeof GOAL_9M_BOOTSTRAP_FEE_LAMPORTS;
  sourceAfterLamports: typeof GOAL_10A_EXPECTED_SOURCE_AFTER_LAMPORTS;
  ownerAfterLamports: typeof GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS;
  unitsConsumed: number | null;
  signatureVerification: false;
  unsigned: true;
  simulationSucceeded: true;
  transactionSubmitted: false;
}>;

export class BootstrapSimulationError extends Error {
  override readonly name = 'BootstrapSimulationError';
}

async function rpcRequest(
  config: BootstrapFeeConfig,
  id: 1 | 2 | 3 | 4 | 5,
  method:
    | 'getGenesisHash'
    | 'getLatestBlockhash'
    | 'getMultipleAccounts'
    | 'getFeeForMessage'
    | 'simulateTransaction',
  params: readonly unknown[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(config.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BootstrapSimulationError(
        `Mainnet RPC read failed at ${config.rpcOrigin}.`,
      );
    }
    if (!response.ok) {
      throw new BootstrapSimulationError(
        `Mainnet RPC read failed with HTTP ${response.status}.`,
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BootstrapSimulationError('Mainnet RPC returned invalid JSON.');
    }
    const rpcError = RpcErrorSchema.safeParse(payload);
    if (!rpcError.success) {
      return payload;
    }
    if (rpcError.data.error.code !== -32016 || attempt === 3) {
      throw new BootstrapSimulationError(
        `Mainnet RPC read failed with code ${rpcError.data.error.code}.`,
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, 250 * 2 ** attempt),
    );
  }
  throw new BootstrapSimulationError('Mainnet RPC retry invariant failed.');
}

export async function simulateUnsignedBootstrap(
  config: BootstrapFeeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<BootstrapSimulationEvidence> {
  const genesis = GenesisSchema.safeParse(
    await rpcRequest(config, 1, 'getGenesisHash', [], fetchImpl),
  );
  if (
    !genesis.success ||
    genesis.data.result !== SOLANA_MAINNET_BETA_GENESIS_HASH
  ) {
    throw new BootstrapSimulationError('RPC genesis is not Solana Mainnet.');
  }

  const blockhash = BlockhashSchema.safeParse(
    await rpcRequest(
      config,
      2,
      'getLatestBlockhash',
      [{ commitment: 'finalized' }],
      fetchImpl,
    ),
  );
  if (!blockhash.success) {
    throw new BootstrapSimulationError('Mainnet blockhash response is invalid.');
  }
  const blockhashContextSlot = blockhash.data.result.context.slot;
  const message = buildUnsignedBootstrapMessage(
    blockhash.data.result.value.blockhash,
  );

  const accounts = AccountsSchema.safeParse(
    await rpcRequest(
      config,
      3,
      'getMultipleAccounts',
      [
        [GOAL_9L_FUNDING_SOURCE, GOAL_9L_WALLET_CHILD_OWNER],
        {
          commitment: 'finalized',
          encoding: 'base64',
          minContextSlot: blockhashContextSlot,
        },
      ],
      fetchImpl,
    ),
  );
  const sourceAccount = accounts.success ? accounts.data.result.value[0] : null;
  const ownerAccount = accounts.success ? accounts.data.result.value[1] : null;
  if (
    !accounts.success ||
    accounts.data.result.context.slot < blockhashContextSlot ||
    !sourceAccount ||
    sourceAccount.owner !== SYSTEM_PROGRAM_ID ||
    sourceAccount.executable ||
    BigInt(sourceAccount.lamports) !== GOAL_10A_EXPECTED_SOURCE_SOL_LAMPORTS ||
    ownerAccount !== null
  ) {
    throw new BootstrapSimulationError(
      'Bootstrap source or destination state changed; action review is stale.',
    );
  }
  const accountContextSlot = accounts.data.result.context.slot;

  const fee = FeeSchema.safeParse(
    await rpcRequest(
      config,
      4,
      'getFeeForMessage',
      [
        message.messageBase64,
        {
          commitment: 'finalized',
          minContextSlot: accountContextSlot,
        },
      ],
      fetchImpl,
    ),
  );
  if (
    !fee.success ||
    fee.data.result.context.slot < accountContextSlot ||
    fee.data.result.value !== Number(GOAL_9M_BOOTSTRAP_FEE_LAMPORTS)
  ) {
    throw new BootstrapSimulationError(
      'Exact bootstrap fee changed; action review is stale.',
    );
  }

  const umi = createUmi('http://127.0.0.1:8899');
  const serializedTransaction = umi.transactions.serialize(message.transaction);
  const simulation = SimulationSchema.safeParse(
    await rpcRequest(
      config,
      5,
      'simulateTransaction',
      [
        Buffer.from(serializedTransaction).toString('base64'),
        {
          commitment: 'finalized',
          encoding: 'base64',
          sigVerify: false,
          replaceRecentBlockhash: false,
          minContextSlot: accountContextSlot,
          accounts: {
            encoding: 'base64',
            addresses: [GOAL_9L_FUNDING_SOURCE, GOAL_9L_WALLET_CHILD_OWNER],
          },
        },
      ],
      fetchImpl,
    ),
  );
  const sourceAfter = simulation.success
    ? simulation.data.result.value.accounts[0]
    : null;
  const ownerAfter = simulation.success
    ? simulation.data.result.value.accounts[1]
    : null;
  if (
    !simulation.success ||
    simulation.data.result.context.slot < accountContextSlot ||
    simulation.data.result.value.err !== null ||
    !sourceAfter ||
    !ownerAfter ||
    sourceAfter.owner !== SYSTEM_PROGRAM_ID ||
    ownerAfter.owner !== SYSTEM_PROGRAM_ID ||
    sourceAfter.executable ||
    ownerAfter.executable ||
    BigInt(sourceAfter.lamports) !== GOAL_10A_EXPECTED_SOURCE_AFTER_LAMPORTS ||
    BigInt(ownerAfter.lamports) !== GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS
  ) {
    throw new BootstrapSimulationError(
      'Exact unsigned bootstrap simulation did not reconcile.',
    );
  }

  return Object.freeze({
    network: 'mainnet-beta',
    rpcOrigin: config.rpcOrigin,
    blockhashContextSlot,
    accountContextSlot,
    feeContextSlot: fee.data.result.context.slot,
    simulationContextSlot: simulation.data.result.context.slot,
    lastValidBlockHeight: blockhash.data.result.value.lastValidBlockHeight,
    messageSha256: message.messageSha256,
    serializedTransactionBytes: serializedTransaction.length,
    sourceBeforeLamports: GOAL_10A_EXPECTED_SOURCE_SOL_LAMPORTS,
    ownerBeforeLamports: GOAL_10A_EXPECTED_OWNER_SOL_LAMPORTS,
    quotedFeeLamports: GOAL_9M_BOOTSTRAP_FEE_LAMPORTS,
    sourceAfterLamports: GOAL_10A_EXPECTED_SOURCE_AFTER_LAMPORTS,
    ownerAfterLamports: GOAL_9M_BOOTSTRAP_TRANSFER_LAMPORTS,
    unitsConsumed: simulation.data.result.value.unitsConsumed ?? null,
    signatureVerification: false,
    unsigned: true,
    simulationSucceeded: true,
    transactionSubmitted: false,
  });
}
