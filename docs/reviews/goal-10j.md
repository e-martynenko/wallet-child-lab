# Goal 10J review — read-only Mainnet birth preflight

Status: **PASS — live preflight reached the write-review boundary**

## Built

- one keyless command that first repeats Goal 10I durability verification;
- exact derivation checks for the frozen Core Asset, Agent Identity, Asset
  Signer, Profile, Delegate Record, and both USDC ATAs;
- finalized Mainnet reads for all three required Metaplex programs, all seven
  future accounts, the isolated owner balance, and fixed account rents;
- an installed-package compatibility check that follows the current
  `mpl-agent-registry@0.2.6` dependency graph instead of mixing in newer
  standalone Core or Toolbox releases.

The preflight contains no key loader, transaction builder, signer, simulation,
or submission path.

## Evidence

At finalized slot `442,643,656`:

- Core, Agent Identity, and Agent Tools are executable Mainnet programs;
- all seven future Wallet Child accounts are absent;
- the isolated owner balance is exactly `19,976,792` lamports, matching Goal
  10F;
- known fixed rent remains `8,477,280` lamports;
- the exact metadata URI, `351` bytes, and SHA-256 remain unchanged;
- metadata is `IRYS_DURABLE_ACCEPTED` at the signed Irys assurance boundary;
- supplemental independent Arweave evidence remains `PENDING` and is not
  represented as finalized.

Public evidence is in
[`wallet-child-001.goal10j.mainnet-birth-preflight.json`](../../artifacts/wallet-child-001.goal10j.mainnet-birth-preflight.json).

## Package decision

Registry inspection on 2026-08-27 found standalone `mpl-core@1.10.0` and
`mpl-toolbox@0.11.4`, but the latest Agent Registry package is still `0.2.6`
and declares Core `1.8.0` plus Toolbox `^0.10.0`. The lab therefore keeps the
coherent Agent Registry graph (`1.8.0` / `0.10.0`) for this identity path. A
piecemeal update would create an unreviewed mixed SDK graph.

## Security review

1. **PASS:** the command reads only the dedicated HTTPS RPC and public
   Irys/Arweave endpoints.
2. **PASS:** no primary wallet, funding-source wallet, owner key, or Core Asset
   key is loaded.
3. **PASS:** a pre-existing account, balance drift, wrong cluster, missing
   program, package drift, or metadata drift fails closed.
4. **PASS:** durability acceptance changes the verdict only to
   `STOP_READY_FOR_MAINNET_BIRTH_WRITE_REVIEW`; it never authorizes a write.
5. **OPEN:** Core Asset rent, Agent Identity plugin top-up, exact birth message
   fees, and same-bytes simulations do not yet exist.
6. **OPEN:** Metaplex execution delegation is broad on-chain authority. The
   `0.1 USDC` cap remains a lab policy and approval invariant, not a protocol
   limit; live delegation must not exist before its separate audit and revoke
   path are ready.

## Goal review

```text
GOAL REVIEW

Status: PASS
Built: keyless Mainnet birth preflight
Evidence: finalized programs/accounts/balance/rent plus package graph
Tests: 40 files / 300 tests pass; typecheck, diff, and credential scan pass
Security findings: no write path; broad future delegate remains a material risk
Unexpected findings: standalone Core/Toolbox are newer, but latest Agent Registry pins the retained versions
Remaining uncertainty: all signer-capable birth costs/messages/simulations
Recommendation: proceed only to a fresh write-specific review
```

Do not load either identity key and do not construct or submit the birth
transaction until a fresh write-specific review passes and an exact action-time
confirmation is received.
