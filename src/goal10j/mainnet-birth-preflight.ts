import { readFile } from 'node:fs/promises';

import { MPL_AGENT_IDENTITY_PROGRAM_ID } from '@metaplex-foundation/mpl-agent-registry';
import { MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { z } from 'zod';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../chain/network.js';
import {
  GOAL_10I_CANONICAL_URI,
  type Goal10IVerification,
} from '../goal10i/irys-transaction-verification.js';
import type { BootstrapFeeConfig } from '../goal9m/bootstrap-fee.js';
import {
  GOAL_9P_AGENT_IDENTITY,
  GOAL_9P_ASSET_SIGNER,
  GOAL_9P_ASSET_SIGNER_USDC_ATA,
  GOAL_9P_CORE_ASSET,
  GOAL_9P_EXECUTION_DELEGATE_RECORD,
  GOAL_9P_EXECUTIVE_PROFILE,
  GOAL_9P_OWNER,
  GOAL_9P_RECOVERY_USDC_ATA,
  createFinalMainnetContract,
} from '../goal9p/final-contract.js';
import { verifyFixedRentPlan } from '../goal9q/fixed-rent-plan.js';
import {
  BPF_UPGRADEABLE_LOADER_ID,
  MPL_AGENT_TOOLS_PROGRAM_ID,
} from '../mainnet/readiness.js';

export const GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS = 19_976_792n;
export const GOAL_10J_METADATA_SHA256 =
  '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c';

const EXPECTED_PACKAGE_CONTRACT = Object.freeze({
  agentRegistry: '0.2.6',
  core: '1.8.0',
  toolbox: '0.10.0',
  umi: '1.5.1',
  umiBundleDefaults: '1.5.1',
  agentRegistryCoreDependency: '1.8.0',
  agentRegistryToolboxDependency: '^0.10.0',
});

const RpcErrorSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});
const RpcEnvelopeSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.number().int(),
  result: z.unknown(),
});
const AccountSchema = z.object({
  lamports: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  owner: z.string(),
  executable: z.boolean(),
  data: z.tuple([z.string(), z.literal('base64')]),
  // Executable programs report u64::MAX here, which JSON cannot represent as a
  // safe integer. The field is intentionally ignored after shape validation.
  rentEpoch: z.number().nonnegative(),
  space: z.number().int().nonnegative(),
});
const AccountsSchema = z.object({
  context: z.object({ slot: z.number().int().positive() }),
  value: z.array(AccountSchema.nullable()),
});
const BalanceSchema = z.object({
  context: z.object({ slot: z.number().int().positive() }),
  value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

type RpcMethod =
  | 'getGenesisHash'
  | 'getSlot'
  | 'getMultipleAccounts'
  | 'getBalance'
  | 'getMinimumBalanceForRentExemption';

export type MainnetBirthPreflight = Readonly<{
  network: 'mainnet-beta';
  rpcOrigin: string;
  finalizedSlot: number;
  metadata: Readonly<{
    uri: typeof GOAL_10I_CANONICAL_URI;
    sha256: typeof GOAL_10J_METADATA_SHA256;
    byteLength: 351;
    settlement: 'PENDING' | 'SETTLED';
  }>;
  packageContract: Readonly<{
    agentRegistry: '0.2.6';
    core: '1.8.0';
    toolbox: '0.10.0';
    umi: '1.5.1';
    umiBundleDefaults: '1.5.1';
    agentRegistryDependenciesMatched: true;
    newerStandaloneCoreOrToolboxIgnored: true;
  }>;
  programs: Readonly<{
    core: string;
    identity: string;
    tools: string;
    allExecutable: true;
  }>;
  accounts: Readonly<{
    owner: typeof GOAL_9P_OWNER;
    ownerBalanceLamports: typeof GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS;
    future: Readonly<Record<string, string>>;
    checkedCount: 7;
    allAbsent: true;
  }>;
  fixedRent: Readonly<{
    agentIdentityLamports: bigint;
    executiveProfileLamports: bigint;
    executionDelegateRecordLamports: bigint;
    tokenAccountLamports: bigint;
    knownFixedRentLamports: bigint;
  }>;
  unresolvedBeforeWrite: readonly [
    'CORE_ASSET_RENT_AND_IDENTITY_PLUGIN_TOP_UP',
    'EXACT_ASSET_AND_IDENTITY_MESSAGE_FEES',
    'SAME_BYTES_SIMULATIONS',
    'ACTION_TIME_HUMAN_CONFIRMATION',
  ];
  readOnly: true;
  keyLoaded: false;
  transactionBuilt: false;
  messageSigned: false;
  transactionSubmitted: false;
  identityCreationAuthorized: false;
  verdict:
    | 'BLOCKED_WAITING_FOR_IRYS_SETTLEMENT'
    | 'STOP_READY_FOR_MAINNET_BIRTH_WRITE_REVIEW';
}>;

export class MainnetBirthPreflightError extends Error {
  override readonly name = 'MainnetBirthPreflightError';
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new MainnetBirthPreflightError(`${label} is not valid JSON.`);
  }
}

export async function verifyMainnetBirthPackageContract(
  projectRoot = process.cwd(),
): Promise<MainnetBirthPreflight['packageContract']> {
  const paths = [
    `${projectRoot}/package.json`,
    `${projectRoot}/node_modules/@metaplex-foundation/mpl-agent-registry/package.json`,
    `${projectRoot}/node_modules/@metaplex-foundation/mpl-core/package.json`,
    `${projectRoot}/node_modules/@metaplex-foundation/mpl-toolbox/package.json`,
    `${projectRoot}/node_modules/@metaplex-foundation/umi/package.json`,
    `${projectRoot}/node_modules/@metaplex-foundation/umi-bundle-defaults/package.json`,
  ];
  let values: string[];
  try {
    values = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
  } catch {
    throw new MainnetBirthPreflightError(
      'Pinned Metaplex installation is incomplete.',
    );
  }
  const [
    rootRaw,
    registryRaw,
    coreRaw,
    toolboxRaw,
    umiRaw,
    umiBundleRaw,
  ] = values;
  if (
    !rootRaw ||
    !registryRaw ||
    !coreRaw ||
    !toolboxRaw ||
    !umiRaw ||
    !umiBundleRaw
  ) {
    throw new MainnetBirthPreflightError(
      'Pinned Metaplex installation is incomplete.',
    );
  }
  const root = z
    .object({
      dependencies: z.object({
        '@metaplex-foundation/mpl-agent-registry': z.literal(
          EXPECTED_PACKAGE_CONTRACT.agentRegistry,
        ),
        '@metaplex-foundation/mpl-core': z.literal(EXPECTED_PACKAGE_CONTRACT.core),
        '@metaplex-foundation/mpl-toolbox': z.literal(
          EXPECTED_PACKAGE_CONTRACT.toolbox,
        ),
        '@metaplex-foundation/umi': z.literal(EXPECTED_PACKAGE_CONTRACT.umi),
        '@metaplex-foundation/umi-bundle-defaults': z.literal(
          EXPECTED_PACKAGE_CONTRACT.umiBundleDefaults,
        ),
      }),
    })
    .safeParse(parseJson(rootRaw, 'Project package'));
  const packageSchema = z.object({ name: z.string(), version: z.string() });
  const registry = packageSchema
    .extend({
      dependencies: z.object({
        '@metaplex-foundation/mpl-core': z.literal(
          EXPECTED_PACKAGE_CONTRACT.agentRegistryCoreDependency,
        ),
        '@metaplex-foundation/mpl-toolbox': z.literal(
          EXPECTED_PACKAGE_CONTRACT.agentRegistryToolboxDependency,
        ),
      }),
    })
    .safeParse(parseJson(registryRaw, 'Agent Registry package'));
  const core = packageSchema.safeParse(parseJson(coreRaw, 'MPL Core package'));
  const toolbox = packageSchema.safeParse(
    parseJson(toolboxRaw, 'MPL Toolbox package'),
  );
  const umi = packageSchema.safeParse(parseJson(umiRaw, 'UMI package'));
  const umiBundle = packageSchema.safeParse(
    parseJson(umiBundleRaw, 'UMI bundle defaults package'),
  );
  if (
    !root.success ||
    !registry.success ||
    registry.data.name !== '@metaplex-foundation/mpl-agent-registry' ||
    registry.data.version !== EXPECTED_PACKAGE_CONTRACT.agentRegistry ||
    !core.success ||
    core.data.name !== '@metaplex-foundation/mpl-core' ||
    core.data.version !== EXPECTED_PACKAGE_CONTRACT.core ||
    !toolbox.success ||
    toolbox.data.name !== '@metaplex-foundation/mpl-toolbox' ||
    toolbox.data.version !== EXPECTED_PACKAGE_CONTRACT.toolbox ||
    !umi.success ||
    umi.data.name !== '@metaplex-foundation/umi' ||
    umi.data.version !== EXPECTED_PACKAGE_CONTRACT.umi ||
    !umiBundle.success ||
    umiBundle.data.name !== '@metaplex-foundation/umi-bundle-defaults' ||
    umiBundle.data.version !== EXPECTED_PACKAGE_CONTRACT.umiBundleDefaults
  ) {
    throw new MainnetBirthPreflightError(
      'Pinned Metaplex package contract changed.',
    );
  }
  return Object.freeze({
    agentRegistry: '0.2.6' as const,
    core: '1.8.0' as const,
    toolbox: '0.10.0' as const,
    umi: '1.5.1' as const,
    umiBundleDefaults: '1.5.1' as const,
    agentRegistryDependenciesMatched: true as const,
    newerStandaloneCoreOrToolboxIgnored: true as const,
  });
}

async function rpcRead(
  config: BootstrapFeeConfig,
  id: number,
  method: RpcMethod,
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
    throw new MainnetBirthPreflightError(
      `Mainnet RPC ${method} read failed at ${config.rpcOrigin}.`,
    );
  }
  if (!response.ok) {
    throw new MainnetBirthPreflightError(
      `Mainnet RPC ${method} read returned HTTP ${response.status}.`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MainnetBirthPreflightError(
      `Mainnet RPC ${method} returned invalid JSON.`,
    );
  }
  const rpcError = RpcErrorSchema.safeParse(payload);
  if (rpcError.success) {
    throw new MainnetBirthPreflightError(
      `Mainnet RPC ${method} failed with code ${rpcError.data.error.code}.`,
    );
  }
  const envelope = RpcEnvelopeSchema.safeParse(payload);
  if (!envelope.success || envelope.data.id !== id) {
    throw new MainnetBirthPreflightError(
      `Mainnet RPC ${method} response is malformed.`,
    );
  }
  return envelope.data.result;
}

function parseResult<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new MainnetBirthPreflightError(`${label} is malformed.`);
  }
  return parsed.data;
}

