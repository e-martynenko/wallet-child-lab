import { transferSol } from '@metaplex-foundation/mpl-toolbox';
import {
  base58,
  keypairIdentity,
  lamports,
  publicKey,
  type TransactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi';

import { createVerifiedDevnetUmi } from '../chain/umi.js';
import type { WalletChildConfig } from '../config/env.js';
import { loadOrCreateDevnetOwner } from '../keys/devnet-owner.js';
import {
  readGoal4Artifact,
  type Goal4Artifact,
  writeGoal4Artifact,
} from './artifact.js';
import {
  assertGoal4FundingDelta,
  readGoal4WalletStatus,
  type Goal4WalletStatus,
} from './wallet.js';

export const GOAL_4_CONFIRMATION = '--confirm-goal-4';
export const GOAL_4_FUNDING_LAMPORTS = 10_000_000n;

const MAX_EXPECTED_TRANSACTION_FEE_LAMPORTS = 100_000n;
const FINALIZATION_ATTEMPTS = 40;

export class Goal4FundingError extends Error {
  override readonly name = 'Goal4FundingError';
}

export function assertGoal4Confirmation(arguments_: string[]): void {
  if (
    arguments_.length !== 1 ||
    arguments_[0] !== GOAL_4_CONFIRMATION
  ) {
    throw new Goal4FundingError(
      `Goal 4 write is locked. Run only with ${GOAL_4_CONFIRMATION}.`,
    );
  }
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
      throw new Goal4FundingError('The Goal 4 funding transaction failed.');
    }
    if (status?.commitment === 'finalized') {
      return;
    }
    await delay(1_000);
  }
  throw new Goal4FundingError(
    'Timed out while waiting for Goal 4 transaction finalization.',
  );
}

function assertArtifactMatchesStatus(
  artifact: Goal4Artifact,
  status: Goal4WalletStatus,
  rpcOrigin: string,
): void {
  if (
    artifact.rpcOrigin !== rpcOrigin ||
    artifact.addresses.owner !== status.owner ||
    artifact.addresses.collection !== status.collection ||
    artifact.addresses.asset !== status.asset ||
    artifact.addresses.agentIdentity !== status.agentIdentity ||
    artifact.addresses.assetSigner !== status.assetSigner ||
    artifact.funding.amountLamports !==
      GOAL_4_FUNDING_LAMPORTS.toString()
  ) {
    throw new Goal4FundingError(
      'The Goal 4 artifact does not match the verified wallet state.',
    );
  }
}

async function completeArtifact(
  umi: Pick<Umi, 'rpc'>,
  artifact: Goal4Artifact,
  after: Goal4WalletStatus,
): Promise<Goal4Artifact> {
  const beforeLamports = BigInt(artifact.funding.beforeLamports);
  assertGoal4FundingDelta(
    beforeLamports,
    after.balanceLamports,
    GOAL_4_FUNDING_LAMPORTS,
  );
  if (
    after.tokenAccounts.legacy.length !== 0 ||
    after.tokenAccounts.token2022.length !== 0
  ) {
    throw new Goal4FundingError(
      'Unexpected SPL token accounts appeared during SOL-only funding.',
    );
  }

  const ownerAfter = await umi.rpc.getBalance(publicKey(after.owner), {
    commitment: 'finalized',
  });
  const ownerBefore = BigInt(artifact.funding.ownerBeforeLamports);
  const ownerSpend = ownerBefore - ownerAfter.basisPoints;
  if (
    ownerSpend < GOAL_4_FUNDING_LAMPORTS ||
    ownerSpend >
      GOAL_4_FUNDING_LAMPORTS + MAX_EXPECTED_TRANSACTION_FEE_LAMPORTS
  ) {
    throw new Goal4FundingError(
      'Owner balance delta does not match the funding amount plus a bounded fee.',
    );
  }

  artifact.funding.ownerAfterLamports = ownerAfter.basisPoints.toString();
  artifact.funding.afterLamports = after.balanceLamports.toString();
  artifact.readBack = {
    registered: after.registered,
    executive: after.executive,
    tokenAccounts: after.tokenAccounts,
    relationship: after.relationship,
  };
  artifact.status = 'complete';
  artifact.completedAt = new Date().toISOString();
  await writeGoal4Artifact(artifact);
  return artifact;
}

