# Goal 10E review — Irys SDK integration and exact action gate

Status: **PASS — dependencies and read-only action contract complete; STOP awaiting exact funding confirmation**

## Built

- exact production pins for the current official `@irys/upload@0.0.15` and
  `@irys/upload-solana@0.1.8` packages;
- complete lockfile SHA-256, registry integrity, and reviewed package-source
  hash verification;
- a fail-closed contract over Mainnet default, finalized default, native SOL
  System transfer, priority-fee disable option, and `uploadFile` availability;
- a runtime import-reachability probe for the newly reported dependency risks;
- one read-only live action review for exactly `3,208` lamports of Irys
  funding with a `5,000` lamport fee cap;
- one exact confirmation phrase covering funding and Irys credit registration,
  but explicitly excluding metadata upload.

## Evidence

- public artifact:
  [`wallet-child-001.goal10e.irys-action-review.json`](../../artifacts/wallet-child-001.goal10e.irys-action-review.json);
- exact registry integrities are locked in `pnpm-lock.yaml`;
- owner balance at finalized slot `441,816,360`: `19,985,000` lamports;
- Irys owner balance: `0` lamports;
- exact funding: `3,208` lamports;
- exact fee cap: `5,000` lamports;
- maximum owner outflow: `8,208` lamports;
- live funding-message digest:
  `f8ddc253f8881b82d875d06c33fcb0340d2d64c3925d26c0f69a4f556ec9a778`.

## Tests

- exact package versions, registry integrity, and source hashes: PASS;
- native-SOL source contract and excluded SPL adapter: PASS;
- runtime import probe: patched `ws@8.21.3` loaded; vulnerable `ws@8.18.0`
  and `bigint-buffer` not loaded: PASS;
- exact funding phrase and upload exclusion: PASS;
- amount, fee, Irys balance, and destination drift rejection: PASS;
- lab source contains no Irys runtime import, wallet initialization, key read,
  signature, simulation, funding, upload, or send path: PASS.

## Security findings

1. The official packages add 204 production packages. This is materially more
   supply-chain surface than Goal 10D and is recorded, not hidden.
2. `pnpm audit --prod` reports five findings: two high, two moderate, and one
   low. The audit is not clean.
3. High `bigint-buffer` is under the Irys SPL-token adapter. The reviewed
   native-SOL entrypoint imports only `solana.ts`/`token.ts`; runtime probing
   confirms that `@solana/spl-token` and `bigint-buffer` are not loaded. Any SPL
   adapter use invalidates this acceptance.
4. Vulnerable `ws@8.18.0` is present through unused Ethereum provider support,
   but the exact native-SOL import does not load it. It loads patched
   `ws@8.21.3` through Solana Web3 instead.
5. `elliptic@6.6.1` is loaded by the multi-chain bundles export, but the exact
   Solana signer uses `@noble/ed25519`. Ethereum/ECDSA signers are forbidden.
6. `uuid@8.3.2` is loaded through Jayson, whose exact installed source calls
   only `uuid.v4()`; the advisory concerns `v3`/`v5`/`v6` with caller buffers.
7. Native build scripts for `bigint-buffer`, `keccak`, and `secp256k1` were not
   approved. Goal 10E neither needs nor executes them.
8. No unsupported dependency override was added to create a misleading clean
   audit. All exact-path guards must rerun before the owner key is loaded.

## Unexpected findings

- installing the latest official Irys packages expanded the audit from one
  moderate finding to five findings, including two high findings;
- the package entrypoint loads unused multi-chain code, including vulnerable
  `elliptic`, even though the Solana signer itself does not use ECDSA;
- the package manager reported one optional native-addon peer mismatch and
  three ignored native build scripts. None was changed or approved.

## Remaining uncertainty

1. No signer-capable SDK instance has been constructed and no owner key has
   been loaded, so the exact action path still needs a fresh guarded preflight.
2. The funding message must be rebuilt with a fresh blockhash, signed, and the
   same signed bytes simulated before submission.
3. Irys credit registration must be verified after finalized funding.
4. Metadata upload, receipt verification from two origins, and its separate
   confirmation remain undone.
5. Core/plugin rent and the final `0.1 USDC` action remain blocked.

## Recommendation

**PASS Goal 10E and STOP.** Goal 10F is authorized only after the user sends the
exact funding phrase published in the artifact. Goal 10F must rerun the audit,
source/reachability guard, live quote, owner/Irys balances, and same-signed-bytes
simulation before one bounded funding submission. The phrase does not approve
metadata upload or any treasury action.

## Current primary sources

- [Irys Node SDK setup](https://docs.irys.xyz/build/d/sdk/setup)
- [Irys metadata upload guide](https://docs.irys.xyz/build/d/guides/uploading-nfts)
- [Irys JavaScript SDK](https://github.com/Irys-xyz/js-sdk)
- [`bigint-buffer` advisory](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg)
- [`ws` memory-exhaustion advisory](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)
- [`uuid` buffer-bounds advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [`elliptic` ECDSA advisory](https://github.com/advisories/GHSA-848j-6mx2-7j84)
