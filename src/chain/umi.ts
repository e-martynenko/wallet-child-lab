import {
  mplAgentIdentity,
  mplAgentTools,
} from '@metaplex-foundation/mpl-agent-registry';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';

import type { WalletChildConfig } from '../config/env.js';
import {
  verifyDevnetRpc,
  type RpcFetch,
  type VerifiedDevnet,
} from './network.js';

export type VerifiedDevnetUmi = Readonly<{
  umi: ReturnType<typeof createUmi>;
  verification: VerifiedDevnet;
}>;

/**
 * Builds an Umi client only after a live Devnet genesis-hash check.
 *
 * Goal 2 deliberately installs no keypair identity and exposes no
 * Wallet Child transaction command. The returned Umi object is not a
 * cryptographic read-only capability; later goals must keep signing behind
 * their own explicit boundary.
 */
export async function createVerifiedDevnetUmi(
  config: WalletChildConfig,
  fetchRpc: RpcFetch = globalThis.fetch,
): Promise<VerifiedDevnetUmi> {
  const verification = await verifyDevnetRpc(config, fetchRpc);
  const umi = createUmi(config.rpcUrl)
    .use(mplToolbox())
    .use(mplCore())
    .use(mplAgentIdentity())
    .use(mplAgentTools());

  return Object.freeze({ umi, verification });
}
