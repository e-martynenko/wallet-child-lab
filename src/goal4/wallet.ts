import {
  fetchAgentIdentityV2,
  findAgentIdentityV2Pda,
  MPL_AGENT_IDENTITY_PROGRAM_ID,
} from '@metaplex-foundation/mpl-agent-registry';
import {
  fetchAsset,
  fetchCollection,
  findAssetSignerPda,
  MPL_CORE_PROGRAM_ID,
} from '@metaplex-foundation/mpl-core';
import { publicKey, type PublicKey } from '@metaplex-foundation/umi';

import { createVerifiedDevnetUmi } from '../chain/umi.js';
import type { WalletChildConfig } from '../config/env.js';
import {
  readGoal3Artifact,
  type Goal3Artifact,
} from '../goal3/artifact.js';

export const SPL_TOKEN_PROGRAM_ID =
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const SPL_TOKEN_2022_PROGRAM_ID =
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export type TokenAccountSummary = {
  address: string;
  mint: string;
  amount: string;
  decimals: number;
  program: 'spl-token' | 'spl-token-2022';
};

export type Goal4WalletStatus = {
  network: 'devnet';
  owner: string;
  collection: string;
  asset: string;
  agentIdentity: string;
  assetSigner: string;
  registrationUri: string;
  registered: true;
  executive: 'NONE';
  balanceLamports: bigint;
  tokenAccounts: {
    legacy: TokenAccountSummary[];
    token2022: TokenAccountSummary[];
  };
  relationship: {
    assetOwner: string;
    assetCollection: string;
    collectionUpdateAuthority: string;
    identityAsset: string;
  };
};

type JsonRpcError = {
  code?: unknown;
};

type JsonRpcTokenAccountsResponse = {
  result?: {
    value?: unknown;
  };
  error?: JsonRpcError;
};

export class Goal4WalletError extends Error {
  override readonly name = 'Goal4WalletError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Goal4WalletError(`Invalid ${label} in token-account response.`);
  }
  return value;
}

function parseTokenAccount(
  value: unknown,
  program: TokenAccountSummary['program'],
): TokenAccountSummary {
  if (!isRecord(value) || !isRecord(value['account'])) {
    throw new Goal4WalletError('Invalid token-account response item.');
  }
  const data = value['account']['data'];
  if (!isRecord(data) || !isRecord(data['parsed'])) {
    throw new Goal4WalletError('Token-account data was not parsed JSON.');
  }
  const info = data['parsed']['info'];
  if (!isRecord(info) || !isRecord(info['tokenAmount'])) {
    throw new Goal4WalletError('Invalid parsed token-account information.');
  }
  const decimals = info['tokenAmount']['decimals'];
  if (typeof decimals !== 'number' || !Number.isInteger(decimals)) {
    throw new Goal4WalletError('Invalid token-account decimals.');
  }

  return {
    address: requireString(value['pubkey'], 'token account address'),
    mint: requireString(info['mint'], 'token mint'),
    amount: requireString(info['tokenAmount']['amount'], 'token amount'),
    decimals,
    program,
  };
}

