# Goal 9D — production dependency advisory decision

Review date: **2026-08-25**

Decision: **ACCEPTED WITH NARROW BOUNDS; RECHECK BEFORE MAINNET**

This is a documented residual-risk decision, not a claim that the production
dependency audit is clean. `pnpm audit --prod` still exits non-zero with one
moderate advisory, and Goal 10 remains locked by other blockers and the missing
exact approval phrase.

## Exact finding

The only reported production advisory is
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

The first command is expected to report exactly one moderate advisory and exit
with status `1`; that expected result must never be relabelled as a clean audit.