async function simulateSendFinalize(
  umi: Umi,
  builder: TransactionBuilder,
  artifact: Goal4Artifact,
): Promise<string> {
  const prepared = await builder.setLatestBlockhash(umi, {
    commitment: 'finalized',
  });
  const transaction = await prepared.buildAndSign(umi);
  const simulation = await umi.rpc.simulateTransaction(transaction, {
    commitment: 'finalized',
    verifySignatures: true,
  });
  if (simulation.err !== null) {
    const details =
      simulation.logs?.slice(-12).join(' | ') ||
      JSON.stringify(simulation.err);
    throw new Goal4FundingError(
      `Goal 4 funding simulation failed; nothing was submitted. ${details}`,
    );
  }

  const signatureBytes = await umi.rpc.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: 'finalized',
    maxRetries: 3,
  });
  const signature = signatureToString(signatureBytes);
  artifact.funding.transaction = { signature, status: 'submitted' };
  await writeGoal4Artifact(artifact);
  console.info(`Goal 4 funding submitted: ${signature}`);

  const confirmation = await prepared.confirm(umi, signatureBytes, {
    commitment: 'finalized',
  });
  if (confirmation.value.err !== null) {
    throw new Goal4FundingError('Goal 4 funding failed after submission.');
  }
  artifact.funding.transaction = { signature, status: 'confirmed' };
  await writeGoal4Artifact(artifact);
  return signature;
}

export async function runGoal4Funding(
  config: WalletChildConfig,
): Promise<Goal4Artifact> {
  const existing = await readGoal4Artifact();
  if (existing?.status === 'complete') {
    console.info('Goal 4 is already complete; no funding transaction submitted.');
    return existing;
  }

  const before = await readGoal4WalletStatus(config);
  const { umi, verification } = await createVerifiedDevnetUmi(config);
  const { owner, created } = await loadOrCreateDevnetOwner(umi);
  umi.use(keypairIdentity(owner));
  if (String(owner.publicKey) !== before.owner) {
    throw new Goal4FundingError('Loaded owner key does not own the Core Asset.');
  }
  console.info(`Devnet owner: ${owner.publicKey}`);
  console.info(`Owner key: ${created ? 'created' : 'loaded'} locally (secret not printed)`);

  let artifact = existing;
  if (artifact) {
    assertArtifactMatchesStatus(artifact, before, verification.rpcOrigin);
  } else {
    if (before.balanceLamports !== 0n) {
      throw new Goal4FundingError(
        'Asset Signer already has a balance; refusing first-time funding.',
      );
    }
    if (
      before.tokenAccounts.legacy.length !== 0 ||
      before.tokenAccounts.token2022.length !== 0
    ) {
      throw new Goal4FundingError(
        'Asset Signer already has token accounts; refusing first-time funding.',
      );
    }
    const ownerBalance = await umi.rpc.getBalance(owner.publicKey, {
      commitment: 'finalized',
    });
    if (
      ownerBalance.basisPoints <
      GOAL_4_FUNDING_LAMPORTS + MAX_EXPECTED_TRANSACTION_FEE_LAMPORTS
    ) {
      throw new Goal4FundingError('Owner balance is too low for Goal 4 funding.');
    }
    artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      goal: 4,
      network: 'devnet',
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      rpcOrigin: verification.rpcOrigin,
      addresses: {
        owner: before.owner,
        collection: before.collection,
        asset: before.asset,
        agentIdentity: before.agentIdentity,
        assetSigner: before.assetSigner,
      },
      funding: {
        amountLamports: GOAL_4_FUNDING_LAMPORTS.toString(),
        ownerBeforeLamports: ownerBalance.basisPoints.toString(),
        beforeLamports: before.balanceLamports.toString(),
      },
    };
    await writeGoal4Artifact(artifact);
  }

  if (artifact.funding.transaction) {
    await waitForFinalizedSignature(
      umi,
      artifact.funding.transaction.signature,
    );
    artifact.funding.transaction.status = 'confirmed';
    await writeGoal4Artifact(artifact);
  } else {
    const currentOwnerBalance = await umi.rpc.getBalance(owner.publicKey, {
      commitment: 'finalized',
    });
    if (
      before.balanceLamports.toString() !== artifact.funding.beforeLamports ||
      currentOwnerBalance.basisPoints.toString() !==
        artifact.funding.ownerBeforeLamports
    ) {
      throw new Goal4FundingError(
        'Balances changed since the Goal 4 artifact was created; refusing to send.',
      );
    }
    await simulateSendFinalize(
      umi,
      transferSol(umi, {
        source: owner,
        destination: publicKey(before.assetSigner),
        amount: lamports(GOAL_4_FUNDING_LAMPORTS),
      }),
      artifact,
    );
  }

  const after = await readGoal4WalletStatus(config);
  assertArtifactMatchesStatus(artifact, after, verification.rpcOrigin);
  return completeArtifact(umi, artifact, after);
}
