# Wallet Child security model

Status: Goals 0–9C complete. The Asset Signer holds exactly 0.0099 Devnet SOL;
the Executive Profile exists, its per-asset delegation is revoked, ownership
is restored to the original owner, the local policy firewall is implemented,
bounded SOL and TEST-token Devnet actions are reconciled, the TEST-token owner
rescue is proven, the minimal brain is isolated from wallet capabilities, and
the Mainnet-readiness verdict is `NO-GO`. No Mainnet transaction path exists.

## Security objective

Wallet Child #001 may hold a deliberately tiny treasury and perform one fixed,
observable action without giving an AI model, general application code, or an
unexpected network unrestricted access to the treasury.

The security claim for the first experiment is intentionally narrow:

> Given isolated keys, a verified Devnet connection, one fixed transfer builder,
> and a matching active delegation, the application permits only a configured
> transfer and denies all other proposed actions.

This is not a claim that Metaplex delegation itself enforces those limits.

## Principals and trust boundaries

```text
USER / OWNER
    │ high-trust, rarely used key
    │ creates or revokes delegation
    ▼
OWNER SIGNING BOUNDARY

AI MODEL OR DETERMINISTIC PROPOSER
    │ untrusted typed data only
    ▼
ZOD PARSER
    │ parsed intent
    ▼
POLICY
    │ allowed domain action only
    ▼
FIXED TRANSACTION BUILDER
    │ exact known instruction
    ▼
MESSAGE ASSERTION + SIMULATION
    │ approved compiled message
    ▼
EXECUTIVE SIGNING BOUNDARY
    │ separate limited operational key
    ▼
SOLANA / MPL CORE EXECUTE
    │ Asset Signer PDA signs inner CPI
    ▼
ASSET SIGNER FUNDS
```

Trust levels:

| Principal/component | Trust level | Must never receive |
|---|---|---|
| Owner key | highest | model input, logs, normal runtime access |
| Executive key | high | arbitrary transaction/sign-message interface |
| AI output | untrusted | signer, RPC send function, raw instruction builder |
| Registration metadata | public/untrusted input | secrets or authority claims without verification |
| RPC response | externally supplied | authority to bypass local assertions |
| Local artifact | public cache | private key material or sole source of truth |
| Asset Signer PDA | program-controlled | assumed human-style private key |

## Minimal brain boundary

Goal 8 gives the untrusted model one tiny context object and accepts one tiny
decision object. The request contains no public wallet addresses and no private
or operational capabilities:

```ts
type MinimalBrainContext = {
  allowance: 'AVAILABLE' | 'UNAVAILABLE';
  task: 'WAIT' | 'CONSIDER_PERMITTED_TEST_PAYMENT';
};

type AgentDecision =
  | { decision: 'HOLD' }
  | { decision: 'REQUEST_TRANSFER' };
```

The model request uses strict JSON Schema, `tool_choice: 'none'`, an empty tool
list, and `store: false`. Any refusal, provider failure, extra field, unknown
decision, or malformed object is denied. `REQUEST_TRANSFER` supplies no amount,
destination, network, token, program, account, or instruction. Application code
selects the existing fixed intent, and the Goal 6 policy evaluates it again.

The provider interface is currently injected and tested with offline fakes.
There is no AI SDK, API key loader, live model adapter, or model-side tool in the
repository. A future adapter must preserve this exact request boundary and may
return parsed data only; it must not gain access to keys, signers, RPC, builders,
or raw transactions.

## Required address separation

The following public keys must all differ:

```text
owner != executive authority
owner != Asset Signer PDA
executive authority != Asset Signer PDA
```

The collection, Core asset, Agent Identity PDA, Executive Profile PDA, and
Execution Delegate Record PDA must also have their canonical roles verified.
Address inequality alone is not sufficient; account owner, discriminator, and
PDA derivation must be checked where applicable.

## Network controls

Goals 2–8 are Devnet-only. Goal 9 adds a separate read-only Mainnet verifier
that can call only `getGenesisHash` and `getAccountInfo`; it imports no key,
signer identity, transaction builder, simulation, or send capability.

Before any transaction can be constructed or sent, code must:

1. parse configuration with a closed Zod schema;
2. require the configured logical network to equal `devnet`;
3. call `getGenesisHash` against the configured RPC;
4. require
   `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`;
5. if the Metaplex hosted API is ever used, require its network argument to be
   `solana-devnet` and compare it with the RPC cluster;
6. refuse to send if any value is absent, unknown, or contradictory.

Mainnet must not be another convenient value accepted by the same development
command. It requires a separate configuration path plus the approval phrase in
`docs/goals.md`.

The Goal 9 Mainnet read configuration accepts only an HTTPS endpoint and still
requires the exact Mainnet Beta genesis hash. Its reported RPC origin omits
path, query, user information, and credentials.

## Key handling rules

The lab now uses three explicit, gitignored Devnet key files:

- `.wallet-child/devnet/owner.json`;
- `.wallet-child/devnet/executive.json`;
- `.wallet-child/devnet/next-owner.json`.

Goal 9A adds one isolated mint-account signer file used only to create the
Devnet TEST mint:

- `.wallet-child/devnet/goal9a-test-mint.json`.

It is not the token mint authority after setup: the initial mint authority was
permanently revoked in the same transaction that created the fixed supply, and
no freeze authority was ever configured.

Goal 9 also created two fresh, unfunded, gitignored readiness key files:

- `.wallet-child/mainnet-readiness/owner.json`;
- `.wallet-child/mainnet-readiness/executive.json`.

Their public keys are distinct from each other and every known Devnet
principal. Their existence does not authorize funding or use.

The following rules remain mandatory:

- only isolated lab keypairs are generated at the explicit paths above;
- no existing Solana CLI keypair is reused;
- no main wallet is referenced;
- no secret key is placed in `.env`;
- no code prints signer objects;
- no catch-all error serializer is allowed to dump key-containing input;
- key files must be gitignored and readable only by the local user;
- artifacts contain public keys and transaction signatures only.

Devnet key isolation is for learning and accident containment. It is not a
production custody design.

## Mainnet loss boundary and verdict

Any future first experiment must satisfy all three limits simultaneously:

- no more than `1,000,000` USDC base units (`1 USDC`);
- no more than `20,000,000` lamports (`0.02 SOL`);
- no more than `$10.00` combined acquisition cost.

The entire funded amount is considered losable. The SOL reserve includes all
fees, rent, account creation, cleanup, and operational error. If the simulated
full lifecycle cannot fit the smaller of the unit caps and the dollar cap, the
experiment stops rather than increasing the budget.

The current verdict is `NO-GO`: native-SOL and USDC-shaped TEST-token fixed
builders have passed Devnet, but official USDC is deliberately excluded. A
Mainnet-USDC policy and final message simulation, durable metadata, reliable
delegate discovery, fixed USDC/SOL evacuation to a reviewed recovery wallet,
funding route, and dedicated RPC remain blockers. See
`docs/mainnet-checklist.md`.

## Delegation threat model

Current `ExecutionDelegateRecordV1` is broad. It identifies an executive and an
agent asset but does not contain:

- maximum amount;
- token allowlist;
- destination allowlist;
- program allowlist;
- expiry;
- frequency limit;
- daily budget;
- instruction class.

Therefore, if the executive key or its unrestricted signing path is
compromised, the off-chain policy can be bypassed. The policy is effective only
when it is the sole route to the executive signer.

Current source also permits one record per executive-profile/asset pair rather
than visibly enforcing one total executive per asset. Revocation and status
checks must account for multiple possible records. Goal 5 verified only the
one record derived from the lab's known Executive Profile; full enumeration is
still unsolved.

## Ownership-transfer threat

The asset, Agent Identity, and Asset Signer remain tied to the stable Core asset
address when ownership changes. Goal 5 proved on Devnet that an existing Agent
Tools delegate record survives the transfer and can still authorize a harmless
Noop Execute simulation after the old owner no longer owns the asset.

Permanent lab rule:

```text
ACTIVE EXECUTION DELEGATION
        +
CORE ASSET TRANSFER
        =
DENY OPERATION / STOP EXPERIMENT
```

Any future non-test transfer procedure must enumerate, revoke, and independently
verify all execution delegate records before transfer. After transfer, the new
owner must deliberately create new delegation. Goal 5 temporarily violated
this rule only inside the explicitly approved ownership experiment, then the
new owner revoked the surviving record and returned the asset.

## Policy firewall design

The lab must not accept a model-generated Solana transaction and attempt to
sanitize it. It accepts a small domain object:

```ts
type TransferIntent = {
  kind: 'TRANSFER';
  destination: PublicKeyString;
  amountLamports: bigint;
};
```

Policy evaluation checks the intent. A separate fixed builder creates the only
allowed instruction. The raw forwarded instruction and outer Core Execute
instruction are both asserted before any future simulation or signing.

Initial allowed action:

- one native SOL transfer;
- source must be the canonical Asset Signer PDA;
- destination must equal one configured test receiver;
- amount must be positive and at or below the configured ceiling;
- inner program must be the System Program;
- account metas must exactly match the expected source and destination;
- no additional inner instruction;
- executive/fee payer must not be the transfer recipient;
- observed post-transaction deltas must reconcile with the action and fees.

Everything else is denied.

Goal 6 fixes the current experiment policy to:

- network: `devnet`;
- token: native `SOL` only;
- source: canonical Wallet Child #001 Asset Signer;
- destination: isolated Goal 5 next-owner address used as `TEST_RECEIVER`;
- maximum per transfer: `1,000,000` lamports (`0.001` SOL);
- first Goal 7 candidate: `100,000` lamports (`0.0001` SOL);
- maximum fee-payer delta: `100,000` lamports;
- inner program: System Program only;
- exactly one System Transfer inside exactly one MPL Core Execute.

