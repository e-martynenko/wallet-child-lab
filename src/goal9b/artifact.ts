import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import { assertPublicArtifact } from '../goal3/artifact.js';
import { PublicKeyStringSchema } from '../policy/types.js';

export const GOAL_9B_ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal9b.delegation-audit.devnet.json',
);

const DelegateSummarySchema = z
  .object({
    address: PublicKeyStringSchema,
    executiveProfile: PublicKeyStringSchema,
    authority: PublicKeyStringSchema,
    agentAsset: PublicKeyStringSchema,
  })
  .strict();

export const Goal9BArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    experiment: z.literal('wallet-child-001'),
    goal: z.literal('9B'),
    network: z.literal('devnet'),
    status: z.literal('complete'),
    auditedAt: z.string(),
    rpcOrigin: z.string(),
    finalizedSlotFloor: z.number().int().nonnegative(),
    finalizedSlotAfter: z.number().int().nonnegative(),
    addresses: z
      .object({
        asset: PublicKeyStringSchema,
        owner: PublicKeyStringSchema,
        agentToolsProgram: PublicKeyStringSchema,
        knownExecutiveProfile: PublicKeyStringSchema,
        knownExecutionDelegateRecord: PublicKeyStringSchema,
      })
      .strict(),
    layout: z
      .object({
        executiveProfileDiscriminator: z.literal(1),
        executiveProfileSize: z.literal(40),
        executionDelegateDiscriminator: z.literal(2),
        executionDelegateSize: z.literal(104),
        agentAssetOffset: z.literal(72),
      })
      .strict(),
    counts: z
      .object({
        allProgramAccounts: z.number().int().nonnegative(),
        executiveProfiles: z.number().int().nonnegative(),
        executionDelegateRecords: z.number().int().nonnegative(),
        matchingAssetDelegates: z.number().int().nonnegative(),
      })
      .strict(),
    activeRecords: z.array(DelegateSummarySchema),
    checks: z
      .object({
        verifiedDevnetGenesis: z.literal(true),
        programLayoutClosedWorld: z.literal(true),
        everyRecordPdaVerified: z.literal(true),
        everyRecordProfileVerified: z.literal(true),
        filteredQueryMatchesFullScan: z.literal(true),
        knownProfileVerified: z.literal(true),
        knownRecordAbsent: z.literal(true),
        assetOwnerVerified: z.literal(true),
      })
      .strict(),
    verdict: z.literal('NO_ACTIVE_EXECUTION_DELEGATES_AT_FINALIZED_AUDIT'),
    scopeClaim: z.literal(
      'Complete for current ExecutionDelegateRecordV1 accounts returned by the verified Devnet RPC at finalized commitment.',
    ),
    limitation: z.literal(
      'A single RPC cannot cryptographically prove that the provider is not censoring data; Mainnet must use a reviewed dedicated RPC and repeat the audit immediately before funding.',
    ),
  })
  .strict();

export type Goal9BArtifact = Readonly<z.infer<typeof Goal9BArtifactSchema>>;

export class Goal9BArtifactError extends Error {
  override readonly name = 'Goal9BArtifactError';
}

export async function readGoal9BArtifact(
  artifactPath = GOAL_9B_ARTIFACT_PATH,
): Promise<Goal9BArtifact | null> {
  let contents: string;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Goal9BArtifactError('Could not read the Goal 9B artifact.');
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Goal9BArtifactError('The Goal 9B artifact is not valid JSON.');
  }
  assertPublicArtifact(value);
  const parsed = Goal9BArtifactSchema.safeParse(value);
  if (!parsed.success) {
    throw new Goal9BArtifactError('The Goal 9B artifact has an invalid shape.');
  }
  return Object.freeze(parsed.data);
}

export async function writeGoal9BArtifact(
  artifact: Goal9BArtifact,
  artifactPath = GOAL_9B_ARTIFACT_PATH,
): Promise<void> {
  assertPublicArtifact(artifact);
  const parsed = Goal9BArtifactSchema.safeParse(artifact);
  if (!parsed.success) {
    throw new Goal9BArtifactError('Refusing an invalid Goal 9B artifact.');
  }
  const temporaryPath = `${artifactPath}.tmp`;
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(parsed.data, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o644,
  });
  await rename(temporaryPath, artifactPath);
}
