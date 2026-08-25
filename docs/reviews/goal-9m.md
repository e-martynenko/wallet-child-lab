# Goal 9M review — exact unsigned bootstrap fee quote

Status: **PASS — exact fee quoted; expired message was never signed**

## Built

- one fixed legacy System Program transfer from the Goal 9L external source to
  the isolated Mainnet owner;
- exact transfer amount: `19,990,000` lamports (`0.01999 SOL`);
- one unsigned-message builder using only a public-key noop signer;
- assertions for message version, header, ordered accounts, signer/writable
  roles, one instruction, System Program discriminator, and little-endian
  amount bytes;
- dedicated-HTTPS RPC validation, Mainnet genesis verification, finalized
  blockhash retrieval, and `getFeeForMessage` bound with `minContextSlot`;
- a hard stop unless the exact message fee is `5,000` lamports;
- a second `5,000` lamport reserve for the future direct USDC funding message;
- public digest evidence without serialized bytes, wallet key, signature,
  simulation, or submission.

## Evidence

- implementation: [`bootstrap-fee.ts`](../../src/goal9m/bootstrap-fee.ts);
- CLI: [`quote-bootstrap-mainnet.ts`](../../src/cli/quote-bootstrap-mainnet.ts);
- public artifact:
  [`wallet-child-001.goal9m.bootstrap-fee.json`](../../artifacts/wallet-child-001.goal9m.bootstrap-fee.json);
- command: `pnpm run bootstrap:quote:mainnet`;
- dedicated Helius blockhash and fee context slot: `441,634,604`;
- last valid block height: `419,683,507`;
- expiring message SHA-256:
  `c834872c6d0820cbb0e5586143b52e007dd9afa119d379f3cf7cb4d613fc063d`;
- live exact-message fee: `5,000` lamports;
- focused tests: 7, PASS.

## Tests

- dedicated HTTPS endpoint and credential-safe origin: PASS;
- exact deterministic legacy System transfer bytes: PASS;
- verified Mainnet genesis plus non-stale exact-message fee: PASS;
- wrong cluster, null/changed fee, or stale context: DENY;
- transfer plus both funding fees equals exactly `0.02 SOL`: PASS;
- mutation-capability source scan: PASS;
- public artifact excludes reusable bytes and secret fields: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 24 files, 203 tests, PASS.
- `pnpm audit --prod`: one known moderate transitive `uuid` advisory, unchanged
  from the bounded Goal 9D acceptance.

## Security findings

1. `getFeeForMessage` is read-only. It prices serialized message bytes but does
   not simulate instruction success or authorize submission.
2. The builder uses a noop public-key signer. No funding-wallet key is present
   in the project or loaded by the command.
3. The quoted blockhash expires. The artifact deliberately omits serialized
   bytes and marks the message unusable for signing.
4. The `0.01999 SOL` transfer plus two external `0.000005 SOL` funding fees
   consumes the complete `0.02 SOL` acquisition boundary. Any changed fee
   requires a smaller transfer or STOP; no top-up is allowed.
5. The second fee is only a fixed reserve. It must be re-quoted against the
   future direct-to-Asset-Signer USDC message.

## Unexpected findings

- the current exact legacy message fee is the same `5,000` lamports observed on
  Devnet, but it was verified live rather than assumed;
- the earlier Goal 9H budget omitted external funding-message fees. Goal 9M
  added both fixed fee slices and reduced the internal reserve by the same
  total, preserving the absolute cap.

## Remaining uncertainty

1. The final Asset Signer does not exist, so its direct USDC message and fee
   cannot be compiled or quoted.
2. The `19,990,000` lamports are a maximum bootstrap allocation, not proof that
   the complete lifecycle has been exactly simulated within it.
3. Identity, registration, delegation, ATA, action, revoke, and rescue messages
   still need final-address construction and same-bytes simulation.
4. Durable metadata publication and two-origin retrieval remain incomplete.
5. The exact phrase `ENABLE MAINNET EXPERIMENT` has not been provided.

## Recommendation

**PASS Goal 9M and continue offline/read-only remediation.** Do not reuse this
expired message. Next, freeze the phased Mainnet bootstrap plan and exact
identity message set; remain stopped before any source-wallet signature.

## Authoritative sources

- [Solana `getLatestBlockhash`](https://solana.com/docs/rpc/http/getlatestblockhash)
  defines the recent blockhash and last-valid-height response;
- [Solana `getFeeForMessage`](https://solana.com/docs/rpc/http/getfeeformessage)
  defines the Base64 serialized-message fee query and nullable lamport result.
