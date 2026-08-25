# Goal 9F review — owner-only Mainnet rescue contract

Status: **PASS — offline rescue complete; final-address simulation remains PARTIAL**

## Built

- one strict owner-only rescue policy for the future Mainnet asset;
- USDC evacuation through checked legacy Token Program transfer inside Core
  Execute, bounded at `1,000,000` base units;
- SOL evacuation through a System transfer inside Core Execute, bounded at
  `20,000,000` lamports;
- one fixed destination for both assets: the isolated Goal 9E recovery wallet;
- exact inner and outer instruction bytes, account metas, signer flags, and
  writable flags;
- complete-evacuation accounting that requires source balance `0`, exact
  recovery gain, and owner fee spend at most `100,000` lamports;
- no executive, execution delegate, RPC, key loading, simulation, signing, or
  send path.

## Evidence

- policy:
  [`policy.ts`](../../src/goal9f/policy.ts);
- builders and accounting:
  [`mainnet-rescue.ts`](../../src/actions/mainnet-rescue.ts);
- recovery:
  `ABZePapHbYaTg7GU4LGQNcYmfURvue5uVrrf4FUa4x3j`;
- focused tests: 8, PASS.

## Tests

- exact fixed constants and distinct principals: PASS;
- malformed network/mint/decimals/program/caps/accounts: DENY;
- USDC zero/excess/non-canonical/wrong-owner cases: DENY;
- SOL zero/excess/wrong-Asset-Signer/malformed-policy cases: DENY;
- exact owner-only USDC and SOL Core Execute shapes: PASS;
- full evacuation and bounded-fee reconciliation: PASS;
- residual balance, unexplained recovery delta, and excess fee: DENY;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 17 files, 155 tests, PASS.

## Security findings

1. Rescue does not depend on the executive or a live delegate record.
2. The amount is operationally dynamic because rescue must match the finalized
   live balance, but it cannot exceed the experiment's fixed unit caps.
3. The destination, mint, decimals, programs, accounts, and instruction shape
   are fixed independently of the amount.
4. A successful rescue must empty the selected source; a partial move is a
   reconciliation failure, not success.
5. The recovery key remains a sensitive signer even though it is normally only
   a destination; it must remain mode `0600`, offline, and unused elsewhere.

## Unexpected findings

- the owner-direct Core Execute path needs no Execution Delegate Record at all,
  which keeps emergency recovery independent of executive state;
- one recovery wallet can receive both SOL and USDC, but its USDC ATA still has
  to exist before rescue.

## Remaining uncertainty

1. Final asset, collection, Asset Signer, and canonical source ATA are unknown.
2. The recovery USDC ATA does not exist and its safe creation is not proven.
3. Exact live balances, recent blockhash, fees, and same-bytes simulations do
   not exist.
4. No Mainnet rescue has been signed or submitted.
5. Dedicated RPC, durable metadata, funding route, and exact Mainnet approval
   remain unresolved.

## Recommendation

**PASS Goal 9F and continue remediation.** The offline emergency contract is
complete. Keep operational rescue `PARTIAL` until final accounts exist and both
paths are independently simulated with the exact messages intended for use.
