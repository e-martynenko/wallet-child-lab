# Goal 9P review — final standalone policy contract

Status: **PASS — final action/setup/rescue paths match standalone topology**

## Built

- final canonical Executive Profile and Execution Delegate Record PDA
  derivation for the frozen executive and Core Asset;
- one final-address contract joining owner, executive, recovery, Core Asset,
  Asset Signer, both USDC ATAs, Executive Profile, and Delegate Record;
- exact final two-ATA setup, delegated `0.1 USDC` action, owner-only USDC
  rescue, and owner-only SOL rescue builder checks;
- standalone-only account types: `collection` must be `null`;
- exact Core optional-account sentinel assertion in every Execute path;
- no RPC, key load, signing, simulation, or submission path.

## Evidence

- final contract: [`final-contract.ts`](../../src/goal9p/final-contract.ts);
- public artifact:
  [`wallet-child-001.goal9p.final-contract.json`](../../artifacts/wallet-child-001.goal9p.final-contract.json);
- Executive Profile: `3Uy4XhPJLAdFRyFLAfJM7ruNc3Td5Ld1258Gx5z2WYXo`;
- Execution Delegate Record:
  `Fr2yQyG7gEQYjL6Sr8sYXrS2n21bfjod5rKQDdo7bgcm`;
- both remained absent at Mainnet finalized slot `441,645,228`;
- focused tests: 6, PASS.

## Tests

- canonical final Profile and Record PDAs: PASS;
- final two-ATA setup build: PASS;
- final delegated action build: PASS;
- both final owner-rescue builds: PASS;
- standalone sentinel and no Collection account: PASS;
- mutation-capability source scan: PASS;
- public artifact secret scan: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 27 files, 220 tests, PASS.

## Security findings

1. The installed Core client does not remove the optional Collection account
   position. For a standalone Asset it writes the Core program ID there as a
   read-only, non-signer sentinel. Tests now assert that exact behavior.
2. Requiring `collection: null` in Mainnet account inputs prevents silently
   reintroducing the discarded Collection topology.
3. Every builder uses noop public-key signers in this review. Final transaction
   bytes are still unavailable and nothing was signed.
4. The owner rescue does not depend on an Executive Delegate Record and remains
   a separate recovery path.

## Unexpected findings

- Goal 9N's architecture decision exposed a real compatibility gap: the older
  Goal 9E/9F builders still required a Collection even though the final Asset
  would not have one. Goal 9P closes that gap before any Mainnet funding.

## Remaining uncertainty

1. Durable metadata URI and exact create/register message bytes are unavailable.
2. Final rents, all transaction fees, and same-bytes simulations are incomplete.
3. The live Asset/Identity/Delegate audit cannot run until those accounts exist.
4. The exact phrase `ENABLE MAINNET EXPERIMENT` has not been provided.

## Recommendation

**PASS Goal 9P and continue read-only remediation.** Quote fixed account rents
and freeze the phased bootstrap dependency order next. Keep every account
absent and unfunded.
