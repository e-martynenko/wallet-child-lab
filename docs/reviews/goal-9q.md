# Goal 9Q review — fixed Mainnet rents and phased bootstrap

Status: **PASS for fixed facts; full lifecycle budget remains NO-GO**

## Built

- installed-SDK size checks for Agent Identity (`104` bytes), Executive Profile
  (`40`), and Execution Delegate Record (`104`);
- fixed legacy SPL token-account size (`165` bytes) for both required USDC ATAs;
- finalized Mainnet rent quotes for those four account classes;
- one hard `9,000,000` lamport ceiling for the known fixed rents;
- a strict phase order that keeps USDC outside Wallet Child until the live
  Asset audit and action/revoke/rescue simulations pass;
- explicit null-equivalent blockers instead of guessed Core/plugin and fee
  values.

## Evidence

- verifier and phase contract:
  [`fixed-rent-plan.ts`](../../src/goal9q/fixed-rent-plan.ts);
- public artifact:
  [`wallet-child-001.goal9q.fixed-rent-plan.json`](../../artifacts/wallet-child-001.goal9q.fixed-rent-plan.json);
- dedicated Helius finalized slot: `441,646,119`;
- Agent Identity rent: `1,614,720` lamports;
- Executive Profile rent: `1,169,280` lamports;
- Execution Delegate Record rent: `1,614,720` lamports;
- each USDC ATA rent: `2,039,280` lamports; count: `2`;
- fixed known rent total: `8,477,280` lamports;
- remaining from the exact `19,990,000` owner bootstrap transfer before unknown
  costs: `11,512,720` lamports.

## Tests

- exact installed fixed sizes: PASS;
- finalized quote acceptance and exact arithmetic: PASS;
- zero, excessive, malformed, or over-cap quote: DENY;
- USDC funding before audit/simulations: DENY;
- mutation-capability source scan: PASS;
- public artifact preserves missing fields and `NO_GO`: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 28 files, 226 tests, PASS.

## Security findings

1. Delegate-record rent is counted as possible loss even though successful
   revoke normally returns it. The budget does not assume recovery succeeds.
2. `11,512,720` remaining lamports is not a spending allowance. Core Asset
   creation/plugin top-up, metadata funding fee, internal fees, and emergency
   space must all fit before it can be treated as sufficient.
3. USDC funding is a late phase. It cannot precede durable metadata, Asset and
   Identity creation, a live delegate scan, ATA/delegate setup, and simulation.
4. Phase one remains locked behind the exact Mainnet phrase plus action-time
   confirmation in the external funding wallet.

## Unexpected findings

- read-only Devnet cross-check found the existing Identity and Profile use the
  same `104`/`40` byte layouts and rent values quoted on Mainnet;
- the existing Devnet Core Asset is `435` bytes and holds `5,564,640` lamports,
  but it has a long Gist URI, Collection relationship, and live identity plugin.
  Reusing that value for the smaller standalone Mainnet Asset would be false
  precision, so Goal 9Q does not do it.

## Remaining uncertainty

1. Durable URI length is unknown, so the exact Core Asset allocation and the
   Identity-plugin realloc/top-up are unknown.
2. Metadata publication still needs its funding transaction fee and signer.
3. Exact create/register/setup/action/revoke/rescue fees and simulations remain.
4. The acquisition total must be reconciled again immediately before approval.
5. The exact phrase `ENABLE MAINNET EXPERIMENT` has not been provided.

## Recommendation

**PASS Goal 9Q but retain NO-GO.** Compile and quote all URI-independent
unsigned internal messages next. Stop before the source-to-owner transfer.
