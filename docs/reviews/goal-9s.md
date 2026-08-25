# Goal 9S review — final pre-approval audit

Status: **PASS for pre-approval evidence; Goal 10 remains NO-GO**

## Built

- one fresh finalized, read-only Mainnet preflight over the external funding
  source and all ten final Wallet Child accounts;
- one explicit durable-metadata workflow decision based on the current official
  Irys SDK documentation;
- one public STOP artifact that records the remaining gates without keys,
  serialized messages, signatures, transactions, or writes;
- corrected checklist wording for the final addresses and Goals 9E–9R.

## Evidence

- public artifact:
  [`wallet-child-001.goal9s.preapproval-audit.json`](../../artifacts/wallet-child-001.goal9s.preapproval-audit.json);
- finalized Mainnet slot: `441,648,274`;
- external source: `88,698,606` lamports and `1,078,695` official-USDC base
  units;
- all ten final Wallet Child accounts: absent;
- metadata candidate: exact `351` bytes, digest
  `7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`,
  still `NOT_PUBLISHED`;
- public repository before this review:
  `5defc329c95b7b80db06268594e11ba959399238`.

## Tests

- final account set and absent-state evidence: PASS;
- source SOL, canonical USDC ATA, mint, and amount evidence: PASS;
- frozen metadata digest and unpublished state: PASS;
- exact approval, action-time confirmation, write, signature, and spend flags:
  all false;
- public artifact secret and reusable-transaction scan: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 30 files, 234 tests, PASS;
- diff check: PASS;
- production dependency audit: one unchanged moderate transitive `uuid`
  advisory; this is the bounded Goal 9D acceptance, not a clean audit.

## Security findings

1. Irys Mainnet is not a read-only continuation. The official workflow prices
   the bytes, funds the uploader, uploads the data, and returns a receipt ID.
   Funding and upload must therefore stay behind the exact gate and a separate
   action-time confirmation.
2. The candidate is small, but this review found no current official guarantee
   that its upload will be free. The budget must use a fresh price and funding
   transaction fee rather than assume zero.
3. The external source has enough displayed assets for the hard caps, but none
   of that balance is authorization to move it.
4. All final accounts being absent proves that no Wallet Child Mainnet setup
   has happened; it does not prove the later write sequence is safe.

## Unexpected findings

- no state drift occurred between the prior fee quotes and this final
  pre-approval read;
- the current Irys package split is `@irys/upload` plus
  `@irys/upload-solana`; installing or integrating it before the gate would add
  unused signing surface, so it remains deliberately unimplemented.

## Remaining uncertainty

1. The exact phrase `ENABLE MAINNET EXPERIMENT` has not been provided.
2. An action-time confirmation has not been provided.
3. Durable metadata URI, exact Core/plugin rent, the metadata funding fee, and
   URI-dependent message fees are unavailable.
4. Live post-create delegate audit, exact signed-byte simulations, execution,
   revoke, rescue, and final reconciliation remain pending.
5. The existing moderate transitive `uuid` advisory must be rechecked before
   signing review.

## Recommendation

**STOP and retain NO-GO.** Safe offline/read-only preparation is complete.
Do not bootstrap the owner, integrate a signer, fund Irys, upload metadata, or
build a send command until the user provides the exact phrase. Even then,
present the exact first transaction, fee, and resulting balances for a fresh
action-time confirmation before anything is submitted.

## Authoritative sources

- [Irys SDK setup](https://docs.irys.xyz/build/d/sdk/setup) documents the
  current Solana packages and uploader configuration;
- [Irys NFT upload guide](https://docs.irys.xyz/build/d/guides/uploading-nfts)
  documents the price, funding, and upload sequence;
- [Irys transaction IDs](https://docs.irys.xyz/build/d/features/txids)
  documents the receipt ID and gateway retrieval URI.
