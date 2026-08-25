import {
  delegateExecutionV1,
  MPL_AGENT_TOOLS_PROGRAM_ID,
  revokeExecutionV1,
  safeFetchExecutionDelegateRecordV1,
  safeFetchExecutiveProfileV1,
} from '@metaplex-foundation/mpl-agent-registry';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';
import {
  base58,
  keypairIdentity,
  lamports,
  publicKey,
  type KeypairSigner,
  type PublicKey,
  type TransactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi';

import {
  assertBoundedTransferBalanceDeltas,
  buildBoundedTransfer,
} from '../actions/transfer.js';
import { createVerifiedDevnetUmi } from '../chain/umi.js';
import type { WalletChildConfig } from '../config/env.js';
import { readGoal4WalletStatus } from '../goal4/wallet.js';
import { readGoal5Artifact } from '../goal5/artifact.js';
import { assertExecutiveSimulation } from '../goal5/lifecycle.js';
import {
  loadOrCreateDevnetExecutive,
  loadOrCreateDevnetOwner,
} from '../keys/devnet-owner.js';
import { SYSTEM_PROGRAM_ID, validateAction } from '../policy/policy.js';
import {
  GOAL_6_EXAMPLE_TRANSFER_LAMPORTS,
  GOAL_6_MAX_FEE_PAYER_SPEND_LAMPORTS,
  GOAL_6_MAX_TRANSFER_LAMPORTS,
  loadWalletChildGoal6Policy,
  type WalletChildGoal6Policy,
} from '../policy/wallet-child-policy.js';
import {
  readGoal7Artifact,
  type Goal7Artifact,
  type Goal7Balances,
  type Goal7TransactionAttempt,
  type Goal7TransactionName,
  writeGoal7Artifact,
} from './artifact.js';

export const GOAL_7_CONFIRMATION = '--confirm-goal-7';
export const GOAL_7_FINAL_ASSET_SIGNER_LAMPORTS = 9_900_000n;
export const GOAL_7_RECEIVER_RENT_LAMPORTS = 890_880n;

export class Goal7ExecutionError extends Error {
  override readonly name = 'Goal7ExecutionError';
}

export function assertGoal7Confirmation(arguments_: string[]): void {
  if (arguments_.length !== 1 || arguments_[0] !== GOAL_7_CONFIRMATION) {
    throw new Goal7ExecutionError(
      `Goal 7 write is locked. Run only with ${GOAL_7_CONFIRMATION}.`,
    );
  }
}

type ForbiddenActionProof = NonNullable<
  Goal7Artifact['checks']['forbiddenActionsDenied']
>;

function requireDenial(
  action: unknown,
  policy: WalletChildGoal6Policy['policy'],
  expectedReason: ForbiddenActionProof[keyof ForbiddenActionProof],
): void {
  const decision = validateAction(action, policy);
  if (decision.decision !== 'DENY' || decision.reason !== expectedReason) {
    throw new Goal7ExecutionError(
      `Forbidden action did not fail closed as ${expectedReason}.`,
    );
  }
}

export function proveGoal7ForbiddenActions(
  goal6: WalletChildGoal6Policy,
): ForbiddenActionProof {
  requireDenial(
    { ...goal6.exampleIntent, amountLamports: 1_000_000_000n },
    goal6.policy,
    'AMOUNT_OVER_LIMIT',
  );
  requireDenial(
    { ...goal6.exampleIntent, destination: goal6.accounts.feePayer },
    goal6.policy,
    'DESTINATION_NOT_ALLOWED',
  );
  requireDenial(
    { ...goal6.exampleIntent, program: goal6.accounts.executive },
    goal6.policy,
    'MALFORMED_ACTION',
  );
  return Object.freeze({
    oneSol: 'AMOUNT_OVER_LIMIT',
    unknownDestination: 'DESTINATION_NOT_ALLOWED',
    injectedProgram: 'MALFORMED_ACTION',
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
    throw new Goal7ExecutionError(
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
    throw new Goal7ExecutionError('Block-height RPC returned an invalid result.');
  }
  return payload.result;
}

async function getZeroDataRentExemption(rpcUrl: string): Promise<bigint> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getMinimumBalanceForRentExemption',
      params: [0, { commitment: 'finalized' }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Goal7ExecutionError(
      `Rent-exemption RPC returned HTTP ${response.status}.`,
    );
  }
  const payload = (await response.json()) as {
    result?: unknown;
    error?: unknown;
  };
  if (
    payload.error !== undefined ||
    typeof payload.result !== 'number' ||
    !Number.isSafeInteger(payload.result)
  ) {
    throw new Goal7ExecutionError(
      'Rent-exemption RPC returned an invalid result.',
    );
  }
  return BigInt(payload.result);
}

function latestAttempt(
  artifact: Goal7Artifact,
  name: Goal7TransactionName,
): Goal7TransactionAttempt | undefined {
  return artifact.transactions[name]?.at(-1);
}

async function markAttempt(
  artifact: Goal7Artifact,
  attempt: Goal7TransactionAttempt,
  status: Goal7TransactionAttempt['status'],
): Promise<void> {
  attempt.status = status;
  await writeGoal7Artifact(artifact);
}

async function reconcileLatestAttempt(
  umi: Umi,
  config: WalletChildConfig,
  artifact: Goal7Artifact,
  name: Goal7TransactionName,
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
    throw new Goal7ExecutionError(`${name} failed on Devnet.`);
  }
  if (status?.commitment === 'finalized') {
    if (attempt.status !== 'confirmed') {
      await markAttempt(artifact, attempt, 'confirmed');
    }
    return true;
  }
  if (attempt.status === 'confirmed') {
    throw new Goal7ExecutionError(
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
      throw new Goal7ExecutionError(`${name} failed after submission.`);
    }
    await markAttempt(artifact, attempt, 'confirmed');
    return true;
  } catch (error) {
    if (error instanceof Goal7ExecutionError) throw error;
    status = await readStatus();
    if (status?.error) {
      await markAttempt(artifact, attempt, 'failed');
      throw new Goal7ExecutionError(`${name} failed on Devnet.`);
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
    throw new Goal7ExecutionError(
      `${name} finalization is still ambiguous; rerun the same command safely.`,
    );
  }
}

async function simulateSendFinalize(
  umi: Umi,
  config: WalletChildConfig,
  builder: TransactionBuilder,
  artifact: Goal7Artifact,
  name: Goal7TransactionName,
): Promise<void> {
  const prepared = await builder.setLatestBlockhash(umi, {
    commitment: 'finalized',
  });
  const blockhash = prepared.options.blockhash;
  if (!blockhash || typeof blockhash === 'string') {
    throw new Goal7ExecutionError(`${name} is missing blockhash expiry data.`);
  }
  const transaction = await prepared.buildAndSign(umi);
  const simulation = await umi.rpc.simulateTransaction(transaction, {
    commitment: 'finalized',
    verifySignatures: true,
  });
  if (simulation.err !== null) {
    throw new Goal7ExecutionError(
      `${name} simulation failed; nothing was submitted. ${formatSimulationDetails(simulation.err, simulation.logs)}`,
    );
  }
  const transactionSignature = transaction.signatures[0];
  if (
    !transactionSignature ||
    transactionSignature.every((byte) => byte === 0)
  ) {
    throw new Goal7ExecutionError(`${name} did not produce a payer signature.`);
  }
  const attempt: Goal7TransactionAttempt = {
    signature: signatureToString(transactionSignature),
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
    status: 'prepared',
  };
  (artifact.transactions[name] ??= []).push(attempt);
  await writeGoal7Artifact(artifact);

  const returnedSignature = await umi.rpc.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: 'finalized',
    maxRetries: 3,
  });
  if (signatureToString(returnedSignature) !== attempt.signature) {
    throw new Goal7ExecutionError(`${name} RPC returned a different signature.`);
  }
  await markAttempt(artifact, attempt, 'submitted');
  console.info(`${name} submitted: ${attempt.signature}`);
  if (!(await reconcileLatestAttempt(umi, config, artifact, name))) {
    throw new Goal7ExecutionError(`${name} expired before finalization.`);
  }
}

