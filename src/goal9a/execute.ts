import { resolve } from 'node:path';

import {
  delegateExecutionV1,
  MPL_AGENT_TOOLS_PROGRAM_ID,
  revokeExecutionV1,
  safeFetchExecutionDelegateRecordV1,
  safeFetchExecutiveProfileV1,
} from '@metaplex-foundation/mpl-agent-registry';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import {
  AuthorityType,
  createIdempotentAssociatedToken,
  createMint,
  findAssociatedTokenPda,
  mintTokensToChecked,
  safeFetchMint,
  safeFetchToken,
  setAuthority,
} from '@metaplex-foundation/mpl-toolbox';
import {
  base58,
  isNone,
  keypairIdentity,
  publicKey,
  type KeypairSigner,
  type PublicKey,
  type TransactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi';

import {
  assertTestTokenActionDeltas,
  assertTestTokenRescueDeltas,
  buildDelegatedTestTokenTransfer,
  buildOwnerTestTokenRescue,
} from '../actions/test-token-transfer.js';
import { createVerifiedDevnetUmi } from '../chain/umi.js';
import type { WalletChildConfig } from '../config/env.js';
import { readGoal5Artifact } from '../goal5/artifact.js';
import { assertExecutiveSimulation } from '../goal5/lifecycle.js';
import { readGoal7Artifact } from '../goal7/artifact.js';
import {
  loadOrCreateDevnetExecutive,
  loadOrCreateDevnetOwner,
} from '../keys/devnet-owner.js';
import { loadOrCreateIsolatedSigner } from '../keys/isolated-key.js';
import { readGoal9ReadinessArtifact } from '../mainnet/artifact.js';
import {
  CIRCLE_DEVNET_USDC_MINT,
  CIRCLE_MAINNET_USDC_MINT,
  GOAL_9A_ACTION_BASE_UNITS,
  GOAL_9A_DECIMALS,
  GOAL_9A_INITIAL_SUPPLY_BASE_UNITS,
  GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS,
  GOAL_9A_MAX_TRANSFER_BASE_UNITS,
  GOAL_9A_RESCUE_BASE_UNITS,
  GOAL_9A_TEST_TOKEN_LABEL,
  LEGACY_TOKEN_PROGRAM_ID,
  type TestTokenDenialReason,
  type TestTokenTransferIntent,
  type TestTokenTransferPolicy,
  validateTestTokenAction,
} from './policy.js';
import {
  readGoal9AArtifact,
  type Goal9AArtifact,
  type Goal9ABalances,
  type Goal9ATransactionAttempt,
  type Goal9ATransactionName,
  writeGoal9AArtifact,
} from './artifact.js';

export const GOAL_9A_CONFIRMATION = '--confirm-goal-9a';
export const DEFAULT_GOAL_9A_MINT_PATH = resolve(
  '.wallet-child/devnet/goal9a-test-mint.json',
);
export const GOAL_9A_FINAL_ASSET_SIGNER_LAMPORTS = 9_900_000n;

export class Goal9AExecutionError extends Error {
  override readonly name = 'Goal9AExecutionError';
}

export function assertGoal9AConfirmation(arguments_: string[]): void {
  if (
    arguments_.length !== 1 ||
    arguments_[0] !== GOAL_9A_CONFIRMATION
  ) {
    throw new Goal9AExecutionError(
      `Goal 9A write is locked. Run only with ${GOAL_9A_CONFIRMATION}.`,
    );
  }
}

type ForbiddenActionProof = NonNullable<
  Goal9AArtifact['checks']['forbiddenActionsDenied']
>;

function requireDenial(
  action: unknown,
  policy: unknown,
  expected: TestTokenDenialReason,
): void {
  const decision = validateTestTokenAction(action, policy);
  if (decision.decision !== 'DENY' || decision.reason !== expected) {
    throw new Goal9AExecutionError(
      `Forbidden Goal 9A action did not fail closed as ${expected}.`,
    );
  }
}

export function proveGoal9AForbiddenActions(
  intent: TestTokenTransferIntent,
  policy: TestTokenTransferPolicy,
): ForbiddenActionProof {
  requireDenial(intent, { ...policy, mint: CIRCLE_MAINNET_USDC_MINT },
    'OFFICIAL_USDC_FORBIDDEN');
  requireDenial(intent, { ...policy, mint: CIRCLE_DEVNET_USDC_MINT },
    'OFFICIAL_USDC_FORBIDDEN');
  requireDenial(
    { ...intent, amountBaseUnits: GOAL_9A_MAX_TRANSFER_BASE_UNITS + 1n },
    policy,
    'AMOUNT_OVER_LIMIT',
  );
  requireDenial(
    { ...intent, destinationOwner: policy.sourceAssetSigner },
    policy,
    'DESTINATION_NOT_ALLOWED',
  );
  requireDenial({ ...intent, instructions: [] }, policy, 'MALFORMED_ACTION');
  return Object.freeze({
    officialMainnetUsdc: 'OFFICIAL_USDC_FORBIDDEN',
    officialDevnetUsdc: 'OFFICIAL_USDC_FORBIDDEN',
    overLimit: 'AMOUNT_OVER_LIMIT',
    unknownDestination: 'DESTINATION_NOT_ALLOWED',
    injectedInstruction: 'MALFORMED_ACTION',
  });
}

function signatureToString(signature: Uint8Array): string {
  return base58.deserialize(signature)[0];
}

function signatureFromString(signature: string): Uint8Array {
  return base58.serialize(signature);
}

function formatSimulationDetails(
  error: unknown,
  logs: string[] | null | undefined,
): string {
  return logs?.slice(-8).join(' | ') || JSON.stringify(error) || 'No details.';
}

async function getFinalizedBlockHeight(rpcUrl: string): Promise<number> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBlockHeight',
      params: [{ commitment: 'finalized' }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Goal9AExecutionError(
      `Block-height RPC returned HTTP ${response.status}.`,
    );
  }
  const payload = (await response.json()) as {
    result?: unknown;
    error?: unknown;
  };
  if (
    payload.error !== undefined ||
    typeof payload.result !== 'number' ||
    !Number.isInteger(payload.result)
  ) {
    throw new Goal9AExecutionError(
      'Block-height RPC returned an invalid result.',
    );
  }
  return payload.result;
}

