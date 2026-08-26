# Metaplex notes

Research snapshot: **2026-08-25**. This ecosystem is moving quickly. Package
versions, generated names, program deployments, API defaults, and documentation
must be rechecked at the beginning of each implementation goal.

## Current package and source snapshot

Observed npm `latest` versions:

| Package | Version | Note |
|---|---:|---|
| `@metaplex-foundation/mpl-agent-registry` | `0.2.6` | Depends on exactly `mpl-core@1.8.0` |
| `@metaplex-foundation/mpl-core` | `1.10.0` | Newer than the Registry's exact dependency |
| `@metaplex-foundation/umi` | `1.5.1` | Registry peer range is `^1.0` |
| `@metaplex-foundation/umi-bundle-defaults` | `1.5.1` | Candidate RPC/Umi setup package |
| `@metaplex-foundation/mpl-toolbox` | `0.11.4` | Registry dependency range is `^0.10.0` |

Goal 2 should initially align the direct Core dependency with the Registry's
exact `1.8.0` dependency, rather than silently loading two Core versions. It
should then prove that the specific Agent Identity and Execute APIs required by
the lab exist. Upgrading to Core `1.10.0` is a deliberate compatibility task,
not a default assumption.

Goal 4 adds a direct `mpl-toolbox@0.10.0` dependency for the official System
Program transfer builder. This matches the Registry's `^0.10.0` range and
avoids mixing it with the currently published Toolbox `0.11.4` line.

The published Registry package is still `0.x`. Source main and published npm
are not perfectly synchronized: npm reports `0.2.6`, while the inspected source
commit's package file reports `0.2.5`. Pin versions and commit `pnpm-lock.yaml`.

Candidate minimal runtime dependencies for Goal 2:

```text
@metaplex-foundation/mpl-agent-registry@0.2.6
@metaplex-foundation/mpl-core@1.8.0
@metaplex-foundation/umi@1.5.1
@metaplex-foundation/umi-bundle-defaults@1.5.1
zod@4.4.3
```

Development dependencies can remain limited to TypeScript, `tsx`, a test
runner, and Node types. They should not be installed until Goal 2 is approved.

Proposed Goal 2 shape:

```text
package.json
pnpm-lock.yaml
tsconfig.json
src/
  config/
    env.ts
  chain/
    network.ts
    umi.ts
tests/
  config.test.ts
  network.test.ts
docs/
  goals.md
  mental-model.md
  metaplex-notes.md
  security-model.md
```

This skeleton deliberately has no asset creation, signer-loading, or send
command. Goal 3 can add those only after Goal 2's configuration and network
gates pass review.

## MPL Core

### In plain English

MPL Core is the on-chain asset system. Wallet Child #001 is one Core asset with
a stable public address and an owner recorded in the asset account.

### Why we need it

It provides ownership, collection membership, plugins, the Asset Signer PDA,
and the `execute` path.

### What exists on-chain

- Core collection account, if used;
- Core asset account;
- plugins and external plugin records stored with those accounts.

### What signs the transaction

A normal payer and the authority required by the Core instruction. Creating an
asset also uses a newly generated asset signer to create the asset account.

### What can go wrong

- confusing owner with update authority or collection authority;
- fetching an asset without resolving inherited collection plugins;
- assuming every Core version is compatible with the Registry package;
- treating a Core asset as an SPL mint/token account.

### Relevant official documentation