async function readBalances(
  umi: Umi,
  addresses: Goal7Artifact['addresses'],
): Promise<Goal7Balances> {
  const [assetSigner, receiver, payer] = await Promise.all([
    umi.rpc.getBalance(publicKey(addresses.assetSigner), {
      commitment: 'finalized',
    }),
    umi.rpc.getBalance(publicKey(addresses.testReceiver), {
      commitment: 'finalized',
    }),
    umi.rpc.getBalance(publicKey(addresses.owner), {
      commitment: 'finalized',
    }),
  ]);
  return {
    assetSignerLamports: assetSigner.basisPoints.toString(),
    testReceiverLamports: receiver.basisPoints.toString(),
    feePayerLamports: payer.basisPoints.toString(),
  };
}

async function ensureReceiverRentExempt(
  umi: Umi,
  config: WalletChildConfig,
  owner: KeypairSigner,
  artifact: Goal7Artifact,
): Promise<void> {
  const minimum = await getZeroDataRentExemption(config.rpcUrl);
  if (minimum !== GOAL_7_RECEIVER_RENT_LAMPORTS) {
    throw new Goal7ExecutionError(
      `Unexpected zero-data rent exemption: ${minimum} lamports.`,
    );
  }
  const receiverAddress = publicKey(artifact.addresses.testReceiver);
  let balance = (
    await umi.rpc.getBalance(receiverAddress, { commitment: 'finalized' })
  ).basisPoints;

  const preparationAttempt = latestAttempt(artifact, 'prepareReceiver');
  if (
    preparationAttempt?.status === 'prepared' ||
    preparationAttempt?.status === 'submitted'
  ) {
    await reconcileLatestAttempt(
      umi,
      config,
      artifact,
      'prepareReceiver',
    );
    balance = (
      await umi.rpc.getBalance(receiverAddress, { commitment: 'finalized' })
    ).basisPoints;
  }
  if (balance < minimum) {
    if (balance !== 0n) {
      throw new Goal7ExecutionError(
        'Receiver has an unexpected partial pre-funding balance.',
      );
    }
    if (latestAttempt(artifact, 'prepareReceiver')?.status === 'confirmed') {
      throw new Goal7ExecutionError(
        'Confirmed receiver preparation is missing from the live balance.',
      );
    }
    const preparation = transferSol(umi, {
      source: owner,
      destination: receiverAddress,
      amount: lamports(GOAL_7_RECEIVER_RENT_LAMPORTS),
    });
    const instructions = preparation.getInstructions();
    const instruction = instructions[0];
    const data = instruction?.data;
    if (
      instructions.length !== 1 ||
      !instruction ||
      String(instruction.programId) !== SYSTEM_PROGRAM_ID ||
      instruction.keys.length !== 2 ||
      String(instruction.keys[0]?.pubkey) !== String(owner.publicKey) ||
      instruction.keys[0]?.isSigner !== true ||
      instruction.keys[0]?.isWritable !== true ||
      String(instruction.keys[1]?.pubkey) !== artifact.addresses.testReceiver ||
      instruction.keys[1]?.isSigner !== false ||
      instruction.keys[1]?.isWritable !== true ||
      !data ||
      data.length !== 12 ||
      new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
        0,
        true,
      ) !== 2 ||
      new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(
        4,
        true,
      ) !== GOAL_7_RECEIVER_RENT_LAMPORTS
    ) {
      throw new Goal7ExecutionError(
        'Receiver preparation transaction shape is invalid.',
      );
    }
    await simulateSendFinalize(
      umi,
      config,
      preparation,
      artifact,
      'prepareReceiver',
    );
    balance = (
      await umi.rpc.getBalance(receiverAddress, { commitment: 'finalized' })
    ).basisPoints;
  }
  if (balance !== minimum) {
    throw new Goal7ExecutionError(
      'TEST_RECEIVER balance does not equal the fixed rent preparation.',
    );
  }
  artifact.checks.receiverRentExempt = {
    minimumLamports: '890880',
    ownerFundingLamports: '890880',
    balanceAfterLamports: balance.toString(),
  };
  await writeGoal7Artifact(artifact);
}

