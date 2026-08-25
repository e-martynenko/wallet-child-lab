import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import { assertPublicArtifact } from '../goal3/artifact.js';
import {
  GOAL_9_MAX_ACQUISITION_COST_USD_CENTS,
  GOAL_9_MAX_SOL_RESERVE_LAMPORTS,
  GOAL_9_MAX_USDC_BASE_UNITS,
  SOLANA_MAINNET_USDC_MINT,
  USDC_DECIMALS,
} from '../mainnet/readiness.js';
import { PublicKeyStringSchema } from '../policy/types.js';

export const GOAL_9E_ACTION_BASE_UNITS = 100_000n;
export const GOAL_9E_ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal9e.mainnet-policy.json',
);

const Goal9EArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    experiment: z.literal('wallet-child-001'),
    goal: z.literal('9E'),
    network: z.literal('mainnet-beta'),
    status: z.literal('offline-policy-only'),
    createdAt: z.string().datetime(),
    addresses: z
      .object({
        owner: PublicKeyStringSchema,
        executive: PublicKeyStringSchema,
        recovery: PublicKeyStringSchema,
      })
      .strict(),
    policy: z
      .object({
        token: z.literal('USDC'),
        mint: z.literal(SOLANA_MAINNET_USDC_MINT),
        decimals: z.literal(USDC_DECIMALS),
        actionBaseUnits: z.literal(GOAL_9E_ACTION_BASE_UNITS.toString()),
        maximumTreasuryBaseUnits: z.literal(
          GOAL_9_MAX_USDC_BASE_UNITS.toString(),
        ),
        maximumSolReserveLamports: z.literal(
          GOAL_9_MAX_SOL_RESERVE_LAMPORTS.toString(),
        ),
        maximumAcquisitionCostUsdCents: z.literal(
          GOAL_9_MAX_ACQUISITION_COST_USD_CENTS.toString(),
        ),
        allowedDestinationOwner: PublicKeyStringSchema,
      })
      .strict(),
    checks: z
      .object({
        allPrincipalsDistinct: z.literal(true),
        funded: z.literal(false),
        networkRequest: z.literal(false),
        offlineBuilderShapeTested: z.literal(true),
        finalMainnetMessageBuilt: z.literal(false),
        finalMainnetMessageSigned: z.literal(false),
        mainnetTransactionSubmitted: z.literal(false),
      })
      .strict(),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (new Set(Object.values(artifact.addresses)).size !== 3) {
      context.addIssue({
        code: 'custom',
        path: ['addresses'],
        message: 'Owner, executive, and recovery must be distinct.',
      });
    }
    if (artifact.policy.allowedDestinationOwner !== artifact.addresses.recovery) {
      context.addIssue({
        code: 'custom',
        path: ['policy', 'allowedDestinationOwner'],
        message: 'The only allowed destination must be the recovery wallet.',
      });
    }
  });

export type Goal9EArtifact = Readonly<z.infer<typeof Goal9EArtifactSchema>>;

export class Goal9EArtifactError extends Error {
  override readonly name = 'Goal9EArtifactError';
}

export function createGoal9EArtifact(input: Readonly<{
  owner: string;
  executive: string;
  recovery: string;
  createdAt?: string;
}>): Goal9EArtifact {
  const artifact = {
    schemaVersion: 1,
    experiment: 'wallet-child-001',
    goal: '9E',
    network: 'mainnet-beta',
    status: 'offline-policy-only',
    createdAt: input.createdAt ?? new Date().toISOString(),
    addresses: {
      owner: input.owner,
      executive: input.executive,
      recovery: input.recovery,
    },
    policy: {
      token: 'USDC',
      mint: SOLANA_MAINNET_USDC_MINT,
      decimals: USDC_DECIMALS,
      actionBaseUnits: GOAL_9E_ACTION_BASE_UNITS.toString(),
      maximumTreasuryBaseUnits: GOAL_9_MAX_USDC_BASE_UNITS.toString(),
      maximumSolReserveLamports: GOAL_9_MAX_SOL_RESERVE_LAMPORTS.toString(),
      maximumAcquisitionCostUsdCents:
        GOAL_9_MAX_ACQUISITION_COST_USD_CENTS.toString(),
      allowedDestinationOwner: input.recovery,
    },
    checks: {
      allPrincipalsDistinct: true,
      funded: false,
      networkRequest: false,
      offlineBuilderShapeTested: true,
      finalMainnetMessageBuilt: false,
      finalMainnetMessageSigned: false,
      mainnetTransactionSubmitted: false,
    },
  } as const;
  const parsed = Goal9EArtifactSchema.safeParse(artifact);
  if (!parsed.success) {
    throw new Goal9EArtifactError('Refusing to create an invalid Goal 9E artifact.');
  }
  return Object.freeze(parsed.data);
}

export async function readGoal9EArtifact(
  artifactPath = GOAL_9E_ARTIFACT_PATH,
): Promise<Goal9EArtifact | null> {
  let raw: string;
  try {
    raw = await readFile(artifactPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Goal9EArtifactError('Could not read the Goal 9E artifact.');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Goal9EArtifactError('The Goal 9E artifact is not valid JSON.');
  }
  assertPublicArtifact(value);
  const parsed = Goal9EArtifactSchema.safeParse(value);
  if (!parsed.success) {
    throw new Goal9EArtifactError('The Goal 9E artifact has an invalid shape.');
  }
  return Object.freeze(parsed.data);
}

export async function writeGoal9EArtifact(
  artifact: Goal9EArtifact,
  artifactPath = GOAL_9E_ARTIFACT_PATH,
): Promise<void> {
  assertPublicArtifact(artifact);
  const parsed = Goal9EArtifactSchema.safeParse(artifact);
  if (!parsed.success) {
    throw new Goal9EArtifactError('Refusing to write an invalid Goal 9E artifact.');
  }
  const existing = await readGoal9EArtifact(artifactPath);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(parsed.data)) {
      throw new Goal9EArtifactError('Goal 9E artifact already contains different evidence.');
    }
    return;
  }
  await mkdir(dirname(artifactPath), { recursive: true });
  const temporaryPath = `${artifactPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(parsed.data, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o644,
  });
  await rename(temporaryPath, artifactPath);
}
