import {
  fetchAgentIdentityV2,
  findAgentIdentityV2Pda,
  MPL_AGENT_IDENTITY_PROGRAM_ID,
  registerIdentityV1,
} from '@metaplex-foundation/mpl-agent-registry';
import {
  create,
  createCollection,
  fetchAsset,
  fetchCollection,
  findAssetSignerPda,
  MPL_CORE_PROGRAM_ID,
} from '@metaplex-foundation/mpl-core';
import {
  base58,
  generateSigner,
  keypairIdentity,
  publicKey,
  type PublicKey,
  type TransactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi';

import { createVerifiedDevnetUmi } from '../chain/umi.js';
import type { WalletChildConfig } from '../config/env.js';
import { loadOrCreateDevnetOwner } from '../keys/devnet-owner.js';
import {
  readGoal3Artifact,
  type Goal3Artifact,
  type TransactionRecord,
  writeGoal3Artifact,
} from './artifact.js';
import {
  assertGoal3ReadBack,
  type Goal3Expected,
  type Goal3ReadBack,
} from './invariants.js';

export const GOAL_3_CONFIRMATION = '--confirm-goal-3';
export const AGENT_NAME = 'Wallet Child #001';
export const COLLECTION_NAME = 'Wallet Child Lab';
export const METADATA_GIST =
  'https://gist.github.com/djent3052/047b96e293e586f6167ca8da41ef5d90';
export const AGENT_METADATA_URI =
  'https://gist.githubusercontent.com/djent3052/047b96e293e586f6167ca8da41ef5d90/raw/0c542aae387a11a0357d898744da44cb8305d9a8/wallet-child-001.json';
export const COLLECTION_METADATA_URI =
  'https://gist.githubusercontent.com/djent3052/047b96e293e586f6167ca8da41ef5d90/raw/8b79dfa9f05f16f5148a235a31458c9b7d5d9603/wallet-child-lab-collection.json';

const OWNER_MINIMUM_LAMPORTS = 100_000_000n;
const OWNER_AIRDROP_LAMPORTS = 1_000_000_000;
const CONFIRMATION_ATTEMPTS = 30;

type TransactionName = Exclude<
  keyof Goal3Artifact['transactions'],
  'ownerAirdrops'
>;

export class Goal3BirthError extends Error {
  override readonly name = 'Goal3BirthError';
}

export function assertGoal3Confirmation(arguments_: string[]): void {
  if (
    arguments_.length !== 1 ||
    arguments_[0] !== GOAL_3_CONFIRMATION
  ) {
    throw new Goal3BirthError(
      `Goal 3 write is locked. Run only with ${GOAL_3_CONFIRMATION}.`,
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

  for (let attempt = 0; attempt < CONFIRMATION_ATTEMPTS; attempt += 1) {
    const [status] = await umi.rpc.getSignatureStatuses([signatureBytes], {
      searchTransactionHistory: true,
    });

    if (status?.error) {
      throw new Goal3BirthError('A submitted Devnet transaction failed.');
    }

    if (status?.commitment === 'finalized') {
      return;
    }

    await delay(1_000);
  }

  throw new Goal3BirthError(
    'Timed out while waiting for Devnet transaction finalization.',
  );
}

async function assertRecordedTransactionFinalized(
  umi: Pick<Umi, 'rpc'>,
  name: string,
  record: TransactionRecord,
): Promise<void> {
  if (record.status !== 'confirmed') {
    throw new Goal3BirthError(
      `${name} is only recorded as submitted; inspect its signature before resuming.`,
    );
  }
  await waitForFinalizedSignature(umi, record.signature);
}

async function recordTransaction(
  artifact: Goal3Artifact,
  name: TransactionName,
  record: TransactionRecord,
): Promise<void> {
  artifact.transactions[name] = record;
  await writeGoal3Artifact(artifact);
}

async function recordOwnerAirdrop(
  artifact: Goal3Artifact,
  record: TransactionRecord,
): Promise<void> {
  artifact.transactions.ownerAirdrops = [record];
  await writeGoal3Artifact(artifact);
}

type AirdropRpcResponse = {
  result?: unknown;
  error?: {
    code?: unknown;
  };
};

export async function requestDevnetAirdrop(
  rpcUrl: string,
  owner: PublicKey,
  fetchRpc: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  const response = await fetchRpc(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'requestAirdrop',
      params: [
        owner,
        OWNER_AIRDROP_LAMPORTS,
        { commitment: 'confirmed' },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Goal3BirthError(
      `The Devnet faucet returned HTTP ${response.status}.`,
    );
  }

  let payload: AirdropRpcResponse;
  try {
    payload = (await response.json()) as AirdropRpcResponse;
  } catch {
    throw new Goal3BirthError('The Devnet faucet returned malformed JSON.');
  }

  if (payload.error) {
    const errorCode =
      typeof payload.error.code === 'number'
        ? ` (RPC ${payload.error.code})`
        : '';
    throw new Goal3BirthError(`The Devnet faucet rejected the airdrop${errorCode}.`);
  }

  if (typeof payload.result !== 'string') {
    throw new Goal3BirthError(
      'The Devnet faucet did not return a transaction signature.',
    );
  }

  try {
    if (signatureFromString(payload.result).length !== 64) {
      throw new Error('wrong signature length');
    }
  } catch {
    throw new Goal3BirthError(
      'The Devnet faucet returned an invalid transaction signature.',
    );
  }

  return payload.result;
}

async function fundOwnerIfNeeded(
  umi: Pick<Umi, 'rpc'>,
  rpcUrl: string,
  owner: PublicKey,
  artifact: Goal3Artifact,
): Promise<void> {
  const startingBalance = await umi.rpc.getBalance(owner, {
    commitment: 'confirmed',
  });

  if (startingBalance.basisPoints >= OWNER_MINIMUM_LAMPORTS) {
    return;
  }

  const signature = await requestDevnetAirdrop(rpcUrl, owner);

  await recordOwnerAirdrop(artifact, {
    signature,
    status: 'submitted',
  });
  console.info(`Owner airdrop submitted: ${signature}`);

  await waitForFinalizedSignature(umi, signature);
  await recordOwnerAirdrop(artifact, {
    signature,
    status: 'confirmed',
  });

  const fundedBalance = await umi.rpc.getBalance(owner, {
    commitment: 'confirmed',
  });
  if (fundedBalance.basisPoints < OWNER_MINIMUM_LAMPORTS) {
    throw new Goal3BirthError(
      'The Devnet owner balance is still too low after the airdrop.',
    );
  }
}

async function simulateSendConfirm(
  umi: Umi,
  builder: TransactionBuilder,
  artifact: Goal3Artifact,
  name: TransactionName,
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
    throw new Goal3BirthError(
      `${name} simulation failed; nothing was submitted. ${details}`,
    );
  }

  const signatureBytes = await umi.rpc.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: 'finalized',
    maxRetries: 3,
  });
  const signature = signatureToString(signatureBytes);

  await recordTransaction(artifact, name, {
    signature,
    status: 'submitted',
  });
  console.info(`${name} submitted: ${signature}`);

  const confirmation = await prepared.confirm(umi, signatureBytes, {
    commitment: 'finalized',
  });
  if (confirmation.value.err !== null) {
    throw new Goal3BirthError(`${name} failed after submission.`);
  }

  await recordTransaction(artifact, name, {
    signature,
    status: 'confirmed',
  });
  return signature;
}

async function readBackGoal3(
  umi: Umi,
  expected: Goal3Expected,
): Promise<Goal3ReadBack> {
  const collection = await fetchCollection(umi, expected.collection, {
    commitment: 'finalized',
  });
  const asset = await fetchAsset(umi, expected.asset, {
    commitment: 'finalized',
  });
  const agentIdentity = await fetchAgentIdentityV2(
    umi,
    publicKey(expected.agentIdentity),
    { commitment: 'finalized' },
  );
  const assetSignerBalance = await umi.rpc.getBalance(
    expected.assetSigner as PublicKey,
    { commitment: 'finalized' },
  );

  return {
    owner: String(umi.identity.publicKey),
    collection: {
      publicKey: String(collection.publicKey),
      programOwner: String(collection.header.owner),
      updateAuthority: String(collection.updateAuthority),
      name: collection.name,
      uri: collection.uri,
      numMinted: collection.numMinted,
      currentSize: collection.currentSize,
    },
    asset: {
      publicKey: String(asset.publicKey),
      programOwner: String(asset.header.owner),
      owner: String(asset.owner),
      updateAuthorityType: asset.updateAuthority.type,
      updateAuthorityAddress: asset.updateAuthority.address
        ? String(asset.updateAuthority.address)
        : undefined,
      name: asset.name,
      uri: asset.uri,
      agentIdentityUris: (asset.agentIdentities ?? []).map(
        (plugin) => plugin.uri,
      ),
    },
    agentIdentity: {
      publicKey: String(agentIdentity.publicKey),
      programOwner: String(agentIdentity.header.owner),
      linkedAsset: String(agentIdentity.asset),
      agentToken:
        agentIdentity.agentToken.__option === 'Some'
          ? String(agentIdentity.agentToken.value)
          : null,
    },
    assetSigner: {
      publicKey: expected.assetSigner,
      balanceLamports: assetSignerBalance.basisPoints,
    },
  };
}

function assertResumableArtifact(
  artifact: Goal3Artifact,
  owner: PublicKey,
  rpcOrigin: string,
): void {
  if (artifact.status !== 'in-progress') {
    throw new Goal3BirthError('Goal 3 is already complete; refusing another write.');
  }
  if (
    artifact.addresses.owner !== String(owner) ||
    artifact.rpcOrigin !== rpcOrigin ||
    artifact.metadata.gist !== METADATA_GIST ||
    artifact.metadata.asset !== AGENT_METADATA_URI ||
    artifact.metadata.collection !== COLLECTION_METADATA_URI
  ) {
    throw new Goal3BirthError(
      'The existing Goal 3 artifact does not match this owner, RPC, or metadata.',
    );
  }
}

async function assertAddressIsUnused(
  umi: Pick<Umi, 'rpc'>,
  address: string | undefined,
  label: string,
): Promise<void> {
  if (
    address &&
    (await umi.rpc.accountExists(publicKey(address), {
      commitment: 'finalized',
    }))
  ) {
    throw new Goal3BirthError(
      `${label} exists on Devnet without a recorded transaction; refusing to overwrite it.`,
    );
  }
}

export async function runGoal3Birth(
  config: WalletChildConfig,
): Promise<Goal3Artifact> {
  const { umi, verification } = await createVerifiedDevnetUmi(config);
  const { owner, created } = await loadOrCreateDevnetOwner(umi);
  umi.use(keypairIdentity(owner));

  let artifact = await readGoal3Artifact();
  if (artifact) {
    assertResumableArtifact(artifact, owner.publicKey, verification.rpcOrigin);
    console.info('Resuming the verified in-progress Goal 3 artifact.');
  } else {
    artifact = {
      schemaVersion: 1,
      experiment: 'wallet-child-001',
      network: 'devnet',
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      rpcOrigin: verification.rpcOrigin,
      metadata: {
        gist: METADATA_GIST,
        asset: AGENT_METADATA_URI,
        collection: COLLECTION_METADATA_URI,
      },
      addresses: {
        owner: String(owner.publicKey),
      },
      transactions: {},
    };
    await writeGoal3Artifact(artifact);
  }

  console.info(`Devnet owner: ${owner.publicKey}`);
  console.info(`Owner key: ${created ? 'created' : 'loaded'} locally (secret not printed)`);

  await fundOwnerIfNeeded(umi, config.rpcUrl, owner.publicKey, artifact);

  let collectionPublicKey: PublicKey;
  const collectionRecord = artifact.transactions.createCollection;
  if (collectionRecord) {
    await assertRecordedTransactionFinalized(
      umi,
      'createCollection',
      collectionRecord,
    );
    if (!artifact.addresses.collection) {
      throw new Goal3BirthError('The recorded Collection address is missing.');
    }
    collectionPublicKey = publicKey(artifact.addresses.collection);
  } else {
    await assertAddressIsUnused(
      umi,
      artifact.addresses.collection,
      'The unrecorded Collection address',
    );
    const collectionSigner = generateSigner(umi);
    collectionPublicKey = collectionSigner.publicKey;
    artifact.addresses.collection = String(collectionPublicKey);
    await writeGoal3Artifact(artifact);

    await simulateSendConfirm(
      umi,
      createCollection(umi, {
        collection: collectionSigner,
        payer: owner,
        updateAuthority: owner.publicKey,
        name: COLLECTION_NAME,
        uri: COLLECTION_METADATA_URI,
      }),
      artifact,
      'createCollection',
    );
  }

  const collection = await fetchCollection(umi, collectionPublicKey, {
    commitment: 'finalized',
  });
  if (
    collection.name !== COLLECTION_NAME ||
    collection.uri !== COLLECTION_METADATA_URI ||
    String(collection.updateAuthority) !== String(owner.publicKey)
  ) {
    throw new Goal3BirthError('Collection read-back failed after creation.');
  }

  let assetPublicKey: PublicKey;
  const assetRecord = artifact.transactions.createAsset;
  if (assetRecord) {
    await assertRecordedTransactionFinalized(umi, 'createAsset', assetRecord);
    if (!artifact.addresses.asset) {
      throw new Goal3BirthError('The recorded Asset address is missing.');
    }
    assetPublicKey = publicKey(artifact.addresses.asset);
  } else {
    await assertAddressIsUnused(
      umi,
      artifact.addresses.asset,
      'The unrecorded Asset address',
    );
    const assetSigner = generateSigner(umi);
    assetPublicKey = assetSigner.publicKey;
    artifact.addresses.asset = String(assetPublicKey);
    await writeGoal3Artifact(artifact);

    await simulateSendConfirm(
      umi,
      create(umi, {
        asset: assetSigner,
        collection,
        authority: owner,
        payer: owner,
        owner: owner.publicKey,
        name: AGENT_NAME,
        uri: AGENT_METADATA_URI,
      }),
      artifact,
      'createAsset',
    );
  }

  const createdAsset = await fetchAsset(umi, assetPublicKey, {
    commitment: 'finalized',
  });
  if (
    createdAsset.name !== AGENT_NAME ||
    createdAsset.uri !== AGENT_METADATA_URI ||
    String(createdAsset.owner) !== String(owner.publicKey)
  ) {
    throw new Goal3BirthError('Asset read-back failed after creation.');
  }

  const agentIdentityPda = findAgentIdentityV2Pda(umi, {
    asset: assetPublicKey,
  });
  const canonicalAssetSignerPda = findAssetSignerPda(umi, {
    asset: assetPublicKey,
  });
  artifact.addresses.agentIdentity = String(agentIdentityPda[0]);
  artifact.addresses.assetSigner = String(canonicalAssetSignerPda[0]);
  await writeGoal3Artifact(artifact);

  const identityRecord = artifact.transactions.registerIdentity;
  if (identityRecord) {
    await assertRecordedTransactionFinalized(
      umi,
      'registerIdentity',
      identityRecord,
    );
  } else {
    await assertAddressIsUnused(
      umi,
      String(agentIdentityPda[0]),
      'The unrecorded Agent Identity address',
    );
    await simulateSendConfirm(
      umi,
      registerIdentityV1(umi, {
        asset: assetPublicKey,
        collection: collectionPublicKey,
        payer: owner,
        authority: owner,
        agentRegistrationUri: AGENT_METADATA_URI,
      }),
      artifact,
      'registerIdentity',
    );
  }

  const expected: Goal3Expected = {
    coreProgram: String(MPL_CORE_PROGRAM_ID),
    agentIdentityProgram: String(MPL_AGENT_IDENTITY_PROGRAM_ID),
    collection: String(collectionPublicKey),
    asset: String(assetPublicKey),
    agentIdentity: String(agentIdentityPda[0]),
    assetSigner: String(canonicalAssetSignerPda[0]),
    collectionName: COLLECTION_NAME,
    collectionUri: COLLECTION_METADATA_URI,
    assetName: AGENT_NAME,
    assetUri: AGENT_METADATA_URI,
    agentIdentityUri: AGENT_METADATA_URI,
  };
  const readBack = await readBackGoal3(umi, expected);
  assertGoal3ReadBack(readBack, expected);

  const ownerBalance = await umi.rpc.getBalance(owner.publicKey, {
    commitment: 'finalized',
  });
  artifact.readBack = {
    collectionName: readBack.collection.name,
    collectionUri: readBack.collection.uri,
    collectionNumMinted: readBack.collection.numMinted,
    collectionCurrentSize: readBack.collection.currentSize,
    assetName: readBack.asset.name,
    assetUri: readBack.asset.uri,
    agentIdentityUri: readBack.asset.agentIdentityUris[0]!,
    agentToken: readBack.agentIdentity.agentToken,
    assetSignerBalanceLamports:
      readBack.assetSigner.balanceLamports.toString(),
    ownerBalanceLamports: ownerBalance.basisPoints.toString(),
  };
  artifact.status = 'complete';
  artifact.completedAt = new Date().toISOString();
  await writeGoal3Artifact(artifact);

  return artifact;
}
