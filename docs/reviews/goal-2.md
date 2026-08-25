# Goal 2 review — safe project skeleton

Status: **PASS**

## Built

- pinned pnpm/TypeScript package;
- strict, namespaced `WALLET_CHILD_*` configuration;
- no automatic `.env` loading;
- canonical Devnet genesis-hash verification;
- Umi factory with MPL Core, Agent Identity, and Agent Tools programs;
- read-only network-check CLI;
- unit tests for configuration, network refusal, RPC credential redaction, and
  program registration.

## Evidence

- [`package.json`](../../package.json)
- [`pnpm-lock.yaml`](../../pnpm-lock.yaml)
- [`src/config/env.ts`](../../src/config/env.ts)
- [`src/chain/network.ts`](../../src/chain/network.ts)
- [`src/chain/umi.ts`](../../src/chain/umi.ts)
- [`tests/config.test.ts`](../../tests/config.test.ts)
- [`tests/network.test.ts`](../../tests/network.test.ts)
- [`tests/umi.test.ts`](../../tests/umi.test.ts)

## Tests

- `pnpm run typecheck`: PASS;
- `pnpm test`: 3 files, 11 tests, PASS;
- trailing-whitespace scan across source, tests, configuration, and docs: PASS;
- write-surface search found no `sendAndConfirm`, `sendTransaction`, `airdrop`,
  keypair identity, or secret-key construction in `src/` or `tests/`;
- live Devnet check: accepted canonical genesis hash
  `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`;
- live negative check against Mainnet RPC: refused with non-zero exit;
- dependency tree contains one Core version, `1.8.0`, aligned with Agent
  Registry `0.2.6`.

No transaction was constructed, signed, simulated, or submitted.

## Security findings

1. Full RPC URLs may contain credentials. The config is deliberately plain and
   easy to inspect; application output and errors use only `rpcOrigin`. Code
   must never log or serialize the complete config object.
2. Raw network errors are not attached as `error.cause`, preventing accidental
   credential disclosure from fetch diagnostics.
3. Unknown `WALLET_CHILD_*` variables fail closed, reducing typo-driven network
   mistakes.
4. Genesis hash, not hostname, is the authoritative cluster gate.
5. The Umi object is not cryptographically read-only. Goal 2 attaches no
   Wallet Child key and provides no write command; later signing still requires
   a separate boundary.
6. Production audit reports one moderate transitive `uuid@8.3.2` advisory. The
   affected UUID buffer APIs are not used by Wallet Child. No unsupported
   major-version override was applied; the finding must be rechecked before
   Goal 3.

## Unexpected findings

- The installed runtime is Node `22.23.2`, while an existing unrelated `.nvmrc`
  names Node `26.7.0`. The package therefore declares the tested lower bound
  `>=22` and does not overwrite `.nvmrc`.
- `tsx` requires a local IPC socket that the execution sandbox initially
  blocked. The final live check succeeded with the necessary execution
  permission; this is tooling behavior, not Solana write access.
- pnpm reported an optional WebSocket native peer mismatch and ignored optional
  native build scripts. Typecheck, tests, program registration, and live RPC
  verification still passed.

## Remaining uncertainty

1. Goal 3 needs a deliberate owner-key storage design; no key exists yet.
2. Agent Identity and Core program accounts must be checked live on Devnet
   immediately before writing.
3. Registration metadata hosting and its exact schema must be selected.
4. The transitive dependency advisory needs an upstream or compatible fix.
5. Current published Core `1.8.0` must remain pinned unless an explicit upgrade
   test approves a newer version.

## Recommendation

**GO** to Goal 3 only after user approval. Goal 3 may create the collection,
Core asset, and Agent Identity on Devnet, derive the Asset Signer PDA, and read
everything back. It must stop before funding the PDA or creating an executive.
