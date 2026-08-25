import {
  deserializeExecutionDelegateRecordV1,
  getExecutionDelegateRecordV1GpaBuilder,
  MPL_AGENT_TOOLS_PROGRAM_ID,
  mplAgentTools,
  tools as mplAgentToolsTypes,
} from '@metaplex-foundation/mpl-agent-registry';
import { fetchAsset, mplCore } from '@metaplex-foundation/mpl-core';
import { publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';

import {
  assertDelegateRecordRelationships,
  assertSameAccountSet,
  classifyAgentToolsProgramAccounts,
  EXECUTION_DELEGATE_RECORD_V1_SIZE,
} from '../goal9b/delegates.js';
import { PublicKeyStringSchema } from '../policy/types.js';

export const SOLANA_MAINNET_GENESIS_HASH =
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

const PUBLIC_SOLANA_RPC_HOSTS = new Set([
  'api.mainnet-beta.solana.com',
  'api.mainnet.solana.com',
  'api.devnet.solana.com',
  'api.testnet.solana.com',
]);

export type MainnetDelegateAuditConfig = Readonly<{
  rpcUrl: string;
  rpcOrigin: string;
  asset: string;
  expectedOwner: string;
}>;

export type MainnetDelegateAuditEvidence = Readonly<{
  network: 'mainnet-beta';
  genesisHash: typeof SOLANA_MAINNET_GENESIS_HASH;
  auditedAt: string;
  rpcOrigin: string;
  asset: string;
  expectedOwner: string;
  finalizedSlotFloor: number;
  finalizedSlotAfter: number;
  counts: Readonly<{
    allProgramAccounts: number;
    executiveProfiles: number;
    executionDelegateRecords: number;
    matchingAssetDelegates: 0;
  }>;
  checks: Readonly<{
    dedicatedHttpsRpc: true;
    verifiedMainnetGenesis: true;
    programLayoutClosedWorld: true;
    everyRecordPdaAndProfileVerified: true;
    filteredQueryMatchesFullScan: true;
    assetOwnerVerified: true;
    noActiveDelegates: true;
  }>;
  verdict: 'NO_ACTIVE_EXECUTION_DELEGATES_AT_FINALIZED_MAINNET_AUDIT';
  limitation: string;
}>;

export class MainnetDelegateAuditError extends Error {
  override readonly name = 'MainnetDelegateAuditError';
}

export function parseMainnetDelegateAuditConfig(
  env: NodeJS.ProcessEnv,
  expectedOwner: string,
): MainnetDelegateAuditConfig {
  const rawUrl = env['WALLET_CHILD_MAINNET_RPC_URL'];
  const rawAsset = env['WALLET_CHILD_MAINNET_AGENT_ASSET'];
  if (!rawUrl || !rawAsset) {
    throw new MainnetDelegateAuditError(
      'A dedicated Mainnet RPC URL and final agent asset address are required.',
    );
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new MainnetDelegateAuditError('The Mainnet RPC URL is invalid.');
  }
  if (
    url.protocol !== 'https:' ||
    PUBLIC_SOLANA_RPC_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new MainnetDelegateAuditError(
      'The final delegate audit requires a dedicated HTTPS Mainnet RPC, not a public cluster endpoint.',
    );
  }
  const asset = PublicKeyStringSchema.safeParse(rawAsset);
  const owner = PublicKeyStringSchema.safeParse(expectedOwner);
  if (!asset.success || !owner.success || asset.data === owner.data) {
    throw new MainnetDelegateAuditError(
      'The final asset or expected owner address is invalid.',
    );
  }
  return Object.freeze({
    rpcUrl: url.toString(),
    rpcOrigin: url.origin,
    asset: asset.data,
    expectedOwner: owner.data,
  });
}

export function assertNoMainnetDelegates(count: number): asserts count is 0 {
  if (count !== 0) {
    throw new MainnetDelegateAuditError(
      `Found ${count} active execution delegate record(s); funding is forbidden.`,
    );
  }
}

export async function auditMainnetDelegates(
  config: MainnetDelegateAuditConfig,
): Promise<MainnetDelegateAuditEvidence> {
  const umi = createUmi(config.rpcUrl).use(mplAgentTools()).use(mplCore());
  const genesisHash = await umi.rpc.getGenesisHash();
  if (genesisHash !== SOLANA_MAINNET_GENESIS_HASH) {
    throw new MainnetDelegateAuditError('RPC genesis hash is not Solana Mainnet.');
  }
  const assetAddress = publicKey(config.asset);
  const finalizedSlotFloor = await umi.rpc.getSlot({ commitment: 'finalized' });
  const allProgramAccounts = await umi.rpc.getProgramAccounts(
    publicKey(MPL_AGENT_TOOLS_PROGRAM_ID),
    { commitment: 'finalized', minContextSlot: finalizedSlotFloor },
  );
  const classified = classifyAgentToolsProgramAccounts(allProgramAccounts);
  const records = classified.executionDelegateRecords.map((account) =>
    deserializeExecutionDelegateRecordV1(account),
  );
  assertDelegateRecordRelationships(umi, records, classified.executiveProfiles);

  const fullScanMatches = classified.executionDelegateRecords.filter(
    (account) =>
      String(deserializeExecutionDelegateRecordV1(account).agentAsset) ===
      config.asset,
  );
  const filteredRaw = await getExecutionDelegateRecordV1GpaBuilder(umi)
    .whereSize(EXECUTION_DELEGATE_RECORD_V1_SIZE)
    .whereField(
      'key',
      mplAgentToolsTypes.Key.ExecutionDelegateRecordV1,
    )
    .whereField('agentAsset', assetAddress)
    .get({ commitment: 'finalized', minContextSlot: finalizedSlotFloor });
  const filtered = classifyAgentToolsProgramAccounts(filteredRaw);
  if (filtered.executiveProfiles.length !== 0) {
    throw new MainnetDelegateAuditError(
      'Delegate-only filtered query returned an executive profile.',
    );
  }
  assertSameAccountSet(fullScanMatches, filtered.executionDelegateRecords);
  assertNoMainnetDelegates(fullScanMatches.length);

  const asset = await fetchAsset(umi, assetAddress, {
    commitment: 'finalized',
    minContextSlot: finalizedSlotFloor,
  });
  if (String(asset.owner) !== config.expectedOwner) {
    throw new MainnetDelegateAuditError('Final Core asset owner is not the isolated owner.');
  }
  const finalizedSlotAfter = await umi.rpc.getSlot({ commitment: 'finalized' });
  if (finalizedSlotAfter < finalizedSlotFloor) {
    throw new MainnetDelegateAuditError('Finalized slot moved backwards during audit.');
  }

  return Object.freeze({
    network: 'mainnet-beta',
    genesisHash: SOLANA_MAINNET_GENESIS_HASH,
    auditedAt: new Date().toISOString(),
    rpcOrigin: config.rpcOrigin,
    asset: config.asset,
    expectedOwner: config.expectedOwner,
    finalizedSlotFloor,
    finalizedSlotAfter,
    counts: Object.freeze({
      allProgramAccounts: allProgramAccounts.length,
      executiveProfiles: classified.executiveProfiles.length,
      executionDelegateRecords: classified.executionDelegateRecords.length,
      matchingAssetDelegates: 0,
    }),
    checks: Object.freeze({
      dedicatedHttpsRpc: true,
      verifiedMainnetGenesis: true,
      programLayoutClosedWorld: true,
      everyRecordPdaAndProfileVerified: true,
      filteredQueryMatchesFullScan: true,
      assetOwnerVerified: true,
      noActiveDelegates: true,
    }),
    verdict: 'NO_ACTIVE_EXECUTION_DELEGATES_AT_FINALIZED_MAINNET_AUDIT',
    limitation:
      'Complete for current documented Agent Tools account layouts returned by this dedicated RPC at finalized commitment; an independent provider cross-check remains preferable.',
  });
}
