# Wallet Child security model

Status: Goals 0–10C complete. The Asset Signer holds exactly 0.0099 Devnet SOL;
the Executive Profile exists, its per-asset delegation is revoked, ownership
is restored to the original owner, the local policy firewall is implemented,
bounded SOL and TEST-token Devnet actions are reconciled, the TEST-token owner
rescue is proven, and the minimal brain is isolated from wallet capabilities.
One external-wallet Mainnet owner bootstrap is finalized and reconciled; the
treasury-action verdict remains `NO-GO`, with no general Mainnet send path.

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

Goal 9 also created two fresh, then-unfunded, gitignored readiness key files:

- `.wallet-child/mainnet-readiness/owner.json`;
- `.wallet-child/mainnet-readiness/executive.json`.

Their public keys are distinct from each other and every known Devnet
principal. Goal 10C later funded only the owner with `19,985,000` lamports
under its separate exact confirmation; the executive remains unfunded. Their
existence and that bootstrap do not authorize further funding or use.

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

The active first experiment must satisfy all three limits simultaneously:

- no more than `1,000,000` USDC base units (`1 USDC`);
- no more than `20,000,000` lamports (`0.02 SOL`);
- no more than `$10.00` combined acquisition cost.

The entire funded amount is considered losable. The SOL reserve includes all
fees, rent, account creation, cleanup, and operational error. If the simulated
full lifecycle cannot fit the smaller of the unit caps and the dollar cap, the
experiment stops rather than increasing the budget.

The current treasury-action verdict is `NO-GO`. Goal 10C used `19,990,001`
lamports for the finalized owner transfer plus fee; reserving the future exact
`5,000` lamport direct-USDC funding fee leaves `4,999` lamports unallocated
inside the fixed boundary, and no top-up is allowed. Goal 10L has since spent
only from the already-acquired owner balance to create the permanent identity.
Goal 10N confirms a positive `7,075,032` lamport conservative owner balance
after all remaining known activation rents and internal fees. Official USDC
remains outside Wallet Child. Goal 10O now closes the keyless atomic
ATA/Profile/delegate write review, but exact approval, signed same-bytes
simulation, finalized read-back, funding approval, and funded-state action
simulations remain blockers. See `docs/mainnet-checklist.md`.

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

`pnpm audit --prod` on 2026-08-30 reports five transitive findings introduced
through the pinned Irys upload graph: two high (`bigint-buffer`, `ws`), two
moderate (`ws`, `uuid`), and one low (`elliptic`). Some have upstream patched
versions while `bigint-buffer` and `elliptic` currently report no patched
release. The lab does not force unsupported transitive overrides or claim a
clean audit.

Goal 10N adds no dependency and does not invoke the Irys SDK, so it does not
expand this reachability boundary. The acceptance remains limited to this
small experimental Mainnet lab and must be rechecked before every signer-capable
goal.

## Current security conclusion

Wallet Child #001 now has a finalized standalone Mainnet Core Asset and Agent
Identity bound to the exact Irys metadata URI. Goal 10L created both atomically,
with no collection, funding, ATA, Executive Profile, or delegation. Goals
10M/10N independently re-read the owner and identity and scanned all currently
documented Agent Tools accounts through full and filtered queries. They found
zero active execution delegates.

The safe current state is intentionally inert: the Asset Signer has no account
balance or USDC ATA; the recovery ATA, Executive Profile, and Execution
Delegate Record are absent; the `1 USDC` treasury remains outside Wallet Child.
The exact builders, fee ceilings, revoke, and owner-only rescue paths exist in
code, but none is active onchain.

This is sufficient only for a separately confirmed unfunded permission write,
not to fund or execute. The broad onchain delegation model still relies on the
isolated Executive signer and the offchain fixed builder for amount,
destination, and program enforcement. A single RPC can omit data, unknown
future Agent Tools layouts are outside the closed-world scan, and the five Irys
dependency findings remain. Any state drift, partial account setup, new
delegate, fee/rent change, or balance change returns the experiment to STOP.

Goal 10O additionally proves that the two empty USDC ATAs, Executive Profile,
and broad Execution Delegate Record fit one atomic `697`-byte transaction. Its
keyless simulation reconciles exactly `6,862,560` lamports of rent, a `10,000`
lamport fee, and zero token movement. This is review evidence only: no account
or permission was created, and the broad delegation must be named explicitly
in any action-time approval.
