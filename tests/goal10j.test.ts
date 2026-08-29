import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { SOLANA_MAINNET_BETA_GENESIS_HASH } from '../src/chain/network.js';
import type { Goal10IVerification } from '../src/goal10i/irys-transaction-verification.js';
import {
  GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS,
  MainnetBirthPreflightError,
  verifyMainnetBirthPackageContract,
  verifyMainnetBirthPreflight,
} from '../src/goal10j/mainnet-birth-preflight.js';
import { BPF_UPGRADEABLE_LOADER_ID } from '../src/mainnet/readiness.js';

const config = {
  rpcUrl: 'https://mainnet.example.test/private?credential=hidden',
  rpcOrigin: 'https://mainnet.example.test',
};

function durability(state: 'PENDING' | 'SETTLED'): Goal10IVerification {
  return {
    id: '2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL',
    canonicalIrysUri:
      'https://gateway.irys.xyz/2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL',
    metadataSha256:
      '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
    metadataByteLength: 351,
    retrievals: [
      {
        requestedUrl: 'https://gateway.irys.xyz/id',
        finalUrl: 'https://one.datasprite-cdn.com/id',
        finalOrigin: 'https://one.datasprite-cdn.com',
        contentType: 'application/json',
        byteLength: 351,
        sha256:
          '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
      },
      {
        requestedUrl: 'https://uploader.irys.xyz/tx/id/data',
        finalUrl: 'https://two.datasprite-cdn.com/id',
        finalOrigin: 'https://two.datasprite-cdn.com',
        contentType: 'application/json',
        byteLength: 351,
        sha256:
          '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c',
      },
    ],
    indexer: {
      owner: '6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385',
      token: 'solana',
      timestamp: 1,
      dataItemSize: '531',
      indexedFeeLamports: '3208',
      contentType: 'application/json',
    },
    receipt: {
      version: '1.0.0',
      timestamp: 1,
      deadlineHeight: 0,
      publicKeyMatchesNode: true,
      signatureMatchesIndexer: true,
      signatureVerifiedNow: true,
    },
    uriCorrection: {
      rejectedAlias: 'ar://id',
      canonicalPattern: 'https://gateway.irys.xyz/:transactionId',
      arweaveProbeStatus: state === 'SETTLED' ? 200 : 404,
      arweaveProbeExactBytes: state === 'SETTLED',
    },
    durability: {
      provider: 'Irys',
      network: 'mainnet-bundler',
      state: 'IRYS_DURABLE_ACCEPTED',
      evidenceClass: 'SIGNED_IRYS_RECEIPT_AND_EXACT_RETRIEVAL',
      canonicalGatewayContractVerified: true,
      independentArweaveFinalizationRequired: false,
    },
    settlement: {
      uploaderStatus: 'CONFIRMED',
      seededTo: state === 'SETTLED' ? ['1', '2', '3', '4', '5'] : [],
      seededMinerCount: state === 'SETTLED' ? 5 : 0,
      requiredSeededMinerCount: 5,
      bundleId: state === 'SETTLED' ? 'bundle' : null,
      blockHeight: state === 'SETTLED' ? 100 : null,
      networkHeight: 150,
      confirmations: state === 'SETTLED' ? 50 : 0,
      requiredConfirmations: 50,
      arweaveFinalizationVerified: state === 'SETTLED',
      state,
    },
    canonicalIrysTransactionVerified: true,
    ownerKeyLoaded: false,
    uploadAttempted: false,
    solanaTransactionSubmitted: false,
    onChainBindingAttempted: false,
  };
}

function programAccount() {
  return {
    lamports: 1,
    owner: BPF_UPGRADEABLE_LOADER_ID,
    executable: true,
    data: ['', 'base64'],
    rentEpoch: 18_446_744_073_709_551_615,
    space: 1,
  };
}

function mockRpc(change?: 'occupied' | 'balance' | 'program') {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
      params: unknown[];
    };
    let result: unknown;
    if (request.method === 'getGenesisHash') {
      result = SOLANA_MAINNET_BETA_GENESIS_HASH;
    } else if (request.method === 'getSlot') {
      result = 500;
    } else if (request.method === 'getMultipleAccounts' && request.id === 3) {
      const accounts = [programAccount(), programAccount(), programAccount()];
      if (change === 'program') accounts[1]!.executable = false;
      result = { context: { slot: 501 }, value: accounts };
    } else if (request.method === 'getMultipleAccounts') {
      const accounts = Array.from({ length: 7 }, () => null);
      if (change === 'occupied') accounts[0] = programAccount() as never;
      result = { context: { slot: 502 }, value: accounts };
    } else if (request.method === 'getBalance') {
      result = {
        context: { slot: 503 },
        value:
          Number(GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS) +
          (change === 'balance' ? 1 : 0),
      };
    } else if (request.method === 'getMinimumBalanceForRentExemption') {
      const size = request.params[0];
      result = size === 104 ? 1_614_720 : size === 40 ? 1_169_280 : 2_039_280;
    } else {
      throw new Error(`Unexpected Goal 10J request: ${request.method}`);
    }
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  };
}