async function readDelegateRecord(umi: Umi, address: PublicKey) {
  return safeFetchExecutionDelegateRecordV1(umi, address, {
    commitment: 'finalized',
  });
}

async function assertActiveDelegate(
  umi: Umi,
  artifact: Goal7Artifact,
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
    throw new Goal7ExecutionError('Active delegate read-back is invalid.');
  }
}

function expectedAddresses(goal5: NonNullable<Awaited<ReturnType<typeof readGoal5Artifact>>>) {
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
  };
}

function assertArtifactMatches(
  artifact: Goal7Artifact,
  rpcOrigin: string,
  addresses: Goal7Artifact['addresses'],
): void {
  if (
    artifact.rpcOrigin !== rpcOrigin ||
    Object.entries(addresses).some(
      ([key, value]) =>
        artifact.addresses[key as keyof Goal7Artifact['addresses']] !== value,
    ) ||
    artifact.policy.amountLamports !==
      GOAL_6_EXAMPLE_TRANSFER_LAMPORTS.toString() ||
    artifact.policy.maximumTransferLamports !==
      GOAL_6_MAX_TRANSFER_LAMPORTS.toString() ||
    artifact.policy.maximumFeePayerSpendLamports !==
      GOAL_6_MAX_FEE_PAYER_SPEND_LAMPORTS.toString() ||
    artifact.policy.token !== 'SOL' ||
    artifact.policy.allowedProgram !== SYSTEM_PROGRAM_ID
  ) {
    throw new Goal7ExecutionError(
      'The Goal 7 artifact does not match the fixed Devnet experiment.',
    );
  }
}

