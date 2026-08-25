# Goal 1 review — current mental model

Status: **PASS**

## Built

- fifteen-part mental model;
- dated Metaplex source and npm package snapshot;
- concept notes in the required plain-English/security format;
- threat model, invariants, network gate, revocation procedure, and non-goals;
- minimal proposed Goal 2 dependency set and directory shape.

## Evidence

- [`docs/mental-model.md`](../mental-model.md)
- [`docs/metaplex-notes.md`](../metaplex-notes.md)
- [`docs/security-model.md`](../security-model.md)
- MPL Agent commit `326b76a46aa3b0dd6400f7a318992d537470c57c`
- MPL Core commit `2181404f90c7dd27ab95fcb2472483c4a347ae8c`

## Tests

- all fifteen requested mental-model questions have explicit sections;
- package versions were read from npm without installing them;
- Devnet and Mainnet genesis hashes were read and distinguished;
- Markdown files have no trailing-whitespace errors;
- no transaction-send method, keypair generation, dependency installation, or
  chain write was executed.

## Security findings

1. Current delegation is broad and does not contain spend limits, recipient
   limits, token limits, program limits, or expiry.
2. Current source indicates an existing execution delegate may survive a Core
   asset ownership transfer.
3. Multiple delegate records may exist for one asset because derivation
   includes executive profile and asset.
4. Revocation closes one record and does not undo earlier effects.
5. A local policy firewall is effective only if it is the sole path to the
   executive signer.
6. The Agent Registry package's exact Core dependency is behind the latest Core
   release; compatibility must be proven instead of assumed.

## Unexpected findings

- `registerIdentityV1` currently creates an `AgentIdentityV2` account.
- The current dedicated Agent Identity plugin differs from older high-level
  descriptions that refer to generic AppData.
- npm reports Registry `0.2.6`, while the inspected source commit's package file
  reports `0.2.5`.
- The hosted Metaplex mint API is convenient but hides part of the learning
  path; direct Core creation plus identity registration is currently preferred.

## Remaining uncertainty

1. Exact Agent Registry and Agent Tools deployments must be read on Devnet
   immediately before the first write.
2. Delegate persistence across ownership transfer must be tested on Devnet.
3. A reliable method for enumerating every delegate record needs design.
4. The registration document's normative schema/version needs confirmation at
   Goal 3 time.
5. Published Core `1.8.0` APIs must be checked before using examples from newer
   Core source.

## Recommendation

**GO** to Goal 2 only after user approval. Goal 2 should create a
non-transactional TypeScript skeleton and prove configuration/network gates. It
must stop before any asset, collection, identity, profile, or delegation write.
