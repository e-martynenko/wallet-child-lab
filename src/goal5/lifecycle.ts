import {
  delegateExecutionV1,
  findExecutionDelegateRecordV1Pda,
  findExecutiveProfileV1Pda,
  MPL_AGENT_TOOLS_PROGRAM_ID,
  registerExecutiveV1,
  revokeExecutionV1,
  safeFetchExecutionDelegateRecordV1,
  safeFetchExecutiveProfileV1,
} from '@metaplex-foundation/mpl-agent-registry';
import {
  execute,
  fetchAsset,
  fetchCollection,
  findAssetSignerPda,
  transfer,
} from '@metaplex-foundation/mpl-core';
import {
  base58,
  keypairIdentity,
  publicKey,
  type KeypairSigner,
  type PublicKey,
  type TransactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi';

import { createVerifiedDevnetUmi } from '../chain/umi.js';
import type { WalletChildConfig } from '../config/env.js';
import { readGoal3Artifact } from '../goal3/artifact.js';
import { readGoal4Artifact } from '../goal4/artifact.js';
import { GOAL_4_FUNDING_LAMPORTS } from '../goal4/fund.js';
import { readGoal4WalletStatus } from '../goal4/wallet.js';
import {
  loadOrCreateDevnetExecutive,
  loadOrCreateDevnetNextOwner,
  loadOrCreateDevnetOwner,
} from '../keys/devnet-owner.js';
import {
  readGoal5Artifact,
  type Goal5Artifact,
  type Goal5TransactionName,
  writeGoal5Artifact,
} from './artifact.js';

export const GOAL_5_CONFIRMATION = '--confirm-goal-5';
export const SPL_NOOP_PROGRAM_ID =
  'noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV';

const FINALIZATION_ATTEMPTS = 40;

export class Goal5LifecycleError extends Error {
  override readonly name = 'Goal5LifecycleError';
}

export function assertGoal5Confirmation(arguments_: string[]): void {
  if (
    arguments_.length !== 1 ||
    arguments_[0] !== GOAL_5_CONFIRMATION
  ) {
    throw new Goal5LifecycleError(
      `Goal 5 write is locked. Run only with ${GOAL_5_CONFIRMATION}.`,
    );
  }
}

export function assertDistinctPrincipals(addresses: {
  owner: string;
  nextOwner: string;
  executiveAuthority: string;
  assetSigner: string;
}): void {
  if (new Set(Object.values(addresses)).size !== 4) {
    throw new Goal5LifecycleError(
      'Owner, next owner, executive, and Asset Signer must be distinct.',
    );
  }
}

export function assertExecutiveSimulation(
  error: unknown,
  logs: string[] | null | undefined,
  expected: 'allowed' | 'NoApprovals',
): void {
  if (expected === 'allowed') {
    if (error !== null) {
      throw new Goal5LifecycleError(
        `Executive execute simulation was unexpectedly denied. ${formatSimulationDetails(error, logs)}`,
      );
    }
    return;
  }

  if (error === null) {
    throw new Goal5LifecycleError(
      'Executive execute simulation unexpectedly succeeded after revocation.',
    );
  }

  const serialized = JSON.stringify(error);
  const noApprovals =
    /(?:0x1a|NoApprovals)/i.test(logs?.join(' | ') ?? '') ||
    /"Custom"\s*:\s*26/.test(serialized);
  if (!noApprovals) {
    throw new Goal5LifecycleError(
      `Executive execute failed for an unexpected reason. ${formatSimulationDetails(error, logs)}`,
    );
  }
}

function formatSimulationDetails(
  error: unknown,
  logs: string[] | null | undefined,
): string {
  return (
    logs?.slice(-8).join(' | ') ||
    JSON.stringify(error) ||
    'No simulation details.'
  );
}

function signatureToString(signature: Uint8Array): string {
  return base58.deserialize(signature)[0];
}

function signatureFromString(signature: string): Uint8Array {
  return base58.serialize(signature);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForFinalizedSignature(
  umi: Pick<Umi, 'rpc'>,
  signature: string,
): Promise<void> {
  const signatureBytes = signatureFromString(signature);
  for (let attempt = 0; attempt < FINALIZATION_ATTEMPTS; attempt += 1) {
    const [status] = await umi.rpc.getSignatureStatuses([signatureBytes], {
      searchTransactionHistory: true,
    });
    if (status?.error) {
      throw new Goal5LifecycleError('A Goal 5 Devnet transaction failed.');
    }
    if (status?.commitment === 'finalized') {
      return;
    }
    await delay(1_000);
  }
  throw new Goal5LifecycleError(
    'Timed out while waiting for Goal 5 transaction finalization.',
  );
}

async function simulateSendFinalize(
  umi: Umi,
  builder: TransactionBuilder,
  artifact: Goal5Artifact,
  name: Goal5TransactionName,
): Promise<void> {
  const prepared = await builder.setLatestBlockhash(umi, {
    commitment: 'finalized',
  });
  const transaction = await prepared.buildAndSign(umi);
  const simulation = await umi.rpc.simulateTransaction(transaction, {
    commitment: 'finalized',
    verifySignatures: true,
  });
  if (simulation.err !== null) {
    throw new Goal5LifecycleError(
      `${name} simulation failed; nothing was submitted. ${formatSimulationDetails(simulation.err, simulation.logs)}`,
    );
  }

  const signatureBytes = await umi.rpc.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: 'finalized',
    maxRetries: 3,
  });
  const signature = signatureToString(signatureBytes);
  artifact.transactions[name] = { signature, status: 'submitted' };
  await writeGoal5Artifact(artifact);
  console.info(`${name} submitted: ${signature}`);

  const confirmation = await prepared.confirm(umi, signatureBytes, {
    commitment: 'finalized',
  });
  if (confirmation.value.err !== null) {
    throw new Goal5LifecycleError(`${name} failed after submission.`);
  }
  artifact.transactions[name] = { signature, status: 'confirmed' };
  await writeGoal5Artifact(artifact);
}

