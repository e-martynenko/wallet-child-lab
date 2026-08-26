# Goal 10A review — Mainnet activation and bootstrap preview

Status: **PASS — exact gate received; bootstrap awaits action-time confirmation**

## Built

- durable evidence that the exact `ENABLE MAINNET EXPERIMENT` project gate was
  received;
- a fresh finalized Mainnet preflight over the external source and all ten
  Wallet Child accounts;
- one exact first-action preview with source, destination, program, transfer,
  fee cap, maximum outflow, and expected post-transaction balances;
- an explicit manual external-wallet signing boundary: the lab still has no
  source key or submission path;
- one exact action-time confirmation phrase and five fail-closed stop rules;
- one unsigned exact-message Mainnet simulation with monotonic finalized
  context and both post-balance checks;
- one read-only check that the official Jupiter site is already connected to
  the exact source and exposes its built-in Send flow, without entering
  transaction data or opening a wallet prompt.

## Evidence

- public artifact:
  [`wallet-child-001.goal10a.bootstrap-review.json`](../../artifacts/wallet-child-001.goal10a.bootstrap-review.json);
- finalized preflight slot: `441,794,729`;
- source: `88,698,606` lamports and `1,078,695` official-USDC base units;
- all ten final Wallet Child accounts: absent;
- transfer: `19,990,000` lamports from external source to isolated owner;
- exact legacy-message fee: `5,000` lamports at slot `441,796,096`;
- maximum first-action outflow: `19,995,000` lamports;
- expected balances: source `68,703,606` lamports, owner `19,990,000`
  lamports, source USDC unchanged;
- expiring message digest:
  `cfc901a398e27cd3fe46c869ff8f8d32c0139a0902e4809c03a27859ae635bc5`;
- exact unsigned simulation: PASS at finalized slot `441,796,096`, `150`
  units, predicted source/owner balances reconciled, no submission.

## Tests

- exact approval phrase and deliberately separate action-time gate: PASS;
- canonical source, owner, official-USDC mint, and System Program: PASS;
- source outflow and predicted-balance arithmetic: PASS;
- transfer plus both external funding fees equals `20,000,000` lamports: PASS;
- changed balance, fee, message shape, or extra-fee stop contract: PASS;
- minimum-context RPC lag: bounded retry; all other RPC errors: DENY;
- monotonic account/fee/simulation slots and exact unsigned simulation: PASS;
- secret and reusable-transaction scan: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 31 files, 244 tests, PASS;
- production audit: one unchanged moderate transitive `uuid` advisory, not a
  clean audit and still bounded by the Goal 9D reachability decision.

## Security findings

1. The exact project phrase activates phased Mainnet work; it does not
   authorize this particular transaction. The action-time phrase remains
   absent.
2. The source holds more SOL than the `0.02 SOL` Wallet Child acquisition cap.
   That excess remains external and must never be treated as an allowance or
   swept into the experiment.
3. The source wallet must sign only the reviewed one-instruction legacy
   System transfer. A priority fee, second instruction, changed recipient, or
   fee above `5,000` lamports causes STOP.
4. The unsigned simulation proves the exact message executes and reconciles at
   the reviewed state, but `sigVerify:false` does not prove source authorization.
5. The quoted blockhash expires. The message must be rebuilt and rechecked
   immediately after confirmation; the published digest is evidence, not a
   reusable transaction.
6. The future direct USDC funding fee retains the other `5,000` lamports of the
   absolute `0.02 SOL` acquisition boundary. No top-up is allowed.
7. Jupiter Wallet is not open source and does not expose a simple injected
   `window.solana` signer in the checked page. Use only the already-connected
   official `jup.ag` Send flow and inspect its final preview; do not build a
   custom wallet frontend or export the key.

## Unexpected findings

- no Mainnet state drift occurred overnight: both source balances are exact
  matches and every Wallet Child account remains absent;
- the exact bootstrap fee also remains `5,000` lamports;
- the production advisory graph remains unchanged.

## Remaining uncertainty

1. Action-time confirmation has not been provided.
2. The external wallet's final transaction preview must prove there is no
   priority or additional fee and no extra instruction.
3. Durable metadata, URI-dependent Core/Identity rent and fees, live delegate
   audit, same-bytes simulations, treasury action, revoke, and rescue remain.

## Recommendation

**PASS Goal 10A and request action-time confirmation.** After receiving the
exact confirmation phrase, repeat the preflight and quote. If every value and
message invariant is unchanged, repeat the unsigned simulation, have the
external experimental wallet sign only those exact message bytes, then wait for
finalized read-back before starting metadata work.

## Authoritative sources

- [Solana `simulateTransaction`](https://solana.com/docs/rpc/http/simulatetransaction)
  documents that a valid-blockhash transaction may be simulated unsigned with
  signature verification disabled;
- [Jupiter Extension Wallet overview](https://docs.jup.ag/user-docs/manage/extension-wallet)
  documents the official browser wallet and its current closed-source status;
- [Jupiter Wallet security and settings](https://docs.jup.ag/user-docs/manage/extension-wallet/security-and-settings)
  documents dApp connections, transaction protection, and the fee display used
  for the final human review.
