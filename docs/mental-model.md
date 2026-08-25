# Wallet Child mental model

Verified against official Metaplex documentation and source on 2026-08-24.
This document explains the current primitive; it does not claim that an AI is a
legal person, independently owns property, or can act without human-controlled
authority.

## The short version

Wallet Child #001 is an MPL Core asset that can be registered as an agent. The
asset has a deterministic Asset Signer PDA: an address that can hold SOL and can
own token accounts, but has no private key. MPL Core can make that PDA sign an
inner instruction through the Core `execute` instruction.

Normally, the current Core asset owner authorizes `execute`. Registering the
asset through the Agent Registry adds an Agent Identity plugin and a separate
identity PDA. The current Agent Tools program also lets the owner create an
execution-delegate record for a separate executive authority. While that record
is valid, the executive can authorize `execute` without the owner signing.

That delegation is broad. It is not an amount limit, recipient allowlist, or
token-specific permission. Any narrow policy in this lab is an off-chain
control around the executive signer, not a restriction enforced by the current
Metaplex delegation record.

## Diagram

```text
OWNER
  │
  │ owns
  ▼
AGENT CORE ASSET
  │
  ├── Agent Identity plugin ── URI ──> registration JSON
  │
  ├── Agent Identity PDA
  │       └── stable on-chain link back to the Core asset
  │
  └── Asset Signer PDA
          └── SOL / token accounts / other PDA-owned authority

OWNER
  │ delegates execution for this asset
  ▼
EXECUTION DELEGATE RECORD
  │ names
  ▼
EXECUTIVE PROFILE + EXECUTIVE AUTHORITY
  │ authorizes
  ▼
MPL CORE EXECUTE
  │ invokes inner instruction with PDA signature
  ▼
AGENT WALLET ACTION
```

## 1. What MPL Core is

MPL Core is Metaplex's Solana program and asset standard for digital assets. A
Core asset uses one main on-chain asset account instead of the mint, metadata,
and token-account combination used by older NFT designs. Core also has a plugin
system that can participate in lifecycle actions such as transfer, update,
burn, and execute.

For this project, Core provides the asset, ownership field, plugin surface,
Asset Signer PDA, and `execute` mechanism. It does not provide an AI model.

## 2. What an MPL Core asset is

A Core asset is an on-chain account with a stable public address. It records
information including its owner, name, metadata URI, and update-authority or
collection relationship. Ownership is state inside the asset account; the
asset is not represented by an SPL token in the owner's associated token
account.

The Core asset is the durable object we call Wallet Child #001.

## 3. What registration changes

Registering a Core asset as an agent currently does two important things:

1. it creates an Agent Identity PDA derived from the Core asset address; and
2. it adds the Core `AgentIdentity` external plugin to the asset, including a
   URI for the agent registration document and an execute lifecycle check.

Registration does not install an AI, fund a wallet, create an executive, grant
a narrow spending allowance, or make the asset autonomous.

The current instruction is named `registerIdentityV1`, but current program
source creates an `AgentIdentityV2` account. Code must inspect the returned
account discriminator instead of assuming that instruction and account version
numbers match.

## 4. What Agent Identity is

"Agent Identity" has two linked on-chain pieces:

- the Agent Identity PDA owned by the Metaplex Agent Identity program; and
- the Agent Identity plugin stored on the Core asset.

The PDA is the canonical registry link. The plugin makes the asset itself
discoverable as an agent and stores the registration URI. Together they bind an
agent registration to one particular Core asset address.

## 5. What the identity PDA stores

Current `AgentIdentityV2` source defines:

- account discriminator;
- PDA bump;
- Core asset public key;
- optional agent-token public key;
- reserved bytes for future use.

The registration URI is stored in the Core asset's Agent Identity plugin, not
in this PDA. The identity PDA does not store the owner, executive, wallet
balance, transaction history, model prompt, or private key.

## 6. What the Asset Signer PDA is

The Asset Signer is a deterministic PDA derived by the MPL Core program from
the Core asset address. The official JavaScript helper is:

```ts
findAssetSignerPda(umi, { asset })
```

The lab must use that helper rather than independently reproducing the seeds.
Because the Core asset address does not change when the asset is transferred,
the derived Asset Signer address also does not change.

## 7. Why it has no private key

A PDA is produced from program-controlled derivation and is off the normal
Ed25519 public-key curve. There is no corresponding private key that a person,
server, or model can export. Consequently, the Asset Signer cannot produce a
normal wallet signature by itself.

"No private key" does not mean "cannot move funds" and does not mean "safe by
default."

## 8. How it can execute transactions

An outer transaction calls MPL Core's `execute` instruction. Core validates the
asset and authority, then invokes the requested inner instruction through CPI.
During that CPI, Core uses `invoke_signed` with the canonical PDA seeds, so the
runtime treats the Asset Signer PDA as a signer for that inner instruction.

A normal fee payer pays the outer transaction fee. The owner or delegated
executive authorizes Core. The Asset Signer signs only inside the
program-mediated CPI path; fee payer and authority need not be the same account.

## 9. What an executive is

An executive is a normal signer/keypair representing an operator for one or
more agents. The Agent Tools program creates an `ExecutiveProfileV1` PDA derived
from the executive authority. Current source stores the executive authority in
that profile.

The executive is not the owner, Agent Identity PDA, Asset Signer PDA, or AI
model. A model may eventually run behind an executive-controlled service, but
those are separate security principals.

