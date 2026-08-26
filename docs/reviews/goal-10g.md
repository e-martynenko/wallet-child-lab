# Goal 10G review — permanent Irys metadata upload gate

Status: **PASS — read-only upload review complete; STOP awaiting exact confirmation**

## Built

- one fail-closed review for the exact `351` frozen bytes and their
  `Content-Type: application/json` tag;
- exact source and registry-integrity pins for the direct-buffer upload,
  one-data-item signing, tagged quote, uploader endpoint, and receipt verifier;
- a live comparison of the tagged quote against only the already funded Irys
  credit;
- one exact upload-only confirmation phrase that authorizes no top-up, Solana
  transaction, identity creation, or treasury action.

## Evidence

- metadata SHA-256:
  `7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`;
- metadata size: `351` bytes;
- current tagged quote: `3,208` lamports;
- current Irys credit: exactly `3,208` lamports;
- direct action: one `irys.upload(exactBuffer, { tags: [Content-Type] })`;
- public artifact:
  [`wallet-child-001.goal10g.metadata-upload-review.json`](../../artifacts/wallet-child-001.goal10g.metadata-upload-review.json).

## Tests

- pinned upload-core version, integrity, source hashes, and call shape: PASS;
- exact metadata/quote/credit/action contract: PASS;
- quote increase and credit drift rejection with no top-up: PASS;
- no SDK import, wallet load, key read, upload, or non-GET network path in the
  review: PASS;
- full suite: `37` files, `278` tests: PASS;
- TypeScript typecheck and diff check: PASS.

## Security findings

1. The production audit remains non-clean at two high, two moderate, and one
   low finding; the exact native-SOL path disposition is unchanged.
2. Goal 10G imports no signer-capable Irys package and reads no key. It only
   hashes installed source and makes two fixed public GET requests.
3. The future upload must read and hash the exact bytes before key load, use
   the in-memory buffer rather than a later file stream, and initialize the SDK
   only after the exact confirmation passes.
4. Upload is a public, intended-permanent write. Receipt verification and exact
   byte readback are mandatory; a returned ID alone is not durability proof.

## Unexpected findings

- the existing Goal 9K quote already includes both owner address and the exact
  `Content-Type` tag, matching the installed SDK contract;
- no new SOL payment is needed: the existing Irys credit exactly covers the
  fresh quote, so the next action requires no Solana transaction or fee.

## Remaining uncertainty

1. No bytes have been uploaded and no durable URI exists.
2. The receipt, gateway byte hash, and two-origin retrieval cannot be verified
   before the separately confirmed upload.
3. Core/Identity creation, URI binding, live delegate audit, and treasury
   funding remain blocked and outside this action.

## Recommendation

**PASS Goal 10G and STOP.** Upload only after the user sends this exact phrase:

```text
CONFIRM PERMANENT PUBLIC IRYS METADATA UPLOAD 351 BYTES WITH SHA256 7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c FROM OWNER 6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385 USING AT MOST 3208 LAMPORTS OF EXISTING IRYS CREDIT WITH CONTENT-TYPE application/json
```

That confirmation covers one public metadata upload only. It covers no credit
top-up, Solana transaction, on-chain URI binding, identity creation, or
treasury action.

## Sources reviewed

- [Irys Node SDK setup](https://docs.irys.xyz/build/d/sdk/setup)
- [Irys metadata upload guide](https://docs.irys.xyz/build/d/guides/uploading-nfts)
- [Irys transaction IDs](https://docs.irys.xyz/build/d/features/txids)
- [official Irys JavaScript SDK](https://github.com/Irys-xyz/js-sdk)
- [official direct upload implementation](https://github.com/Irys-xyz/js-sdk/blob/master/packages/upload-core/src/irys.ts)