export async function verifyMainnetBirthPreflight(
  config: BootstrapFeeConfig,
  durability: Goal10IVerification,
  fetchImpl: typeof fetch = fetch,
): Promise<MainnetBirthPreflight> {
  if (
    durability.canonicalIrysUri !== GOAL_10I_CANONICAL_URI ||
    durability.metadataSha256 !== GOAL_10J_METADATA_SHA256 ||
    durability.metadataByteLength !== 351 ||
    !durability.canonicalIrysTransactionVerified
  ) {
    throw new MainnetBirthPreflightError(
      'Goal 10I metadata evidence changed before Mainnet birth preflight.',
    );
  }
  const packageContract = await verifyMainnetBirthPackageContract();
  const contract = createFinalMainnetContract(
    createUmi('http://127.0.0.1:8899').use(mplToolbox()),
  );
  const future = Object.freeze({
    coreAsset: GOAL_9P_CORE_ASSET,
    agentIdentity: GOAL_9P_AGENT_IDENTITY,
    assetSigner: GOAL_9P_ASSET_SIGNER,
    assetSignerUsdcAta: GOAL_9P_ASSET_SIGNER_USDC_ATA,
    recoveryUsdcAta: GOAL_9P_RECOVERY_USDC_ATA,
    executiveProfile: GOAL_9P_EXECUTIVE_PROFILE,
    executionDelegateRecord: GOAL_9P_EXECUTION_DELEGATE_RECORD,
  });
  if (
    contract.addresses.coreAsset !== future.coreAsset ||
    new Set(Object.values(future)).size !== 7
  ) {
    throw new MainnetBirthPreflightError(
      'Frozen Mainnet identity address contract changed.',
    );
  }

  const genesis = await rpcRead(config, 1, 'getGenesisHash', [], fetchImpl);
  if (genesis !== SOLANA_MAINNET_BETA_GENESIS_HASH) {
    throw new MainnetBirthPreflightError('RPC genesis hash is not Solana Mainnet.');
  }
  const finalizedSlot = parseResult(
    z.number().int().positive(),
    await rpcRead(config, 2, 'getSlot', [{ commitment: 'finalized' }], fetchImpl),
    'Finalized slot',
  );
  const programAddresses = [
    String(MPL_CORE_PROGRAM_ID),
    String(MPL_AGENT_IDENTITY_PROGRAM_ID),
    MPL_AGENT_TOOLS_PROGRAM_ID,
  ];
  const programs = parseResult(
    AccountsSchema,
    await rpcRead(
      config,
      3,
      'getMultipleAccounts',
      [
        programAddresses,
        {
          encoding: 'base64',
          commitment: 'finalized',
          minContextSlot: finalizedSlot,
        },
      ],
      fetchImpl,
    ),
    'Program accounts',
  );
  if (
    programs.context.slot < finalizedSlot ||
    programs.value.length !== 3 ||
    programs.value.some(
      (account) =>
        !account?.executable || account.owner !== BPF_UPGRADEABLE_LOADER_ID,
    )
  ) {
    throw new MainnetBirthPreflightError(
      'A required Metaplex Mainnet program is missing or not executable.',
    );
  }
  const futureAccounts = parseResult(
    AccountsSchema,
    await rpcRead(
      config,
      4,
      'getMultipleAccounts',
      [
        Object.values(future),
        {
          encoding: 'base64',
          commitment: 'finalized',
          minContextSlot: programs.context.slot,
        },
      ],
      fetchImpl,
    ),
    'Future Wallet Child accounts',
  );
  if (
    futureAccounts.context.slot < programs.context.slot ||
    futureAccounts.value.length !== 7 ||
    futureAccounts.value.some((account) => account !== null)
  ) {
    throw new MainnetBirthPreflightError(
      'A frozen future Wallet Child account is already occupied.',
    );
  }
  const ownerBalance = parseResult(
    BalanceSchema,
    await rpcRead(
      config,
      5,
      'getBalance',
      [
        GOAL_9P_OWNER,
        {
          commitment: 'finalized',
          minContextSlot: futureAccounts.context.slot,
        },
      ],
      fetchImpl,
    ),
    'Owner balance',
  );
  if (
    ownerBalance.context.slot < futureAccounts.context.slot ||
    BigInt(ownerBalance.value) !== GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS
  ) {
    throw new MainnetBirthPreflightError(
      'Owner SOL balance drifted from the finalized Goal 10F receipt.',
    );
  }
  const rentValues = await Promise.all(
    [104, 40, 165].map((size, index) =>
      rpcRead(
        config,
        6 + index,
        'getMinimumBalanceForRentExemption',
        [size, { commitment: 'finalized' }],
        fetchImpl,
      ),
    ),
  );
  const [identityRent, profileRent, tokenRent] = rentValues.map((value) =>
    BigInt(
      parseResult(z.number().int().positive(), value, 'Fixed rent quote'),
    ),
  );
  if (
    identityRent === undefined ||
    profileRent === undefined ||
    tokenRent === undefined
  ) {
    throw new MainnetBirthPreflightError('Fixed rent quote is incomplete.');
  }
  const fixedRent = verifyFixedRentPlan({
    finalizedSlot: ownerBalance.context.slot,
    agentIdentityLamports: identityRent,
    executiveProfileLamports: profileRent,
    executionDelegateRecordLamports: identityRent,
    tokenAccountLamports: tokenRent,
  });

  return Object.freeze({
    network: 'mainnet-beta' as const,
    rpcOrigin: config.rpcOrigin,
    finalizedSlot: ownerBalance.context.slot,
    metadata: Object.freeze({
      uri: GOAL_10I_CANONICAL_URI,
      sha256: GOAL_10J_METADATA_SHA256,
      byteLength: 351 as const,
      settlement: durability.settlement.state,
    }),
    packageContract,
    programs: Object.freeze({
      core: programAddresses[0]!,
      identity: programAddresses[1]!,
      tools: programAddresses[2]!,
      allExecutable: true as const,
    }),
    accounts: Object.freeze({
      owner: GOAL_9P_OWNER,
      ownerBalanceLamports: GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS,
      future,
      checkedCount: 7 as const,
      allAbsent: true as const,
    }),
    fixedRent: Object.freeze({
      agentIdentityLamports: identityRent,
      executiveProfileLamports: profileRent,
      executionDelegateRecordLamports: identityRent,
      tokenAccountLamports: tokenRent,
      knownFixedRentLamports: fixedRent.fixedRentLamports,
    }),
    unresolvedBeforeWrite: Object.freeze([
      'CORE_ASSET_RENT_AND_IDENTITY_PLUGIN_TOP_UP',
      'EXACT_ASSET_AND_IDENTITY_MESSAGE_FEES',
      'SAME_BYTES_SIMULATIONS',
      'ACTION_TIME_HUMAN_CONFIRMATION',
    ] as const),
    readOnly: true as const,
    keyLoaded: false as const,
    transactionBuilt: false as const,
    messageSigned: false as const,
    transactionSubmitted: false as const,
    identityCreationAuthorized: false as const,
    verdict:
      durability.settlement.state === 'SETTLED'
        ? ('STOP_READY_FOR_MAINNET_BIRTH_WRITE_REVIEW' as const)
        : ('BLOCKED_WAITING_FOR_IRYS_SETTLEMENT' as const),
  });
}