- [Core overview](https://www.metaplex.com/docs/smart-contracts/core)
- [What is a Core asset](https://www.metaplex.com/docs/smart-contracts/core/what-is-an-asset)
- [Core collections](https://www.metaplex.com/docs/smart-contracts/core/collections)
- [Current Core source snapshot](https://github.com/metaplex-foundation/mpl-core/tree/2181404f90c7dd27ab95fcb2472483c4a347ae8c)

## Agent Registry registration

### In plain English

Registration declares that one specific Core asset is an agent identity. It
does not create an AI process.

### Why we need it

It creates a canonical link that applications can verify from the asset and
identity PDA.

### What exists on-chain

- Agent Identity PDA derived from the Core asset;
- Agent Identity external plugin on the Core asset;
- registration URI inside that plugin.

Current source uses the dedicated `AgentIdentity` plugin, not the older generic
AppData description still present in some high-level material.

### What signs the transaction

The payer signs. If a separate authority is provided, it signs. The Agent
Identity PDA signs the Core CPI through program-derived seeds when the plugin is
attached.

### What can go wrong

- assuming `registerIdentityV1` creates an `AgentIdentityV1` account: current
  source creates V2;
- assuming the registration URI is stored in the PDA;
- using a hosted API transaction without inspecting what it contains;
- calling the mint API twice and creating two separate agents;
- trusting a mutable or unavailable URI as durable identity metadata.

### Relevant official documentation

- [Agent mint/registration guide](https://www.metaplex.com/docs/agents/mint-agent)
- [Official source guide for the hosted API](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/docs/agent-registration-guide.md)
- [Registration processor](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-identity/src/processor/register_identity_v1.rs)
- [AgentIdentityV2 state](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-identity/src/state/agent_identity_v2.rs)

## Agent registration metadata

### In plain English

This is a public JSON description reached through the URI in the Agent Identity
plugin. It describes the agent; it is not the agent's executable brain.

### Why we need it

Other software needs a discoverable name, description, services, registry
references, and declared trust mechanisms.

### What exists on-chain

The URI exists on-chain. The JSON content normally exists off-chain.

### What signs the transaction

The authority involved in registering or updating the Agent Identity plugin.
Hosting a JSON file does not itself require a Solana signature.

### What can go wrong

- calling the document "exact ERC-8004" without naming a normative schema and
  version;
- claiming unsupported trust mechanisms;
- publishing private endpoints or credentials;
- changing content behind the same URI without integrity/version evidence;
- losing the hosting location.

For Goal 3, use the fields currently accepted by the official client API as a
compatibility baseline: `type`, `name`, `description`, `services`,
`registrations`, and `supportedTrust`. Before publishing, validate the exact
current schema again and record its source. Do not claim full ERC-8004
compliance solely because these fields serialize successfully.

### Relevant official documentation

- [Current API types](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/clients/js/src/api/types.ts)
- [MIP-014 discussion and non-normative example](https://github.com/metaplex-foundation/mip/discussions/52)

## Agent Identity PDA

### In plain English

This PDA is the registry's stable on-chain pointer back to the Core asset.

### Why we need it

Anyone can derive it from the asset public key and verify that registration
exists.

### What exists on-chain

Current V2 contains the asset, optional agent-token address, discriminator,
bump, and reserved space.

### What signs the transaction

No private key signs for this PDA. The Agent Identity program can sign a CPI for
it using its seeds.

### What can go wrong

- decoding a V2 account as V1;
- checking only that an account exists instead of checking its owner,
  discriminator, derivation, and linked asset;
- treating the optional token link as proof that a token is safe or official.

### Relevant official documentation

- [Agent Identity source](https://github.com/metaplex-foundation/mpl-agent/tree/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-identity)

## Asset Signer PDA

### In plain English

The Asset Signer is a wallet-like address deterministically attached to the
Core asset. It has no private key, but MPL Core can make it sign inner
instructions through `execute`.

### Why we need it

It lets Wallet Child #001 hold SOL, own SPL token accounts, and act as an
authority without a seed phrase that can be exported.

### What exists on-chain

The PDA address need not have a standalone data account merely to exist as an
address. SOL may be held at that address, and token accounts can name it as
their authority/owner.

### What signs the transaction

MPL Core signs the inner CPI with the PDA seeds. The outer transaction still
needs an authorized normal signer and fee payer.

### What can go wrong

- manually duplicating seeds instead of using `findAssetSignerPda`;
- believing no private key means no withdrawal path;
- exposing broad `execute` authority to untrusted code;
- forgetting that token-account and authority changes can outlive revocation.

### Relevant official documentation

- [Execute and Asset Signer](https://developers.metaplex.com/smart-contracts/core/execute-asset-signing)
- [Canonical helper source](https://github.com/metaplex-foundation/mpl-core/blob/2181404f90c7dd27ab95fcb2472483c4a347ae8c/clients/js/src/generated/accounts/assetSigner.ts)
- [Current execute client](https://github.com/metaplex-foundation/mpl-core/blob/2181404f90c7dd27ab95fcb2472483c4a347ae8c/clients/js/src/instructions/execute.ts)

## Executive profile

### In plain English

An executive profile is an on-chain profile for a normal executive authority
key. It identifies an operator; it is not a spending policy.

### Why we need it

The owner and day-to-day operator must remain distinct, and the operator must be
replaceable.

### What exists on-chain

`ExecutiveProfileV1` PDA stores the executive authority. Its derivation is tied
to that authority.

### What signs the transaction

The payer signs, and a separately supplied executive authority must consent by
signing its registration.

### What can go wrong

- using the owner as executive;
- registering an authority without proving it signed;
- putting both keypairs in the same unrestricted runtime;
- interpreting the profile as authorization for a particular agent without a
  matching delegate record.

### Relevant official documentation

- [Executive registration processor](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-tools/src/processor/register_executive_v1.rs)
- [Executive profile state](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-tools/src/state/executive_profile_v1.rs)

## Execution delegation

### In plain English

The owner creates a record saying a particular executive can authorize Core
execution for a particular agent asset.

### Why we need it

It lets the operator act without requiring the owner key for every action and
allows the operator to be revoked later.

### What exists on-chain

`ExecutionDelegateRecordV1`, derived from executive profile plus agent asset,
stores executive profile, executive authority, and agent asset.

### What signs the transaction

Only the current Core asset owner may create the delegation. During execution,
the executive authority signs the outer transaction; the Asset Signer signs the
inner CPI through Core.

### What can go wrong

- treating it as a narrow capability or allowance;
- failing to discover multiple records for one asset;
- transferring ownership while a record still exists;
- assuming revocation reverses earlier operations.

### Relevant official documentation

- [Delegate processor](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-tools/src/processor/delegate_execution_v1.rs)
- [Delegate record state](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-tools/src/state/execution_delegate_record_v1.rs)
- [Core Agent Identity execute validation](https://github.com/metaplex-foundation/mpl-core/blob/2181404f90c7dd27ab95fcb2472483c4a347ae8c/programs/mpl-core/src/plugins/external/agent_identity.rs)

## Revocation

### In plain English

Revocation closes one delegate record so it cannot approve future execution.

### Why we need it

It is the primary emergency and operator-replacement mechanism.

### What exists on-chain

After a successful revoke, that record account is closed and its rent is sent
to a destination account.

### What signs the transaction

The current Core asset owner or the executive authority recorded in the record
may authorize revocation.

### What can go wrong

- checking a cached artifact instead of checking the chain;
- revoking one record while another remains;
- expecting prior approvals, transfers, or authority changes to disappear;
- not having enough SOL or a working RPC path during an emergency.

### Relevant official documentation

- [Revoke processor](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-tools/src/processor/revoke_execution_v1.rs)

## Network identity

### In plain English

An RPC URL label is not enough to prove which Solana cluster answered. The
genesis hash identifies the chain.

### Why we need it

A typo or malicious/misconfigured endpoint must not turn a Devnet command into
a Mainnet write.

### What exists on-chain

Observed with `getGenesisHash` on 2026-08-24:

- Devnet: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`
- Mainnet Beta: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`

### What signs the transaction

Nothing signs this read. Goal 2 must perform it before enabling any builder that
can send.

### What can go wrong

- checking only the hostname or configuration string;
- using Devnet in Umi but `solana-mainnet` in the hosted Agent API request;
- permitting Mainnet as an ordinary enum value in development commands.

### Relevant official documentation

- [Solana RPC `getGenesisHash`](https://solana.com/docs/rpc/http/getgenesishash)

## Open questions carried into later goals

1. Determine a reliable way to enumerate every execution delegate record for
   one asset.
2. Determine how metadata integrity and permanence will be handled before
   Mainnet.
3. Recheck when Agent Registry can move beyond its exact MPL Core `1.8.0`
   dependency without an unsupported client mismatch.

## Goal 9 Mainnet readiness snapshot — 2026-08-25

### In plain English

Mainnet facts can be checked without giving the repository a Mainnet signing
path. The network, official USDC mint, and Agent Tools deployment are necessary
facts, but they do not prove that a USDC transaction builder is safe.

### Why we need it

The planned `$1 USDC` experiment uses a different instruction and account shape
from the native-SOL transfer proven in Goal 7. Treating them as equivalent would
bypass the fixed-builder security design.

### What exists on-chain

Read-only Mainnet checks observed:

- genesis hash `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`;
- USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, initialized,
  six decimals, owned by the legacy SPL Token Program;
- Agent Tools program `TLREGni9ZEyGC3vnPZtqUh95xQ8oPqJSvNjvB7FGK8S`,
  executable through the upgradeable BPF loader.

No Wallet Child Mainnet asset, collection, identity, executive profile,
delegation, or token account exists.

### What signs the transaction

Nothing signs these reads. The Goal 9 verifier contains no signer or transaction
capability. The newly generated owner and executive keys remain local and
unfunded.

### What can go wrong

- trusting a Circle address without verifying the actual account and cluster;
- accepting the correct mint while allowing a wrong Token Program or decimals;
- assuming the SOL builder safely transfers SPL tokens;
- using the public Solana RPC as a production endpoint;
- funding before every active delegation can be discovered and reviewed;
- confusing a completed readiness audit with a `GO` decision.

### Relevant official documentation

- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Solana clusters](https://solana.com/docs/references/clusters)
- [Solana `getGenesisHash`](https://solana.com/docs/rpc/http/getgenesishash)
- [Metaplex Agent Tools](https://www.metaplex.com/docs/smart-contracts/mpl-agent/tools)
- [Current Registry package](https://www.npmjs.com/package/@metaplex-foundation/mpl-agent-registry)

## Goal 9A USDC-shaped Devnet observation — 2026-08-25

### In plain English

A six-decimal SPL token can be transferred from the Asset Signer through Core
Execute without using real USDC. Goal 9A created an explicitly labelled TEST
mint and treated the mint, token accounts, decimals, amount, destination,
program, instruction bytes, and account metas as fixed application data.

### What was proven

- `TransferChecked` used legacy Token Program discriminator `12`, a fixed
  `100,000` base-unit amount, and six decimals;
- source, destination, and owner-recovery accounts were canonical associated
  token accounts for one isolated TEST mint;
- the delegated Core Execute contained one asserted forwarded instruction;
- the known delegate record was closed after the action;
- an identical executive simulation then failed with Core `NoApprovals`;
- the current Core asset owner could directly authorize Core Execute without an
  active Agent Tools record and rescue the remaining `1,900,000` base units;
- mint and freeze authorities were absent, token delegate and close authorities
  were absent, and total supply reconciled at finalized commitment;
- a completed rerun validated live state and submitted no transaction.

The initial delegate rent was returned to the owner when the record closed, so
owner SOL can rise between action and rescue snapshots even though each
individual transaction still spends a positive bounded fee. Goal 9A recorded a
net owner cost of `7,721,880` Devnet lamports, primarily mint/ATA rent and fees.

### What this does not prove

- official Devnet and Mainnet USDC mints are explicitly denied by this path;
- no Mainnet transaction was built, signed, simulated, or submitted;
- the final Mainnet address set and compiled transaction message do not exist;
- direct owner rescue did not itself solve full delegate enumeration, SOL evacuation,
  funding-route isolation, metadata durability, or production RPC selection.

### Relevant official documentation

- [Solana token basics](https://solana.com/docs/tokens/basics)
- [Solana checked token CPI](https://solana.com/docs/tokens/advanced/cpi)
- [Core Execute Asset Signing](https://www.metaplex.com/docs/smart-contracts/core/execute-asset-signing)
- [Metaplex Agent Tools](https://www.metaplex.com/docs/smart-contracts/mpl-agent/tools)

## Goal 9B complete delegate discovery observation — 2026-08-25

### In plain English

An execution delegate record contains the agent asset address in fixed account
data, so discovery does not require knowing executive wallets or profiles in
advance. The current official layout is 104 bytes with discriminator `2` and
`agentAsset` at byte offset `72`.

### What was proven

- verified-Devnet `getProgramAccounts` returned every account owned by the Agent
  Tools program at finalized commitment;
- the scanner accepted only the documented 40-byte Executive Profile V1 and
  104-byte Execution Delegate Record V1 layouts and failed closed on anything
  unknown;
- every one of the 133 live delegate records returned in the full scan had a
  canonical PDA/bump, an existing canonical executive profile, and a matching
  authority;
- local asset matching from the full scan exactly matched a second RPC query
  using discriminator, size, and `agentAsset` `memcmp` filters;
- Wallet Child #001 had zero active records and its known revoked record was
  absent between finalized slots `487701675` and `487701677`;
- the audit loaded no key and had no transaction builder, signer, simulation,
  or send path.

### Completeness boundary

The result is complete relative to current `ExecutionDelegateRecordV1`
accounts returned by that verified RPC at finalized commitment. A single RPC
response is not a cryptographic proof against provider censorship. Before any
future funding, the same fail-closed audit must run on the final asset through a
reviewed dedicated Mainnet RPC, ideally cross-checked through an independent
provider.

### Relevant official documentation

- [Metaplex Agent Tools account layouts](https://www.metaplex.com/docs/smart-contracts/mpl-agent/tools)
- [Solana `getProgramAccounts`](https://solana.com/docs/rpc/http/getprogramaccounts)

## Goal 9C metadata integrity observation — 2026-08-25

### In plain English

The registration document is a public capability claim. Empty or false fields
are safer than advertising services, payment support, registrations, or trust
mechanisms that do not exist. Goal 9C freezes one exact inactive candidate
before any permanent upload or on-chain URI decision.

### Fixed candidate

- type: `https://eips.ethereum.org/EIPS/eip-8004#registration-v1`;
- active: `false`;
- x402 support: `false`;
- image: empty;
- services, registrations, and supported trust: empty arrays;
- no Devnet label and no chain-specific address;
- canonical byte length: `351`;
- SHA-256:
  `7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`.

The validator rejects unknown fields, semantic claim changes, formatting or
key-order drift, byte-length changes, and digest mismatch. The manifest records
`NOT_PUBLISHED`, `durableUri: null`, and `onChainUriUpdated: false` so a local
hash cannot be mistaken for durable publication.

### Durability boundary

Current Core guidance recommends permanent storage such as Arweave or pinned
IPFS for off-chain metadata. The Core `ImmutableMetadata` plugin can permanently
lock name and URI, but that action is irreversible and does not keep a bad or
unavailable target online. Therefore publication, multi-gateway retrieval,
content-address verification, and the immutability decision belong to a later
separately approved goal.

### Relevant official documentation

- [Metaplex Agent Commerce metadata fields](https://www.metaplex.com/docs/agents/agent-commerce)
- [MPL Core off-chain metadata storage](https://www.metaplex.com/docs/smart-contracts/core/what-is-an-asset)
- [MPL Core immutability guide](https://www.metaplex.com/docs/smart-contracts/core/guides/immutability)

## Goal 5 observed lifecycle — 2026-08-24

The Devnet experiment confirmed the current official security model:

- an active `ExecutionDelegateRecordV1` remained present after the Core Asset
  moved to a different owner;
- the same executive still passed a harmless SPL Noop Execute simulation after
  that ownership change;
- the new owner could revoke the surviving record;
- after revocation, the identical simulation failed with Core `NoApprovals`;
- the Core Asset was returned to the original owner and the Asset Signer
  remained at exactly `10,000,000` lamports.

Current official references:

- [Run an Agent](https://www.metaplex.com/docs/agents/run-an-agent), updated
  June 2, 2026;
- [Agent Tools security model](https://www.metaplex.com/docs/smart-contracts/mpl-agent/tools),
  updated June 2, 2026;
- [Core Execute Asset Signing](https://www.metaplex.com/docs/smart-contracts/core/execute-asset-signing),
  updated January 31, 2026.

## Policy firewall and Execute message shape

### In plain English

Metaplex delegation is broad, so Goal 6 adds a smaller off-chain door in front
of it. Callers may request only a typed transfer; they cannot supply a program,
instruction, account list, signer, approval, authority change, or close action.

### Why we need it

An active executive can otherwise forward arbitrary instructions through Core
Execute. The firewall limits the one signing path we control before Goal 7
temporarily activates delegation again.

### What exists on-chain

Nothing new in Goal 6. The policy, fixed builder, and assertions are local
TypeScript. The Execution Delegate Record remains closed.

### What signs the transaction

Nothing in Goal 6. `policy:check` uses public no-op signer placeholders and does
not build-and-sign, simulate, or submit a transaction.

### What can go wrong

- allowing callers to provide raw instructions or transaction messages;
- checking only the program ID instead of exact data and accounts;
- accepting SOL decimals instead of integer lamports;
- overlooking extra writable accounts or a second instruction;
- treating local limits as on-chain enforcement;
- letting another unrestricted route reach the executive key.

### Relevant official documentation

- [Agent Tools security model](https://www.metaplex.com/docs/smart-contracts/mpl-agent/tools)
- [Core Execute Asset Signing](https://www.metaplex.com/docs/smart-contracts/core/execute-asset-signing)

## Goal 7 observed bounded action — 2026-08-24

The live Devnet action confirmed the fixed builder and accounting assumptions:

- an empty System account required `890,880` lamports of rent-exempt
  preparation before it could receive the smaller `100,000` lamport transfer;
- the owner funded that preparation directly after both public faucet paths
  were rate-limited; this did not touch Asset Signer funds;
- the executive submitted exactly one System Transfer inside one Core Execute;
- Asset Signer moved from `10,000,000` to `9,900,000` lamports;
- TEST_RECEIVER moved from `890,880` to `990,880` lamports during the bounded
  action;
- the action-only fee-payer delta was `58,720` lamports, below the `100,000`
  lamport ceiling;
- revoke closed the record, and the identical Execute simulation then failed
  with Core `NoApprovals`;
- the completed command reran idempotently with zero new transactions.

The first attempt also tested the emergency path: the transfer simulation was
rejected before submission because the receiver did not yet meet rent
requirements, and `finally` still submitted and verified revoke. No Asset
Signer funds moved in that attempt.

## Goal 9E offline Mainnet USDC contract — 2026-08-25

### In plain English

The policy now describes one real-token action without enabling it: exactly
`0.1 USDC` may move from the future Asset Signer's canonical USDC account to one
isolated recovery wallet. Nothing in the request can select another mint,
program, amount, decimal count, account list, or instruction.

### Why we need it

Agent Tools deliberately gives an executive broad execution authority. The
local builder narrows the only intended application path to the same checked
token instruction shape already proven with a worthless six-decimal TEST token
on Devnet.

### What exists on-chain

Nothing new. The recovery, owner, and executive are unfunded public keys. The
future Mainnet asset, identity, Asset Signer, token accounts, and delegation do
not exist.

### What signs the transaction

Nothing in Goal 9E. Unit tests use no-op signer placeholders. The policy and
builder modules cannot load a key, call RPC, simulate, sign, or submit.

### What can go wrong

- treating an offline builder test as the final compiled message;
- creating the recovery ATA through an unreviewed setup transaction;
- funding before enumerating every active delegate on the final asset;
- giving the executive key to another unrestricted transaction path;
- changing final accounts without rebuilding and re-simulating exact bytes.

### Relevant official documentation

- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Solana checked token CPI](https://solana.com/docs/tokens/advanced/cpi)
- [Metaplex Agent Tools security model](https://www.metaplex.com/docs/smart-contracts/mpl-agent/tools)

## Goal 9F owner-only rescue — 2026-08-25

### In plain English

The owner can use Core Execute directly even if no executive is delegated. The
emergency path therefore does not need the hot executive key or a surviving
Execution Delegate Record: it moves the full bounded USDC or SOL balance to the
isolated recovery address under direct owner control.

### Why we need it

Revoking an executive stops future delegated execution but does not move funds.
A separately tested evacuation shape is required so emergency recovery is not
invented during an incident.

### What exists on-chain

Nothing new. Goal 9F is an offline policy, builder, and accounting contract.

### What signs the transaction

In a future approved rescue, the isolated owner signs and pays the fee while
the Asset Signer PDA signs the inner transfer through Core Execute. Goal 9F
loads neither key and signs nothing.

### What can go wrong

- rescuing less than the finalized full source balance;
- sending to any address other than the isolated recovery wallet/ATA;
- exceeding the fixed `1 USDC` or `0.02 SOL` unit caps;
- assuming the recovery ATA exists;
- using stale balance or blockhash data;
- calling an unrestricted owner or executive transaction path.

### Relevant official documentation

- [Core Execute Asset Signing](https://www.metaplex.com/docs/smart-contracts/core/execute-asset-signing)
- [Solana checked token CPI](https://solana.com/docs/tokens/advanced/cpi)
- [Metaplex Agent Tools security model](https://www.metaplex.com/docs/smart-contracts/mpl-agent/tools)

## Goal 9G Associated Token Account setup — 2026-08-25

### In plain English

USDC is held in a token account, not directly at a wallet address. Before the
future Asset Signer can receive USDC or recovery can work, both deterministic
Associated Token Accounts must exist and have the correct owner/mint state.

### Why we need it

The transfer and rescue instructions intentionally do not create accounts. A
separate exact setup message keeps rent-producing account creation out of the
agent action and makes its cost visible.

### What exists on-chain

Nothing new. The future source ATA is unknown because the Mainnet asset does
not exist. The recovery ATA is derivable but has not been created.

### What signs the transaction

In a future approved setup, the isolated owner pays and signs. Neither the Asset
Signer nor recovery wallet needs to sign ATA creation. Goal 9G signs nothing.

### What can go wrong

- using a non-canonical token account;
- using Token-2022 or another mint instead of legacy Solana USDC;
- silently accepting a partial setup and building a different message;
- failing to check delegate/close authority and initial zero balance;
- treating the ATA setup cap as the total lifecycle cap;
- trusting a helper name without checking its generated instruction bytes.

### Relevant official documentation

- [Solana SPL Token basics](https://solana.com/docs/tokens/basics)
- [Solana payment address verification](https://solana.com/docs/payments/send-payments/verify-address)
- [SPL Associated Token Account program](https://github.com/solana-program/associated-token-account)

## Goal 10C finalized Mainnet owner bootstrap — 2026-08-26

### In plain English

The separate experimental source sent exactly `0.019985 SOL` to the isolated
Mainnet owner. The transfer finalized with a `0.000005001 SOL` fee and was
decoded and balance-checked before any next step.

### Why we need it

The future owner-paid setup, metadata, creation, audit, and rescue steps need a
strictly bounded SOL source. This bootstrap establishes that source without
moving USDC into Wallet Child or giving the lab the external wallet key.

### What exists on-chain

- owner balance: `19,985,000` lamports;
- source balance: `68,708,605` lamports;
- source USDC: unchanged at `1,078,695` base units;
- one finalized legacy transaction with two Compute Budget instructions and
  one exact System transfer;
- all other nine final Wallet Child accounts remain absent.

### What signed the transaction

The connected external Jupiter Wallet signed through the official Send page.
The lab loaded no source key. The isolated owner did not sign the incoming
transfer.

### What can go wrong next

- treating the bootstrap confirmation as permission for a later write;
- topping up beyond the fixed `0.02 SOL` acquisition boundary;
- moving staged USDC before the Asset Signer exists and passes its live audit;
- uploading metadata or creating accounts before exact remaining-budget and
  same-bytes review;
- relying on a merely confirmed result instead of finalized decoded evidence.

### Public receipt

- [Solscan transaction](https://solscan.io/tx/5sB41GfGqTbPjiz4FZKia3TnoicCDTEW81yDCZeW7AoEZSKxTsDriYzjeTcaXjdw2Xx9p3pRgWEZtSRmwvih8sVq)
