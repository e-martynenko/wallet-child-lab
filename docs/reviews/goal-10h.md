# Goal 10H review — verified permanent Irys metadata upload

Status: **PASS — one upload verified; STOP before on-chain binding**

## Built

- an exact confirmation gate and pre-key rerun of the frozen metadata, tagged
  quote, existing credit, lockfile, source hashes, production audit, and native
  SOL import boundary;
- one direct-buffer Irys upload with only
  `Content-Type: application/json`;
- a private `0600` attempt marker that blocks blind retries after an ambiguous
  network result;
- receipt-signature, owner/tag, credit, and two-origin exact-byte verification;
- a public receipt containing only public Irys evidence.

## Evidence

- Irys ID: `2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL`;
- URI: `ar://2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL`;
- gateway:
  <https://gateway.irys.xyz/2vfo7cjnaATRyjeBF2511Mqe2P2GkKHsVGDwAEn6c5PL>;
- exact `351` bytes and SHA-256
  `7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`
  matched through both `gateway.irys.xyz` and the fixed uploader data route;
- receipt version `1.0.0`, timestamp `1787750529972`, signature verified;
- Irys credit `3,208 → 3,208`, so actual credit spend was `0` lamports;
- no top-up and no Solana transaction;
- public artifact:
  [`wallet-child-001.goal10h.metadata-upload-receipt.json`](../../artifacts/wallet-child-001.goal10h.metadata-upload-receipt.json).

## Tests

- exact confirmation and pre-key order: PASS;
- one-call exact buffer/tag contract: PASS;
- blind duplicate protection: PASS;
- failed/ambiguous receipt never retries: PASS;
- accepted-upload recovery uses only public evidence and no owner key: PASS;
- published artifact and credential exclusion: PASS;
- full suite: `38` files, `285` tests: PASS;
- TypeScript typecheck and staged diff check: PASS.

## Security findings

1. The production audit remains non-clean: two high, two moderate, and one low
   finding. The exact-path reachability guard passed immediately before key
   load; the known pure-JS bigint fallback warning did not alter signed bytes.
2. The existing owner key was loaded only after all public/source checks. It
   was never printed, copied to an artifact, or used for a Solana transaction.
3. The upload call occurred exactly once. Recovery used a temporary in-memory
   key only to read and verify the public node receipt; it never loaded the
   owner key and never called upload.
4. The metadata is now public. It intentionally contains no service endpoint,
   registration, trust claim, payment support, or active flag.

## Unexpected findings

- Irys returned a valid 44-character ID and `deadlineHeight: 0`, while the
  first local validator required 43 characters and a positive deadline. The
  uploader had already accepted the item, so the attempt marker correctly
  blocked a second upload.
- read-only GraphQL recovered the single owner transaction. Its receipt
  signature and exact bytes then passed independently.
- Irys did not debit the quoted `3,208` lamports; actual spend was `0`. No
  refund or top-up action was attempted.
- the public gateway and uploader data route redirect to two distinct reviewed
  HTTPS Datasprite CDN origins. Both returned exact bytes.

## Remaining uncertainty

1. `arweave.net/<id>` still returned `404` during immediate verification.
   Long-term Arweave settlement remains pending even though Irys retrieval and
   receipt verification passed.
2. The URI has not been bound to a Metaplex Core Asset or Agent Identity.
3. Asset creation, delegate audit, same-signed-bytes simulations, and the
   `0.1 USDC` treasury action remain blocked and separately gated.

## Recommendation

**PASS Goal 10H and STOP.** Next perform only read-only Arweave settlement and
durability verification. Do not upload again, top up Irys, create the identity,
bind the URI on-chain, or fund the treasury without new goal-specific review
and confirmation.
