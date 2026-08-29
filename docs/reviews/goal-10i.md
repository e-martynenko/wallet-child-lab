# Goal 10I review — current Irys durability contract

Status: **PASS — signed Irys durability accepted; Arweave not represented as finalized**

## Built

- a fixed, keyless verifier for the one accepted Goal 10H transaction;
- exact-byte checks through the canonical gateway and uploader data route;
- an exact indexed owner/token/tag check and fresh receipt-signature
  verification against the live Irys node public key;
- a strict requirement that the live uploader status remain `CONFIRMED`;
- an explicit separation between current Irys Mainnet bundler acceptance and
  optional independent Arweave finalization evidence.

## Evidence

- Irys transaction ID:
  `2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL`;
- canonical URI:
  <https://gateway.irys.xyz/2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL>;
- both Irys routes return exact `351` bytes and SHA-256
  `7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`;
- the index returns exactly one item owned by
  `6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385`, paid with `solana`, with
  only `Content-Type: application/json`;
- indexed receipt fields match Goal 10H and its signature verifies again;
- current official Irys documentation defines the receipt ID and
  `https://gateway.irys.xyz/:transactionId` retrieval contract, describes
  Mainnet bundler data as the paid durable path, and documents same-ID
  migration to the Irys L1;
- current Mainnet sampling found five of five recent receipts also use
  `deadlineHeight: 0`; the sampled status has the same `CONFIRMED`, empty
  `seededTo`, and Arweave `404` shape as Wallet Child #001.

Public evidence is in
[`wallet-child-001.goal10i.irys-transaction-verification.json`](../../artifacts/wallet-child-001.goal10i.irys-transaction-verification.json).

## Contract correction

The previous gate used the Irys Whistleblower thresholds of 50 Arweave
confirmations and five seeded miners. That repository describes the older
Arweave-monitoring contract and was last pushed in 2023. Applying it as the
completion condition for current `uploader.irys.xyz` receipts created a false,
open-ended blocker.

Goal 10I now calls the current transaction durable only at this exact assurance
boundary:

1. live Irys status is `CONFIRMED`;
2. exact frozen bytes are available through two distinct reviewed routes;
3. indexed provenance matches the fixed owner, token, fee, size, and tag;
4. the stored receipt matches the live node and its signature verifies.

Arweave remains `0/5`, `0/50`, without a bundle, and `arweave.net/<id>` returns
`404`. This is recorded as supplemental evidence `PENDING`, not hidden and not
misreported as independent finalization.

## Security findings

1. No owner key, SDK wallet, upload, top-up, signature, Solana transaction, or
   on-chain binding was attempted.
2. Byte drift, owner drift, receipt drift, a non-`CONFIRMED` Irys status, or an
   unexpected redirect fails closed.
3. The correction does not retry or replace the accepted upload and does not
   grant write authority.
4. The production audit remains non-clean at two high, two moderate, and one
   low finding. Goal 10I adds no dependency or signer-capable path.

## Goal review

```text
GOAL REVIEW

Status: PASS
Built: corrected keyless current-contract Irys durability verifier
Evidence: signed receipt, exact bytes, fixed provenance, live CONFIRMED status
Tests: 40 files / 300 tests pass; typecheck, diff, and credential scan pass
Security findings: no key or write path; independent Arweave copy not verified
Unexpected findings: current Mainnet receipts consistently use deadlineHeight 0
Remaining uncertainty: Irys service assurance is not independent Arweave proof
Recommendation: proceed only to fresh signer-capable Mainnet birth write review
```

Do not upload again. Goal 10I completion does not itself authorize Core Asset
creation, identity registration, funding, delegation, or treasury execution.
