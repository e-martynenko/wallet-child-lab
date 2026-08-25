# Goal 9R review — URI-independent unsigned Mainnet message fees

Status: **PASS for six static messages; URI-dependent execution remains NO-GO**

## Built

- exact final-address legacy messages for two-ATA setup, Executive registration,
  delegation, `0.1 USDC` action, owner revoke, and `0.9 USDC` owner rescue;
- deterministic dummy-blockhash digests that detect account, instruction, or
  signer-count drift;
- finalized Mainnet blockhash plus one non-stale `getFeeForMessage` quote per
  message;
- one exact `40,000` lamport URI-independent fee total;
- explicit exclusion of Asset/Identity creation and SOL rescue rather than
  compiling guessed URI or live-balance values;
- no local key load, signing, simulation, or submission.

## Evidence

- implementation:
  [`internal-message-fees.ts`](../../src/goal9r/internal-message-fees.ts);
- CLI: [`quote-internal-mainnet.ts`](../../src/cli/quote-internal-mainnet.ts);
- public artifact:
  [`wallet-child-001.goal9r.internal-message-fees.json`](../../artifacts/wallet-child-001.goal9r.internal-message-fees.json);
- blockhash context slot: `441,647,589`;
- every fee context slot: `441,647,590`;
- last valid block height: `419,696,480`;
- fees: `5,000`, `10,000`, `5,000`, `10,000`, `5,000`, `5,000` lamports;
- total: `40,000` lamports;
- public evidence contains digests but no serialized bytes.

## Tests

- exact six message names, signer headers, instruction counts, and deterministic
  dummy-blockhash digests: PASS;
- verified Mainnet genesis and non-stale exact-message fees: PASS;
- changed fee, stale context, or wrong cluster: DENY;
- mutation-capability and serialized-byte logging scans: PASS;
- public artifact secret/reusable-byte scan: PASS;
- corrected Goal 9Q phase order: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 29 files, 231 tests, PASS.

## Security findings

1. Two messages require two signatures: owner + executive registration, and
   owner fee payer + executive action. Their fee is therefore `10,000`
   lamports, not `5,000`.
2. Revoke uses the owner for both fee payer and authority, so the delegate can
   be closed without relying on the executive.
3. Rescue is fixed at `0.9 USDC`, the exact remainder after a successful
   `0.1 USDC` action from the `1 USDC` treasury.
4. These expiring messages are fee evidence, not pre-authorized transactions.
   They must be rebuilt and simulated against live post-funding state.
5. Goal 9Q's earlier simulation-before-funding order was infeasible because an
   empty source ATA cannot simulate token spending. The corrected sequence does
   static bytes/fee review before funding, then same-bytes simulation before
   execution.

## Remaining uncertainty

1. Durable metadata URI is still absent, blocking exact Asset/Identity messages.
2. Core/plugin rent, metadata funding fee, and URI-dependent transaction fees
   are unknown.
3. SOL rescue amount depends on the live balance after actual setup and fees.
4. No exact message has been simulated against funded Mainnet state.
5. The exact phrase `ENABLE MAINNET EXPERIMENT` has not been provided.

## Recommendation

**PASS Goal 9R and retain NO-GO.** The remaining offline work depends on a
durable URI or live funded state. Stop before the source-to-owner SOL transfer
and request the exact Mainnet gate only when the user is ready for phase one.
