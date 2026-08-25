# Goal 9D review — dependency advisory decision

Status: **PASS — decision complete; one bounded residual advisory remains**

## Built

- an explicit residual-risk decision for `GHSA-w5hq-g745-h8pq`;
- exact dependency-path and installed-source reachability evidence;
- a regression test that expires the decision when its assumptions drift;
- an explicit rejection of an unsupported cross-major dependency override;
- a mandatory recheck gate immediately before any Mainnet signing review.

## Evidence

- decision:
  [`dependency-decision.md`](../dependency-decision.md);
- exact path:
  `umi-bundle-defaults@1.5.1 -> web3.js@1.98.4 -> jayson@4.3.0 -> uuid@8.3.2`;
- `jayson` imports only `uuid.v4` in all three installed request-helper files;
- its automatic request ID calls `v4()` without a buffer or offset;
- Wallet Child has no direct `uuid` or `jayson` dependency or source import;
- current upstream package metadata offers no compatible patched release.

## Tests

- exact lockfile dependency path: guarded;
- installed `jayson` UUID API use: guarded;
- absence of direct Wallet Child imports: guarded;
- full typecheck and test results: recorded after this review is implemented.

## Security findings

1. `pnpm audit --prod` is not clean: it reports exactly one moderate advisory
   and exits with status `1`.
2. The advisory's affected `v3/v5/v6` buffer APIs are not reachable in the
   reviewed path, which uses `v4()` without a buffer.
3. Forcing a patched major through `pnpm.overrides` would violate `jayson`'s
   declared range and could create a less-reviewed runtime combination.
4. The acceptance is narrow and self-expiring; it does not authorize Mainnet.

## Unexpected findings

- the latest `jayson@4.3.0` still declares `uuid: ^8.3.2` even though current
  patched UUID releases begin at `11.1.1`;
- the separate UUID copy used by `rpc-websockets` is already `14.0.2` and is not
  the source of the audit finding.

## Remaining uncertainty

1. Upstream packages may change after this dated review.
2. A single audit database may add or revise advisories later.
3. Other Goal 10 blockers remain independent of this decision.

## Recommendation

**PASS Goal 9D and continue remediation.** Mark the dependency decision closed
only under its documented bounds. Re-run the audit, dependency graph, and
reachability guard immediately before any Mainnet signing review; any drift
returns this item to `NO-GO`.
