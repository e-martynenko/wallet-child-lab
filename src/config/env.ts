import { z } from 'zod';

const WALLET_CHILD_ENV_PREFIX = 'WALLET_CHILD_';

const ALLOWED_ENV_KEYS = new Set([
  'WALLET_CHILD_NETWORK',
  'WALLET_CHILD_RPC_URL',
]);

const HttpUrlSchema = z.string().url().superRefine((value, context) => {
  const url = new URL(value);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    context.addIssue({
      code: 'custom',
      message: 'RPC URL must use http or https.',
    });
  }
});

const EnvInputSchema = z
  .object({
    WALLET_CHILD_NETWORK: z.literal('devnet'),
    WALLET_CHILD_RPC_URL: HttpUrlSchema,
  })
  .strict();

export type WalletChildConfig = Readonly<{
  network: 'devnet';
  rpcUrl: string;
  rpcOrigin: string;
}>;

export class WalletChildConfigError extends Error {
  override readonly name = 'WalletChildConfigError';
}

function findUnknownWalletChildKeys(
  environment: NodeJS.ProcessEnv,
): string[] {
  return Object.keys(environment)
    .filter(
      (key) =>
        key.startsWith(WALLET_CHILD_ENV_PREFIX) && !ALLOWED_ENV_KEYS.has(key),
    )
    .sort();
}

export function parseWalletChildConfig(
  environment: NodeJS.ProcessEnv,
): WalletChildConfig {
  const unknownKeys = findUnknownWalletChildKeys(environment);

  if (unknownKeys.length > 0) {
    throw new WalletChildConfigError(
      `Unknown Wallet Child environment keys: ${unknownKeys.join(', ')}`,
    );
  }

  const result = EnvInputSchema.safeParse({
    WALLET_CHILD_NETWORK: environment['WALLET_CHILD_NETWORK'],
    WALLET_CHILD_RPC_URL: environment['WALLET_CHILD_RPC_URL'],
  });

  if (!result.success) {
    throw new WalletChildConfigError(
      'Invalid Wallet Child configuration. Set WALLET_CHILD_NETWORK=devnet ' +
        'and WALLET_CHILD_RPC_URL to an http(s) Solana Devnet endpoint.',
    );
  }

  const rpcUrl = new URL(result.data.WALLET_CHILD_RPC_URL);

  return Object.freeze({
    network: result.data.WALLET_CHILD_NETWORK,
    rpcUrl: rpcUrl.toString(),
    // Deliberately omit path, query, fragment, and user information because
    // RPC credentials are often embedded in those fields.
    rpcOrigin: rpcUrl.origin,
  });
}
