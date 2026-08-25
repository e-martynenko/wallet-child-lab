import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { z } from 'zod';

import { assertPublicArtifact } from '../goal3/artifact.js';

export const GOAL_9C_METADATA_PATH = resolve(
  'metadata/wallet-child-001.mainnet-candidate.json',
);
export const GOAL_9C_INTEGRITY_PATH = resolve(
  'metadata/wallet-child-001.mainnet-candidate.integrity.json',
);
export const EIP_8004_REGISTRATION_V1 =
  'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
export const GOAL_9C_DESCRIPTION =
  'A minimal experimental agent identity for testing bounded wallet execution under explicit owner control.';

export const Goal9CMetadataSchema = z
  .object({
    type: z.literal(EIP_8004_REGISTRATION_V1),
    name: z.literal('Wallet Child #001'),
    description: z.literal(GOAL_9C_DESCRIPTION),
    image: z.literal(''),
    services: z.array(z.never()).length(0),
    x402Support: z.literal(false),
    active: z.literal(false),
    registrations: z.array(z.never()).length(0),
    supportedTrust: z.array(z.never()).length(0),
  })
  .strict();

export type Goal9CMetadata = Readonly<z.infer<typeof Goal9CMetadataSchema>>;

export const Goal9CIntegrityManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    candidatePath: z.literal(
      'metadata/wallet-child-001.mainnet-candidate.json',
    ),
    canonicalization: z.literal(
      'WALLET_CHILD_METADATA_V1_PRETTY_UTF8_LF_TRAILING_NEWLINE',
    ),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().positive(),
    publicationStatus: z.literal('NOT_PUBLISHED'),
    durableUri: z.null(),
    onChainUriUpdated: z.literal(false),
  })
  .strict();

export type Goal9CIntegrityManifest = Readonly<
  z.infer<typeof Goal9CIntegrityManifestSchema>
>;

export type Goal9CIntegrityEvidence = Readonly<{
  metadata: Goal9CMetadata;
  manifest: Goal9CIntegrityManifest;
  sha256: string;
  byteLength: number;
}>;

export class Goal9CMetadataError extends Error {
  override readonly name = 'Goal9CMetadataError';
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Goal9CMetadataError(`${label} is not valid JSON.`);
  }
}

export function canonicalizeGoal9CMetadata(metadata: Goal9CMetadata): string {
  const ordered = {
    type: metadata.type,
    name: metadata.name,
    description: metadata.description,
    image: metadata.image,
    services: metadata.services,
    x402Support: metadata.x402Support,
    active: metadata.active,
    registrations: metadata.registrations,
    supportedTrust: metadata.supportedTrust,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export async function verifyGoal9CMetadataIntegrity(
  metadataPath = GOAL_9C_METADATA_PATH,
  integrityPath = GOAL_9C_INTEGRITY_PATH,
): Promise<Goal9CIntegrityEvidence> {
  let metadataRaw: string;
  let integrityRaw: string;
  try {
    [metadataRaw, integrityRaw] = await Promise.all([
      readFile(metadataPath, 'utf8'),
      readFile(integrityPath, 'utf8'),
    ]);
  } catch {
    throw new Goal9CMetadataError(
      'Could not read the Goal 9C metadata or integrity manifest.',
    );
  }

  const parsedMetadata = Goal9CMetadataSchema.safeParse(
    parseJson(metadataRaw, 'Goal 9C metadata'),
  );
  if (!parsedMetadata.success) {
    throw new Goal9CMetadataError(
      'Goal 9C metadata is malformed or makes an unsupported claim.',
    );
  }
  const canonical = canonicalizeGoal9CMetadata(parsedMetadata.data);
  if (metadataRaw !== canonical) {
    throw new Goal9CMetadataError(
      'Goal 9C metadata bytes are not in the fixed canonical form.',
    );
  }

  const manifestValue = parseJson(integrityRaw, 'Goal 9C integrity manifest');
  assertPublicArtifact(manifestValue);
  const parsedManifest = Goal9CIntegrityManifestSchema.safeParse(manifestValue);
  if (!parsedManifest.success) {
    throw new Goal9CMetadataError(
      'Goal 9C integrity manifest has an invalid shape.',
    );
  }
  const bytes = Buffer.from(metadataRaw, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (
    sha256 !== parsedManifest.data.sha256 ||
    bytes.byteLength !== parsedManifest.data.byteLength
  ) {
    throw new Goal9CMetadataError(
      'Goal 9C metadata hash or byte length does not match its manifest.',
    );
  }
  return Object.freeze({
    metadata: Object.freeze(parsedMetadata.data),
    manifest: Object.freeze(parsedManifest.data),
    sha256,
    byteLength: bytes.byteLength,
  });
}
