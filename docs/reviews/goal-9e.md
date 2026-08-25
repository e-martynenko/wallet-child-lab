# Goal 9E review — fixed offline Mainnet USDC contract

Status: **PASS — offline contract complete; final Mainnet message remains PARTIAL**

## Built

- one third isolated recovery wallet, distinct from owner, executive, and every
  recorded Devnet principal;
- one public artifact containing only the recovery address and fixed limits;
- one strict Mainnet-only USDC intent for exactly `100,000` base units =
  `0.1 USDC`;
- one fixed destination: the isolated recovery wallet;
- exact official USDC mint, six decimals, legacy Token Program, canonical
  source/destination ATA checks, instruction bytes, metas, and writable/signer
  assertions;
- exactly one `TransferChecked` CPI inside exactly one Core Execute;
- no RPC, real key loading, simulation, signing, or send path in the policy and
  builder modules.

## Evidence

- recovery address:
  `ABZePapHbYaTg7GU4LGQNcYmfURvue5uVrrf4FUa4x3j`;
- recovery key:
  `.wallet-child/mainnet-readiness/recovery.json`, mode `0600`, gitignored;
- public artifact:
  [`wallet-child-001.goal9e.mainnet-policy.json`](../../artifacts/wallet-child-001.goal9e.mainnet-policy.json);
- policy:
  [`policy.ts`](../../src/goal9e/policy.ts);
- builder:
  [`mainnet-usdc-transfer.ts`](../../src/actions/mainnet-usdc-transfer.ts);
- fixed data bytes for `100,000` base units:
  `12 a0 86 01 00 00 00 00 00 06`;
- idempotent recovery rerun: same address, `REUSED`, no artifact drift.

## Tests

- Goal 9E focused tests: 15, PASS;
- exact policy allow case and modified amount/network/token/destination/input
  denials: PASS;
- wrong mint/program/decimals/cap and reused-account denials: PASS;
- canonical ATA checks and exact inner/outer message shape: PASS;
- tampered bytes and wrong Asset Signer denial: PASS;
- key file mode, public artifact isolation, and idempotent key reuse: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 16 files, 147 tests, PASS.

## Security findings

1. The action amount is exact, not merely below a broad ceiling.
2. The recovery destination is an isolated Wallet Child key; no normal wallet
   address is involved.
3. The builder accepts no raw instruction, program, account list, decimals,
   mint, or arbitrary amount from the intent.
4. These are local controls. They do not constrain another code path that is
   given the executive key.
5. No final Mainnet asset exists, so the final Asset Signer, source ATA,
   delegation record, compiled message, blockhash, and simulation do not exist.

## Unexpected findings

- the current official Metaplex Agent Tools documentation continues to describe
  execution authority as arbitrary; our local exact-message assertions remain
  essential rather than optional;
- the recovery wallet can serve as the first harmless fixed recipient and the
  emergency destination, reducing the number of trusted external addresses.

## Remaining uncertainty

1. The recovery USDC ATA does not exist on Mainnet and its creation path/rent
   must be included in the final setup simulation.
2. The final Mainnet asset/collection/Asset Signer/delegate record are unknown.
3. The same signed bytes intended for submission have not been simulated.
4. Owner-direct USDC and SOL evacuation builders are not yet implemented.
5. Funding route, dedicated RPC, durable metadata publication, and exact
   Mainnet approval remain unresolved.

## Recommendation

**PASS Goal 9E and continue remediation.** Treat the fixed intent and offline
builder as complete, but keep the combined Mainnet message requirements
`PARTIAL` until the final accounts exist, setup and action bytes are simulated,
and the signed bytes match the reviewed message.
