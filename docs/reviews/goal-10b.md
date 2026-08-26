# Goal 10B review — Jupiter live-fee stop and bounded rework

Status: **PASS at review — superseded by finalized Goal 10C execution**

Post-review outcome: the exact reworked phrase was received. The live fee was
`5,001` lamports, the transaction finalized, and Goal 10C reconciles its actual
instructions and balances.

## Built

- durable evidence that the first action-time confirmation was received but
  authorized only the exact Goal 10A contract;
- a live official-Jupiter preview record showing the unexpected dynamic fee;
- explicit proof that Send was not clicked and no wallet prompt, signature,
  submission, write, or fund movement occurred;
- one smaller bootstrap amount and bounded fee contract that retains the
  future direct-USDC fee reserve inside the original `0.02 SOL` hard cap;
- one new exact action-time phrase and fail-closed live-preview rules;
- a narrow exception for the official Jupiter UI only for this external
  source-to-owner bootstrap, never for treasury or delegate actions.

## Evidence

- public artifact:
  [`wallet-child-001.goal10b.jupiter-fee-rework.json`](../../artifacts/wallet-child-001.goal10b.jupiter-fee-rework.json);
- confirmed candidate shown in Jupiter: `19,990,000` lamports to the exact
  isolated owner;
- fee observations: `5,001`, then `5,003` lamports instead of exactly `5,000`;
- stop point: before Send, wallet prompt, signature, or submission;
- reworked transfer: `19,985,000` lamports;
- bootstrap fee cap: `10,000` lamports;
- future direct-USDC funding fee reserve: `5,000` lamports;
- hard-boundary equality: `19,985,000 + 10,000 + 5,000 = 20,000,000`
  lamports;
- source after bootstrap: between `68,703,606` and `68,708,606` lamports;
- owner after bootstrap: exactly `19,985,000` lamports; source USDC unchanged.

## Tests

- old confirmation invalidation and pre-send stop evidence: PASS;
- maximum-outflow and hard-boundary arithmetic: PASS;
- bounded official-UI exception and mandatory finalized decode: PASS;
- separate new confirmation, secret scan, and no-write flags: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 32 files, 248 tests, PASS;
- production audit: one unchanged moderate transitive `uuid` advisory; no
  dependency changed and the Goal 9D reachability decision remains in force.

## Security findings

1. The original phrase cannot authorize a transaction whose fee differs from
   the exact reviewed contract. It is consumed by this mismatch.
2. Jupiter's displayed fee is dynamic. The rework therefore uses a small hard
   maximum rather than pretending the UI will preserve an exact fee.
3. Jupiter Wallet is closed source and the built-in Send page does not expose
   exact pre-sign message bytes to this lab. This route is accepted only for
   the one external bootstrap because the destination, amount, and fee are
   visible and strictly capped. It is forbidden for treasury/delegate actions.
4. Immediately before Send, finalized source SOL, source USDC, and destination
   SOL must still match. The visible origin, amount, destination, and fee must
   match the reworked contract; unreadable or over-cap fee means STOP.
5. If submission occurs, progression remains blocked until finalized
   `getTransaction` decoding and balance reconciliation prove the actual
   transaction. A pending or merely confirmed state is insufficient.
6. No top-up is allowed. The unused difference between the actual bootstrap
   fee and its cap remains unallocated inside the fixed acquisition boundary.

## Unexpected findings

- the official Send UI added a small dynamic fee even though the exact simple
  System-transfer message still quoted `5,000` lamports through RPC;
- Jupiter settings exposed no fixed-fee control, so the exact-fee contract
  cannot be made reliable through that UI without overbuilding a custom signer.

## Remaining uncertainty

1. The reworked action-time confirmation has not been provided.
2. The live fee and all finalized balances must be re-read immediately before
   Send.
3. Exact transaction instructions can be proven only by finalized post-submit
   decoding on this closed-source external-wallet route.
4. Every later Goal 10 blocker remains unchanged.

## Recommendation

**PASS Goal 10B and request the new exact confirmation.** After it is received,
re-run finalized balances, enter exactly `0.019985 SOL`, and proceed only if
the official Jupiter page shows the exact owner and a total fee no greater than
`0.00001 SOL`. Then wait for finalized read-back and decode before any next
goal. Otherwise STOP.

## Authoritative sources

- [Jupiter Extension Wallet overview](https://docs.jup.ag/user-docs/manage/extension-wallet)
  documents the official browser wallet and its closed-source status;
- [Jupiter Wallet security and settings](https://docs.jup.ag/user-docs/manage/extension-wallet/security-and-settings)
  documents transaction protection, fee display, dApp connections, and the
  optional auto-approve boundary.
