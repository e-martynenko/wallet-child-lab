# Wallet Child Lab — goals and gates

This file is the execution contract for the experiment. Work advances one goal
at a time. Reaching a goal produces evidence and a self-review; it does not
automatically authorize the next goal.

## Goal 0 — experiment contract

Status: **complete**

### Purpose

Define what the experiment may and may not do before any code can submit a
transaction.

### Non-negotiable rules

1. All chain writes are forbidden through Goal 2. The first possible Devnet
   write is Goal 3, and it requires separate approval after Goal 2 review.
2. Goal 2 and later development targets Solana Devnet only.
3. Mainnet writes require the exact, separate approval phrase
   `ENABLE MAINNET EXPERIMENT`. “Continue”, “proceed”, or “try it” is not
   sufficient.
4. No real money, real USDC, token launch, trading, leverage, staking, x402, or
   production service is part of Goals 0–8.
5. Owner, executive, and Asset Signer must be distinct addresses.
6. Private keys, seed phrases, and secret-key arrays must never appear in Git,
   artifacts, logs, stack traces, prompts, or model context.
7. The Asset Signer PDA has no private key. Code must derive it with the
   official `findAssetSignerPda` helper.
8. An AI model may propose typed intent only. It may not build, sign, submit, or
   receive an unrestricted transaction-signing interface.
9. The policy layer fails closed. Missing, unknown, malformed, or ambiguous
   input is denied.
10. Every write must be followed by an on-chain read-back check and must record
    its public transaction signature.
11. Existing files from other local experiments are not assumed to belong to
    Wallet Child Lab and must not be overwritten without review.
12. A failed safety invariant stops the goal. It is not converted into a warning.
13. Prefer the smallest clear implementation: one obvious code path, no
    abstraction before a second real use, no speculative extensibility, and no
    hidden or “clever” behavior.

### Engineering style

- clarity before compactness;
- reliability before feature count;
- direct functions before frameworks or service layers;
- explicit data flow before magic configuration;
- fixed behavior before generic transaction machinery;
- a small test for each real failure mode, not tests for implementation trivia;
- delete or defer anything that is not required by the current goal.

### Mainnet loss boundary

No Mainnet budget exists yet. Before any Mainnet write, a later goal must define
one explicit maximum possible loss, including treasury, fees, rent, token
accounts, and operational error. The current planning estimate of approximately
USD 10 is not authorization to spend it.

## Goal 1 — current mental model

Status: **complete**

Deliverables:

- `docs/mental-model.md`
- `docs/metaplex-notes.md`
- `docs/security-model.md`
- a dated dependency and source snapshot
- an explicit uncertainty list

Exit criteria:

- no chain transaction was submitted;
- identity, ownership, executive authority, and wallet state are distinguished;
- revocation limits are documented;
- ownership-transfer risk is documented;
- unsupported product claims are excluded.

## Goal 2 — safe project skeleton

Status: **complete**

Expected result:

- small TypeScript/pnpm repository;
- Zod-validated Devnet configuration;
- RPC genesis-hash check;
- isolated, gitignored owner and executive key handling;
- no transaction-producing feature yet.

## Goal 3 — Devnet identity birth

Status: **complete — reviewed 2026-08-24**

Expected result:

- one Core collection;
- one Core asset;
- one registered Agent Identity;
- canonical Asset Signer PDA derivation;
- read-back verification and public experiment artifact.

Review: [`reviews/goal-3.md`](reviews/goal-3.md)

## Goal 4 — prove the wallet exists

Status: **complete — reviewed 2026-08-24**

Expected result:

- Asset Signer receives Devnet SOL;
- deterministic address, balance, token accounts, and ownership relationship
  are displayed and reconciled.

Review: [`reviews/goal-4.md`](reviews/goal-4.md)

## Goal 5 — executive and ownership lifecycle

Status: **complete — reviewed 2026-08-24**

Expected result:

- separate executive profile;
- delegate, verify, revoke, and verify-denial lifecycle;
- explicit Devnet test of what happens to an existing execution delegate after
  the Core asset changes owner.

Review: [`reviews/goal-5.md`](reviews/goal-5.md)

## Goal 6 — policy firewall