function latestAttempt(
  artifact: Goal9AArtifact,
  name: Goal9ATransactionName,
): Goal9ATransactionAttempt | undefined {
  return artifact.transactions[name]?.at(-1);
}

async function markAttempt(
  artifact: Goal9AArtifact,
  attempt: Goal9ATransactionAttempt,
  status: Goal9ATransactionAttempt['status'],
): Promise<void> {
  attempt.status = status;
  await writeGoal9AArtifact(artifact);
}

async function reconcileLatestAttempt(
  umi: Umi,
  config: WalletChildConfig,
  artifact: Goal9AArtifact,
  name: Goal9ATransactionName,
): Promise<boolean> {
  const attempt = latestAttempt(artifact, name);
  if (!attempt || attempt.status === 'expired' || attempt.status === 'failed') {
    return false;
  }
  const signature = signatureFromString(attempt.signature);
  const readStatus = async () =>
    (
      await umi.rpc.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      })
    )[0];
  let status = await readStatus();
  if (status?.error) {
    await markAttempt(artifact, attempt, 'failed');
    throw new Goal9AExecutionError(`${name} failed on Devnet.`);
  }
  if (status?.commitment === 'finalized') {
    if (attempt.status !== 'confirmed') {
      await markAttempt(artifact, attempt, 'confirmed');
    }
    return true;
  }
  if (attempt.status === 'confirmed') {
    throw new Goal9AExecutionError(
      `Recorded confirmed ${name} is not finalized on the current RPC.`,
    );
  }
  try {
    const confirmation = await umi.rpc.confirmTransaction(signature, {
      commitment: 'finalized',
      strategy: {
        type: 'blockhash',
        blockhash: attempt.blockhash,
        lastValidBlockHeight: attempt.lastValidBlockHeight,
      },
    });
    if (confirmation.value.err !== null) {
      await markAttempt(artifact, attempt, 'failed');
      throw new Goal9AExecutionError(`${name} failed after submission.`);
    }
    await markAttempt(artifact, attempt, 'confirmed');
    return true;
  } catch (error) {
    if (error instanceof Goal9AExecutionError) throw error;
    status = await readStatus();
    if (status?.error) {
      await markAttempt(artifact, attempt, 'failed');
      throw new Goal9AExecutionError(`${name} failed on Devnet.`);
    }
    if (status?.commitment === 'finalized') {
      await markAttempt(artifact, attempt, 'confirmed');
      return true;
    }
    const blockHeight = await getFinalizedBlockHeight(config.rpcUrl);
    if (blockHeight > attempt.lastValidBlockHeight) {
      await markAttempt(artifact, attempt, 'expired');
      return false;
    }
    throw new Goal9AExecutionError(
      `${name} finalization is still ambiguous; rerun the same command safely.`,
    );
  }
}

async function simulateSendFinalize(
  umi: Umi,
  config: WalletChildConfig,
  builder: TransactionBuilder,
  artifact: Goal9AArtifact,
  name: Goal9ATransactionName,
): Promise<void> {
  const prepared = await builder.setLatestBlockhash(umi, {
    commitment: 'finalized',
  });
  const blockhash = prepared.options.blockhash;
  if (!blockhash || typeof blockhash === 'string') {
    throw new Goal9AExecutionError(`${name} is missing blockhash expiry data.`);
  }
  const transaction = await prepared.buildAndSign(umi);
  const simulation = await umi.rpc.simulateTransaction(transaction, {
    commitment: 'finalized',
    verifySignatures: true,
  });
  if (simulation.err !== null) {
    throw new Goal9AExecutionError(
      `${name} simulation failed; nothing was submitted. ${formatSimulationDetails(simulation.err, simulation.logs)}`,
    );
  }
  const transactionSignature = transaction.signatures[0];
  if (
    !transactionSignature ||
    transactionSignature.every((byte) => byte === 0)
  ) {
    throw new Goal9AExecutionError(`${name} did not produce a payer signature.`);
  }
  const attempt: Goal9ATransactionAttempt = {
    signature: signatureToString(transactionSignature),
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
    status: 'prepared',
  };
  (artifact.transactions[name] ??= []).push(attempt);
  await writeGoal9AArtifact(artifact);

  const returnedSignature = await umi.rpc.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: 'finalized',
    maxRetries: 3,
  });
  if (signatureToString(returnedSignature) !== attempt.signature) {
    throw new Goal9AExecutionError(`${name} RPC returned a different signature.`);
  }
  await markAttempt(artifact, attempt, 'submitted');
  console.info(`${name} submitted: ${attempt.signature}`);
  if (!(await reconcileLatestAttempt(umi, config, artifact, name))) {
    throw new Goal9AExecutionError(`${name} expired before finalization.`);
  }
}

async function readDelegateRecord(umi: Umi, address: PublicKey) {
  return safeFetchExecutionDelegateRecordV1(umi, address, {
    commitment: 'finalized',
  });
}

