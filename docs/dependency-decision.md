# Production dependency advisory decisions

## Goal 10E — current expanded graph

Review date: **2026-08-26**

Decision: **BOUNDED TO THE EXACT NATIVE-SOL PATH; RECHECK BEFORE KEY LOAD**

Installing the latest official pinned Irys packages expanded the current
production audit to five findings: two high, two moderate, and one low. The
audit is not clean. The exact findings and runtime-path dispositions are in
[`reviews/goal-10e.md`](reviews/goal-10e.md) and the Goal 10E artifact.

The acceptance is narrow: no SPL adapter, Ethereum provider, ECDSA signer,
UUID buffer API, unsupported override, or approved native build script. Exact
registry integrity, package-source hashes, and runtime import reachability must
all be rechecked before the isolated owner key is loaded. Any drift returns the
metadata funding action to `NO_GO`.

## Goal 9D — historical pre-Irys baseline

Review date: **2026-08-25**

Decision: **ACCEPTED WITH NARROW BOUNDS; RECHECK BEFORE MAINNET**

This section records the dependency graph before Goal 10E installed Irys. It
was a documented residual-risk decision, not a claim that the production audit
was clean. At that time `pnpm audit --prod` exited non-zero with one moderate
advisory.

## Exact finding

The only production advisory reported in that historical graph was
[`GHSA-w5hq-g745-h8pq`](https://github.com/advisories/GHSA-w5hq-g745-h8pq):
`uuid` does not bounds-check caller-supplied output buffers in the `v3()`,
`v5()`, and `v6()` API methods. The project currently receives the affected
`uuid@8.3.2` through this exact path:

```text
@metaplex-foundation/umi-bundle-defaults@1.5.1
  -> @solana/web3.js@1.98.4
    -> jayson@4.3.0
      -> uuid@8.3.2
```

The current patched `uuid` line begins at `11.1.1`, while `jayson@4.3.0`
declares `uuid: ^8.3.2`. Current releases on 2026-08-25 are still
`umi-bundle-defaults@1.5.1`, `web3.js@1.98.4`, and `jayson@4.3.0`; therefore no
supported patch or minor upgrade closes this path.

## Reachability review

- Wallet Child does not directly depend on or import `uuid` or `jayson`.
- The installed `jayson@4.3.0` source imports only `require('uuid').v4` in its
  request helpers.
- Its automatic request-ID path calls `v4()` with no output buffer or offset.
- The advisory explicitly excludes `v4()` and concerns only `v3()`, `v5()`,
  and `v6()` when a caller supplies a buffer.
- Wallet Child exposes no UUID method, buffer, or offset to model or user input.

The vulnerable package is present, so the finding is real. The reviewed Wallet
Child path does not reach the affected methods.

## Rejected workaround

No `pnpm.overrides` entry forces `uuid@11`, `12`, `13`, or `14`. That would
cross the dependency's declared major-version range and would replace a known,
reviewed runtime path with an unsupported combination. A green audit produced
that way would not be stronger evidence.

## Acceptance boundary

This decision is valid only while all of these statements remain true:

1. the dependency path and versions above are unchanged;
2. Wallet Child has no direct `uuid` or `jayson` dependency or import;
3. the runtime path uses only `uuid.v4()` without a caller-supplied buffer;
4. the fixed Mainnet loss caps remain at most `1 USDC`, `0.02 SOL`, and `$10`
   combined acquisition cost;
5. `pnpm audit --prod`, `pnpm why uuid --prod`, and the reachability inspection
   are repeated immediately before any Mainnet signing review.

If any condition changes, this acceptance expires and the Mainnet decision
returns to `NO-GO` until the new graph is reviewed. A compatible upstream fix
should replace this acceptance as soon as one is available.

## Evidence commands

```sh
pnpm audit --prod
pnpm why uuid --prod
pnpm view @metaplex-foundation/umi-bundle-defaults version dependencies peerDependencies
pnpm view @solana/web3.js version dependencies
pnpm view jayson version dependencies
```

For the historical pre-Irys lockfile, the first command reported exactly one
moderate advisory. The current Goal 10E graph must instead match the expanded
five-finding decision above.
