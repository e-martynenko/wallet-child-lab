# Wallet Child Lab

> Your AI has a wallet now.

Wallet Child Lab is a Devnet-first learning experiment around MPL Core, the
Metaplex Agent Registry, and an asset's deterministic Asset Signer PDA.

## Current state

Goals 0–2 established the mental model, security boundary, and safe project
skeleton. Goals 3–8 created one Devnet identity, proved its wallet exists,
tested the executive/ownership lifecycle, built a local policy firewall,
executed one bounded action, and added one isolated minimal-brain contract:

- namespaced, fail-closed configuration;
- live Solana Devnet verification by genesis hash;
- one MPL Core Collection and one Core Asset;
- one registered Metaplex Agent Identity;
- one canonical Asset Signer PDA, now holding exactly 0.0099 Devnet SOL after
  the bounded transfer;
- live SOL balance plus legacy SPL and Token-2022 account reads;
- a local, gitignored owner key and a public transaction/read-back artifact;
- separate local, gitignored executive and temporary next-owner keys;
- a registered Executive Profile with its final execution delegation revoked;
- an explicit proof that an active delegate survives a Core ownership transfer;
- restored ownership after the transfer test;
- one strict typed intent for a Devnet native-SOL transfer;
- a fixed System Transfer inside Core Execute with exact program, data, account,
  signer, writable, amount, and balance-delta assertions;
- one finalized `100,000` lamport transfer to the isolated test receiver;
- a finalized post-action revoke and an identical simulation denied with Core
  `NoApprovals`;
- model output limited to exact `HOLD` or `REQUEST_TRANSFER` data;
- strict structured output, no model tools, no addresses, keys, RPC, signer, or
  transaction data in model context;
- fail-closed parsing followed by the existing deterministic policy;
- finalized confirmation and resumable, duplicate-resistant writes.