## Why message inspection still matters

Using a fixed builder is the primary control. Inspecting the final compiled
message catches builder mistakes, dependency drift, injected instructions, or
unexpected account metas. Simulation is an additional operational check, not a
replacement for policy or message assertions.

An allowlisted program alone is not sufficient: a program can expose many
instructions and perform CPI. The exact instruction discriminator/data and
account metas must also be constrained.

## Revocation procedure

The minimum emergency sequence is:

1. stop the executive runtime;
2. use the isolated owner path;
3. read the Core asset's current owner from chain;
4. locate the intended delegate record and verify its derivation/content;
5. submit revoke;
6. fetch the record and require that it is closed;
7. attempt the previously valid execute path and require failure;
8. inspect balances and authorities for damage already done;
9. check for other delegate records;
10. preserve public signatures and an incident note.

Revocation does not undo earlier effects. If prior execution created token
approvals or changed authorities, separate remediation is required.

## Invariants to test

### Identity and derivation

- same Core asset always produces the same Asset Signer PDA;
- Agent Identity PDA is owned by the expected program and links to the asset;
- Agent Identity plugin exists and contains the expected URI;
- Asset Signer was derived through the official helper.

### Separation

- owner, executive, and Asset Signer are different;
- the AI-facing process cannot import or receive key material;
- owner key is not needed for ordinary executive execution.

### Policy

- exact allowed transfer passes;
- over-limit, zero, negative, malformed, or fractional-unit-confused amount
  fails;
- unknown recipient fails;
- unknown program or instruction fails;
- extra instruction or account meta fails;
- SPL approve, authority change, and close-account instructions fail.

### Lifecycle

- valid executive can execute only with an active matching record;
- revocation closes the record and blocks the old path;
- ownership-transfer behavior is measured rather than assumed;
- status does not claim `Executive: NONE` based only on a missing local artifact.

### Accounting

- pre/post source and destination balances are read at finalized commitment;
- fee-payer changes are separated from Asset Signer changes;
- expected deltas equal observed deltas;
- failed transactions are reported and never recorded as successful actions.

## Known non-goals

This security model does not currently solve:

- compromised host operating system;
- malicious dependency installation;
- production key custody;
- on-chain spending limits;
- provider-independent or cryptographically complete delegate discovery;
- RPC censorship or long-term availability;
- legal ownership of agent-held assets;
- economic manipulation or reputation gaming;
- safe arbitrary CPI;
- large treasury management.

## Current dependency advisory

`pnpm audit --prod` on 2026-08-24 reports one moderate advisory,
[`GHSA-w5hq-g745-h8pq`](https://github.com/advisories/GHSA-w5hq-g745-h8pq),
in transitive `uuid@8.3.2` through
`umi-bundle-defaults -> @solana/web3.js -> jayson`. The affected behavior is
caller-supplied output buffers in UUID v3/v5/v6. Wallet Child does not call
those APIs.

There is no patched `uuid` release within Jayson's declared `^8.3.2` range.
Forcing `uuid@11.1.1` would cross an unsupported major-version boundary, so the
lab does not hide the finding with an override. This acceptance remains limited
to this non-production Devnet lab and must be rechecked before each later goal.

## Current security conclusion

Goal 9A closes with the original Devnet owner and Core asset ownership
unchanged, the known delegate record closed, and the Asset Signer still holding
exactly `9,900,000` lamports. The isolated six-decimal TEST mint has a fixed
`2,000,000` base-unit supply with no mint or freeze authority. The delegated
path moved exactly `100,000` base units to the fixed receiver, then failed with
Core `NoApprovals` after revoke. The direct owner path rescued the remaining
`1,900,000` base units. All three token accounts have no token delegate or close
authority. A repeated live command submitted zero transactions.

Goal 9B additionally performed a keyless finalized scan of all 253 accounts
owned by the Devnet Agent Tools program. It classified 120 executive profiles
and 133 execution delegate records, rejected unknown layouts, validated every
record PDA/profile relationship, and matched a separate asset-filtered query
against the full scan. Wallet Child #001 had zero active records and its known
revoked record was absent.

This materially reduces uncertainty around legacy SPL `TransferChecked`, owner
rescue, and delegate discovery, but it is still not safe for a Mainnet write.
A single RPC can censor data, Goal 9B is Devnet-only, real USDC was explicitly
forbidden, and metadata durability, final Mainnet asset/RPC audit, funding
route, dedicated RPC, final Mainnet message simulation, fixed SOL evacuation,
and the dependency advisory remain unresolved.

Goal 9C freezes a chain-neutral, inactive registration-v1 metadata candidate.
It advertises zero services, `x402Support: false`, no registrations, and no
supported trust mechanisms. Its exact 351 UTF-8 bytes have SHA-256
`7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`.
The strict validator rejects semantic false claims, unknown fields, byte-order
or whitespace drift, and digest mismatch. The candidate is explicitly not
published, has no durable URI, and has not changed any on-chain state.