describe('Goal 10J read-only Mainnet birth preflight', () => {
  it('records the live review-ready result without secret or reusable transaction material', async () => {
    const raw = await readFile(
      'artifacts/wallet-child-001.goal10j.mainnet-birth-preflight.json',
      'utf8',
    );
    expect(JSON.parse(raw)).toMatchObject({
      status: 'READ_ONLY_PREFLIGHT_READY_FOR_WRITE_REVIEW',
      metadata: {
        durability: 'IRYS_DURABLE_ACCEPTED',
        supplementalArweaveEvidence: 'PENDING',
        bindingAuthorized: false,
      },
      liveReadOnlySnapshot: {
        finalizedSlot: 442_643_656,
        ownerBalanceLamports: '19976792',
        futureAccounts: { checkedCount: 7, allAbsent: true },
      },
      actions: {
        primaryWalletAccessed: false,
        ownerKeyLoaded: false,
        coreAssetKeyLoaded: false,
        transactionBuilt: false,
        messageSigned: false,
        transactionSubmitted: false,
        networkWrite: false,
      },
      verdict: 'STOP_READY_FOR_MAINNET_BIRTH_WRITE_REVIEW',
    });
    expect(raw).not.toMatch(
      /messageBase64|serializedMessage|secretKey|privateKey|mnemonic|api[_-]?key|rpcUrl/i,
    );
  });

  it('reaches write review while keeping identity creation unauthorized', async () => {
    const evidence = await verifyMainnetBirthPreflight(
      config,
      durability('PENDING'),
      mockRpc(),
    );
    expect(evidence).toMatchObject({
      finalizedSlot: 503,
      metadata: {
        durability: 'IRYS_DURABLE_ACCEPTED',
        supplementalArweaveEvidence: 'PENDING',
      },
      packageContract: {
        agentRegistry: '0.2.6',
        core: '1.8.0',
        toolbox: '0.10.0',
        umi: '1.5.1',
        umiBundleDefaults: '1.5.1',
        agentRegistryDependenciesMatched: true,
      },
      programs: { allExecutable: true },
      accounts: {
        ownerBalanceLamports: GOAL_10J_EXPECTED_OWNER_BALANCE_LAMPORTS,
        checkedCount: 7,
        allAbsent: true,
      },
      fixedRent: { knownFixedRentLamports: 8_477_280n },
      readOnly: true,
      keyLoaded: false,
      transactionBuilt: false,
      messageSigned: false,
      transactionSubmitted: false,
      identityCreationAuthorized: false,
      verdict: 'STOP_READY_FOR_MAINNET_BIRTH_WRITE_REVIEW',
    });
  });

  it('records optional Arweave finalization without authorizing a write', async () => {
    await expect(
      verifyMainnetBirthPreflight(config, durability('SETTLED'), mockRpc()),
    ).resolves.toMatchObject({
      metadata: {
        durability: 'IRYS_DURABLE_ACCEPTED',
        supplementalArweaveEvidence: 'SETTLED',
      },
      identityCreationAuthorized: false,
      verdict: 'STOP_READY_FOR_MAINNET_BIRTH_WRITE_REVIEW',
    });
  });

  it.each(['occupied', 'balance', 'program'] as const)(
    'fails closed on %s drift',
    async (change) => {
      await expect(
        verifyMainnetBirthPreflight(
          config,
          durability('PENDING'),
          mockRpc(change),
        ),
      ).rejects.toThrow(MainnetBirthPreflightError);
    },
  );

  it('verifies the installed Agent Registry compatibility graph', async () => {
    await expect(verifyMainnetBirthPackageContract()).resolves.toMatchObject({
      agentRegistry: '0.2.6',
      core: '1.8.0',
      toolbox: '0.10.0',
      umi: '1.5.1',
      umiBundleDefaults: '1.5.1',
      agentRegistryDependenciesMatched: true,
    });
  });

  it('contains no key load, transaction builder, signer, or submission path', async () => {
    const sources = (
      await Promise.all([
        readFile('src/goal10j/mainnet-birth-preflight.ts', 'utf8'),
        readFile('src/cli/preflight-mainnet-birth.ts', 'utf8'),
      ])
    ).join('\n');
    expect(sources).not.toMatch(
      /loadOrCreate|privateKey|secretKey|Keypair|createSigner|generateSigner|TransactionBuilder|signTransaction|sendTransaction|sendAndConfirm/i,
    );
  });
});
