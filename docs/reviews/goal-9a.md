# Goal 9A review — USDC-shaped Devnet safety test

Status: **PASS — Devnet objective complete; Mainnet verdict remains NO-GO**

## Built

- one isolated, explicitly labelled six-decimal Devnet TEST mint;
- three canonical associated token accounts for the Asset Signer, fixed test
  receiver, and original owner recovery path;
- a strict fail-closed TEST-token policy that explicitly rejects both official
  Circle USDC mint addresses;
- an exact legacy Token Program `TransferChecked` builder with asserted bytes,
  accounts, signer flags, writable flags, and outer Core Execute shape;
- a resumable simulate-before-send lifecycle for setup, delegation, bounded
  transfer, revoke, and owner rescue;
- finalized balance, fee, authority, supply, ownership, and delegation checks;
- an atomic public-only artifact and repeat-safe completed-state validation.

## Evidence

- TEST mint: `Axe7U6PFbGFFkzzPxEgDUbSDXaYuqBMc3npimMWoV8uv`;
- source ATA: `FHibzozTbQVcGkzTE2j8VTV2cUmVw4DrLoiEft8Mmiwp`;
- receiver ATA: `4FvttsuRs21vJ4KN9MpK7ZdsmArVPZCuUye21YUqJCXQ`;
- owner recovery ATA: `F6Jaj1fapXFih6j1PZgkxKxf3SXAPwGRYCPDQenvMALG`;
- fixed supply: `2,000,000` base units; decimals: `6`;
- bounded transfer signature:
  `58ZGjcBJbBXvUvDSqzxNSceXribxxc5ov64jLjZGEbSAVEvBbc6jeGV3kvY1i7ZLRjBndpMULKL3qiFy8pYDHo8L`;
- revoke signature:
  `2v3F4VioXimXbCkveig9ASKNkTcujFwzj9GFjBxq8CeU27UP78ZRsiZx5vGingvXSuU9yWjDBAAyLUDRkCngpbEZ`;
- owner rescue signature:
  `2GJjMEvzxoz2gWgJbJoSzQYcRnNsf6K7bMRWpZ11YPs1muvmrm26U8TwANxJJ3QVyN5hiTK3ZrJBd6nZDq3RfZNH`;
- final balances: source `0`, receiver `100,000`, owner recovery
  `1,900,000` base units;
- final execution delegation: revoked; identical executive simulation:
  `NoApprovals`;
- mint authority: none; freeze authority: none; token delegates: none; close
  authorities: none;
- Core asset owner unchanged; Asset Signer SOL unchanged at `9,900,000`
  lamports;
- immediate rerun: `already complete; no transaction submitted`;
- public artifact:
  [`wallet-child-001.goal9a.devnet.json`](../../artifacts/wallet-child-001.goal9a.devnet.json).

## Tests

- `pnpm run typecheck`: PASS;
- `pnpm test`: 12 files, 116 tests, PASS before the live run;
- exact confirmation gate, strict policy, official-USDC denial, amount and
  destination denial, injected-field denial, canonical ATA enforcement,
  instruction tamper detection, direct-owner rescue shape, fee ceilings,
  accounting, and public artifact round-trip: PASS;
- every live transaction was simulated before submission and then read at
  finalized commitment;
- a second full command performed live-state validation and submitted zero
  transactions.

## Cost

- real money: `$0`;
- real USDC: `0`;
- Mainnet SOL and transactions: `0`;
- TEST supply: no monetary value;
- net Devnet owner spend: `7,721,880` lamports (`0.00772188` Devnet SOL),
  primarily rent for one mint and three token accounts plus transaction fees;
- Asset Signer spend in Goal 9A: `0` lamports.

## Security findings

1. The delegated transfer uses one exact `TransferChecked`; no caller can
   supply the mint, token accounts, program, decimals, destination, or raw
   instructions.
2. Both official USDC addresses are deny-listed in Goal 9A, preventing a TEST
   command from being repurposed for real USDC.
3. Revocation blocked future executive execution but did not move the remaining
   tokens; the separate direct-owner rescue path was therefore necessary.
4. Mint authority was permanently revoked in the fixed-supply transaction and
   no freeze authority was configured.
5. Limits remain off-chain and protect only this controlled signing path;
   Metaplex delegation itself is still broad.

## Unexpected findings

- closing the execution delegate record returned `1,609,720` rent lamports to
  the owner between the action and rescue snapshots; this is why total owner
  balance increased between those two evidence points even though both bounded
  write transactions paid positive fees;
- the first CLI attempt included pnpm's literal `--` separator and was rejected
  by the exact confirmation gate before configuration or network writes; the
  corrected one-argument command performed the approved lifecycle;
- `tsx` again required its temporary IPC socket outside the file sandbox; this
  did not change application behavior.

## Remaining uncertainty

1. No official USDC token was touched, and no Mainnet USDC policy, account set,
   compiled message, simulation, or submission path exists.
2. Complete execution-delegate enumeration remains unsolved.
3. Durable metadata, isolated Mainnet funding route, dedicated Mainnet RPC, and
   fixed SOL evacuation remain unresolved.
4. The tested recovery destination is the original isolated Devnet owner; a
   separately reviewed Mainnet recovery wallet is not implemented.
5. The moderate transitive `uuid@8.3.2` dependency advisory remains open.

## Recommendation

**PASS Goal 9A and STOP before Goal 10.** Keep the Goal 9 Mainnet verdict at
`NO-GO`. Any next remediation goal requires separate approval; Mainnet writes
remain locked behind both resolved blockers and the exact phrase
`ENABLE MAINNET EXPERIMENT`.
