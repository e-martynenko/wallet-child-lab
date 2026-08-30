# Goal 10O review — keyless Mainnet activation write review

Status: **PASS — exact unfunded activation reviewed; confirmation pending**

## Built

- one atomic `697`-byte legacy transaction with exactly four instructions:
  two canonical USDC ATA creates, Executive Profile registration, and execution
  delegation;
- exactly two required signers: isolated owner and isolated Executive;
- strict compiled account order, signer header, instruction program/index/data,
  transaction-size, and zero-signature assertions;
- fresh finalized fee quote and exact zero-signature Mainnet simulation;
- simulated account-data decoding for both empty legacy-token ATAs, the
  Executive Profile, and the Execution Delegate Record;
- one exact action-time phrase that explicitly names the broad delegation;
- no key load, signature, funding, USDC transfer, external action, or
  transaction submission.

## Evidence

At preflight slot `442,807,190` and simulation slot `442,807,193`:

- transaction size: `697` bytes;
- instructions: `4`;
- required signatures: `2`;
- quoted fee: `10,000` lamports;
- two ATA rents: `2 × 2,039,280` lamports;
- Executive Profile rent: `1,169,280` lamports;
- Execution Delegate Record rent: `1,614,720` lamports;
- total rent: `6,862,560` lamports;
- exact simulated owner debit: `6,872,560` lamports;
- simulated owner balance after: `7,105,032` lamports;
- compute units: `58,027`;
- created token balances: zero;
- funding/USDC movement/external action: none.

Public artifact:
[`wallet-child-001.goal10o.mainnet-activation-write-review.json`](../../artifacts/wallet-child-001.goal10o.mainnet-activation-write-review.json).

## Tests

- deterministic dummy-blockhash digest, exact size, signer and instruction
  shape: PASS;
- exact fee, rent, owner delta, empty token accounts, Profile, and delegate
  relationship: PASS;
- fee/owner/token/Profile/stale-context drift: DENY;
- key/sign/send capability and reusable-byte publication scans: PASS;
- full suite: `44` files, `335` tests, PASS;
- TypeScript: PASS;
- diff check: PASS.

## Security findings

1. The Metaplex execution delegation is broad. It contains no onchain amount,
   destination, program, expiry, or frequency cap. The isolated Executive key
   and fixed offchain builder remain the actual policy firewall.
2. Atomic setup avoids a partially created ATA/Profile/delegate state and uses
   one `10,000` lamport two-signature fee instead of three setup transactions.
3. The owner-only revoke path does not require the Executive and remains the
   emergency stop, but revocation cannot undo a completed action.
4. Both new ATAs simulate with exactly zero USDC and no delegate/close
   authority. The experimental source and its `1 USDC` remain outside this
   transaction.
5. The production audit remains at five transitive Irys findings. Goal 10O adds
   no dependency and does not invoke Irys.

## Unexpected findings

- the simulated delegate record stores the Executive as its `authority`; the
  owner authorizes creation but is not stored in that field. This matches the
  Agent Tools relationship model and the existing full-scan validator;
- the atomic transaction is `10,000` lamports cheaper than the earlier
  conservative three-transaction setup allowance.

## Remaining uncertainty

1. No real signature or onchain activation exists yet.
2. Execution must repeat Goal 10N and the exact fee before key load, simulate
   the freshly signed bytes with signature verification, submit those identical
   bytes once, and perform finalized account/delegate read-back.
3. USDC funding remains a later independent external-wallet action with its own
   exact confirmation.
4. The `0.1 USDC` action/revoke/rescue messages still need funded-state
   same-signed-bytes simulation.

## Recommendation

**STOP pending the exact unfunded-activation phrase.** If approved, execute only
this one atomic ATA/Profile/delegate transaction. Do not fund or transfer USDC
in the same goal.