Status: **complete — reviewed 2026-08-24**

Expected result:

- typed transfer intent;
- fixed transaction builder, not arbitrary-transaction inspection;
- amount, destination, network, program, accounts, and balance-delta checks;
- rejection tests for every forbidden class.

Review: [`reviews/goal-6.md`](reviews/goal-6.md)

## Goal 7 — one bounded Devnet action

Status: **complete — reviewed 2026-08-24**

Expected result:

- simulate, execute, and reconcile one small Devnet SOL transfer;
- prove forbidden actions fail;
- revoke the executive afterward.

Review: [`reviews/goal-7.md`](reviews/goal-7.md)

## Goal 8 — minimal brain

Status: **complete — reviewed 2026-08-24**

Expected result:

- the only model outputs are `HOLD` and `REQUEST_TRANSFER`;
- the model has no key or signer access;
- deterministic policy remains authoritative.

Review: [`reviews/goal-8.md`](reviews/goal-8.md)

## Goal 9 — Mainnet readiness

Status: **complete — reviewed 2026-08-25; Mainnet verdict NO-GO**

Expected result:

- complete Devnet evidence;
- fresh isolated wallets;
- authoritative USDC mint verification;
- fixed maximum loss and emergency procedure;
- explicit go/no-go review.

Review: [`reviews/goal-9.md`](reviews/goal-9.md)

Checklist: [`mainnet-checklist.md`](mainnet-checklist.md)

## Goal 9A — USDC-shaped safety test on Devnet

Status: **complete — reviewed 2026-08-25; Mainnet verdict remains NO-GO**

Expected result:

- one explicitly labelled, isolated, six-decimal Devnet TEST mint;
- a strict TEST-token intent that explicitly rejects official USDC mints;
- exact legacy Token Program `TransferChecked` and Core Execute assertions;
- one bounded delegated transfer, finalized accounting, and revoke;
- an identical executive path denied after revoke;
- a fixed direct-owner rescue and finalized supply reconciliation;
- resumable public evidence and an idempotent zero-write rerun.

Review: [`reviews/goal-9a.md`](reviews/goal-9a.md)

Artifact:
[`wallet-child-001.goal9a.devnet.json`](../artifacts/wallet-child-001.goal9a.devnet.json)

## Goal 9B — complete execution-delegate discovery on Devnet

Status: **complete — reviewed 2026-08-25; Mainnet verdict remains NO-GO**

Expected result:

- no signer, transaction builder, simulation, or send capability;
- finalized full scan of every account owned by the Agent Tools program;
- fail-closed rejection of unknown account layouts;
- local asset matching from the documented byte offset;
- independent RPC `memcmp` query with exact set comparison;
- PDA, bump, executive-profile, and authority validation for every active
  delegate record returned by the full scan;
- explicit single-RPC trust limitation.

Review: [`reviews/goal-9b.md`](reviews/goal-9b.md)

Artifact:
[`wallet-child-001.goal9b.delegation-audit.devnet.json`](../artifacts/wallet-child-001.goal9b.delegation-audit.devnet.json)

## Goal 9C — metadata contract and integrity freeze

Status: **complete — reviewed 2026-08-25; durable hosting remains unresolved**

Expected result:

- exact current registration-v1 metadata type;
- no Devnet wording, active-service claim, x402 claim, registration claim, or
  trust claim;
- fixed canonical UTF-8 bytes and deterministic SHA-256 evidence;
- strict fail-closed schema and byte-for-byte validator;
- explicit `NOT_PUBLISHED`, `durableUri: null`, and no on-chain update;
- no network, key, signer, builder, or transaction path.

Review: [`reviews/goal-9c.md`](reviews/goal-9c.md)

Candidate:
[`wallet-child-001.mainnet-candidate.json`](../metadata/wallet-child-001.mainnet-candidate.json)

Integrity manifest:
[`wallet-child-001.mainnet-candidate.integrity.json`](../metadata/wallet-child-001.mainnet-candidate.integrity.json)

## Goal 9D — production dependency advisory decision

Status: **complete — reviewed 2026-08-25; bounded acceptance requires recheck**

Expected result:

