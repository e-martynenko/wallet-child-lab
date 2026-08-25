# Goal 9H review — aggregate Mainnet lifecycle budget gate

Status: **PASS — aggregate contract complete; final simulated values unavailable**

## Built

- one pure fail-closed budget schema for the complete bounded Mainnet lifecycle;
- exactly `1,000,000` maximum USDC base units;
- at most `20,000,000` total acquired SOL lamports across metadata publication,
  identity/collection, executive/delegation, ATA setup, Asset Signer reserve,
  action, revoke, and two emergency-fee allowances;
- at most `USD 10.00` combined acquisition cost for all USDC and SOL;
- per-slice `5,000,000` lamport ATA setup and `100,000` lamport action/revoke/
  rescue fee ceilings;
- exact remaining-unit and remaining-cost evidence;
- no price feed, RPC, key, builder, simulation, signing, or send path.

## Evidence

- implementation:
  [`budget.ts`](../../src/goal9h/budget.ts);
- focused tests: 6, PASS;
- exact-boundary example: `20,000,000` lamports total, `$4.00` acquisition
  cost, `$6.00` remaining cost room.

## Tests

- exact total-SOL boundary: PASS;
- one lamport over total boundary: DENY;
- one cent over combined dollar boundary: DENY;
- inflated USDC, ATA slice, or individual fee: DENY;
- negative units or fractional-cent quote: DENY;
- source isolation: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 19 files, 168 tests, PASS.

## Security findings

1. `0.02 SOL` is now a maximum for all SOL acquired for the experiment, not an
   additional treasury reserve on top of unbounded setup/rent/fees.
2. The Asset Signer reserve is the remainder after mandatory lifecycle costs;
   it must shrink if the other simulated slices need more SOL.
3. The budget contains four separate bounded fee allowances so the emergency
   path cannot rely on an unbudgeted top-up.
4. A quote is manual input, not an oracle claim. It must be obtained from the
   selected isolated funding route immediately before acquisition.

## Unexpected findings

- treating `0.02 SOL` as reserve alone would omit identity, rent, and emergency
  fees from the maximum possible loss; the gate deliberately tightens it to a
  total-acquisition ceiling;
- if the complete lifecycle cannot fit under that ceiling, the correct result
  is a smaller Asset Signer reserve or STOP, not a top-up.

## Remaining uncertainty

1. Exact storage price, rent, and fees require an upload quote, final account
   addresses, and same-bytes Mainnet simulations.
2. Current SOL and USDC acquisition quotes require the selected funding route.
3. No final populated budget artifact exists yet.
4. Dedicated RPC, durable metadata, final asset/delegate audit, funding route,
   simulations, and exact Mainnet approval remain unresolved.

## Recommendation

**PASS Goal 9H and continue remediation.** Keep hard-limit execution `PARTIAL`
until final simulation values and live acquisition quotes populate this exact
schema without exceeding any boundary.