async function assertActiveDelegate(
  umi: Umi,
  artifact: Goal9AArtifact,
): Promise<void> {
  const record = await readDelegateRecord(
    umi,
    publicKey(artifact.addresses.executionDelegateRecord),
  );
  if (
    !record ||
    String(record.header.owner) !== String(MPL_AGENT_TOOLS_PROGRAM_ID) ||
    String(record.executiveProfile) !== artifact.addresses.executiveProfile ||
    String(record.authority) !== artifact.addresses.executiveAuthority ||
    String(record.agentAsset) !== artifact.addresses.asset
  ) {
    throw new Goal9AExecutionError('Active delegate read-back is invalid.');
  }
}

function tokenAccountIsUncontrolled(
  account: NonNullable<Awaited<ReturnType<typeof safeFetchToken>>>,
): boolean {
  return (
    isNone(account.delegate) &&
    account.delegatedAmount === 0n &&
    isNone(account.closeAuthority)
  );
}

function assertTokenAccount(
  account: Awaited<ReturnType<typeof safeFetchToken>>,
  address: string,
  owner: string,
  mint: string,
): asserts account is NonNullable<typeof account> {
  if (
    !account ||
    String(account.publicKey) !== address ||
    String(account.header.owner) !== LEGACY_TOKEN_PROGRAM_ID ||
    String(account.owner) !== owner ||
    String(account.mint) !== mint ||
    !tokenAccountIsUncontrolled(account)
  ) {
    throw new Goal9AExecutionError(
      `TEST-token account ${address} failed read-back validation.`,
    );
  }
}

async function readBalances(
  umi: Umi,
  addresses: Goal9AArtifact['addresses'],
): Promise<Goal9ABalances> {
  const [source, destination, recovery, payer] = await Promise.all([
    safeFetchToken(umi, publicKey(addresses.sourceAta), {
      commitment: 'finalized',
    }),
    safeFetchToken(umi, publicKey(addresses.destinationAta), {
      commitment: 'finalized',
    }),
    safeFetchToken(umi, publicKey(addresses.recoveryAta), {
      commitment: 'finalized',
    }),
    umi.rpc.getBalance(publicKey(addresses.owner), {
      commitment: 'finalized',
    }),
  ]);
  assertTokenAccount(
    source,
    addresses.sourceAta,
    addresses.assetSigner,
    addresses.testMint,
  );
  assertTokenAccount(
    destination,
    addresses.destinationAta,
    addresses.testReceiver,
    addresses.testMint,
  );
  assertTokenAccount(
    recovery,
    addresses.recoveryAta,
    addresses.recoveryOwner,
    addresses.testMint,
  );
  return {
    sourceBaseUnits: source.amount.toString(),
    destinationBaseUnits: destination.amount.toString(),
    recoveryBaseUnits: recovery.amount.toString(),
    feePayerLamports: payer.basisPoints.toString(),
  };
}

function expectedAddresses(
  goal5: NonNullable<Awaited<ReturnType<typeof readGoal5Artifact>>>,
  mint: string,
  sourceAta: string,
  destinationAta: string,
  recoveryAta: string,
): Goal9AArtifact['addresses'] {
  return {
    owner: goal5.addresses.owner,
    executiveAuthority: goal5.addresses.executiveAuthority,
    executiveProfile: goal5.addresses.executiveProfile,
    executionDelegateRecord: goal5.addresses.executionDelegateRecord,
    collection: goal5.addresses.collection,
    asset: goal5.addresses.asset,
    agentIdentity: goal5.addresses.agentIdentity,
    assetSigner: goal5.addresses.assetSigner,
    testReceiver: goal5.addresses.nextOwner,
    testMint: mint,
    sourceAta,
    destinationAta,
    recoveryOwner: goal5.addresses.owner,
    recoveryAta,
  };
}

function fixedPolicy(
  addresses: Goal9AArtifact['addresses'],
): TestTokenTransferPolicy {
  return Object.freeze({
    network: 'devnet',
    token: GOAL_9A_TEST_TOKEN_LABEL,
    mint: addresses.testMint,
    decimals: GOAL_9A_DECIMALS,
    sourceAssetSigner: addresses.assetSigner,
    sourceTokenAccount: addresses.sourceAta,
    allowedDestinationOwner: addresses.testReceiver,
    allowedDestinationTokenAccount: addresses.destinationAta,
    recoveryOwner: addresses.recoveryOwner,
    recoveryTokenAccount: addresses.recoveryAta,
    maximumBaseUnits: GOAL_9A_MAX_TRANSFER_BASE_UNITS,
    maximumFeePayerSpendLamports: GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS,
    allowedProgram: LEGACY_TOKEN_PROGRAM_ID,
  });
}

function fixedIntent(
  addresses: Goal9AArtifact['addresses'],
): TestTokenTransferIntent {
  return Object.freeze({
    kind: 'TRANSFER_TEST_TOKEN',
    network: 'devnet',
    token: GOAL_9A_TEST_TOKEN_LABEL,
    destinationOwner: addresses.testReceiver,
    amountBaseUnits: GOAL_9A_ACTION_BASE_UNITS,
  });
}

