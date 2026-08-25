import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import { assertPublicArtifact } from '../goal3/artifact.js';

export const GOAL_9_READINESS_ARTIFACT_PATH = resolve(
  'artifacts/wallet-child-001.goal9.mainnet-readiness.json',
);

const SolanaPublicKeySchema = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/);

const Goal9ReadinessArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    experiment: z.literal('wallet-child-001'),
    goal: z.literal(9),
    network: z.literal('mainnet-beta'),
    status: z.literal('unfunded'),
    createdAt: z.string().datetime(),
    addresses: z
      .object({
        owner: SolanaPublicKeySchema,
        executive: SolanaPublicKeySchema,
      })
      .strict(),
    checks: z
      .object({
        distinctFromEachOther: z.literal(true),
        distinctFromDevnet: z.literal(true),
        funded: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type Goal9ReadinessArtifact = Readonly<
  z.infer<typeof Goal9ReadinessArtifactSchema>
>;

export class Goal9ReadinessArtifactError extends Error {
  override readonly name = 'Goal9ReadinessArtifactError';
}

export async function readGoal9ReadinessArtifact(
  artifactPath = GOAL_9_READINESS_ARTIFACT_PATH,
): Promise<Goal9ReadinessArtifact | null> {
  let contents: string;
  try {
    contents = await readFile(artifactPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new Goal9ReadinessArtifactError(
      'Could not read the Goal 9 readiness artifact.',
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Goal9ReadinessArtifactError(
      'The Goal 9 readiness artifact is not valid JSON.',
    );
  }
  assertPublicArtifact(value);
  const parsed = Goal9ReadinessArtifactSchema.safeParse(value);
  if (!parsed.success) {
    throw new Goal9ReadinessArtifactError(
      'The Goal 9 readiness artifact has an invalid shape.',
    );
  }
  return Object.freeze(parsed.data);
}

export async function writeGoal9ReadinessArtifact(
  artifact: Goal9ReadinessArtifact,
  artifactPath = GOAL_9_READINESS_ARTIFACT_PATH,
): Promise<void> {
  assertPublicArtifact(artifact);
  const parsed = Goal9ReadinessArtifactSchema.safeParse(artifact);
  if (!parsed.success) {
    throw new Goal9ReadinessArtifactError(
      'Refusing to write an invalid Goal 9 readiness artifact.',
    );
  }

  const existing = await readGoal9ReadinessArtifact(artifactPath);
  if (existing) {
    if (
      existing.addresses.owner !== artifact.addresses.owner ||
      existing.addresses.executive !== artifact.addresses.executive
    ) {
      throw new Goal9ReadinessArtifactError(
        'The Goal 9 artifact already records different readiness wallets.',
      );
    }
    return;
  }

  const temporaryPath = `${artifactPath}.tmp`;
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o644,
  });
  await rename(temporaryPath, artifactPath);
}