Goal 9 then performed a separate read-only Mainnet-readiness audit. It created
two isolated, initially unfunded readiness wallets, verified the current
Circle-listed Solana USDC mint and Metaplex Agent Tools program on Mainnet, fixed a maximum
loss boundary, and returned **NO-GO**. Goal 9A then completed a Devnet-only,
USDC-shaped safety test using an explicitly labelled TEST token: exact
`TransferChecked`, bounded delegation, revoke, post-revoke denial, direct-owner
rescue, finalized accounting, and a zero-write idempotency rerun all passed.
Goal 9B then added a keyless, read-only full-program delegation audit and found
zero active execution delegates for Wallet Child #001 at finalized commitment.
Goal 9C froze an honest registration-v1 metadata candidate and SHA-256 manifest
without publishing it or changing an on-chain URI. Goal 9D then documented the
one remaining moderate production dependency advisory: the reviewed path uses
only unaffected `uuid.v4()` without a buffer, so the risk is narrowly accepted
with a mandatory pre-Mainnet recheck rather than hidden by an unsupported
override. No real USDC was used, and the remaining Mainnet blockers keep the
verdict at **NO-GO**. Goal 9E additionally created an unfunded isolated recovery
wallet and an offline-only exact `0.1 USDC` policy/builder contract; it did not
create, simulate, sign, or submit a final Mainnet message. Goal 9F added exact
owner-only USDC and SOL rescue contracts to the same recovery destination,
still without a live Mainnet message or write path. Goal 9G then fixed the
two-account USDC ATA setup and read-back contract, also offline only.
Goal 9H tightened `0.02 SOL` into the total SOL acquired for every lifecycle
cost—including metadata publication, not an extra reserve—and added one
aggregate `$10` acquisition gate.
Goal 9I added the final-asset Mainnet delegation scanner; it requires a
dedicated HTTPS RPC and refuses public cluster endpoints, but cannot run until
the Mainnet asset exists.
Goal 9J added a read-only two-origin durable metadata verifier, but no upload or
on-chain URI update has occurred.
Goal 9K added a fixed read-only Irys Mainnet storage quote for the exact frozen
metadata bytes. The live tagged quote observed on 2026-08-25 was `3,208`
lamports (`0.000003208 SOL`); it is not an upload, funding estimate, or durable
URI. Goal 9L then fixed the operator-designated experimental wallet as an
external funding source. A finalized read found `1.078695 USDC` and
`0.088698606 SOL` there while every Wallet Child Mainnet principal remained
unfunded. The bootstrap policy permits only at most `0.02 SOL` and zero USDC to
the isolated owner. Exactly `1 USDC` stays staged until the final Asset Signer
exists and passes its immediate audit; the policy cannot build or submit either
transfer.
Goal 9M then compiled one exact unsigned SOL-only bootstrap message for
`0.01999 SOL` and obtained a live `5,000` lamport Mainnet fee through the
dedicated Helius RPC. Another `5,000` lamports remains reserved for the future
direct USDC funding message, so transfer plus both fees equals exactly
`0.02 SOL`. The quoted blockhash expired; no reusable bytes, key, signature,
simulation, or transaction were produced.
Goal 9N then selected the smaller standalone-Core-Asset topology for Mainnet,
generated one isolated local Core Asset account, and froze every final derived
address. Mainnet finalized read-back found the Core Asset, Agent Identity,
Asset Signer PDA, and both USDC ATAs absent. No Collection or transaction was
created.
Goal 9O fixes the future direct treasury transfer at exactly `1.000000 USDC`
from the experimental source ATA to the final Asset Signer ATA. A live
read-only exact-message quote confirmed the reserved `5,000` lamport fee. The
message expired unsigned; no wallet key, simulation, or submission was used.
Goal 9P then repairs the action and rescue builders for that standalone
topology, freezes the final Executive Profile and Delegate Record PDAs, and
compiles all final-address policy paths offline. Collection inputs are now
explicitly forbidden on Mainnet.
Goal 9Q quotes the exact fixed rents for Identity, Profile, Delegate Record,
and two USDC ATAs: `8,477,280` lamports total. It deliberately leaves Core
Asset/plugin rent and remaining fees unresolved, and freezes a phase order that
keeps USDC outside the child until live audit and static review pass, then
requires same-bytes simulations before execution.
Goal 9R compiles and live-quotes the six URI-independent internal messages for
an exact `40,000` lamport total. Asset/Identity creation still waits for the
durable URI, and SOL rescue still waits for its real post-setup balance; neither
is guessed.
Goal 9S then performs the final read-only pre-approval audit. At finalized slot
`441,648,274`, the external source still held `0.088698606 SOL` and `1.078695`
official USDC, while all ten final Wallet Child accounts remained absent. The
current official Irys `getPrice → fund → upload` flow is now explicit, but no
uploader dependency, key, signature, upload, or transaction was added. Safe
pre-gate preparation is complete and the verdict remains **NO-GO**.
Goal 10A records receipt of the exact Mainnet project phrase and performs a
fresh first-action review. The only candidate is `0.01999 SOL` from the
external experimental source to the isolated owner with an exact `0.000005
SOL` fee. Its exact unsigned message simulated successfully with both predicted
SOL balances reconciled. The official `jup.ag` session is connected to the exact
source and exposes its built-in Send flow, but no transaction data was entered.
At that review point it remained unsigned and unsubmitted pending a separate
action-time confirmation; the later `0.1 USDC` action stayed **NO-GO**.
Goal 10B records what happened after that exact confirmation: the official
Jupiter Send preview displayed a dynamic `5,001–5,003` lamport fee, so the lab
stopped before Send and invalidated the narrower approval. The reworked
bootstrap is `0.019985 SOL` with a `0.00001 SOL` live-fee cap. Together with the
future `0.000005 SOL` direct-USDC funding fee reserve, the absolute acquisition
boundary remains exactly `0.02 SOL`. At the end of Goal 10B, no transaction had
been submitted.
Goal 10C receives the reworked confirmation and completes that one bootstrap.
The finalized transaction moves exactly `0.019985 SOL` to the isolated owner
with a `0.000005001 SOL` fee. Finalized decoding proves that its only
value-moving instruction is the exact System transfer; source USDC remains
unchanged, the remaining nine Wallet Child accounts remain absent, and the
`0.1 USDC` action remains **NO-GO**.

See [the goal gates](docs/goals.md), [mental model](docs/mental-model.md), and
[security model](docs/security-model.md) before changing the project.

The engineering rule is simple: build only what the current goal requires. Use
one obvious path, explicit names, and no speculative framework or abstraction.

## Install and verify

Requirements: Node.js 22 or newer and pnpm 10.

```sh
pnpm install
pnpm run typecheck
pnpm test
```

The project deliberately does not load `.env`. Export the Wallet Child values
explicitly when running the read-only network check:

```sh
export WALLET_CHILD_NETWORK=devnet
export WALLET_CHILD_RPC_URL=https://api.devnet.solana.com
pnpm run check:network
```

Expected network-check final line:

```text
Write capability: NOT CONFIGURED
```

Then inspect the live wallet relationship and balances:

```sh
pnpm run status:devnet
```

Inspect the Goal 6 policy and fixed transaction shape entirely offline:

```sh
pnpm run policy:check
```

Inspect the Goal 8 model boundary and policy handoff entirely offline:

```sh
pnpm run brain:check
```