function reconcileActionBalances(artifact: Goal7Artifact): void {
  const before = artifact.checks.actionBefore;
  const after = artifact.checks.actionAfter;
  if (!before || !after) {
    throw new Goal7ExecutionError('Action balance evidence is incomplete.');
  }
  assertBoundedTransferBalanceDeltas(
    {
      sourceBeforeLamports: BigInt(before.assetSignerLamports),
      sourceAfterLamports: BigInt(after.assetSignerLamports),
      destinationBeforeLamports: BigInt(before.testReceiverLamports),
      destinationAfterLamports: BigInt(after.testReceiverLamports),
      feePayerBeforeLamports: BigInt(before.feePayerLamports),
      feePayerAfterLamports: BigInt(after.feePayerLamports),
    },
    GOAL_6_EXAMPLE_TRANSFER_LAMPORTS,
    GOAL_6_MAX_FEE_PAYER_SPEND_LAMPORTS,
  );
}

function buildGoal7Transfer(
  umi: Umi,
  owner: KeypairSigner,
  executive: KeypairSigner,
  goal6: WalletChildGoal6Policy,
) {
  return buildBoundedTransfer(umi, goal6.exampleIntent, goal6.policy, {
    ...goal6.accounts,
    feePayer: owner,
    executive,
  });
}

async function ensureRevoked(
  umi: Umi,
  config: WalletChildConfig,
  owner: KeypairSigner,
  artifact: Goal7Artifact,
): Promise<void> {
  const delegateAddress = publicKey(
    artifact.addresses.executionDelegateRecord,
  );
  let record = await readDelegateRecord(umi, delegateAddress);
  if (!record) {
    artifact.checks.recordAbsentAfterRevoke = true;
    await writeGoal7Artifact(artifact);
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
      await writeGoal7Artifact(artifact);
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
    throw new Goal7ExecutionError('Delegate record still exists after revoke.');
  }
  artifact.checks.recordAbsentAfterRevoke = true;
  await writeGoal7Artifact(artifact);
}

