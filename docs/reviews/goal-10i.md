# Goal 10I review — canonical Irys transaction verification

Status: **PARTIAL — Irys transaction confirmed; Arweave settlement pending**

## Built

- a fixed, keyless verifier for the one accepted Goal 10H Irys transaction;
- exact-byte checks through the canonical gateway and uploader data route;
- one read-only GraphQL identity/receipt check and a fresh receipt-signature
  verification against the live Irys node public key;
- a correction from the premature local `ar://<Irys ID>` reference to the
  documented canonical Irys HTTPS URI;
- a fixed settlement check that requires exact Arweave retrieval, an indexed
  bundle, at least 50 confirmations, and at least five seeded miners before it
  can return `SETTLED`.

## Evidence

- Irys transaction ID:
  `2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL`;
- canonical URI:
  <https://gateway.irys.xyz/2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL>;
- both Irys routes returned exact `351` bytes and SHA-256
  `7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`;
- the index returned exactly one item owned by
  `6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385`, paid with `solana`, with
  only `Content-Type: application/json`;
- indexed receipt fields matched Goal 10H and its signature verified again;
- uploader status is `CONFIRMED`, but `seededTo` is empty, Arweave GraphQL has
  no bundle, confirmations are `0/50`, and `arweave.net/<id>` returns `404`,
  so settlement is `PENDING`;
- public artifact:
  [`wallet-child-001.goal10i.irys-transaction-verification.json`](../../artifacts/wallet-child-001.goal10i.irys-transaction-verification.json).

## Tests

- exact canonical retrieval, owner/tag/index, and live receipt: PASS;
- byte-drift and wrong-owner rejection: PASS;
- corrected public-manifest URI: PASS;
- no wallet/funding/upload/sign/send path: PASS;
- full suite: `39` files, `291` tests: PASS;
- TypeScript typecheck and diff check: PASS.

## Security findings

1. No owner key, SDK wallet, upload, top-up, signature, Solana transaction, or
   on-chain binding was attempted.
2. The only POST is a fixed read-only GraphQL query to the Irys indexer.
3. The production audit remains non-clean at two high, two moderate, and one
   low finding. Goal 10I adds no dependency and no signer-capable path.

## Unexpected findings

- `arweave.net/<Irys ID>` still returns `404`.
- Current official Irys documentation defines the receipt value as an Irys
  transaction ID and documents `https://gateway.irys.xyz/:transactionId` as
  its canonical reference.
- The official Irys Whistleblower nevertheless defines finalized Arweave
  inclusion and seeding to at least five miners as the permanence evidence for
  this bundler path. `CONFIRMED` is therefore not enough while `seededTo: []`.
- The earlier `ar://...` value was premature. The current manifest and Goal
  10H output contract now use the canonical HTTPS Irys URI, without pretending
  that underlying settlement has completed.

## Remaining uncertainty

1. The accepted item has not yet produced the required public settlement
   evidence: exact Arweave retrieval, an indexed bundle, 50 confirmations, and
   five seeded miners.
2. The URI is still not bound to a Mainnet Core Asset or Agent Identity.
3. Core/plugin rent, URI-dependent messages, live delegation audit,
   same-signed-bytes simulations, and every future action confirmation remain
   blocked.

## Recommendation

**WAIT on Goal 10I and STOP.** Do not upload again. Re-run only the read-only
settlement verifier until it reports exact Arweave bytes, `50/50`
confirmations, and `5/5` seeded miners. Do not use the URI in an on-chain write
before then.