async function confirmRecordedTransaction(
  umi: Pick<Umi, 'rpc'>,
  artifact: Goal5Artifact,
  name: Goal5TransactionName,
): Promise<boolean> {
  const transaction = artifact.transactions[name];
  if (!transaction) {
    return false;
  }
  await waitForFinalizedSignature(umi, transaction.signature);
  if (transaction.status !== 'confirmed') {
    transaction.status = 'confirmed';
    await writeGoal5Artifact(artifact);
  }
  return true;
}

async function readDelegateRecord(
  umi: Umi,
  delegateRecord: PublicKey,
) {
  return safeFetchExecutionDelegateRecordV1(umi, delegateRecord, {
    commitment: 'finalized',
  });
}

async function assertExecutiveProfile(
  umi: Umi,
  executiveProfile: PublicKey,
  executiveAuthority: PublicKey,
): Promise<void> {
  const profile = await safeFetchExecutiveProfileV1(umi, executiveProfile, {
    commitment: 'finalized',
  });
  if (
    !profile ||
    String(profile.header.owner) !== String(MPL_AGENT_TOOLS_PROGRAM_ID) ||
    String(profile.authority) !== String(executiveAuthority)
  ) {
    throw new Goal5LifecycleError('Executive Profile read-back is invalid.');
  }
}

async function assertActiveDelegateRecord(
  umi: Umi,
  delegateRecord: PublicKey,
  executiveProfile: PublicKey,
  executiveAuthority: PublicKey,
  asset: PublicKey,
): Promise<void> {
  const record = await readDelegateRecord(umi, delegateRecord);
  if (
    !record ||
    String(record.header.owner) !== String(MPL_AGENT_TOOLS_PROGRAM_ID) ||
    String(record.executiveProfile) !== String(executiveProfile) ||
    String(record.authority) !== String(executiveAuthority) ||
    String(record.agentAsset) !== String(asset)
  ) {
    throw new Goal5LifecycleError('Execution Delegate Record read-back is invalid.');
  }
}

