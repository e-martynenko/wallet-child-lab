import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findAgentIdentityV2Pda, mplAgentIdentity } from '@metaplex-foundation/mpl-agent-registry';
import { findAssetSignerPda, mplCore } from '@metaplex-foundation/mpl-core';
import { findAssociatedTokenPda, mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { afterEach, describe, expect, it } from 'vitest';

import {
  MainnetIdentityAddressError,
  prepareMainnetIdentityAddresses,
} from '../src/goal9n/identity-addresses.js';
import { SOLANA_MAINNET_USDC_MINT } from '../src/mainnet/readiness.js';

const OWNER = '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385';
const EXECUTIVE = 'EJQcuD9FtJ33c2wA7GM6HzvmJJJbPsYnmH5ZjTDdhbjF';
const RECOVERY = 'ABZePapHbYaTg7GU4LGQNcYmfURvue5uVrrf4FUa4x3j';
const FUNDING = '8W7sQKSRuYAdev3qcZCm9rrs4DDKbnEgD4fA8kvENvxt';
const DEVNET = '7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function offlineUmi() {
  return createUmi('http://127.0.0.1:8899')
    .use(mplCore())
    .use(mplAgentIdentity())
    .use(mplToolbox());
}

describe('Goal 9N final standalone Mainnet identity addresses', () => {
  it('creates one mode-0600 Core Asset key and reloads it idempotently', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9n-'));
    temporaryDirectories.push(directory);
    const keyPath = join(directory, 'core-asset.json');
    const umi = offlineUmi();
    const input = {
      owner: OWNER,
      executive: EXECUTIVE,
      recovery: RECOVERY,
      fundingSource: FUNDING,
      forbiddenPublicKeys: [DEVNET],
    };
    const first = await prepareMainnetIdentityAddresses(umi, input, keyPath);
    const second = await prepareMainnetIdentityAddresses(umi, input, keyPath);

    expect(first.coreAsset.created).toBe(true);
    expect(second.coreAsset.created).toBe(false);
    expect(second.coreAsset.publicKey).toBe(first.coreAsset.publicKey);
    expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
    expect(first.collection).toBeNull();
    expect(first.standalone).toBe(true);
  });

  it('derives the canonical identity, Asset Signer, and USDC ATAs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9n-'));
    temporaryDirectories.push(directory);
    const umi = offlineUmi();
    const addresses = await prepareMainnetIdentityAddresses(
      umi,
      {
        owner: OWNER,
        executive: EXECUTIVE,
        recovery: RECOVERY,
        fundingSource: FUNDING,
        forbiddenPublicKeys: [DEVNET],
      },
      join(directory, 'core-asset.json'),
    );
    const asset = publicKey(addresses.coreAsset.publicKey);
    expect(addresses.agentIdentity).toBe(
      String(findAgentIdentityV2Pda(umi, { asset })[0]),
    );
    expect(addresses.assetSignerPda).toBe(
      String(findAssetSignerPda(umi, { asset })[0]),
    );
    expect(addresses.assetSignerUsdcAta).toBe(
      String(
        findAssociatedTokenPda(umi, {
          mint: publicKey(SOLANA_MAINNET_USDC_MINT),
          owner: publicKey(addresses.assetSignerPda),
        })[0],
      ),
    );
    expect(addresses.recoveryUsdcAta).toBe(
      String(
        findAssociatedTokenPda(umi, {
          mint: publicKey(SOLANA_MAINNET_USDC_MINT),
          owner: publicKey(RECOVERY),
        })[0],
      ),
    );
  });

  it('rejects reuse of any Devnet or Mainnet principal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wallet-child-goal9n-'));
    temporaryDirectories.push(directory);
    const umi = offlineUmi();
    const keyPath = join(directory, 'core-asset.json');
    const first = await prepareMainnetIdentityAddresses(
      umi,
      {
        owner: OWNER,
        executive: EXECUTIVE,
        recovery: RECOVERY,
        fundingSource: FUNDING,
        forbiddenPublicKeys: [DEVNET],
      },
      keyPath,
    );
    await expect(
      prepareMainnetIdentityAddresses(
        umi,
        {
          owner: OWNER,
          executive: EXECUTIVE,
          recovery: RECOVERY,
          fundingSource: FUNDING,
          forbiddenPublicKeys: [first.coreAsset.publicKey],
        },
        keyPath,
      ),
    ).rejects.toThrow(MainnetIdentityAddressError);
  });

  it('contains no RPC, transaction builder, signing, simulation, or send path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal9n/identity-addresses.ts', 'utf8'),
        readFile('src/cli/prepare-mainnet-identity.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /fetch\(|TransactionBuilder|buildAndSign|signTransaction|simulateTransaction|sendTransaction|sendAndConfirm/i,
    );
  });

  it('publishes final canonical addresses without local material', async () => {
    const artifact = JSON.parse(
      await readFile(
        'artifacts/wallet-child-001.goal9n.identity-addresses.json',
        'utf8',
      ),
    ) as {
      architecture: { standaloneCoreAsset: boolean; collection: null };
      addresses: Record<string, string>;
      availability: Record<string, boolean | number>;
      checks: Record<string, boolean>;
    };
    const umi = offlineUmi();
    const asset = publicKey(artifact.addresses['coreAsset']!);
    const assetSignerPda = String(findAssetSignerPda(umi, { asset })[0]);
    expect(artifact).toMatchObject({
      architecture: { standaloneCoreAsset: true, collection: null },
      addresses: {
        owner: OWNER,
        executive: EXECUTIVE,
        recovery: RECOVERY,
        fundingSource: FUNDING,
        agentIdentity: String(findAgentIdentityV2Pda(umi, { asset })[0]),
        assetSignerPda,
        assetSignerUsdcAta: String(
          findAssociatedTokenPda(umi, {
            mint: publicKey(SOLANA_MAINNET_USDC_MINT),
            owner: publicKey(assetSignerPda),
          })[0],
        ),
        recoveryUsdcAta: String(
          findAssociatedTokenPda(umi, {
            mint: publicKey(SOLANA_MAINNET_USDC_MINT),
            owner: publicKey(RECOVERY),
          })[0],
        ),
      },
      availability: {
        verifiedMainnetGenesis: true,
        coreAssetExists: false,
        agentIdentityExists: false,
        assetSignerPdaExists: false,
        assetSignerUsdcAtaExists: false,
        recoveryUsdcAtaExists: false,
      },
      checks: {
        allAddressesDistinct: true,
        distinctFromDevnetPrincipals: true,
        localFileMode0600: true,
        transactionBuilt: false,
        transactionSigned: false,
        transactionSubmitted: false,
      },
    });
    expect(JSON.stringify(artifact)).not.toMatch(
      /secret|privateKey|seed|mnemonic|api[_-]?key/i,
    );
  });
});
