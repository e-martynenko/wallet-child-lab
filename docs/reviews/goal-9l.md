# Goal 9L review — isolated Mainnet funding route

Status: **PASS — route boundary fixed; Wallet Child remains unfunded**

## Built

- one fixed external source:
  `8W7sQKSRuYAdev3qcZCm9rrs4DDKbnEgD4fA8kvENvxt`, designated by the operator
  as the experimental wallet;
- one fixed isolated destination owner:
  `6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385`;
- canonical legacy-token USDC ATA for the source;
- strict finalized snapshot validation for source SOL, USDC mint, token owner,
  initialization, delegate, close authority, and all unfunded Wallet Child
  principals;
- one pure bootstrap intent validator permitting a positive amount no greater
  than `20,000,000` lamports and zero USDC to the owner only;
- a blocked second phase that keeps exactly `1,000,000` USDC base units outside
  Wallet Child until the final Asset Signer exists and passes its live audit;
- no RPC, wallet key, builder, simulation, signing, or submission capability.

## Evidence

- policy: [`funding-route.ts`](../../src/goal9l/funding-route.ts);
- public snapshot:
  [`wallet-child-001.goal9l.funding-route.json`](../../artifacts/wallet-child-001.goal9l.funding-route.json);
- dedicated Helius source finalized slot: `441,631,349`; Wallet Child
  read-back finalized slot: `441,632,634`;
- source: `88,698,606` lamports (`0.088698606 SOL`) and `1,078,695`
  USDC base units (`1.078695 USDC`);
- Wallet Child owner, executive, and recovery SOL balances: `0`; their USDC
  account counts: `0`;
- focused tests: 9, PASS.

## Tests

- canonical source ATA derivation: PASS;
- exact post-swap snapshot and fixed route: PASS;
- insufficient SOL or USDC: DENY;
- delegated, closable, wrong-mint, or wrong-owner source account: DENY;
- any pre-funded Wallet Child principal: DENY;
- stale Wallet Child read-back relative to source snapshot: DENY;
- excess amount or changed source/destination: DENY;
- mutation-capability source scan: PASS;
- public artifact boundary and secret-name scan: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 23 files, 196 tests, PASS.

## Security findings

1. The source holds more SOL than the Wallet Child cap. Those assets remain
   outside the experiment; the bootstrap intent can move no more than
   `0.02 SOL` and cannot move USDC.
2. The lab never loads the source wallet key. A future transfer would be signed
   in the external wallet and requires action-time user confirmation.
3. Owner is the only bootstrap destination. Executive and recovery are
   forbidden, and USDC remains staged until its final Asset Signer destination
   is derived and audited.
4. Public Solana history makes the source and every future transfer linkable.
   Code cannot prove that an upstream funding wallet is unrelated.
5. This route contract is not a transaction and does not satisfy the exact
   Mainnet message, fee, simulation, or approval gates.

## Unexpected findings

- the executed Jupiter swap produced `1.078695 USDC`, slightly more than the
  earlier UI quote; only the fixed `1 USDC` may cross into Wallet Child;
- the USDC ATA rent reduced the external source SOL balance, but the remaining
  balance still covers the `0.02 SOL` ceiling.

## Remaining uncertainty

1. The exact SOL amount below the ceiling still depends on final rent and
   same-bytes simulation evidence.
2. The source-to-owner ATA creation and transfer fee is not yet quoted.
3. No final Mainnet asset, live delegate scan, compiled message, or simulation
   exists.
4. Metadata has not been uploaded or bound to an on-chain asset.
5. The exact approval phrase `ENABLE MAINNET EXPERIMENT` has not been given.

## Recommendation

**PASS Goal 9L and continue read-only/offline remediation.** Keep Wallet Child
unfunded. Next, select the exact bootstrap SOL amount, then compile and quote
that unsigned SOL-only funding message without loading a key, signing,
simulating a signed transaction, or submitting it.