## 10. What delegation means

The current owner can create an `ExecutionDelegateRecordV1` for a specific
executive profile and Core asset. The record stores:

- executive profile;
- executive authority;
- agent asset.

When the Core Agent Identity plugin validates an execute request, it can approve
the executive if the supplied record matches the asset and authority. Current
source does not encode amount, mint, recipient, expiry, program allowlist, or
action type in this record.

More than one executive profile can theoretically have a record for the same
asset because the PDA derivation includes both executive profile and asset.
Therefore, "the delegate" must not be treated as a guaranteed singleton.

## 11. What the owner can revoke

The current Core asset owner can revoke a specific execution-delegate record.
The executive authority named in that record can also revoke it. Revocation
closes that record and prevents it from authorizing future execute calls; the
closed account's rent is sent to a supplied destination.

Revoking one record does not prove that no other executive record exists for
the asset. A safe status command will need to discover or otherwise account for
all records, not only the one the local artifact remembers.

## 12. What revocation does not undo

Revocation does not:

- reverse earlier transfers;
- recover spent or stolen assets;
- cancel approvals or authority changes created earlier;
- close token accounts;
- revoke another executive's record;
- rotate the executive key;
- remove the Agent Identity;
- stop the current owner from using Core `execute`;
- make an already submitted transaction disappear.

Revocation is a future authorization change, not rollback.

## 13. What happens when Core ownership changes

The Core asset's owner field changes. The asset address, identity PDA, Agent
Identity plugin, Asset Signer PDA, and funds held at that PDA-derived wallet
remain associated with the same asset address. The previous owner loses the
normal owner-authorized execute path; the new owner gains it.

Critical current-source finding: an Agent Tools execution-delegate record is a
separate account, and the Core Agent Identity plugin's transfer validation
currently abstains. Its execute check matches the delegate record's asset and
executive authority but does not compare the record to the current owner.
Therefore an existing executive appears able to remain authorized after an
ownership transfer until its record is explicitly revoked.

This must be proven on Devnet before the asset is ever transferred with value.
Until then, the safety rule is: **revoke and verify every executive before
transferring the Core asset**.

## 14. Where state belongs

| State | Where it belongs |
|---|---|
| Stable agent anchor | Core asset address |
| Canonical registration link | Agent Identity PDA |
| Registration URI | Core Agent Identity plugin |
| Optional agent token link | Agent Identity V2 PDA |
| Current asset ownership | Core asset account |
| Metadata/update authority | Core asset or collection relationship |
| Operator identity | Executive key and Executive Profile PDA |
| Operator-to-agent authorization | Execution Delegate Record PDA |
| SOL | Asset Signer PDA address |
| SPL assets | Token accounts whose authority/owner is the Asset Signer PDA |
| AI prompt, model, policy configuration | Off-chain application state |
| Economic history | Transaction/indexer data or a separately designed receipt system |

## 15. Dangerous assumptions

1. **"The AI owns the wallet."** A program-mediated authority path controls it.
2. **"No private key means no one can drain it."** Authorized execute can move
   funds or change authorities.
3. **"Delegation is an allowance."** Current delegation is broad authorization.
4. **"Our policy is enforced on-chain."** It is not, unless a later custom
   on-chain constraint is introduced.
5. **"Transfer revokes executives."** Current source indicates the opposite.
6. **"Revoke restores the previous state."** It only blocks future use of one
   record.
7. **"One local record means one total delegate."** Other records may exist.
8. **"An allowlisted program is always safe."** A program may expose many
   instructions or perform CPI.
9. **"Simulation guarantees execution."** Chain state can change, and
   simulation is not authorization.
10. **"The metadata URI is immutable and truthful."** Its content and hosting
    need independent integrity and availability decisions.
11. **"Wallet history equals reputation."** Interpretation requires indexing,
    attribution, and resistance to spoofed transfers.
12. **"Devnet proves Mainnet deployment and economics."** It proves behavior
    only against the exact programs and cluster actually tested.

## Current source snapshot

- MPL Agent source commit:
  [`326b76a`](https://github.com/metaplex-foundation/mpl-agent/commit/326b76a46aa3b0dd6400f7a318992d537470c57c)
- MPL Core source commit:
  [`2181404`](https://github.com/metaplex-foundation/mpl-core/commit/2181404f90c7dd27ab95fcb2472483c4a347ae8c)
- [MPL Core asset overview](https://www.metaplex.com/docs/smart-contracts/core/what-is-an-asset)
- [MPL Core Execute and Asset Signer](https://developers.metaplex.com/smart-contracts/core/execute-asset-signing)
- [Current Asset Signer helper source](https://github.com/metaplex-foundation/mpl-core/blob/2181404f90c7dd27ab95fcb2472483c4a347ae8c/clients/js/src/generated/accounts/assetSigner.ts)
- [Current Agent Identity plugin validation](https://github.com/metaplex-foundation/mpl-core/blob/2181404f90c7dd27ab95fcb2472483c4a347ae8c/programs/mpl-core/src/plugins/external/agent_identity.rs)
- [Current AgentIdentityV2 state](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-identity/src/state/agent_identity_v2.rs)
- [Current delegation record state](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-tools/src/state/execution_delegate_record_v1.rs)
- [Current revoke processor](https://github.com/metaplex-foundation/mpl-agent/blob/326b76a46aa3b0dd6400f7a318992d537470c57c/programs/mpl-agent-tools/src/processor/revoke_execution_v1.rs)
