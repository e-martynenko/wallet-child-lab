# Goal 9C review — metadata contract and integrity freeze

Status: **PASS — offline candidate complete; durable publication remains PARTIAL**

## Built

- one strict, chain-neutral registration-v1 metadata candidate;
- explicit inactive and no-x402 status;
- empty service, registration, supported-trust, and image fields;
- deterministic field order, two-space JSON, UTF-8/LF, and trailing newline;
- SHA-256 plus exact byte-length integrity manifest;
- an offline fail-closed validator and CLI;
- explicit publication and on-chain status fields that cannot be confused with
  a durable deployment.

## Evidence

- candidate:
  [`wallet-child-001.mainnet-candidate.json`](../../metadata/wallet-child-001.mainnet-candidate.json);
- manifest:
  [`wallet-child-001.mainnet-candidate.integrity.json`](../../metadata/wallet-child-001.mainnet-candidate.integrity.json);
- type:
  `https://eips.ethereum.org/EIPS/eip-8004#registration-v1`;
- exact byte length: `351`;
- SHA-256:
  `7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`;
- `active: false`; `x402Support: false`;
- services, registrations, supported trust: `0`;
- publication: `NOT_PUBLISHED`; durable URI: `null`;
- on-chain URI update and transactions: `NO`.

## Tests

- `pnpm run typecheck`: PASS;
- `pnpm test`: 14 files, 129 tests, PASS before final documentation;
- exact candidate validation, canonical byte comparison, hash and length check,
  unsupported active/x402/service/trust/registration rejection, unknown-field
  rejection, whitespace drift, and digest mismatch: PASS;
- `pnpm run metadata:check`: PASS;
- independent system `shasum -a 256` and `wc -c`: same digest and 351 bytes;
- static isolation: no fetch, network client, key loader, signing identity,
  transaction builder, simulation, or send path.

## Cost

- real money: `$0`;
- SOL and USDC: `0`;
- chain transactions: `0`;
- durable-storage upload: not performed.

## Security findings

1. Metadata is an externally consumed claim surface; unsupported capabilities
   are denied rather than described optimistically.
2. `active: false` prevents the candidate from claiming an operating public
   service before one exists.
3. `x402Support: false` prevents wallet experiments from being mistaken for a
   production payment endpoint.
4. SHA-256 detects content changes, while canonical-byte enforcement also
   detects formatting or key-order drift.
5. A local hash provides integrity evidence but not availability, permanence,
   or an on-chain binding.

## Unexpected findings

- current official Metaplex documentation now describes the registration-v1
  fields more explicitly than the early non-normative MIP example used at Goal
  3;
- MPL Core offers an irreversible `ImmutableMetadata` plugin, but locking the
  URI cannot compensate for non-durable or incorrectly reviewed content.

## Remaining uncertainty

1. No permanent Arweave or pinned-IPFS URI has been selected or uploaded.
2. Retrieval through multiple gateways and returned-byte hash verification have
   not been performed.
3. The future Mainnet asset does not exist, so no on-chain URI can be bound.
4. Whether to add Core `ImmutableMetadata` must be decided only after the final
   URI is independently verified; the action is irreversible.
5. Other Mainnet blockers remain: final asset/RPC delegation audit, isolated
   funding route, exact USDC message simulation, SOL evacuation, dedicated RPC,
   and dependency decision.

## Recommendation

**PASS Goal 9C and STOP before publication.** Treat the metadata contract and
integrity bytes as frozen, but keep the combined “finalized and durable”
Mainnet checklist item `PARTIAL` until permanent publication, retrieval, hash
verification, and the on-chain immutability decision are completed under a
separate approval.