function assertArtifactMatches(
  artifact: Goal9AArtifact,
  rpcOrigin: string,
  addresses: Goal9AArtifact['addresses'],
): void {
  if (
    artifact.rpcOrigin !== rpcOrigin ||
    Object.entries(addresses).some(
      ([key, value]) =>
        artifact.addresses[key as keyof Goal9AArtifact['addresses']] !== value,
    ) ||
    artifact.policy.token !== GOAL_9A_TEST_TOKEN_LABEL ||
    artifact.policy.decimals !== GOAL_9A_DECIMALS ||
    artifact.policy.initialSupplyBaseUnits !==
      GOAL_9A_INITIAL_SUPPLY_BASE_UNITS.toString() ||
    artifact.policy.actionBaseUnits !== GOAL_9A_ACTION_BASE_UNITS.toString() ||
    artifact.policy.maximumTransferBaseUnits !==
      GOAL_9A_MAX_TRANSFER_BASE_UNITS.toString() ||
    artifact.policy.rescueBaseUnits !== GOAL_9A_RESCUE_BASE_UNITS.toString() ||
    artifact.policy.maximumFeePayerSpendLamports !==
      GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS.toString() ||
    artifact.policy.allowedProgram !== LEGACY_TOKEN_PROGRAM_ID
  ) {
    throw new Goal9AExecutionError(
      'The Goal 9A artifact does not match the fixed Devnet experiment.',
    );
  }
}

async function ensureMint(
  umi: Umi,
  config: WalletChildConfig,
  owner: KeypairSigner,
  mintSigner: KeypairSigner,
  artifact: Goal9AArtifact,
): Promise<void> {
  const pending = latestAttempt(artifact, 'createMint');
  if (pending?.status === 'prepared' || pending?.status === 'submitted') {
    await reconcileLatestAttempt(umi, config, artifact, 'createMint');
  }
  let mint = await safeFetchMint(umi, mintSigner.publicKey, {
    commitment: 'finalized',
  });
  if (!mint) {
    if (latestAttempt(artifact, 'createMint')?.status === 'confirmed') {
      throw new Goal9AExecutionError(
        'Confirmed TEST mint creation is missing from Devnet.',
      );
    }
    await simulateSendFinalize(
      umi,
      config,
      createMint(umi, {
        mint: mintSigner,
        decimals: GOAL_9A_DECIMALS,
        mintAuthority: owner.publicKey,
        freezeAuthority: null,
      }),
      artifact,
      'createMint',
    );
    mint = await safeFetchMint(umi, mintSigner.publicKey, {
      commitment: 'finalized',
    });
  } else if (!latestAttempt(artifact, 'createMint')) {
    throw new Goal9AExecutionError(
      'TEST mint already exists without a Goal 9A transaction record.',
    );
  }
  if (
    !mint ||
    String(mint.header.owner) !== LEGACY_TOKEN_PROGRAM_ID ||
    mint.decimals !== GOAL_9A_DECIMALS ||
    mint.isInitialized !== true ||
    !isNone(mint.freezeAuthority) ||
    !(
      (mint.supply === 0n &&
        !isNone(mint.mintAuthority) &&
        String(mint.mintAuthority.value) === String(owner.publicKey)) ||
      (mint.supply === GOAL_9A_INITIAL_SUPPLY_BASE_UNITS &&
        isNone(mint.mintAuthority))
    )
  ) {
    throw new Goal9AExecutionError('TEST mint read-back is invalid.');
  }
  artifact.checks.mintVerified = true;
  await writeGoal9AArtifact(artifact);
}

async function ensureAtas(
  umi: Umi,
  config: WalletChildConfig,
  owner: KeypairSigner,
  artifact: Goal9AArtifact,
): Promise<void> {
  const pending = latestAttempt(artifact, 'createAtas');
  if (pending?.status === 'prepared' || pending?.status === 'submitted') {
    await reconcileLatestAttempt(umi, config, artifact, 'createAtas');
  }
  const readAll = () =>
    Promise.all([
      safeFetchToken(umi, publicKey(artifact.addresses.sourceAta), {
        commitment: 'finalized',
      }),
      safeFetchToken(umi, publicKey(artifact.addresses.destinationAta), {
        commitment: 'finalized',
      }),
      safeFetchToken(umi, publicKey(artifact.addresses.recoveryAta), {
        commitment: 'finalized',
      }),
    ]);
  let accounts = await readAll();
  if (accounts.some((account) => account === null)) {
    if (latestAttempt(artifact, 'createAtas')?.status === 'confirmed') {
      throw new Goal9AExecutionError(
        'Confirmed ATA creation is missing from Devnet.',
      );
    }
    const builder = createIdempotentAssociatedToken(umi, {
      payer: owner,
      ata: publicKey(artifact.addresses.sourceAta),
      owner: publicKey(artifact.addresses.assetSigner),
      mint: publicKey(artifact.addresses.testMint),
      tokenProgram: publicKey(LEGACY_TOKEN_PROGRAM_ID),
    })
      .add(
        createIdempotentAssociatedToken(umi, {
          payer: owner,
          ata: publicKey(artifact.addresses.destinationAta),
          owner: publicKey(artifact.addresses.testReceiver),
          mint: publicKey(artifact.addresses.testMint),
          tokenProgram: publicKey(LEGACY_TOKEN_PROGRAM_ID),
        }),
      )
      .add(
        createIdempotentAssociatedToken(umi, {
          payer: owner,
          ata: publicKey(artifact.addresses.recoveryAta),
          owner: owner.publicKey,
          mint: publicKey(artifact.addresses.testMint),
          tokenProgram: publicKey(LEGACY_TOKEN_PROGRAM_ID),
        }),
      );
    await simulateSendFinalize(
      umi,
      config,
      builder,
      artifact,
      'createAtas',
    );
    accounts = await readAll();
  } else if (!latestAttempt(artifact, 'createAtas')) {
    throw new Goal9AExecutionError(
      'TEST token accounts already exist without a Goal 9A transaction record.',
    );
  }
  assertTokenAccount(
    accounts[0],
    artifact.addresses.sourceAta,
    artifact.addresses.assetSigner,
    artifact.addresses.testMint,
  );
  assertTokenAccount(
    accounts[1],
    artifact.addresses.destinationAta,
    artifact.addresses.testReceiver,
    artifact.addresses.testMint,
  );
  assertTokenAccount(
    accounts[2],
    artifact.addresses.recoveryAta,
    artifact.addresses.recoveryOwner,
    artifact.addresses.testMint,
  );
  artifact.checks.atasVerified = true;
  await writeGoal9AArtifact(artifact);
}

