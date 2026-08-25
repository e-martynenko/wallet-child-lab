# Goal 9K review — Irys metadata storage quote

Status: **PASS — quote-only path complete; publication remains BLOCKED**

## Built

- one fixed Irys Mainnet price URL for SOL and the frozen `351` metadata bytes;
- one required `Content-Type: application/json` tag and the isolated public
  Mainnet owner address;
- one read-only `GET` with timeout, redirect refusal, HTTP status handling, and
  a `64`-character response bound;
- strict atomic-lamport parsing and integer-only SOL formatting;
- a `100,000` lamport storage-quote cap;
- explicit negative evidence for key loading, funding, upload, and transaction
  submission;
- no Irys SDK dependency because its normal builder begins at wallet loading,
  which is unnecessary for the public price endpoint.

## Evidence

- quote implementation:
  [`irys-quote.ts`](../../src/goal9k/irys-quote.ts);
- CLI:
  [`quote-irys-metadata.ts`](../../src/cli/quote-irys-metadata.ts);
- command: `pnpm run metadata:quote:irys`;
- frozen digest:
  `7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`;
- frozen byte length: `351`;
- live quote on 2026-08-25: `3,208` lamports (`0.000003208 SOL`);
- focused tests: 5, PASS.

## Tests

- exact fixed endpoint, token, byte length, owner, and tag: PASS;
- tagged live Irys Mainnet quote: PASS;
- malformed, failed, oversized, or over-cap response: DENY;
- integer-only atomic SOL conversion: PASS;
- source mutation-capability scan: PASS;
- `pnpm run typecheck`: PASS.
- `pnpm test`: 22 files, 187 tests, PASS.

## Security findings

1. The quote request needs only public data; loading a wallet for it would add
   risk without adding evidence.
2. The endpoint is fixed to `https://uploader.irys.xyz`; environment overrides
   and arbitrary quote hosts are intentionally absent.
3. The quote is bounded far below the total `0.02 SOL` lifecycle cap, but it is
   only the storage price.
4. Funding Irys would still require a separate Solana transaction, fee quote,
   signer review, sufficient isolated funds, and explicit authorization.
5. A successful quote is not evidence of upload durability or retrievability.

## Unexpected findings

- the official Irys SDK implements `getPrice` as a simple
  `GET /price/{token}/{bytes}` request, so a dedicated storage SDK is not needed
  for this goal;
- the tagged live quote is only `3,208` lamports, but it remains time-sensitive
  and must be refreshed immediately before any approved funding decision.

## Remaining uncertainty

1. The future Solana funding-transaction fee is not included in this quote.
2. No Irys balance has been funded and no bytes have been uploaded.
3. No durable transaction ID or URI exists.
4. Two-origin retrieval verification cannot run before publication.
5. The final Mainnet asset, delegate audit, exact-message simulations, funding
   route, remaining lifecycle quotes, and separate Mainnet approval remain
   unresolved.

## Recommendation

**PASS Goal 9K and STOP before funding or upload.** Define the isolated funding
route and quote its full acquisition plus transaction costs before adding any
signer-capable Irys publication path.

## Authoritative sources

- [Irys NFT/metadata upload guide](https://docs.irys.xyz/build/d/guides/uploading-nfts)
  defines `getPrice(size)` before funding or upload;
- [Irys supported tokens](https://docs.irys.xyz/build/d/features/supported-tokens)
  lists Mainnet SOL under the `solana` parameter;
- [Irys JS SDK `getPrice` source](https://github.com/Irys-xyz/js-sdk/blob/master/packages/upload-core/src/utils.ts)
  implements the public `GET /price/{token}/{bytes}` request used here.
