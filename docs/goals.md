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

Status: **complete — reviewed 2026-08-25; SOL bootstrap later finalized in Goal 10C**

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

## Goal 9O — exact unsigned Mainnet USDC funding fee

Status: **complete — reviewed 2026-08-25; message expired unsigned**

Expected result:

- exactly `1,000,000` official USDC base units from the isolated funding
  source's canonical ATA directly to the final Asset Signer's canonical ATA;
- one exact legacy `TransferChecked` message with fixed program, account order,
  compiled indexes, discriminator, amount bytes, and decimals;
- Mainnet genesis plus finalized non-stale `getFeeForMessage` evidence;
- exact fee `5,000` lamports, equal to the existing Goal 9M reserve;
- no funding-wallet key, signature, simulation, or submission.

Review: [`reviews/goal-9o.md`](reviews/goal-9o.md)

Artifact:
[`wallet-child-001.goal9o.usdc-funding-fee.json`](../artifacts/wallet-child-001.goal9o.usdc-funding-fee.json)

## Goal 9P — final standalone policy contract

Status: **complete — reviewed 2026-08-25; all builds remain offline**

Expected result:

- canonical final Executive Profile and Execution Delegate Record PDAs;
- one final-address contract for ATA setup, delegated `0.1 USDC` action, and
  both owner rescue paths;
- Mainnet builders accept only `collection: null` and assert the exact read-only
  Core program sentinel used for an omitted optional Collection;
- finalized proof that the final Profile and Delegate Record remain absent;
- no key loading, signing, simulation, or submission.

Review: [`reviews/goal-9p.md`](reviews/goal-9p.md)

Artifact:
[`wallet-child-001.goal9p.final-contract.json`](../artifacts/wallet-child-001.goal9p.final-contract.json)

## Goal 9Q — fixed Mainnet rents and phased bootstrap

Status: **complete — reviewed 2026-08-25; full budget still NO-GO**

Expected result:

- exact installed fixed sizes and finalized Mainnet rents for Agent Identity,
  Executive Profile, Delegate Record, and two official-USDC ATAs;
- known fixed rent total below `9,000,000` lamports;
- delegate rent counted without assuming a successful refund;
- strict phase order that places USDC funding after live audit/static review
  and state-dependent simulations immediately after funding but before action;
- unknown Core/plugin rent and remaining fees preserved as blockers, never
  replaced by estimates;
- no network write, key load, signature, simulation, or transaction.

Review: [`reviews/goal-9q.md`](reviews/goal-9q.md)

Artifact:
[`wallet-child-001.goal9q.fixed-rent-plan.json`](../artifacts/wallet-child-001.goal9q.fixed-rent-plan.json)

## Goal 9R — URI-independent unsigned Mainnet message fees

Status: **complete — reviewed 2026-08-25; messages expired unsigned**

Expected result:

- exact final-address messages for ATA setup, Executive registration,
  delegation, `0.1 USDC` action, owner revoke, and `0.9 USDC` rescue;
- exact signer headers, instruction counts, deterministic test-vector digests,
  and non-stale Mainnet fee quotes;
- exact URI-independent internal fee total of `40,000` lamports;
- Asset/Identity messages blocked until durable URI and SOL rescue blocked until
  its live balance, with no guessed values;
- no local key load, signature, simulation, or submission.

Review: [`reviews/goal-9r.md`](reviews/goal-9r.md)

Artifact:
[`wallet-child-001.goal9r.internal-message-fees.json`](../artifacts/wallet-child-001.goal9r.internal-message-fees.json)

## Goal 9S — final pre-approval audit

Status: **complete — reviewed 2026-08-25; STOP awaiting exact approval**

Expected result:

- one fresh finalized read of the external source and all ten final Wallet
  Child accounts;
- exact confirmation that balances and absent account state have not drifted;
- current official Irys price/fund/upload workflow recorded without installing
  a signer-capable dependency or creating external state;
- every approval, action-time confirmation, signature, write, and spend flag
  remains false;
- one explicit `NO_GO` verdict with no Mainnet transaction.

Review: [`reviews/goal-9s.md`](reviews/goal-9s.md)

Artifact:
[`wallet-child-001.goal9s.preapproval-audit.json`](../artifacts/wallet-child-001.goal9s.preapproval-audit.json)

## Goal 10 — one-dollar Mainnet experiment

Status: **active, phase-gated — exact Mainnet phrase received 2026-08-26**

The exact phrase opens the phased work required to close the live-only Goal 9
blockers. It is not blanket transaction authorization. Every write requires a
fresh preflight, a fixed maximum outflow, separate action-time confirmation,
and finalized read-back before the next phase. The bounded `0.1 USDC` treasury
action remains `NO_GO` until every preceding blocker is closed.

## Goal 10A — Mainnet activation and bootstrap preview