async function ensureSupplyAndRevokeMintAuthority(
  umi: Umi,
  config: WalletChildConfig,
  owner: KeypairSigner,
  artifact: Goal9AArtifact,
): Promise<void> {
  const pending = latestAttempt(artifact, 'mintSupply');
  if (pending?.status === 'prepared' || pending?.status === 'submitted') {
    await reconcileLatestAttempt(umi, config, artifact, 'mintSupply');
  }
  let mint = await safeFetchMint(umi, publicKey(artifact.addresses.testMint), {
    commitment: 'finalized',
  });
  if (!mint) throw new Goal9AExecutionError('TEST mint is missing.');
  if (mint.supply === 0n) {
    if (
      isNone(mint.mintAuthority) ||
      String(mint.mintAuthority.value) !== String(owner.publicKey)
    ) {
      throw new Goal9AExecutionError('TEST mint authority changed before minting.');
    }
    if (latestAttempt(artifact, 'mintSupply')?.status === 'confirmed') {
      throw new Goal9AExecutionError(
        'Confirmed TEST supply transaction is missing from live state.',
      );
    }
    const builder = mintTokensToChecked(umi, {
      mint: publicKey(artifact.addresses.testMint),
      token: publicKey(artifact.addresses.sourceAta),
      mintAuthority: owner,
      amount: GOAL_9A_INITIAL_SUPPLY_BASE_UNITS,
      decimals: GOAL_9A_DECIMALS,
    }).add(
      setAuthority(umi, {
        owned: publicKey(artifact.addresses.testMint),
        owner,
        authorityType: AuthorityType.MintTokens,
        newAuthority: null,
      }),
    );
    await simulateSendFinalize(
      umi,
      config,
      builder,
      artifact,
      'mintSupply',
    );
    mint = await safeFetchMint(umi, publicKey(artifact.addresses.testMint), {
      commitment: 'finalized',
    });
  } else if (!latestAttempt(artifact, 'mintSupply')) {
    throw new Goal9AExecutionError(
      'TEST mint has a supply without a Goal 9A transaction record.',
    );
  }
  const balances = await readBalances(umi, artifact.addresses);
  if (
    !mint ||
    mint.supply !== GOAL_9A_INITIAL_SUPPLY_BASE_UNITS ||
    !isNone(mint.mintAuthority) ||
    !isNone(mint.freezeAuthority) ||
    BigInt(balances.sourceBaseUnits) +
        BigInt(balances.destinationBaseUnits) +
        BigInt(balances.recoveryBaseUnits) !==
      GOAL_9A_INITIAL_SUPPLY_BASE_UNITS
  ) {
    throw new Goal9AExecutionError(
      'TEST supply or permanent authority revocation failed read-back.',
    );
  }
  artifact.checks.mintAuthorityRevoked = true;
  await writeGoal9AArtifact(artifact);
}

function buildDelegatedAction(
  umi: Umi,
  owner: KeypairSigner,
  executive: KeypairSigner,
  artifact: Goal9AArtifact,
) {
  return buildDelegatedTestTokenTransfer(
    umi,
    fixedIntent(artifact.addresses),
    fixedPolicy(artifact.addresses),
    {
      asset: artifact.addresses.asset,
      collection: artifact.addresses.collection,
      assetSigner: artifact.addresses.assetSigner,
      executionDelegateRecord: artifact.addresses.executionDelegateRecord,
      feePayer: owner,
      executive,
    },
  );
}

async function ensureRevoked(
  umi: Umi,
  config: WalletChildConfig,
  owner: KeypairSigner,
  artifact: Goal9AArtifact,
): Promise<void> {
  const delegateAddress = publicKey(
    artifact.addresses.executionDelegateRecord,
  );
  let record = await readDelegateRecord(umi, delegateAddress);
  if (!record) {
    artifact.checks.recordAbsentAfterRevoke = true;
    await writeGoal9AArtifact(artifact);
    return;
  }
  await assertActiveDelegate(umi, artifact);
  const revokeAttempt = latestAttempt(artifact, 'revoke');
  if (
    revokeAttempt?.status === 'prepared' ||
    revokeAttempt?.status === 'submitted'
  ) {
    await reconcileLatestAttempt(umi, config, artifact, 'revoke');
    record = await readDelegateRecord(umi, delegateAddress);
    if (!record) {
      artifact.checks.recordAbsentAfterRevoke = true;
      await writeGoal9AArtifact(artifact);
      return;
    }
  }
  await simulateSendFinalize(
    umi,
    config,
    revokeExecutionV1(umi, {
      executionDelegateRecord: delegateAddress,
      agentAsset: publicKey(artifact.addresses.asset),
      destination: owner.publicKey,
      payer: owner,
      authority: owner,
    }),
    artifact,
    'revoke',
  );
  if (await readDelegateRecord(umi, delegateAddress)) {
    throw new Goal9AExecutionError('Delegate record still exists after revoke.');
  }
  artifact.checks.recordAbsentAfterRevoke = true;
  await writeGoal9AArtifact(artifact);
}