This check uses deterministic fake providers. Goal 8 does not install an AI
SDK, read an API key, or make a model request.

Inspect the Goal 9 Mainnet facts without loading a key or enabling writes:

```sh
WALLET_CHILD_MAINNET_READ_RPC_URL=https://api.mainnet.solana.com \
  pnpm run readiness:mainnet
```

See [the Mainnet checklist](docs/mainnet-checklist.md) for the explicit loss
boundary, emergency procedure, blockers, and authoritative sources.

Goal 9A is already complete. Its repeat-safe finalized read-back is:

```sh
pnpm run test-token:devnet --confirm-goal-9a
```

The completed rerun submits no transaction. The public evidence is in
[`artifacts/wallet-child-001.goal9a.devnet.json`](artifacts/wallet-child-001.goal9a.devnet.json).

Run the Goal 9B read-only delegation audit:

```sh
pnpm run delegates:audit:devnet
```

It scans all Agent Tools program accounts, rejects unknown layouts, validates
every delegate PDA/profile, and compares the asset-specific full-scan result to
an independent `memcmp` query. It loads no key and cannot submit a transaction.

Verify the Goal 9C metadata bytes and integrity manifest entirely offline:

```sh
pnpm run metadata:check
```

The candidate is deliberately inactive, advertises no service or x402 support,
and makes no registration or trust claim. It is not yet published to permanent
storage and is not referenced on-chain.

Goal 9D's dependency decision is documented in
[`docs/dependency-decision.md`](docs/dependency-decision.md). The production
audit deliberately remains non-clean with one moderate advisory; its exact
unreachable path and the conditions that expire the acceptance are explicit.

Goal 9E's public offline policy evidence is in
[`artifacts/wallet-child-001.goal9e.mainnet-policy.json`](artifacts/wallet-child-001.goal9e.mainnet-policy.json).
The only intended real-token action is exactly `0.1 USDC` to the isolated
recovery wallet. The final asset-derived accounts do not exist, so this is not
a runnable Mainnet command.

After a Mainnet asset exists, the keyless pre-funding delegate audit will be:

```sh
WALLET_CHILD_MAINNET_RPC_URL=https://your-dedicated-provider.example/path \
WALLET_CHILD_MAINNET_AGENT_ASSET=<FINAL_ASSET_ADDRESS> \
  pnpm run delegates:audit:mainnet
```

The command refuses public Solana RPC endpoints and submits no transaction.

After the exact frozen metadata is published to durable storage, verify two
independent retrieval origins with:

```sh
WALLET_CHILD_METADATA_DURABLE_URI=<ARWEAVE_OR_IPFS_URI> \
WALLET_CHILD_METADATA_RETRIEVAL_URLS='["https://first.example/content","https://second.example/content"]' \
  pnpm run metadata:verify-durable
```

This command only downloads and hashes bytes. It does not upload or update the
agent.

Refresh the Irys storage quote for the exact frozen metadata with:

```sh
pnpm run metadata:quote:irys
```

The command makes one fixed Mainnet `GET` request for `351` tagged bytes. It
loads no key and cannot fund, upload, sign, or submit a transaction. The quote
does not include the future Solana funding-transaction fee.

Quote the exact unsigned SOL-only bootstrap message with a dedicated Mainnet
RPC:

```sh
WALLET_CHILD_MAINNET_RPC_URL=https://your-dedicated-provider.example/path \
  pnpm run bootstrap:quote:mainnet
```

This performs only Mainnet genesis, blockhash, and `getFeeForMessage` reads.
It loads no key and cannot sign, simulate, or submit the expiring message.

## Safety boundary

Goals 10A–10C are complete and Goal 10 is active only as a phase-gated
remediation sequence. The owner bootstrap is finalized, and the final Mainnet
treasury-action verdict remains **NO-GO**. The
Executive Profile remains registered,
but its per-asset Execution Delegate Record is closed. The Asset Signer holds
exactly `9,900,000` lamports after spending the approved `100,000` Devnet
lamports in Goal 7. Its Goal 9A TEST-token ATA now holds `0`; the isolated test
receiver holds `100,000` base units, and the owner recovery ATA holds the other
`1,900,000`. Mint and freeze authorities are absent, token delegates and close
authorities are absent, and the execution delegation is revoked. Goal 9 created
only local readiness keys and performed read-only RPC calls. Goal 10C then
records the lab's first Mainnet write: one finalized `19,985,000` lamport
source-to-owner bootstrap with a `5,001` lamport fee. No real USDC has entered
Wallet Child; executive, recovery, Asset Signer, and all other final accounts
remain unfunded or absent.
