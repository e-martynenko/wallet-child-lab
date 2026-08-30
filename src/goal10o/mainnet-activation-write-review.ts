import { createHash } from 'node:crypto';

import {
  delegateExecutionV1,
  deserializeExecutionDelegateRecordV1,
  deserializeExecutiveProfileV1,
  mplAgentTools,
  registerExecutiveV1,
  tools as mplAgentToolsTypes,
} from '@metaplex-foundation/mpl-agent-registry';
import { mplCore } from '@metaplex-foundation/mpl-core';
import {
  deserializeToken,
  mplToolbox,
  TokenState,
} from '@metaplex-foundation/mpl-toolbox';
import {
  TRANSACTION_SIZE_LIMIT,
  createNoopSigner,
  lamports,
  publicKey,
  signerIdentity,
  type RpcAccount,
  type Transaction,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { z } from 'zod';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../chain/network.js';
import {
  GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS,
} from '../goal10l/mainnet-birth-execution.js';
import {
  GOAL_10N_ACTIVATION_RENT_LAMPORTS,
  GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS,
  GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS,
  GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS,
  type PostBirthActivationReview,
} from '../goal10n/post-birth-activation-review.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  buildMainnetUsdcAtaSetup,
} from '../goal9g/usdc-ata-setup.js';
import type { BootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';
import {
  GOAL_9P_AGENT_IDENTITY,
  GOAL_9P_ASSET_SIGNER,
  GOAL_9P_ASSET_SIGNER_USDC_ATA,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_EXECUTION_DELEGATE_RECORD,
  GOAL_9P_EXECUTIVE,
  GOAL_9P_EXECUTIVE_PROFILE,
  GOAL_9P_OWNER,
  GOAL_9P_RECOVERY,
  GOAL_9P_RECOVERY_USDC_ATA,
  createFinalMainnetContract,
} from '../goal9p/final-contract.js';
import {
  MPL_AGENT_TOOLS_PROGRAM_ID,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  SOLANA_MAINNET_USDC_MINT,
} from '../mainnet/readiness.js';
import { SYSTEM_PROGRAM_ID } from '../policy/policy.js';

export const GOAL_10O_TRANSACTION_BYTE_LENGTH = 697;
export const GOAL_10O_MAX_FEE_LAMPORTS = 10_000n;
export const GOAL_10O_TOTAL_DEBIT_LAMPORTS =
  GOAL_10N_ACTIVATION_RENT_LAMPORTS + GOAL_10O_MAX_FEE_LAMPORTS;
export const GOAL_10O_EXPECTED_OWNER_AFTER_LAMPORTS =
  GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS - GOAL_10O_TOTAL_DEBIT_LAMPORTS;
export const GOAL_10O_MAX_COMPUTE_UNITS = 150_000;
export const GOAL_10O_CONFIRMATION =
  'CONFIRM MAINNET ACTIVATE WALLET CHILD #001 IN ONE ATOMIC TRANSACTION FROM OWNER 6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385 WITH EXECUTIVE EJQcuD9FtJ33c2wA7GM6HzvmJJJbPsYnmH5ZjTDdhbjF CREATING ASSET SIGNER USDC ATA hCmisMZFRL7SWKvgdtFWXMTDW3PY858Kmvg6dQ8GQMU RECOVERY USDC ATA 8dbJMqCGAMTuJZ5ZZZeQMT43WqkkrwmBiyEJRH8szAd EXECUTIVE PROFILE 3Uy4XhPJLAdFRyFLAfJM7ruNc3Td5Ld1258Gx5z2WYXo AND BROAD METAPLEX EXECUTION DELEGATE RECORD Fr2yQyG7gEQYjL6Sr8sYXrS2n21bfjod5rKQDdo7bgcm TOTAL RENT 6862560 LAMPORTS TOTAL DEBIT CAP 6872560 LAMPORTS FEE CAP 10000 LAMPORTS NO FUNDING NO USDC TRANSFER NO EXTERNAL ACTION';

const EXPECTED_ACCOUNTS = Object.freeze([
  GOAL_9P_OWNER,
  GOAL_9P_EXECUTIVE,
  GOAL_9P_ASSET_SIGNER_USDC_ATA,
  GOAL_9P_RECOVERY_USDC_ATA,
  GOAL_9P_EXECUTIVE_PROFILE,
  GOAL_9P_EXECUTION_DELEGATE_RECORD,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  GOAL_9P_ASSET_SIGNER,
  SOLANA_MAINNET_USDC_MINT,
  SYSTEM_PROGRAM_ID,
  SOLANA_LEGACY_TOKEN_PROGRAM_ID,
  GOAL_9P_RECOVERY,
  MPL_AGENT_TOOLS_PROGRAM_ID,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_AGENT_IDENTITY,
] as const);
const EXPECTED_INSTRUCTIONS = Object.freeze([
  Object.freeze({
    program: ASSOCIATED_TOKEN_PROGRAM_ID,
    accountIndexes: '0,2,7,8,9,10',
    dataHex: '',
  }),
  Object.freeze({
    program: ASSOCIATED_TOKEN_PROGRAM_ID,
    accountIndexes: '0,3,11,8,9,10',
    dataHex: '',
  }),
  Object.freeze({
    program: MPL_AGENT_TOOLS_PROGRAM_ID,
    accountIndexes: '4,0,1,9',
    dataHex: '0000000000000000',
  }),
  Object.freeze({
    program: MPL_AGENT_TOOLS_PROGRAM_ID,
    accountIndexes: '4,13,14,5,0,0,9',
    dataHex: '0100000000000000',
  }),
] as const);

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
  id: z.literal(3),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.number().int().nonnegative().nullable(),
  }),
});
const SimulatedAccountSchema = z.object({
  lamports: z.number().int().nonnegative(),
  owner: z.string(),
  executable: z.boolean(),
  data: z.tuple([z.string(), z.literal('base64')]),
});
const SimulationResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(4),
  result: z.object({
    context: z.object({ slot: z.number().int().positive() }),
    value: z.object({
      err: z.null(),
      logs: z.array(z.string()),
      accounts: z.tuple([
        SimulatedAccountSchema,
        SimulatedAccountSchema,
        SimulatedAccountSchema,
        SimulatedAccountSchema,
        SimulatedAccountSchema,
      ]),
      unitsConsumed: z.number().int().positive(),
    }),
  }),
});
const FEE_READ_ATTEMPTS = 6;

