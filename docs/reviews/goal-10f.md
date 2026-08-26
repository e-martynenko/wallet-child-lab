# Goal 10F review — finalized Irys metadata funding

Status: **PASS — exact funding finalized and credited; STOP before upload**

## Built

- a `load existing` owner-key boundary that cannot create a replacement key;
- one exact legacy System transfer from the fixed owner to the reviewed Irys
  funding address for `3,208` lamports;
- an exact `5,000` lamport fee gate, same-signed-bytes simulation, single
  submission, finalized decode, and later owner-balance readback;
- direct registration of only the finalized transaction ID using the exact
  official Irys SDK endpoint contract, followed by exact credit verification;
- a public receipt that contains hashes and public chain facts but no key, RPC
  credential, or reusable transaction bytes.

## Evidence

- signature:
  `4zHdifUiB1jHxYGuVo5s3EkSkQAEvXeKKmyJkV6wsGqY5mZeuwMaz8LvPN77yKtH4eZPp385nQYTawSfeiECcFER`;
- finalized slot: `441,857,234`;
- owner balance: `19,985,000 → 19,976,792` lamports;
- Irys funding-address delta: exactly `3,208` lamports;
- transaction fee: exactly `5,000` lamports;
- independently read public signature status: `finalized`, error `null`;
- independently read Irys owner credit: exactly `3,208` lamports;
- public artifact:
  [`wallet-child-001.goal10f.irys-funding-receipt.json`](../../artifacts/wallet-child-001.goal10f.irys-funding-receipt.json).

## Tests

- exact action-time phrase and drift rejection: PASS;
- existing-key-only load boundary: PASS;
- exact signed simulation owner delta: PASS;
- finalized instruction/fee/balance decode: PASS;
- exact Irys registration and excess-credit rejection: PASS;
- no SDK wallet or upload path in the executor: PASS;
- full post-write suite: `36` files, `273` tests: PASS;
- TypeScript typecheck and diff check: PASS.

## Security findings

1. The production audit remains non-clean: two high, two moderate, and one low
   finding. The exact Goal 10E reachability disposition did not change.
2. The complete audit and exact native-SOL reachability tests ran immediately
   before key load and matched the reviewed contract.
3. The official Irys `submitFundTransaction` source is pinned by SHA-256 and
   requires the same `/account/balance/solana` endpoint, `{tx_id}`, and HTTP
   `202` contract used here.
4. The Irys SDK was never initialized with the owner wallet. Only the local
   Umi Ed25519 signer saw the existing isolated key.
5. No Helius API key, secret array, signed bytes, or serialized message appears
   in tracked files or the public receipt.

## Unexpected findings

- `pnpm audit` returns exit code `1` for the expected known findings; the first
  wrapper attempt stopped before key load until the exact findings and exit
  contract were handled correctly;
- the first package-manager invocation forwarded a literal `--`; the exact
  confirmation gate rejected it before key load. The gate was not weakened.

## Remaining uncertainty

1. The metadata bytes are funded but not uploaded; there is no durable URI.
2. Two-origin retrieval, immutable-byte verification, and on-chain binding are
   still undone.
3. Core/plugin rent, URI-dependent Asset/Identity messages, and later
   same-signed-bytes simulations remain unresolved.
4. The `0.1 USDC` treasury action remains **NO-GO**.

## Recommendation

**PASS Goal 10F and STOP.** The next goal may review one metadata-upload-only
path, but upload requires its own exact action contract and confirmation. This
receipt authorizes no upload, identity creation, treasury funding, or top-up.
