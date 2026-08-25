# Goal 9B review — complete execution-delegate discovery on Devnet

Status: **PASS — Devnet discovery objective complete; Mainnet verdict remains NO-GO**

## Built

- a keyless, read-only Devnet delegation-audit command;
- one finalized full scan of all Agent Tools program-owned accounts;
- a closed-world classifier for the current official 40-byte profile and
  104-byte delegate layouts;
- fail-closed handling for unknown layout, owner, executable flag, duplicate,
  padding, discriminator, and size;
- local asset matching using the documented `agentAsset` offset `72`;
- an independent discriminator/size/asset `memcmp` query and exact address-set
  comparison;
- PDA, bump, executive-profile, and authority validation for every active
  delegate record returned by the full scan;
- a strict public-only audit artifact with an explicit RPC trust limitation.

## Evidence

- verified Agent Tools program:
  `TLREGni9ZEyGC3vnPZtqUh95xQ8oPqJSvNjvB7FGK8S`;
- finalized slot floor: `487701675`; finalized slot after: `487701677`;
- program-owned accounts scanned: `253`;
- valid Executive Profile V1 accounts: `120`;
- valid Execution Delegate Record V1 accounts: `133`;
- all 133 record PDA/bump/profile/authority relationships: PASS;
- full-scan and independent asset-filtered query sets: identical;
- Wallet Child #001 active records: `0`;
- known revoked record
  `4nzrCQWJNXRdyd7To3vtzMQioNkDrn4RduW4g3QcqFaH`: absent;
- Core asset owner unchanged:
  `7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c`;
- transaction built, signed, simulated, or submitted: `NO`;
- artifact:
  [`wallet-child-001.goal9b.delegation-audit.devnet.json`](../../artifacts/wallet-child-001.goal9b.delegation-audit.devnet.json).

## Tests

- `pnpm run typecheck`: PASS;
- `pnpm test`: 13 files, 121 tests, PASS before the live audit;
- valid layout classification, unknown-layout rejection, duplicate rejection,
  owner rejection, PDA/profile validation, tampered-authority rejection, query
  set mismatch, and public artifact round-trip: PASS;
- static source isolation found no key loader, signing identity, transaction
  builder, simulation, send method, Mainnet configuration, or USDC address.

## Cost

- real money: `$0`;
- Devnet and Mainnet SOL spent: `0`;
- transactions: `0`;
- only finalized RPC reads and a local public artifact write were performed.

## Security findings

1. Current delegation discovery does not require a pre-known executive list;
   full program account data exposes the linked asset at a fixed offset.
2. Scanning the entire program and rejecting unknown layouts avoids silently
   missing a newly introduced account version.
3. Comparing an independently filtered query to local full-scan selection
   catches filter/offset mistakes.
4. PDA and profile validation prevents an arbitrary 104-byte account from being
   accepted as a valid delegate solely because its asset bytes match.
5. The result describes active Agent Tools records only. Revoked/closed history
   and durable downstream approvals or protocol state require separate audits.

## Unexpected findings

- Devnet currently contained 133 active delegation records linked to 120
  profiles, which exercised the validator against real non-lab records rather
  than only the Wallet Child zero-result case;
- the official public Devnet RPC supported the unfiltered program scan without
  rate limiting during this audit.

## Remaining uncertainty

1. A single RPC provider can omit data; its response is not a cryptographic
   completeness proof.
2. The command is intentionally Devnet-only. It cannot yet audit a future
   Mainnet asset.
3. A dedicated Mainnet RPC and independent-provider comparison are not selected.
4. Delegate discovery does not inspect SPL approvals, changed authorities,
   escrows, or other durable effects left by earlier execution.
5. Other Goal 9 blockers remain: durable metadata, funding route, final Mainnet
   USDC message simulation, fixed SOL evacuation, and dependency decision.

## Recommendation

**PASS Goal 9B and STOP before the next goal.** Mark the Devnet enumeration
method proven, but keep Mainnet enumeration `PARTIAL` until the same audit runs
against the final asset through a reviewed dedicated RPC immediately before
funding. Goal 10 remains `NO-GO`.