export type UnsignedMainnetActivation = Readonly<{
  transaction: Transaction;
  messageBase64: string;
  transactionBase64: string;
  messageSha256: string;
  transactionByteLength: typeof GOAL_10O_TRANSACTION_BYTE_LENGTH;
  requiredSigners: readonly [typeof GOAL_9P_OWNER, typeof GOAL_9P_EXECUTIVE];
  instructionCount: 4;
  signatureCount: 2;
  signaturesAllZero: true;
}>;

export type MainnetActivationWriteReview = Readonly<{
  network: 'mainnet-beta';
  rpcOrigin: string;
  preflightSlot: number;
  blockhashContextSlot: number;
  simulationSlot: number;
  lastValidBlockHeight: number;
  messageSha256: string;
  transactionByteLength: typeof GOAL_10O_TRANSACTION_BYTE_LENGTH;
  instructionCount: 4;
  requiredSigners: readonly [typeof GOAL_9P_OWNER, typeof GOAL_9P_EXECUTIVE];
  quotedFeeLamports: typeof GOAL_10O_MAX_FEE_LAMPORTS;
  assetSignerAtaRentLamports: typeof GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS;
  recoveryAtaRentLamports: typeof GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS;
  executiveProfileRentLamports: typeof GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS;
  executionDelegateRentLamports: typeof GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS;
  totalActivationRentLamports: typeof GOAL_10N_ACTIVATION_RENT_LAMPORTS;
  simulatedOwnerDebitLamports: typeof GOAL_10O_TOTAL_DEBIT_LAMPORTS;
  simulatedOwnerAfterLamports: typeof GOAL_10O_EXPECTED_OWNER_AFTER_LAMPORTS;
  computeUnitsConsumed: number;
  createdAccountsEmpty: true;
  broadExecutionDelegateCreated: true;
  fundingIncluded: false;
  usdcTransferIncluded: false;
  externalActionIncluded: false;
  simulationPassed: true;
  keyLoaded: false;
  messageSigned: false;
  transactionSubmitted: false;
  actionTimeConfirmationRequired: true;
  requiredExactConfirmation: typeof GOAL_10O_CONFIRMATION;
  verdict: 'STOP_READY_FOR_EXACT_UNFUNDED_ACTIVATION_CONFIRMATION';
}>;