Status: **complete — reviewed 2026-08-26; live preview superseded by Goal 10B**

Expected result:

- exact Mainnet project phrase recorded as received;
- fresh finalized source, USDC, RPC, and ten-account absence preflight;
- exact `19,990,000` lamport owner bootstrap with `5,000` lamport fee cap;
- exact predicted balances and hard-boundary reconciliation;
- exact unsigned Mainnet simulation with monotonic finalized context and both
  post-balances reconciled;
- verified official Jupiter Send/manual-confirmation boundary and one exact
  confirmation phrase;
- no key load, signature, transaction submission, network write, or moved
  funds.

Review: [`reviews/goal-10a.md`](reviews/goal-10a.md)

Artifact:
[`wallet-child-001.goal10a.bootstrap-review.json`](../artifacts/wallet-child-001.goal10a.bootstrap-review.json)

## Goal 10B — Jupiter live-fee stop and bounded bootstrap rework

Status: **complete — reviewed 2026-08-26; executed and verified by Goal 10C**

Expected result:

- record the received Goal 10A action phrase without expanding its scope;
- stop before Send when Jupiter's live fee differs from the exact contract;
- prove no prompt, signature, submission, write, or fund movement occurred;
- reduce the transfer to `19,985,000` lamports and cap its live fee at `10,000`
  lamports while retaining the `5,000` lamport future USDC-fee reserve inside
  the absolute `20,000,000` lamport boundary;
- limit the closed-source official Jupiter UI exception to this external
  source-to-owner bootstrap;
- require a new exact confirmation and finalized transaction decoding before
  progression.

Review: [`reviews/goal-10b.md`](reviews/goal-10b.md)

Artifact:
[`wallet-child-001.goal10b.jupiter-fee-rework.json`](../artifacts/wallet-child-001.goal10b.jupiter-fee-rework.json)

## Goal 10C — finalized Mainnet owner bootstrap

Status: **complete — reviewed 2026-08-26; STOP before the next write**

Expected result:

- receive the exact Goal 10B action-time phrase and repeat a drift-free
  finalized preflight;
- submit only the exact `19,985,000` lamport source-to-owner transfer through
  official Jupiter with a visible fee no greater than `10,000` lamports;
- wait for finalized status, then decode every actual account and instruction;
- reconcile source, owner, fee, source USDC, and all remaining Wallet Child
  accounts at a later finalized slot;
- retain the future USDC-fee reserve inside the `20,000,000` lamport boundary;
- publish only the public receipt and STOP before another write.

Review: [`reviews/goal-10c.md`](reviews/goal-10c.md)

Artifact:
[`wallet-child-001.goal10c.bootstrap-receipt.json`](../artifacts/wallet-child-001.goal10c.bootstrap-receipt.json)

## Goal 10D — durable metadata publication plan

Status: **complete — reviewed 2026-08-26; STOP before SDK integration or write**

Expected result:

- re-verify the exact frozen metadata and current official Irys Node workflow;
- read current Irys version, funding address, owner balance, and storage quote;
- refresh the finalized owner balance, fixed rents, and exact unsigned funding
  message fee through the dedicated Mainnet RPC;
- distinguish Irys funding from upload and fix the known remaining budget;
- install no signer-capable uploader, load no key, sign nothing, fund nothing,
  upload nothing, and submit no transaction;
- preserve Core/plugin rent and state-dependent messages/simulations as
  explicit blockers.

Review: [`reviews/goal-10d.md`](reviews/goal-10d.md)

Artifact:
[`wallet-child-001.goal10d.metadata-publication-plan.json`](../artifacts/wallet-child-001.goal10d.metadata-publication-plan.json)

## Goal 10E — Irys SDK integration and exact action gate

Status: **complete — reviewed 2026-08-26; STOP awaiting exact funding confirmation**

Expected result:

- install only exact current official Irys Node/Solana packages and lock their
  registry integrity;
- verify the reviewed Mainnet/finalized/native-SOL source contract and package
  source hashes without initializing the SDK with a wallet;
- audit the expanded production graph and preserve every advisory rather than
  claiming a clean result;
- prove the high-risk SPL and vulnerable WebSocket paths are not loaded by the
  exact native-SOL import, while recording the remaining loaded dependencies;
- refresh owner/Irys balances, storage quote, and exact funding fee;
- publish one exact funding-only confirmation phrase that excludes upload;
- load no key, sign/simulate/fund/upload/submit nothing, and STOP.

Review: [`reviews/goal-10e.md`](reviews/goal-10e.md)

Artifact:
[`wallet-child-001.goal10e.irys-action-review.json`](../artifacts/wallet-child-001.goal10e.irys-action-review.json)

## Goal 10F — finalized Irys metadata funding

Status: **complete — reviewed 2026-08-26; STOP before metadata upload**

Expected result:

- receive only the exact Goal 10E funding phrase and exclude upload;
- repeat the five-finding production audit, exact-path reachability guard,
  installed-source hashes, metadata hash, owner/Irys balances, quote, funding
  address, and exact `5,000` lamport fee before key load;
- load only the existing isolated owner key and build one legacy System
  transfer for exactly `3,208` lamports;
- simulate the same signed bytes, submit once, wait for finalized status, and
  decode the exact instruction, fee, and balance deltas;
- register only the finalized transaction ID with Irys and verify exactly
  `3,208` lamports of owner credit;
- initialize no Irys SDK wallet, upload no bytes, authorize no treasury action,
  and STOP.

Review: [`reviews/goal-10f.md`](reviews/goal-10f.md)

Artifact:
[`wallet-child-001.goal10f.irys-funding-receipt.json`](../artifacts/wallet-child-001.goal10f.irys-funding-receipt.json)

## Goal 10G — permanent Irys metadata upload gate

Status: **complete — reviewed 2026-08-26; STOP awaiting exact upload confirmation**

Expected result:

- re-verify the exact frozen metadata and finalized Goal 10F funding receipt;
- pin the direct-buffer upload, one-data-item signature, tagged quote, uploader
  endpoint, and receipt-verification source contract;
- confirm the fresh tagged quote is covered entirely by exactly `3,208`
  lamports of existing Irys credit;
- publish one exact upload-only phrase and make its public, intended-permanent
  consequence explicit;
- load no key, initialize no SDK wallet, upload nothing, perform no top-up or
  Solana transaction, and STOP.

Review: [`reviews/goal-10g.md`](reviews/goal-10g.md)

Artifact:
[`wallet-child-001.goal10g.metadata-upload-review.json`](../artifacts/wallet-child-001.goal10g.metadata-upload-review.json)

## Goal 10H — verified permanent Irys metadata upload

Status: **complete — one upload verified 2026-08-26; STOP before on-chain binding**

Expected result:

- receive only the exact Goal 10G permanent-upload phrase;
- repeat the full source/audit/metadata/quote/credit checks before key load;
- load only the existing owner key, initialize one native-SOL Irys wallet, and
  submit exactly one `351`-byte data item with the exact content-type tag;
- never retry an ambiguous upload and recover accepted evidence by public ID;
- verify the signed receipt, fixed owner/tag, exact bytes through two origins,
  and actual credit spend;
- perform no top-up, Solana transaction, on-chain binding, identity creation,
  or treasury action, and STOP.

Review: [`reviews/goal-10h.md`](reviews/goal-10h.md)

Artifact:
[`wallet-child-001.goal10h.metadata-upload-receipt.json`](../artifacts/wallet-child-001.goal10h.metadata-upload-receipt.json)

## Goal 10I — canonical Irys transaction verification

Status: **pass — current Irys durability contract verified**

Expected result:

- re-verify the exact frozen bytes through the canonical Irys gateway and the
  fixed uploader data route;
- query exactly one indexed transaction and match its owner, token, timestamp,
  size, fee, tag, and receipt to Goal 10H;
- fetch the Irys node public key and verify the receipt signature again without
  loading the owner key;
- correct the unsupported local `ar://<Irys ID>` interpretation to the
  officially documented `https://gateway.irys.xyz/:transactionId` URI;
- require the public uploader status to remain `CONFIRMED` and classify the
  signed receipt plus exact retrieval as current Irys Mainnet bundler durable
  acceptance;
- retain exact Arweave retrieval, bundle, confirmations, and seeded miners as
  supplemental evidence without treating the legacy Whistleblower thresholds
  as the current completion contract;
- perform no upload, top-up, key load, Solana transaction, on-chain binding,
  identity creation, or treasury action.

Review: [`reviews/goal-10i.md`](reviews/goal-10i.md)

Artifact:
[`wallet-child-001.goal10i.irys-transaction-verification.json`](../artifacts/wallet-child-001.goal10i.irys-transaction-verification.json)

## Goal 10J — read-only Mainnet birth preflight

Status: **pass — live preflight reached the write-review boundary**

Expected result:

- repeat Goal 10I before evaluating birth readiness;
- verify current Mainnet genesis and the executable Core, Agent Identity, and
  Agent Tools programs at finalized commitment;
- re-derive the frozen standalone identity contract and require all seven
  future accounts to remain absent;
- require the isolated owner balance and known fixed rent quotes to match the
  finalized public record;
- verify the installed Metaplex package graph matches the current Agent
  Registry contract;
- load no wallet key, build no transaction, sign nothing, and submit nothing;
- stop at a new write-specific review; durability acceptance never authorizes
  identity creation by itself.

Review: [`reviews/goal-10j.md`](reviews/goal-10j.md)

Artifact:
[`wallet-child-001.goal10j.mainnet-birth-preflight.json`](../artifacts/wallet-child-001.goal10j.mainnet-birth-preflight.json)

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