async function simulateDeniedAfterRevoke(
  umi: Umi,
  owner: KeypairSigner,
  executive: KeypairSigner,
  goal6: WalletChildGoal6Policy,
): Promise<void> {
  const { builder } = buildGoal7Transfer(umi, owner, executive, goal6);
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

async function assertCompleteLiveState(
  config: WalletChildConfig,
  umi: Umi,
  artifact: Goal7Artifact,
): Promise<void> {
  const [wallet, receiver, record, asset] = await Promise.all([
    readGoal4WalletStatus(config),
    umi.rpc.getBalance(publicKey(artifact.addresses.testReceiver), {
      commitment: 'finalized',
    }),
    readDelegateRecord(
      umi,
      publicKey(artifact.addresses.executionDelegateRecord),
    ),
    fetchAsset(umi, publicKey(artifact.addresses.asset), {
      commitment: 'finalized',
    }),
  ]);
  const expectedReceiver =
    BigInt(
      artifact.checks.actionBefore?.testReceiverLamports ??
        artifact.startingBalances.testReceiverLamports,
    ) +
    GOAL_6_EXAMPLE_TRANSFER_LAMPORTS;
  if (
    record ||
    String(asset.owner) !== artifact.addresses.owner ||
    wallet.owner !== artifact.addresses.owner ||
    wallet.balanceLamports !== GOAL_7_FINAL_ASSET_SIGNER_LAMPORTS ||
    receiver.basisPoints !== expectedReceiver ||
    wallet.tokenAccounts.legacy.length !== 0 ||
    wallet.tokenAccounts.token2022.length !== 0
  ) {
    throw new Goal7ExecutionError('Completed Goal 7 live state has drifted.');
  }
}

export async function runGoal7BoundedAction(
  config: WalletChildConfig,
): Promise<Goal7Artifact> {
  const [goal5, goal6, existing] = await Promise.all([
    readGoal5Artifact(),
    loadWalletChildGoal6Policy(),
    readGoal7Artifact(),
  ]);
  if (
    !goal5 ||
    goal5.status !== 'complete' ||
    goal5.checks.final?.activeDelegate !== false
  ) {
    throw new Goal7ExecutionError('Goal 5 must be complete and revoked.');
  }
  const { umi, verification } = await createVerifiedDevnetUmi(config);
  const [{ owner, created: ownerCreated }, { executive, created: executiveCreated }] =
    await Promise.all([
      loadOrCreateDevnetOwner(umi),
      loadOrCreateDevnetExecutive(umi),
    ]);
  if (
    ownerCreated ||
    executiveCreated ||
    String(owner.publicKey) !== goal5.addresses.owner ||
    String(executive.publicKey) !== goal5.addresses.executiveAuthority
  ) {
    throw new Goal7ExecutionError('Goal 7 signer keys do not match Goal 5.');
  }
  umi.use(keypairIdentity(owner));
  const addresses = expectedAddresses(goal5);

  const profile = await safeFetchExecutiveProfileV1(
    umi,
    publicKey(addresses.executiveProfile),
    { commitment: 'finalized' },
  );
  if (
    !profile ||
    String(profile.authority) !== addresses.executiveAuthority ||
    String(profile.header.owner) !== String(MPL_AGENT_TOOLS_PROGRAM_ID)
  ) {
    throw new Goal7ExecutionError('Executive Profile read-back is invalid.');
  }

  let artifact = existing;
  if (artifact) {
    assertArtifactMatches(artifact, verification.rpcOrigin, addresses);
  } else {
    const [wallet, record, balances] = await Promise.all([
      readGoal4WalletStatus(config),
      readDelegateRecord(
        umi,
        publicKey(addresses.executionDelegateRecord),
      ),
      readBalances(umi, addresses),
    ]);
    if (
      record ||
      wallet.owner !== addresses.owner ||
      wallet.balanceLamports !== 10_000_000n ||
      wallet.tokenAccounts.legacy.length !== 0 ||
      wallet.tokenAccounts.token2022.length !== 0
    ) {
      throw new Goal7ExecutionError(
        'Goal 7 requires a revoked delegate, original owner, 0.01 SOL, and zero token accounts.',
      );
    }
    artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: 7,
      network: 'devnet',
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      rpcOrigin: verification.rpcOrigin,
      addresses,
      policy: {
        token: 'SOL',
        amountLamports: '100000',
        maximumTransferLamports: '1000000',
        maximumFeePayerSpendLamports: '100000',
        allowedProgram: goal6.policy.allowedProgram,
      },
      startingBalances: balances,
      transactions: {},
      checks: {},
    };
    await writeGoal7Artifact(artifact);
  }

  if (artifact.status === 'complete') {
    await assertCompleteLiveState(config, umi, artifact);
    console.info('Goal 7 is already complete; no transaction submitted.');
    return artifact;
  }

  artifact.checks.forbiddenActionsDenied = proveGoal7ForbiddenActions(goal6);
  await writeGoal7Artifact(artifact);

  await ensureReceiverRentExempt(umi, config, owner, artifact);

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
        const recordedDelegate = latestAttempt(artifact, 'delegate');
        if (!recordedDelegate) {
          throw new Goal7ExecutionError(
            'An active delegate exists without a Goal 7 transaction record.',
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
      await writeGoal7Artifact(artifact);

      if (!artifact.transactions.boundedTransfer?.length) {
        artifact.checks.actionBefore = await readBalances(umi, addresses);
        if (
          BigInt(artifact.checks.actionBefore.assetSignerLamports) !==
          10_000_000n
        ) {
          throw new Goal7ExecutionError(
            'Asset Signer balance changed before the bounded action.',
          );
        }
        await writeGoal7Artifact(artifact);
      } else if (!artifact.checks.actionBefore) {
        throw new Goal7ExecutionError(
          'Recorded bounded transfer is missing pre-action balances.',
        );
      }
      const { builder } = buildGoal7Transfer(umi, owner, executive, goal6);
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
      throw new Goal7ExecutionError('Bounded action evidence is incomplete.');
    }
    if (!artifact.checks.actionAfter) {
      artifact.checks.actionAfter = await readBalances(umi, addresses);
      await writeGoal7Artifact(artifact);
    }
    reconcileActionBalances(artifact);
    artifact.checks.actionReconciled = true;
    await writeGoal7Artifact(artifact);
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await ensureRevoked(umi, config, owner, artifact);
    } catch (revokeError) {
      if (primaryError !== undefined) {
        throw new AggregateError(
          [primaryError, revokeError],
          'Goal 7 failed and emergency revoke also failed.',
        );
      }
      throw revokeError;
    }
  }
  if (primaryError !== undefined) throw primaryError;

  await simulateDeniedAfterRevoke(umi, owner, executive, goal6);
  artifact.checks.deniedAfterRevoke = 'NoApprovals';
  await assertCompleteLiveState(config, umi, artifact);
  const finalReceiver = await umi.rpc.getBalance(
    publicKey(addresses.testReceiver),
    { commitment: 'finalized' },
  );
  artifact.checks.final = {
    owner: addresses.owner,
    activeDelegate: false,
    assetSignerBalanceLamports: '9900000',
    testReceiverBalanceLamports: finalReceiver.basisPoints.toString(),
    legacyTokenAccounts: 0,
    token2022Accounts: 0,
  };
  artifact.status = 'complete';
  artifact.completedAt = new Date().toISOString();
  await writeGoal7Artifact(artifact);
  return artifact;
}