export class MainnetActivationWriteReviewError extends Error {
  override readonly name = 'MainnetActivationWriteReviewError';
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isZeroSignature(signature: Uint8Array): boolean {
  return signature.byteLength === 64 && signature.every((byte) => byte === 0);
}

export function buildUnsignedMainnetActivation(
  blockhash: string,
): UnsignedMainnetActivation {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(blockhash)) {
    throw new MainnetActivationWriteReviewError('Latest blockhash is malformed.');
  }
  const owner = createNoopSigner(publicKey(GOAL_9P_OWNER));
  const executive = createNoopSigner(publicKey(GOAL_9P_EXECUTIVE));
  const umi = createUmi('http://127.0.0.1:8899')
    .use(signerIdentity(owner))
    .use(mplCore())
    .use(mplToolbox())
    .use(mplAgentTools());
  const contract = createFinalMainnetContract(umi);
  const builder = buildMainnetUsdcAtaSetup(
    umi,
    contract.ataSetupPolicy,
    owner,
  ).builder
    .add(registerExecutiveV1(umi, { payer: owner, authority: executive }))
    .add(
      delegateExecutionV1(umi, {
        executiveProfile: publicKey(GOAL_9P_EXECUTIVE_PROFILE),
        agentAsset: publicKey(GOAL_9P_CORE_ASSET),
        agentIdentity: publicKey(GOAL_9P_AGENT_IDENTITY),
        executionDelegateRecord: publicKey(
          GOAL_9P_EXECUTION_DELEGATE_RECORD,
        ),
        payer: owner,
        authority: owner,
      }),
    );
  const signers = builder.getSigners(umi).map((signer) => String(signer.publicKey));
  const transaction = builder
    .setFeePayer(owner)
    .useLegacyVersion()
    .setBlockhash(blockhash)
    .build(umi);
  const serialized = umi.transactions.serialize(transaction);
  const instructions = transaction.message.instructions.map((instruction) => ({
    program: String(transaction.message.accounts[instruction.programIndex]),
    accountIndexes: instruction.accountIndexes.join(','),
    dataHex: Buffer.from(instruction.data).toString('hex'),
  }));
  if (
    signers.join(',') !== `${GOAL_9P_OWNER},${GOAL_9P_EXECUTIVE}` ||
    transaction.message.version !== 'legacy' ||
    transaction.message.blockhash !== blockhash ||
    transaction.message.header.numRequiredSignatures !== 2 ||
    transaction.message.header.numReadonlySignedAccounts !== 1 ||
    transaction.message.header.numReadonlyUnsignedAccounts !== 9 ||
    transaction.message.accounts.map(String).join(',') !==
      EXPECTED_ACCOUNTS.join(',') ||
    JSON.stringify(instructions) !== JSON.stringify(EXPECTED_INSTRUCTIONS) ||
    transaction.signatures.length !== 2 ||
    !transaction.signatures.every(isZeroSignature) ||
    serialized.byteLength !== GOAL_10O_TRANSACTION_BYTE_LENGTH ||
    serialized.byteLength > TRANSACTION_SIZE_LIMIT
  ) {
    throw new MainnetActivationWriteReviewError(
      'Atomic Mainnet activation message shape changed.',
    );
  }
  return Object.freeze({
    transaction,
    messageBase64: Buffer.from(transaction.serializedMessage).toString('base64'),
    transactionBase64: Buffer.from(serialized).toString('base64'),
    messageSha256: sha256(transaction.serializedMessage),
    transactionByteLength: GOAL_10O_TRANSACTION_BYTE_LENGTH,
    requiredSigners: Object.freeze([
      GOAL_9P_OWNER,
      GOAL_9P_EXECUTIVE,
    ] as const),
    instructionCount: 4,
    signatureCount: 2,
    signaturesAllZero: true,
  });
}