export async function fetchTokenAccountsByOwner(
  rpcUrl: string,
  owner: PublicKey,
  tokenProgram: PublicKey,
  program: TokenAccountSummary['program'],
  fetchRpc: typeof globalThis.fetch = globalThis.fetch,
): Promise<TokenAccountSummary[]> {
  const response = await fetchRpc(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [
        owner,
        { programId: tokenProgram },
        { commitment: 'finalized', encoding: 'jsonParsed' },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Goal4WalletError(
      `Token-account RPC returned HTTP ${response.status}.`,
    );
  }

  let payload: JsonRpcTokenAccountsResponse;
  try {
    payload = (await response.json()) as JsonRpcTokenAccountsResponse;
  } catch {
    throw new Goal4WalletError('Token-account RPC returned malformed JSON.');
  }

  if (payload.error) {
    const code =
      typeof payload.error.code === 'number'
        ? ` (RPC ${payload.error.code})`
        : '';
    throw new Goal4WalletError(`Token-account RPC rejected the request${code}.`);
  }
  if (!Array.isArray(payload.result?.value)) {
    throw new Goal4WalletError('Token-account RPC returned an invalid result.');
  }

  return payload.result.value.map((item) => parseTokenAccount(item, program));
}

function requireGoal3Addresses(
  artifact: Goal3Artifact,
): Required<Goal3Artifact['addresses']> {
  if (
    artifact.status !== 'complete' ||
    !artifact.addresses.collection ||
    !artifact.addresses.asset ||
    !artifact.addresses.agentIdentity ||
    !artifact.addresses.assetSigner
  ) {
    throw new Goal4WalletError(
      'Goal 3 must be complete with every public address before Goal 4.',
    );
  }
  return artifact.addresses as Required<Goal3Artifact['addresses']>;
}

export function assertGoal4FundingDelta(
  beforeLamports: bigint,
  afterLamports: bigint,
  expectedIncreaseLamports: bigint,
): void {
  if (afterLamports - beforeLamports !== expectedIncreaseLamports) {
    throw new Goal4WalletError(
      'Asset Signer balance did not increase by the exact expected amount.',
    );
  }
}

export async function readGoal4WalletStatus(
  config: WalletChildConfig,
  fetchRpc: typeof globalThis.fetch = globalThis.fetch,
): Promise<Goal4WalletStatus> {
  const goal3 = await readGoal3Artifact();
  if (!goal3) {
    throw new Goal4WalletError('Goal 3 artifact is missing.');
  }
  const addresses = requireGoal3Addresses(goal3);
  const { umi } = await createVerifiedDevnetUmi(config, fetchRpc);
  const assetPublicKey = publicKey(addresses.asset);
  const collectionPublicKey = publicKey(addresses.collection);
  const identityPda = findAgentIdentityV2Pda(umi, { asset: assetPublicKey });
  const assetSignerPda = findAssetSignerPda(umi, { asset: assetPublicKey });

  if (
    String(identityPda[0]) !== addresses.agentIdentity ||
    String(assetSignerPda[0]) !== addresses.assetSigner
  ) {
    throw new Goal4WalletError(
      'Stored Goal 3 PDAs do not match canonical derivation.',
    );
  }

  const collection = await fetchCollection(umi, collectionPublicKey, {
    commitment: 'finalized',
  });
  const asset = await fetchAsset(umi, assetPublicKey, {
    commitment: 'finalized',
  });
  const identity = await fetchAgentIdentityV2(umi, identityPda, {
    commitment: 'finalized',
  });
  const balance = await umi.rpc.getBalance(assetSignerPda[0], {
    commitment: 'finalized',
  });

  const assetCollection =
    asset.updateAuthority.type === 'Collection' &&
    asset.updateAuthority.address
      ? String(asset.updateAuthority.address)
      : undefined;
  const registrationUri = asset.agentIdentities?.[0]?.uri;
  if (
    String(collection.header.owner) !== String(MPL_CORE_PROGRAM_ID) ||
    String(asset.header.owner) !== String(MPL_CORE_PROGRAM_ID) ||
    String(identity.header.owner) !== String(MPL_AGENT_IDENTITY_PROGRAM_ID) ||
    String(asset.owner) !== addresses.owner ||
    assetCollection !== addresses.collection ||
    String(collection.updateAuthority) !== addresses.owner ||
    String(identity.asset) !== addresses.asset ||
    registrationUri !== goal3.metadata.asset
  ) {
    throw new Goal4WalletError(
      'On-chain owner, Collection, Identity, or registration relationship is invalid.',
    );
  }

  const legacy = await fetchTokenAccountsByOwner(
    config.rpcUrl,
    assetSignerPda[0],
    publicKey(SPL_TOKEN_PROGRAM_ID),
    'spl-token',
    fetchRpc,
  );
  const token2022 = await fetchTokenAccountsByOwner(
    config.rpcUrl,
    assetSignerPda[0],
    publicKey(SPL_TOKEN_2022_PROGRAM_ID),
    'spl-token-2022',
    fetchRpc,
  );

  return {
    network: 'devnet',
    owner: addresses.owner,
    collection: addresses.collection,
    asset: addresses.asset,
    agentIdentity: addresses.agentIdentity,
    assetSigner: addresses.assetSigner,
    registrationUri,
    registered: true,
    executive: 'NONE',
    balanceLamports: balance.basisPoints,
    tokenAccounts: { legacy, token2022 },
    relationship: {
      assetOwner: String(asset.owner),
      assetCollection,
      collectionUpdateAuthority: String(collection.updateAuthority),
      identityAsset: String(identity.asset),
    },
  };
}
