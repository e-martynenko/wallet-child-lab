# Goal 9I review — Mainnet-capable keyless delegate audit

Status: **PASS — implementation complete; final asset audit remains BLOCKED**

## Built

- a Mainnet version of Goal 9B's complete Agent Tools program scan;
- mandatory Solana Mainnet genesis verification;
- mandatory dedicated HTTPS RPC and explicit refusal of public Solana cluster
  endpoints;
- final asset and isolated expected-owner inputs;
- closed-world Agent Tools account layout classification;
- every delegate record's PDA, bump, executive profile, and authority check;
- independent discriminator/size/asset-filtered query with exact set comparison;
- finalized Core asset owner check and a hard zero-active-delegate funding gate;
- RPC credential redaction to origin in normal output;
- no key loading, transaction builder, simulation, signing, or send path.

## Evidence

- implementation:
  [`mainnet-delegates.ts`](../../src/goal9i/mainnet-delegates.ts);
- CLI:
  [`audit-delegates-mainnet.ts`](../../src/cli/audit-delegates-mainnet.ts);
- command:
  `pnpm run delegates:audit:mainnet`;
- focused tests: 9, PASS.

## Tests

- dedicated credential-bearing HTTPS URL accepted and redacted: PASS;
- public Mainnet/Devnet and non-HTTPS endpoints: DENY;
- missing/invalid final asset: DENY;
- zero delegates: PASS; any active delegate: funding DENY;
- Mainnet genesis pin: PASS;
- source isolation: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 20 files, 177 tests, PASS.

## Security findings

1. This command cannot use the public Solana RPC by construction.
2. The full scan still trusts one provider's response; a second independent
   provider is preferable before funding.
3. The pre-funding verdict is deliberately zero delegates. A later approved
   delegation must be separately verified as exactly the one derived record.
4. The final asset owner must still be the isolated readiness owner.
5. RPC URLs may contain credentials and must never be copied into artifacts,
   logs, reviews, or prompts; only origin is reported.

## Unexpected findings

- no new scanning algorithm was required: the same documented account sizes,
  discriminators, PDA relations, and asset offset apply on both clusters;
- the only responsible live test is impossible before the final Mainnet asset
  exists, so code completion and live evidence must remain visibly separate.

## Remaining uncertainty

1. No final Mainnet agent asset exists.
2. No dedicated RPC has been selected or configured.
3. The command has therefore made no Mainnet RPC request and produced no live
   Goal 9I artifact.
4. A post-delegation exact-one-record audit remains to be specified after the
   final asset and executive profile exist.
5. Durable metadata, funding route, final simulations, acquisition quotes, and
   exact Mainnet approval remain unresolved.

## Recommendation

**PASS Goal 9I implementation and STOP before the live audit.** Keep the
Mainnet delegate checklist `PARTIAL` until a final asset exists and this command
returns zero through a reviewed dedicated RPC immediately before funding.