async function assertDelegateRecordAbsent(
  umi: Umi,
  delegateRecord: PublicKey,
): Promise<void> {
  if (await readDelegateRecord(umi, delegateRecord)) {
    throw new Goal5LifecycleError(
      'Execution Delegate Record still exists after revocation.',
    );
  }
}

async function simulateExecutiveExecute(
  umi: Umi,
  payer: KeypairSigner,
  executive: KeypairSigner,
  asset: PublicKey,
  collection: PublicKey,
  delegateRecord: PublicKey,
  expected: 'allowed' | 'NoApprovals',
): Promise<void> {
  const builder = execute(umi, {
    asset: { publicKey: asset },
    collection: { publicKey: collection },
    payer,
    authority: executive,
    instructions: [
      {
        programId: publicKey(SPL_NOOP_PROGRAM_ID),
        keys: [
          {
            pubkey: delegateRecord,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: new Uint8Array(),
      },
    ],
  });
  const prepared = await builder.setLatestBlockhash(umi, {
    commitment: 'finalized',
  });
  const transaction = await prepared.buildAndSign(umi);
  const simulation = await umi.rpc.simulateTransaction(transaction, {
    commitment: 'finalized',
    verifySignatures: true,
  });
  assertExecutiveSimulation(simulation.err, simulation.logs, expected);
}

function requireGoalAddresses(
  goal3: Awaited<ReturnType<typeof readGoal3Artifact>>,
  goal4: Awaited<ReturnType<typeof readGoal4Artifact>>,
) {
  if (
    !goal3 ||
    goal3.status !== 'complete' ||
    !goal3.addresses.collection ||
    !goal3.addresses.asset ||
    !goal3.addresses.agentIdentity ||
    !goal3.addresses.assetSigner ||
    !goal4 ||
    goal4.status !== 'complete'
  ) {
    throw new Goal5LifecycleError(
      'Goals 3 and 4 must be complete before Goal 5.',
    );
  }
  return {
    owner: goal3.addresses.owner,
    collection: goal3.addresses.collection,
    asset: goal3.addresses.asset,
    agentIdentity: goal3.addresses.agentIdentity,
    assetSigner: goal3.addresses.assetSigner,
  };
}

function assertArtifactMatches(
  artifact: Goal5Artifact,
  rpcOrigin: string,
  expected: Goal5Artifact['addresses'],
): void {
  if (
    artifact.rpcOrigin !== rpcOrigin ||
    Object.entries(expected).some(
      ([key, value]) =>
        artifact.addresses[key as keyof Goal5Artifact['addresses']] !== value,
    ) ||
    artifact.startingAssetSignerBalanceLamports !==
      GOAL_4_FUNDING_LAMPORTS.toString()
  ) {
    throw new Goal5LifecycleError(
      'The Goal 5 artifact does not match the verified Devnet state.',
    );
  }
}

async function fetchAssetAndCollection(
  umi: Umi,
  asset: PublicKey,
  collection: PublicKey,
) {
  const [assetAccount, collectionAccount] = await Promise.all([
    fetchAsset(umi, asset, { commitment: 'finalized' }),
    fetchCollection(umi, collection, { commitment: 'finalized' }),
  ]);
  return { assetAccount, collectionAccount };
}

export async function runGoal5Lifecycle(
  config: WalletChildConfig,
): Promise<Goal5Artifact> {
  const existing = await readGoal5Artifact();
  const [goal3, goal4] = await Promise.all([
    readGoal3Artifact(),
    readGoal4Artifact(),
  ]);
  const goalAddresses = requireGoalAddresses(goal3, goal4);
  const { umi, verification } = await createVerifiedDevnetUmi(config);
  const { owner, created: ownerCreated } = await loadOrCreateDevnetOwner(umi);
  const { executive, created: executiveCreated } =
    await loadOrCreateDevnetExecutive(umi);
  const { nextOwner, created: nextOwnerCreated } =
    await loadOrCreateDevnetNextOwner(umi);
  umi.use(keypairIdentity(owner));

  if (ownerCreated || String(owner.publicKey) !== goalAddresses.owner) {
    throw new Goal5LifecycleError(
      'The loaded owner key does not match the existing Core Asset owner.',
    );
  }

  const asset = publicKey(goalAddresses.asset);
  const collection = publicKey(goalAddresses.collection);
  const executiveProfile = findExecutiveProfileV1Pda(umi, {
    authority: executive.publicKey,
  })[0];
  const delegateRecord = findExecutionDelegateRecordV1Pda(umi, {
    executiveProfile,
    agentAsset: asset,
  })[0];
  const derivedAssetSigner = findAssetSignerPda(umi, { asset })[0];
  if (String(derivedAssetSigner) !== goalAddresses.assetSigner) {
    throw new Goal5LifecycleError('Stored Asset Signer PDA is not canonical.');
  }

  assertDistinctPrincipals({
    owner: String(owner.publicKey),
    nextOwner: String(nextOwner.publicKey),
    executiveAuthority: String(executive.publicKey),
    assetSigner: String(derivedAssetSigner),
  });

  const expectedAddresses: Goal5Artifact['addresses'] = {
    owner: String(owner.publicKey),
    nextOwner: String(nextOwner.publicKey),
    executiveAuthority: String(executive.publicKey),
    executiveProfile: String(executiveProfile),
    executionDelegateRecord: String(delegateRecord),
    collection: goalAddresses.collection,
    asset: goalAddresses.asset,
    agentIdentity: goalAddresses.agentIdentity,
    assetSigner: goalAddresses.assetSigner,
  };

  let artifact = existing;
  if (artifact) {
    assertArtifactMatches(artifact, verification.rpcOrigin, expectedAddresses);
  } else {
    const [{ assetAccount }, profile, record, balance] = await Promise.all([
      fetchAssetAndCollection(umi, asset, collection),
      safeFetchExecutiveProfileV1(umi, executiveProfile, {
        commitment: 'finalized',
      }),
      readDelegateRecord(umi, delegateRecord),
      umi.rpc.getBalance(derivedAssetSigner, { commitment: 'finalized' }),
    ]);
    if (
      String(assetAccount.owner) !== String(owner.publicKey) ||
      profile ||
      record ||
      balance.basisPoints !== GOAL_4_FUNDING_LAMPORTS
    ) {
      throw new Goal5LifecycleError(
        'Goal 5 initial owner, profile, delegate, or balance state is not clean.',
      );
    }
    artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: 5,
      network: 'devnet',
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      rpcOrigin: verification.rpcOrigin,
      addresses: expectedAddresses,
      startingAssetSignerBalanceLamports: balance.basisPoints.toString(),
      transactions: {},
      checks: {},
    };
    await writeGoal5Artifact(artifact);
  }

  console.info(`Owner key: ${ownerCreated ? 'created' : 'loaded'} locally`);
  console.info(
    `Executive key: ${executiveCreated ? 'created' : 'loaded'} locally (secret not printed)`,
  );
  console.info(
    `Next-owner key: ${nextOwnerCreated ? 'created' : 'loaded'} locally (secret not printed)`,
  );

  if (artifact.status === 'complete') {
    const status = await readGoal4WalletStatus(config);
    await assertDelegateRecordAbsent(umi, delegateRecord);
    if (
      status.owner !== String(owner.publicKey) ||
      status.balanceLamports !== GOAL_4_FUNDING_LAMPORTS
    ) {
      throw new Goal5LifecycleError('Completed Goal 5 live state has drifted.');
    }
    console.info('Goal 5 is already complete; no transaction submitted.');
    return artifact;
  }

  if (
    !(await confirmRecordedTransaction(umi, artifact, 'registerExecutive'))
  ) {
    const profile = await safeFetchExecutiveProfileV1(umi, executiveProfile, {
      commitment: 'finalized',
    });
    if (profile) {
      throw new Goal5LifecycleError(
        'Executive Profile exists without a recorded Goal 5 transaction.',
      );
    }
    await simulateSendFinalize(
      umi,
      registerExecutiveV1(umi, { payer: owner, authority: executive }),
      artifact,
      'registerExecutive',
    );
  }
  await assertExecutiveProfile(umi, executiveProfile, executive.publicKey);
  artifact.checks.executiveProfileVerified = true;
  await writeGoal5Artifact(artifact);

  if (!(await confirmRecordedTransaction(umi, artifact, 'delegateInitial'))) {
    await assertDelegateRecordAbsent(umi, delegateRecord);
    const { assetAccount } = await fetchAssetAndCollection(
      umi,
      asset,
      collection,
    );
    if (String(assetAccount.owner) !== String(owner.publicKey)) {
      throw new Goal5LifecycleError('Original owner is not the asset owner.');
    }
    await simulateSendFinalize(
      umi,
      delegateExecutionV1(umi, {
        executiveProfile,
        agentAsset: asset,
        agentIdentity: publicKey(goalAddresses.agentIdentity),
        payer: owner,
        authority: owner,
      }),
      artifact,
      'delegateInitial',
    );
  }
  await assertActiveDelegateRecord(
    umi,
    delegateRecord,
    executiveProfile,
    executive.publicKey,
    asset,
  );
  artifact.checks.initialDelegationVerified = true;
  if (!artifact.checks.activeSimulationBeforeRevoke) {
    await simulateExecutiveExecute(
      umi,
      owner,
      executive,
      asset,
      collection,
      delegateRecord,
      'allowed',
    );
    artifact.checks.activeSimulationBeforeRevoke = 'allowed';
  }
  await writeGoal5Artifact(artifact);

  if (!(await confirmRecordedTransaction(umi, artifact, 'revokeInitial'))) {
    await simulateSendFinalize(
      umi,
      revokeExecutionV1(umi, {
        executionDelegateRecord: delegateRecord,
        agentAsset: asset,
        destination: owner.publicKey,
        payer: owner,
        authority: executive,
      }),
      artifact,
      'revokeInitial',
    );
  }
  await assertDelegateRecordAbsent(umi, delegateRecord);
  artifact.checks.recordAbsentAfterInitialRevoke = true;
  if (!artifact.checks.deniedAfterInitialRevoke) {
    await simulateExecutiveExecute(
      umi,
      owner,
      executive,
      asset,
      collection,
      delegateRecord,
      'NoApprovals',
    );
    artifact.checks.deniedAfterInitialRevoke = 'NoApprovals';
  }
  await writeGoal5Artifact(artifact);

  if (
    !(await confirmRecordedTransaction(
      umi,
      artifact,
      'delegateOwnershipTest',
    ))
  ) {
    await simulateSendFinalize(
      umi,
      delegateExecutionV1(umi, {
        executiveProfile,
        agentAsset: asset,
        agentIdentity: publicKey(goalAddresses.agentIdentity),
        payer: owner,
        authority: owner,
      }),
      artifact,
      'delegateOwnershipTest',
    );
  }
  await assertActiveDelegateRecord(
    umi,
    delegateRecord,
    executiveProfile,
    executive.publicKey,
    asset,
  );

  if (
    !(await confirmRecordedTransaction(umi, artifact, 'transferToNextOwner'))
  ) {
    const { assetAccount, collectionAccount } = await fetchAssetAndCollection(
      umi,
      asset,
      collection,
    );
    if (String(assetAccount.owner) !== String(owner.publicKey)) {
      throw new Goal5LifecycleError(
        'Asset is not held by the original owner before transfer.',
      );
    }
    await simulateSendFinalize(
      umi,
      transfer(umi, {
        asset: assetAccount,
        collection: collectionAccount,
        payer: owner,
        authority: owner,
        newOwner: nextOwner.publicKey,
      }),
      artifact,
      'transferToNextOwner',
    );
  }
  const ownerAfterTransfer = await fetchAsset(umi, asset, {
    commitment: 'finalized',
  });
  if (String(ownerAfterTransfer.owner) !== String(nextOwner.publicKey)) {
    throw new Goal5LifecycleError('Ownership transfer read-back failed.');
  }
  await assertActiveDelegateRecord(
    umi,
    delegateRecord,
    executiveProfile,
    executive.publicKey,
    asset,
  );
  await simulateExecutiveExecute(
    umi,
    owner,
    executive,
    asset,
    collection,
    delegateRecord,
    'allowed',
  );
  artifact.checks.ownershipTest = {
    ownerBefore: String(owner.publicKey),
    ownerAfter: String(nextOwner.publicKey),
    delegateRecordSurvived: true,
    activeSimulationAfterTransfer: 'allowed',
  };
  await writeGoal5Artifact(artifact);

  if (
    !(await confirmRecordedTransaction(umi, artifact, 'revokeAfterTransfer'))
  ) {
    await simulateSendFinalize(
      umi,
      revokeExecutionV1(umi, {
        executionDelegateRecord: delegateRecord,
        agentAsset: asset,
        destination: owner.publicKey,
        payer: owner,
        authority: nextOwner,
      }),
      artifact,
      'revokeAfterTransfer',
    );
  }
  await assertDelegateRecordAbsent(umi, delegateRecord);
  artifact.checks.recordAbsentAfterFinalRevoke = true;
  if (!artifact.checks.deniedAfterFinalRevoke) {
    await simulateExecutiveExecute(
      umi,
      owner,
      executive,
      asset,
      collection,
      delegateRecord,
      'NoApprovals',
    );
    artifact.checks.deniedAfterFinalRevoke = 'NoApprovals';
  }
  await writeGoal5Artifact(artifact);

  if (!(await confirmRecordedTransaction(umi, artifact, 'transferBack'))) {
    const { assetAccount, collectionAccount } = await fetchAssetAndCollection(
      umi,
      asset,
      collection,
    );
    if (String(assetAccount.owner) !== String(nextOwner.publicKey)) {
      throw new Goal5LifecycleError(
        'Next owner does not hold the asset before the return transfer.',
      );
    }
    await simulateSendFinalize(
      umi,
      transfer(umi, {
        asset: assetAccount,
        collection: collectionAccount,
        payer: owner,
        authority: nextOwner,
        newOwner: owner.publicKey,
      }),
      artifact,
      'transferBack',
    );
  }

  const finalStatus = await readGoal4WalletStatus(config);
  await assertDelegateRecordAbsent(umi, delegateRecord);
  if (
    finalStatus.owner !== String(owner.publicKey) ||
    finalStatus.relationship.assetOwner !== String(owner.publicKey) ||
    finalStatus.balanceLamports !== GOAL_4_FUNDING_LAMPORTS ||
    finalStatus.tokenAccounts.legacy.length !== 0 ||
    finalStatus.tokenAccounts.token2022.length !== 0
  ) {
    throw new Goal5LifecycleError(
      'Goal 5 final owner, balance, or token-account reconciliation failed.',
    );
  }

  artifact.checks.final = {
    owner: finalStatus.owner,
    activeDelegate: false,
    assetSignerBalanceLamports: finalStatus.balanceLamports.toString(),
    legacyTokenAccounts: finalStatus.tokenAccounts.legacy.length,
    token2022Accounts: finalStatus.tokenAccounts.token2022.length,
  };
  artifact.status = 'complete';
  artifact.completedAt = new Date().toISOString();
  await writeGoal5Artifact(artifact);
  return artifact;
}