async function simulateDeniedAfterRevoke(
  umi: Umi,
  owner: KeypairSigner,
  executive: KeypairSigner,
  artifact: Goal9AArtifact,
): Promise<void> {
  const { builder } = buildDelegatedAction(umi, owner, executive, artifact);
  const prepared = await builder.setLatestBlockhash(umi, {
    commitment: 'finalized',
  });
  const transaction = await prepared.buildAndSign(umi);
  const simulation = await umi.rpc.simulateTransaction(transaction, {
    commitment: 'finalized',
    verifySignatures: true,
  });
  assertExecutiveSimulation(simulation.err, simulation.logs, 'NoApprovals');
}

function reconcileActionBalances(artifact: Goal9AArtifact): void {
  const before = artifact.checks.actionBefore;
  const after = artifact.checks.actionAfter;
  if (!before || !after) {
    throw new Goal9AExecutionError('Bounded action balance evidence is incomplete.');
  }
  assertTestTokenActionDeltas(
    {
      sourceBefore: BigInt(before.sourceBaseUnits),
      sourceAfter: BigInt(after.sourceBaseUnits),
      destinationBefore: BigInt(before.destinationBaseUnits),
      destinationAfter: BigInt(after.destinationBaseUnits),
      recoveryBefore: BigInt(before.recoveryBaseUnits),
      recoveryAfter: BigInt(after.recoveryBaseUnits),
      feePayerBeforeLamports: BigInt(before.feePayerLamports),
      feePayerAfterLamports: BigInt(after.feePayerLamports),
    },
    GOAL_9A_ACTION_BASE_UNITS,
    GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS,
  );
}

function reconcileRescueBalances(artifact: Goal9AArtifact): void {
  const before = artifact.checks.rescueBefore;
  const after = artifact.checks.rescueAfter;
  if (!before || !after) {
    throw new Goal9AExecutionError('Owner rescue balance evidence is incomplete.');
  }
  assertTestTokenRescueDeltas(
    {
      sourceBefore: BigInt(before.sourceBaseUnits),
      sourceAfter: BigInt(after.sourceBaseUnits),
      destinationBefore: BigInt(before.destinationBaseUnits),
      destinationAfter: BigInt(after.destinationBaseUnits),
      recoveryBefore: BigInt(before.recoveryBaseUnits),
      recoveryAfter: BigInt(after.recoveryBaseUnits),
      feePayerBeforeLamports: BigInt(before.feePayerLamports),
      feePayerAfterLamports: BigInt(after.feePayerLamports),
    },
    GOAL_9A_RESCUE_BASE_UNITS,
    GOAL_9A_MAX_FEE_PAYER_SPEND_LAMPORTS,
  );
}

async function assertCompleteLiveState(
  umi: Umi,
  artifact: Goal9AArtifact,
): Promise<Readonly<{ balances: Goal9ABalances; supply: bigint }>> {
  const [record, asset, mint, balances, assetSignerBalance] = await Promise.all([
    readDelegateRecord(
      umi,
      publicKey(artifact.addresses.executionDelegateRecord),
    ),
    fetchAsset(umi, publicKey(artifact.addresses.asset), {
      commitment: 'finalized',
    }),
    safeFetchMint(umi, publicKey(artifact.addresses.testMint), {
      commitment: 'finalized',
    }),
    readBalances(umi, artifact.addresses),
    umi.rpc.getBalance(publicKey(artifact.addresses.assetSigner), {
      commitment: 'finalized',
    }),
  ]);
  if (
    record ||
    String(asset.owner) !== artifact.addresses.owner ||
    !mint ||
    String(mint.header.owner) !== LEGACY_TOKEN_PROGRAM_ID ||
    mint.decimals !== GOAL_9A_DECIMALS ||
    mint.supply !== GOAL_9A_INITIAL_SUPPLY_BASE_UNITS ||
    !isNone(mint.mintAuthority) ||
    !isNone(mint.freezeAuthority) ||
    balances.sourceBaseUnits !== '0' ||
    balances.destinationBaseUnits !== GOAL_9A_ACTION_BASE_UNITS.toString() ||
    balances.recoveryBaseUnits !== GOAL_9A_RESCUE_BASE_UNITS.toString() ||
    assetSignerBalance.basisPoints !== GOAL_9A_FINAL_ASSET_SIGNER_LAMPORTS
  ) {
    throw new Goal9AExecutionError('Completed Goal 9A live state has drifted.');
  }
  return Object.freeze({ balances, supply: mint.supply });
}