async function rpcRequest(
  config: BootstrapFeeConfig,
  id: number,
  method:
    | 'getGenesisHash'
    | 'getLatestBlockhash'
    | 'getFeeForMessage'
    | 'simulateTransaction',
  params: readonly unknown[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MainnetActivationWriteReviewError(
      `Mainnet RPC ${method} read failed at ${config.rpcOrigin}.`,
    );
  }
  if (!response.ok) {
    throw new MainnetActivationWriteReviewError(
      `Mainnet RPC ${method} returned HTTP ${response.status}.`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MainnetActivationWriteReviewError(
      `Mainnet RPC ${method} returned invalid JSON.`,
    );
  }
  const rpcError = RpcErrorSchema.safeParse(payload);
  if (rpcError.success) {
    throw new MainnetActivationWriteReviewError(
      `Mainnet RPC ${method} failed with code ${rpcError.data.error.code}.`,
    );
  }
  return payload;
}

async function readFreshFee(
  config: BootstrapFeeConfig,
  messageBase64: string,
  minimumContextSlot: number,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let lastPayload: unknown;
  for (let attempt = 1; attempt <= FEE_READ_ATTEMPTS; attempt += 1) {
    try {
      lastPayload = await rpcRequest(
        config,
        3,
        'getFeeForMessage',
        [
          messageBase64,
          { commitment: 'finalized', minContextSlot: minimumContextSlot },
        ],
        fetchImpl,
      );
    } catch (error) {
      if (
        attempt === FEE_READ_ATTEMPTS ||
        !(error instanceof MainnetActivationWriteReviewError) ||
        !error.message.includes('code -32016')
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      continue;
    }
    const parsed = FeeResponseSchema.safeParse(lastPayload);
    if (
      !parsed.success ||
      (parsed.data.result.value !== null &&
        parsed.data.result.context.slot >= minimumContextSlot)
    ) {
      return lastPayload;
    }
    if (attempt < FEE_READ_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }
  return lastPayload;
}

function toRpcAccount(
  address: string,
  account: z.infer<typeof SimulatedAccountSchema>,
): RpcAccount {
  return {
    publicKey: publicKey(address),
    executable: account.executable,
    owner: publicKey(account.owner),
    lamports: lamports(BigInt(account.lamports)),
    data: new Uint8Array(Buffer.from(account.data[0], 'base64')),
  };
}

function assertCreatedAccountData(
  accounts: z.infer<typeof SimulationResponseSchema>['result']['value']['accounts'],
): void {
  const [, sourceAtaRaw, recoveryAtaRaw, profileRaw, delegateRaw] = accounts;
  const sourceAta = deserializeToken(
    toRpcAccount(GOAL_9P_ASSET_SIGNER_USDC_ATA, sourceAtaRaw),
  );
  const recoveryAta = deserializeToken(
    toRpcAccount(GOAL_9P_RECOVERY_USDC_ATA, recoveryAtaRaw),
  );
  for (const [token, expectedOwner] of [
    [sourceAta, GOAL_9P_ASSET_SIGNER],
    [recoveryAta, GOAL_9P_RECOVERY],
  ] as const) {
    if (
      String(token.mint) !== SOLANA_MAINNET_USDC_MINT ||
      String(token.owner) !== expectedOwner ||
      token.amount !== 0n ||
      token.delegate.__option !== 'None' ||
      token.closeAuthority.__option !== 'None' ||
      token.isNative.__option !== 'None' ||
      token.delegatedAmount !== 0n ||
      token.state !== TokenState.Initialized
    ) {
      throw new MainnetActivationWriteReviewError(
        'A simulated USDC ATA is not empty and canonical.',
      );
    }
  }
  const profile = deserializeExecutiveProfileV1(
    toRpcAccount(GOAL_9P_EXECUTIVE_PROFILE, profileRaw),
  );
  const delegate = deserializeExecutionDelegateRecordV1(
    toRpcAccount(GOAL_9P_EXECUTION_DELEGATE_RECORD, delegateRaw),
  );
  if (
    profile.key !== mplAgentToolsTypes.Key.ExecutiveProfileV1 ||
    String(profile.authority) !== GOAL_9P_EXECUTIVE ||
    delegate.key !== mplAgentToolsTypes.Key.ExecutionDelegateRecordV1 ||
    String(delegate.executiveProfile) !== GOAL_9P_EXECUTIVE_PROFILE ||
    String(delegate.authority) !== GOAL_9P_EXECUTIVE ||
    String(delegate.agentAsset) !== GOAL_9P_CORE_ASSET
  ) {
    throw new MainnetActivationWriteReviewError(
      'Simulated Executive Profile or delegate relationship changed.',
    );
  }
}

export async function reviewMainnetActivationWrite(
  config: BootstrapFeeConfig,
  preflight: PostBirthActivationReview,
  fetchImpl: typeof fetch = fetch,
): Promise<MainnetActivationWriteReview> {
  if (
    preflight.verdict !== 'PASS_STOP_BEFORE_ATA_PERMISSION_OR_FUNDING_WRITE' ||
    preflight.accounts.ownerLamports !==
      GOAL_10L_EXPECTED_OWNER_AFTER_LAMPORTS ||
    !preflight.accounts.childAccountsAbsent ||
    preflight.accounts.activeExecutionDelegates !== 0 ||
    preflight.activation.totalRentLamports !==
      GOAL_10N_ACTIVATION_RENT_LAMPORTS ||
    !preflight.checks.identityAndOwnerReadbackPassed ||
    !preflight.checks.freshExactFeesQuoted
  ) {
    throw new MainnetActivationWriteReviewError(
      'Goal 10N is not ready for an activation write review.',
    );
  }
  const genesis = GenesisResponseSchema.safeParse(
    await rpcRequest(config, 1, 'getGenesisHash', [], fetchImpl),
  );
  if (!genesis.success || genesis.data.result !== SOLANA_MAINNET_BETA_GENESIS_HASH) {
    throw new MainnetActivationWriteReviewError(
      'RPC genesis hash is not Solana Mainnet.',
    );
  }
  const blockhash = LatestBlockhashResponseSchema.safeParse(
    await rpcRequest(
      config,
      2,
      'getLatestBlockhash',
      [
        {
          commitment: 'finalized',
          minContextSlot: preflight.finalizedSlotFloor,
        },
      ],
      fetchImpl,
    ),
  );
  if (
    !blockhash.success ||
    blockhash.data.result.context.slot < preflight.finalizedSlotFloor
  ) {
    throw new MainnetActivationWriteReviewError(
      'Mainnet RPC returned a stale or invalid blockhash.',
    );
  }
  const unsigned = buildUnsignedMainnetActivation(
    blockhash.data.result.value.blockhash,
  );
  const fee = FeeResponseSchema.safeParse(
    await readFreshFee(
      config,
      unsigned.messageBase64,
      preflight.finalizedSlotFloor,
      fetchImpl,
    ),
  );
  if (
    !fee.success ||
    fee.data.result.value === null ||
    fee.data.result.context.slot < preflight.finalizedSlotFloor ||
    BigInt(fee.data.result.value) !== GOAL_10O_MAX_FEE_LAMPORTS
  ) {
    throw new MainnetActivationWriteReviewError(
      'Atomic Mainnet activation fee quote changed or is stale.',
    );
  }
  const simulation = SimulationResponseSchema.safeParse(
    await rpcRequest(
      config,
      4,
      'simulateTransaction',
      [
        unsigned.transactionBase64,
        {
          encoding: 'base64',
          commitment: 'finalized',
          sigVerify: false,
          replaceRecentBlockhash: false,
          minContextSlot: preflight.finalizedSlotFloor,
          accounts: {
            encoding: 'base64',
            addresses: [
              GOAL_9P_OWNER,
              GOAL_9P_ASSET_SIGNER_USDC_ATA,
              GOAL_9P_RECOVERY_USDC_ATA,
              GOAL_9P_EXECUTIVE_PROFILE,
              GOAL_9P_EXECUTION_DELEGATE_RECORD,
            ],
          },
        },
      ],
      fetchImpl,
    ),
  );
  if (
    !simulation.success ||
    simulation.data.result.context.slot < preflight.finalizedSlotFloor
  ) {
    throw new MainnetActivationWriteReviewError(
      'Atomic Mainnet activation simulation failed.',
    );
  }
  const [ownerAfter, sourceAta, recoveryAta, profile, delegate] =
    simulation.data.result.value.accounts;
  const simulatedRents = [sourceAta, recoveryAta, profile, delegate].map(
    (account) => BigInt(account.lamports),
  );
  if (
    ownerAfter.owner !== SYSTEM_PROGRAM_ID ||
    ownerAfter.executable ||
    sourceAta.owner !== SOLANA_LEGACY_TOKEN_PROGRAM_ID ||
    recoveryAta.owner !== SOLANA_LEGACY_TOKEN_PROGRAM_ID ||
    profile.owner !== MPL_AGENT_TOOLS_PROGRAM_ID ||
    delegate.owner !== MPL_AGENT_TOOLS_PROGRAM_ID ||
    [sourceAta, recoveryAta, profile, delegate].some(
      (account) => account.executable,
    ) ||
    simulatedRents[0] !== GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS ||
    simulatedRents[1] !== GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS ||
    simulatedRents[2] !== GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS ||
    simulatedRents[3] !== GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS ||
    simulatedRents.reduce((total, rent) => total + rent, 0n) !==
      GOAL_10N_ACTIVATION_RENT_LAMPORTS ||
    BigInt(ownerAfter.lamports) !== GOAL_10O_EXPECTED_OWNER_AFTER_LAMPORTS ||
    simulation.data.result.value.unitsConsumed > GOAL_10O_MAX_COMPUTE_UNITS
  ) {
    throw new MainnetActivationWriteReviewError(
      'Atomic Mainnet activation simulated owner, rent, or compute invariant changed.',
    );
  }
  assertCreatedAccountData(simulation.data.result.value.accounts);

  return Object.freeze({
    network: 'mainnet-beta',
    rpcOrigin: config.rpcOrigin,
    preflightSlot: preflight.finalizedSlotFloor,
    blockhashContextSlot: blockhash.data.result.context.slot,
    simulationSlot: simulation.data.result.context.slot,
    lastValidBlockHeight: blockhash.data.result.value.lastValidBlockHeight,
    messageSha256: unsigned.messageSha256,
    transactionByteLength: GOAL_10O_TRANSACTION_BYTE_LENGTH,
    instructionCount: 4,
    requiredSigners: unsigned.requiredSigners,
    quotedFeeLamports: GOAL_10O_MAX_FEE_LAMPORTS,
    assetSignerAtaRentLamports: GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS,
    recoveryAtaRentLamports: GOAL_10N_TOKEN_ACCOUNT_RENT_LAMPORTS,
    executiveProfileRentLamports:
      GOAL_10N_EXECUTIVE_PROFILE_RENT_LAMPORTS,
    executionDelegateRentLamports:
      GOAL_10N_EXECUTION_DELEGATE_RENT_LAMPORTS,
    totalActivationRentLamports: GOAL_10N_ACTIVATION_RENT_LAMPORTS,
    simulatedOwnerDebitLamports: GOAL_10O_TOTAL_DEBIT_LAMPORTS,
    simulatedOwnerAfterLamports: GOAL_10O_EXPECTED_OWNER_AFTER_LAMPORTS,
    computeUnitsConsumed: simulation.data.result.value.unitsConsumed,
    createdAccountsEmpty: true,
    broadExecutionDelegateCreated: true,
    fundingIncluded: false,
    usdcTransferIncluded: false,
    externalActionIncluded: false,
    simulationPassed: true,
    keyLoaded: false,
    messageSigned: false,
    transactionSubmitted: false,
    actionTimeConfirmationRequired: true,
    requiredExactConfirmation: GOAL_10O_CONFIRMATION,
    verdict: 'STOP_READY_FOR_EXACT_UNFUNDED_ACTIVATION_CONFIRMATION',
  });
}