- exact production advisory and transitive path recorded without claiming a
  clean audit;
- current compatible upstream releases checked;
- vulnerable API reachability reviewed against installed source;
- no unsupported cross-major override;
- regression guard for the exact accepted assumptions;
- mandatory audit and reachability recheck before any Mainnet signing review.

Review: [`reviews/goal-9d.md`](reviews/goal-9d.md)

Decision: [`dependency-decision.md`](dependency-decision.md)

## Goal 9E — fixed offline Mainnet USDC contract

Status: **complete — reviewed 2026-08-25; final message remains unresolved**

Expected result:

- third isolated, gitignored recovery wallet;
- exact official Mainnet USDC mint and six-decimal legacy Token Program policy;
- one exact `0.1 USDC` action to the recovery wallet;
- canonical ATA, instruction byte, account meta, signer, writable, and Core
  Execute outer-shape assertions;
- no RPC, real signer loading, simulation, or submission path;
- public evidence that clearly distinguishes offline builder testing from a
  final Mainnet message.

Review: [`reviews/goal-9e.md`](reviews/goal-9e.md)

Artifact:
[`wallet-child-001.goal9e.mainnet-policy.json`](../artifacts/wallet-child-001.goal9e.mainnet-policy.json)

## Goal 9F — owner-only Mainnet rescue contract

Status: **complete — reviewed 2026-08-25; final simulation remains unresolved**

Expected result:

- direct owner authority with no executive or Execution Delegate Record;
- bounded full-balance USDC rescue to the isolated recovery ATA;
- bounded full-balance SOL rescue to the isolated recovery wallet;
- exact Core Execute, Token Program, and System Program message assertions;
- full evacuation, destination gain, and owner fee reconciliation;
- no RPC, real key loading, signing, simulation, or send path.

Review: [`reviews/goal-9f.md`](reviews/goal-9f.md)

## Goal 9G — exact Mainnet USDC ATA setup contract

Status: **complete — reviewed 2026-08-25; final simulation remains unresolved**

Expected result:

- exactly two canonical regular Associated Token Account create instructions;
- future Asset Signer and fixed recovery owners only;
- official USDC mint and legacy Token Program only;
- explicit absent/complete/partial preflight behavior;
- empty safe-baseline read-back and a `5,000,000` lamport setup ceiling;
- no trust in the installed idempotent-named helper's wire bytes;
- no RPC, real key loading, signing, simulation, or send path.

Review: [`reviews/goal-9g.md`](reviews/goal-9g.md)

## Goal 9H — aggregate Mainnet lifecycle budget gate

Status: **complete — reviewed 2026-08-25; final values remain unresolved**

Expected result:

- fixed `1 USDC`, `0.02 total SOL`, and `$10 combined acquisition` ceilings;
- metadata publication, identity, delegation, ATA, reserve, action, revoke, and
  emergency slices in one fail-closed sum;
- per-slice setup and fee ceilings;
- no unbudgeted top-up or setup spend outside the total SOL amount;
- no network, price feed, key, builder, signing, simulation, or send path.

Review: [`reviews/goal-9h.md`](reviews/goal-9h.md)

## Goal 9I — Mainnet-capable keyless delegate audit

Status: **complete — reviewed 2026-08-25; live final-asset audit blocked**

Expected result:

- dedicated HTTPS RPC required; public endpoints refused;
- verified Mainnet genesis and finalized commitment;
- complete closed-world Agent Tools account scan;
- every record/profile/PDA relationship validated;
- independent filtered query exactly matches local full-scan selection;
- expected isolated owner and zero active delegates required before funding;
- no key, builder, simulation, signing, or send capability.

Review: [`reviews/goal-9i.md`](reviews/goal-9i.md)

## Goal 9J — durable metadata retrieval verifier

Status: **complete — reviewed 2026-08-25; publication blocked**

Expected result:

- frozen Goal 9C bytes remain authoritative;
- one durable HTTPS/Arweave/IPFS URI;
- exactly two independent credential-free HTTPS retrieval origins;
- byte-for-byte, length, and SHA-256 equality;
- no upload, key, transaction builder, URI update, signing, or send path.

Review: [`reviews/goal-9j.md`](reviews/goal-9j.md)