export async function runGoal9ATestTokenAction(
  config: WalletChildConfig,
): Promise<Goal9AArtifact> {
  const [goal5, goal7, goal9, existing] = await Promise.all([
    readGoal5Artifact(),
    readGoal7Artifact(),
    readGoal9ReadinessArtifact(),
    readGoal9AArtifact(),
  ]);
  if (
    !goal5 ||
    goal5.status !== 'complete' ||
    goal5.checks.final?.activeDelegate !== false ||
    !goal7 ||
    goal7.status !== 'complete' ||
    goal7.checks.final?.activeDelegate !== false
  ) {
    throw new Goal9AExecutionError(
      'Goals 5 and 7 must be complete with delegation revoked.',
    );
  }
  if (!goal9 || goal9.status !== 'unfunded' || goal9.checks.funded !== false) {
    throw new Goal9AExecutionError(
      'Goal 9 must remain an unfunded Mainnet readiness audit.',
    );
  }

  const { umi, verification } = await createVerifiedDevnetUmi(config);
  const [ownerResult, executiveResult, mintResult] = await Promise.all([
    loadOrCreateDevnetOwner(umi),
    loadOrCreateDevnetExecutive(umi),
    loadOrCreateIsolatedSigner(
      umi,
      DEFAULT_GOAL_9A_MINT_PATH,
      'Goal 9A Devnet TEST mint',
      (message) => new Goal9AExecutionError(message),
    ),
  ]);
  const { owner, created: ownerCreated } = ownerResult;
  const { executive, created: executiveCreated } = executiveResult;
  const { signer: mintSigner } = mintResult;
  if (
    ownerCreated ||
    executiveCreated ||
    String(owner.publicKey) !== goal5.addresses.owner ||
    String(executive.publicKey) !== goal5.addresses.executiveAuthority
  ) {
    throw new Goal9AExecutionError('Goal 9A signer keys do not match Goal 5.');
  }
  if (
    String(mintSigner.publicKey) === CIRCLE_MAINNET_USDC_MINT ||
    String(mintSigner.publicKey) === CIRCLE_DEVNET_USDC_MINT
  ) {
    throw new Goal9AExecutionError('Official USDC mints are forbidden.');
  }
  umi.use(keypairIdentity(owner));

  const mint = mintSigner.publicKey;
  const sourceAta = findAssociatedTokenPda(umi, {
    mint,
    owner: publicKey(goal5.addresses.assetSigner),
  })[0];
  const destinationAta = findAssociatedTokenPda(umi, {
    mint,
    owner: publicKey(goal5.addresses.nextOwner),
  })[0];
  const recoveryAta = findAssociatedTokenPda(umi, {
    mint,
    owner: owner.publicKey,
  })[0];
  const addresses = expectedAddresses(
    goal5,
    String(mint),
    String(sourceAta),
    String(destinationAta),
    String(recoveryAta),
  );

  const [profile, initialRecord, ownerBalance] = await Promise.all([
    safeFetchExecutiveProfileV1(
      umi,
      publicKey(addresses.executiveProfile),
      { commitment: 'finalized' },
    ),
    readDelegateRecord(
      umi,
      publicKey(addresses.executionDelegateRecord),
    ),
    umi.rpc.getBalance(owner.publicKey, { commitment: 'finalized' }),
  ]);
  if (
    !profile ||
    String(profile.authority) !== addresses.executiveAuthority ||
    String(profile.header.owner) !== String(MPL_AGENT_TOOLS_PROGRAM_ID)
  ) {
    throw new Goal9AExecutionError('Executive Profile read-back is invalid.');
  }

  let artifact: Goal9AArtifact;
  if (existing) {
    artifact = existing;
    assertArtifactMatches(artifact, verification.rpcOrigin, addresses);
  } else {
    if (initialRecord) {
      throw new Goal9AExecutionError(
        'Goal 9A requires delegation to be revoked before setup.',
      );
    }
    artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: '9A',
      network: 'devnet',
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      rpcOrigin: verification.rpcOrigin,
      addresses,
      policy: {
        token: GOAL_9A_TEST_TOKEN_LABEL,
        decimals: GOAL_9A_DECIMALS,
        initialSupplyBaseUnits: '2000000',
        actionBaseUnits: '100000',
        maximumTransferBaseUnits: '1000000',
        rescueBaseUnits: '1900000',
        maximumFeePayerSpendLamports: '100000',
        allowedProgram: LEGACY_TOKEN_PROGRAM_ID,
      },
      ownerStartingLamports: ownerBalance.basisPoints.toString(),
      transactions: {},
      checks: {},
    };
    await writeGoal9AArtifact(artifact);
  }

  if (artifact.status === 'complete') {
    await assertCompleteLiveState(umi, artifact);
    console.info('Goal 9A is already complete; no transaction submitted.');
    return artifact;
  }

  const policy = fixedPolicy(addresses);
  const intent = fixedIntent(addresses);
  const allowed = validateTestTokenAction(intent, policy);
  if (allowed.decision !== 'ALLOW') {
    throw new Goal9AExecutionError('The fixed TEST-token action was denied.');
  }
  artifact.checks.forbiddenActionsDenied = proveGoal9AForbiddenActions(
    intent,
    policy,
  );
  await writeGoal9AArtifact(artifact);

  await ensureMint(umi, config, owner, mintSigner, artifact);
  await ensureAtas(umi, config, owner, artifact);
  await ensureSupplyAndRevokeMintAuthority(umi, config, owner, artifact);

  let primaryError: unknown;
  try {
    let actionConfirmed = await reconcileLatestAttempt(
      umi,
      config,
      artifact,
      'boundedTransfer',
    );
    if (!actionConfirmed) {
      const delegateAddress = publicKey(addresses.executionDelegateRecord);
      let delegate = await readDelegateRecord(umi, delegateAddress);
      if (delegate) {
        if (!latestAttempt(artifact, 'delegate')) {
          throw new Goal9AExecutionError(
            'An active delegate exists without a Goal 9A transaction record.',
          );
        }
        await reconcileLatestAttempt(umi, config, artifact, 'delegate');
      } else {
        const pendingDelegate = latestAttempt(artifact, 'delegate');
        if (
          pendingDelegate?.status === 'prepared' ||
          pendingDelegate?.status === 'submitted'
        ) {
          await reconcileLatestAttempt(umi, config, artifact, 'delegate');
          delegate = await readDelegateRecord(umi, delegateAddress);
        }
        if (!delegate) {
          await simulateSendFinalize(
            umi,
            config,
            delegateExecutionV1(umi, {
              executiveProfile: publicKey(addresses.executiveProfile),
              agentAsset: publicKey(addresses.asset),
              agentIdentity: publicKey(addresses.agentIdentity),
              payer: owner,
              authority: owner,
            }),
            artifact,
            'delegate',
          );
        }
      }
      await assertActiveDelegate(umi, artifact);
      artifact.checks.activeDelegateVerified = true;
      await writeGoal9AArtifact(artifact);

      if (!artifact.transactions.boundedTransfer?.length) {
        artifact.checks.actionBefore = await readBalances(umi, addresses);
        if (
          artifact.checks.actionBefore.sourceBaseUnits !==
            GOAL_9A_INITIAL_SUPPLY_BASE_UNITS.toString() ||
          artifact.checks.actionBefore.destinationBaseUnits !== '0' ||
          artifact.checks.actionBefore.recoveryBaseUnits !== '0'
        ) {
          throw new Goal9AExecutionError(
            'TEST balances changed before the bounded action.',
          );
        }
        await writeGoal9AArtifact(artifact);
      } else if (!artifact.checks.actionBefore) {
        throw new Goal9AExecutionError(
          'Recorded bounded transfer is missing pre-action balances.',
        );
      }
      const { builder } = buildDelegatedAction(
        umi,
        owner,
        executive,
        artifact,
      );
      await simulateSendFinalize(
        umi,
        config,
        builder,
        artifact,
        'boundedTransfer',
      );
      actionConfirmed = true;
    }
    if (!actionConfirmed || !artifact.checks.actionBefore) {
      throw new Goal9AExecutionError('Bounded action evidence is incomplete.');
    }
    if (!artifact.checks.actionAfter) {
      artifact.checks.actionAfter = await readBalances(umi, addresses);
      await writeGoal9AArtifact(artifact);
    }
    reconcileActionBalances(artifact);
    artifact.checks.actionReconciled = true;
    await writeGoal9AArtifact(artifact);
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await ensureRevoked(umi, config, owner, artifact);
    } catch (revokeError) {
      if (primaryError !== undefined) {
        throw new AggregateError(
          [primaryError, revokeError],
          'Goal 9A failed and emergency revoke also failed.',
        );
      }
      throw revokeError;
    }
  }
  if (primaryError !== undefined) throw primaryError;

  await simulateDeniedAfterRevoke(umi, owner, executive, artifact);
  artifact.checks.deniedAfterRevoke = 'NoApprovals';
  await writeGoal9AArtifact(artifact);

  let rescueConfirmed = await reconcileLatestAttempt(
    umi,
    config,
    artifact,
    'ownerRescue',
  );
  if (!rescueConfirmed) {
    if (!artifact.transactions.ownerRescue?.length) {
      artifact.checks.rescueBefore = await readBalances(umi, addresses);
      if (
        artifact.checks.rescueBefore.sourceBaseUnits !==
          GOAL_9A_RESCUE_BASE_UNITS.toString() ||
        artifact.checks.rescueBefore.destinationBaseUnits !==
          GOAL_9A_ACTION_BASE_UNITS.toString() ||
        artifact.checks.rescueBefore.recoveryBaseUnits !== '0'
      ) {
        throw new Goal9AExecutionError(
          'TEST balances changed before owner rescue.',
        );
      }
      await writeGoal9AArtifact(artifact);
    } else if (!artifact.checks.rescueBefore) {
      throw new Goal9AExecutionError(
        'Recorded owner rescue is missing pre-rescue balances.',
      );
    }
    const { builder } = buildOwnerTestTokenRescue(umi, policy, {
      asset: addresses.asset,
      collection: addresses.collection,
      assetSigner: addresses.assetSigner,
      owner,
    });
    await simulateSendFinalize(
      umi,
      config,
      builder,
      artifact,
      'ownerRescue',
    );
    rescueConfirmed = true;
  }
  if (!rescueConfirmed || !artifact.checks.rescueBefore) {
    throw new Goal9AExecutionError('Owner rescue evidence is incomplete.');
  }
  if (!artifact.checks.rescueAfter) {
    artifact.checks.rescueAfter = await readBalances(umi, addresses);
    await writeGoal9AArtifact(artifact);
  }
  reconcileRescueBalances(artifact);
  artifact.checks.rescueReconciled = true;
  await writeGoal9AArtifact(artifact);

  const finalState = await assertCompleteLiveState(umi, artifact);
  const ownerEndingLamports = BigInt(finalState.balances.feePayerLamports);
  const totalOwnerSpend =
    BigInt(artifact.ownerStartingLamports) - ownerEndingLamports;
  if (totalOwnerSpend <= 0n) {
    throw new Goal9AExecutionError('Goal 9A owner spend did not reconcile.');
  }
  artifact.checks.final = {
    owner: addresses.owner,
    activeDelegate: false,
    sourceBaseUnits: '0',
    destinationBaseUnits: '100000',
    recoveryBaseUnits: '1900000',
    mintSupplyBaseUnits: '2000000',
    mintAuthority: null,
    freezeAuthority: null,
    tokenDelegates: 0,
    tokenCloseAuthorities: 0,
    assetSignerBalanceLamports: '9900000',
    ownerEndingLamports: ownerEndingLamports.toString(),
    totalOwnerSpendLamports: totalOwnerSpend.toString(),
  };
  artifact.status = 'complete';
  artifact.completedAt = new Date().toISOString();
  await writeGoal9AArtifact(artifact);
  return artifact;
}
