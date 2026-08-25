import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const SOURCE = '8W7sQKSRuYAdev3qcZCm9rrs4DDKbnEgD4fA8kvENvxt';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const METADATA_SHA256 =
  '7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c';

async function readArtifact() {
  return JSON.parse(
    await readFile(
      'artifacts/wallet-child-001.goal9s.preapproval-audit.json',
      'utf8',
    ),
  ) as Record<string, unknown>;
}

describe('Goal 9S final pre-approval audit', () => {
  it('records the stable source and the complete absent Wallet Child set', async () => {
    const artifact = await readArtifact();
    expect(artifact).toMatchObject({
      network: 'mainnet-beta',
      status: 'STOP_AWAIT_EXACT_APPROVAL',
      finalizedSlot: 441_648_274,
      source: {
        address: SOURCE,
        solLamports: '88698606',
        usdcBaseUnits: '1078695',
        usdcMint: USDC_MINT,
      },
      walletChildAccounts: {
        checkedCount: 10,
        allAbsent: true,
      },
    });
    const addresses = Object.values(
      (artifact['walletChildAccounts'] as { addresses: Record<string, string> })
        .addresses,
    );
    expect(addresses).toHaveLength(10);
    expect(new Set(addresses).size).toBe(10);
    expect(addresses).not.toContain(SOURCE);
  });

  it('keeps durable metadata unpublished and every approval/write gate closed', async () => {
    const artifact = await readArtifact();
    expect(artifact).toMatchObject({
      durableMetadata: {
        byteLength: 351,
        sha256: METADATA_SHA256,
        publicationStatus: 'NOT_PUBLISHED',
        durableUri: null,
        officialIrysWorkflow: [
          'GET_PRICE',
          'FUND',
          'UPLOAD',
          'VERIFY_RECEIPT_ID',
        ],
        implementationStatus: 'NOT_IMPLEMENTED_BEFORE_GATE',
      },
      gates: {
        exactApprovalPhraseProvided: false,
        actionTimeConfirmationProvided: false,
        ownerBootstrapFunded: false,
        metadataPublished: false,
        assetCreated: false,
        sameBytesSimulationsPassed: false,
        finalGo: false,
      },
      checks: {
        keyLoaded: false,
        messageSigned: false,
        transactionSubmitted: false,
        networkWrite: false,
        fundsSpent: false,
      },
      verdict: 'NO_GO',
    });
  });

  it('publishes no secret, credential, or reusable transaction material', async () => {
    const raw = JSON.stringify(await readArtifact());
    expect(raw).not.toMatch(
      /messageBase64|serializedMessage|secret|privateKey|seed|mnemonic|api[_-]?key|rpcUrl/i,
    );
  });
});