## Goal 9K — Irys metadata storage quote

Status: **complete — reviewed 2026-08-25; publication blocked**

Expected result:

- fixed Irys Mainnet `GET /price/solana/351` path;
- exact frozen SHA-256, byte length, public owner, and JSON tag;
- atomic lamport parsing without floating-point conversion;
- storage quote hard-stop above `100,000` lamports;
- no wallet key, signer, funding, upload, signing, or send path;
- explicit separation between storage price and future funding transaction fee.

Review: [`reviews/goal-9k.md`](reviews/goal-9k.md)

## Goal 9L — isolated Mainnet funding route

Status: **complete — reviewed 2026-08-25; assets remain staged outside Wallet Child**

Expected result:

- one operator-designated experimental source, distinct from every Wallet Child
  principal and never loaded as a key by the lab;
- finalized proof that the source can cover the fixed `1 USDC` and `0.02 SOL`
  caps while owner, executive, and recovery remain unfunded;
- canonical source USDC ATA for the official legacy-token mint;
- source token-account checks for owner, mint, initialization, delegate, and
  close authority;
- one fail-closed bootstrap intent allowing at most `0.02 SOL` and no USDC to
  the isolated owner;
- `1 USDC` remains staged until the final Asset Signer exists and passes its
  immediate pre-funding audit;
- no RPC in the policy module and no key, builder, simulation, signing, or send
  path anywhere in the goal.

Review: [`reviews/goal-9l.md`](reviews/goal-9l.md)

Artifact:
[`wallet-child-001.goal9l.funding-route.json`](../artifacts/wallet-child-001.goal9l.funding-route.json)

## Goal 9M — exact unsigned bootstrap fee quote

Status: **complete — reviewed 2026-08-25; message expired and was never signed**

Expected result:

- one exact legacy System Program transfer from the external experimental
  source to the isolated Mainnet owner;
- exactly `19,990,000` lamports transferred, with one `5,000` lamport quoted
  bootstrap fee and one `5,000` lamport future USDC-funding fee reserve inside
  the fixed `20,000,000` lamport experiment boundary;
- dedicated HTTPS RPC and verified Mainnet genesis;
- fresh finalized blockhash and `getFeeForMessage` for the exact serialized
  unsigned bytes at a non-stale context slot;
- public SHA-256 evidence without publishing reusable message bytes;
- no key loading, signing, simulation, or transaction submission.

Review: [`reviews/goal-9m.md`](reviews/goal-9m.md)

Artifact:
[`wallet-child-001.goal9m.bootstrap-fee.json`](../artifacts/wallet-child-001.goal9m.bootstrap-fee.json)

## Goal 9N — final standalone Mainnet identity addresses

Status: **complete — reviewed 2026-08-25; every final account remains absent**

Expected result:

- one isolated mode-`0600` Core Asset account generated offline and stored only
  under the gitignored Mainnet-readiness directory;
- no Mainnet Collection because it is optional and would add an unnecessary
  account, metadata object, transaction, and rent;
- canonical Agent Identity, Asset Signer PDA, Asset Signer USDC ATA, and
  recovery USDC ATA derivation;
- every address distinct from the funding source, Mainnet principals, official
  USDC mint, and all Devnet principals;
- verified Mainnet genesis plus finalized proof that all five derived accounts
  remain absent;
- no transaction builder, signing, simulation, or submission path.

Review: [`reviews/goal-9n.md`](reviews/goal-9n.md)

Artifact:
[`wallet-child-001.goal9n.identity-addresses.json`](../artifacts/wallet-child-001.goal9n.identity-addresses.json)

## Goal 10 — one-dollar Mainnet experiment

Status: **locked**

This goal is blocked by the Goal 9 `NO-GO` findings and also requires the exact
separate approval phrase from Goal 0. The phrase cannot override unresolved
readiness blockers.

## Self-review format

Every goal ends with:

```text
GOAL REVIEW

Status: PASS | PARTIAL | FAIL
Built:
Evidence:
Tests:
Security findings:
Unexpected findings:
Remaining uncertainty:
Recommendation: GO | REWORK | STOP
```

Only the user can approve the transition to the next goal.
