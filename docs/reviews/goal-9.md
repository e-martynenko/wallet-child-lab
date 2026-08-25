# Goal 9 review — Mainnet readiness

Status: **PASS — readiness audit complete; Mainnet verdict NO-GO**

## Built

- two fresh, isolated, mode-`0600`, gitignored, unfunded readiness wallets;
- public-only wallet artifact with explicit `funded: false`;
- separate HTTPS-only Mainnet read configuration;
- read-only genesis-hash verification;
- Circle-address plus live-account verification of the Solana Mainnet USDC
  mint, legacy Token Program ownership, initialization, and six decimals;
- live executable-account check for the Metaplex Agent Tools program;
- simultaneous treasury, SOL-reserve, and acquisition-cost caps;
- explicit checklist, emergency procedure, blockers, and `NO-GO` verdict.

## Evidence

- readiness owner:
  `6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385`;
- readiness executive:
  `EJQcuD9FtJ33c2wA7GM6HzvmJJJbPsYnmH5ZjTDdhbjF`;
- both key files: mode `0600`; finalized Mainnet balances: `0` lamports;
- Mainnet genesis:
  `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`;
- Circle and on-chain USDC mint:
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;
- live mint: initialized, six decimals, legacy SPL Token Program owner;
- live Agent Tools program:
  `TLREGni9ZEyGC3vnPZtqUh95xQ8oPqJSvNjvB7FGK8S`, executable;
- Mainnet transactions, signatures, token accounts, and funding: `0`.

## Tests

- `pnpm run typecheck`: PASS;
- `pnpm test`: 11 files, 96 tests, PASS;
- Goal 9 rejects Devnet genesis, wrong mint owner, wrong decimals,
  uninitialized mint, and non-executable Agent Tools program;
- local wallet creation/reload, mode `0600`, address separation, public artifact,
  hard caps, and read-only source isolation: PASS;
- `pnpm run readiness:mainnet`: PASS for read-only facts and `NO-GO` verdict;
- `git diff --check`: PASS;
- `pnpm audit --prod`: same known moderate transitive `uuid@8.3.2` advisory,
  no new finding.

## Cost

- real money: `$0`;
- Mainnet SOL: `0`;
- Mainnet USDC: `0`;
- Mainnet transactions: `0`;
- future absolute funding boundary: at most `1 USDC`, at most `0.02 SOL`, and
  combined acquisition cost at most `$10`, all enforced simultaneously.

## Security findings

1. Current code is not capable of the intended `$1 USDC` experiment. Its fixed
   transaction path supports native Devnet SOL only.
2. The official Metaplex security documentation confirms that execution
   authority is broad and that transfer does not clear delegate records.
3. The authoritative Circle mint matches the live Mainnet account, but a safe
   mint constant alone does not make an SPL transfer path safe.
4. Wallet separation is ready, but funding route, durable metadata, delegate
   enumeration, USDC policy/builder, and rescue path are not.
5. The read-only verifier imports no key, signer identity, transaction builder,
   simulation, or send capability.

## Unexpected findings

- current official Metaplex docs now state the broad execution threat and
  cross-owner delegate persistence explicitly, matching the lab's Goal 5
  Devnet observation;
- one additional batched public-RPC balance/token-account read returned `429`;
  bounded single balance reads through the compatible Solana endpoint then
  confirmed both readiness addresses at zero lamports;
- `tsx` again required its local IPC socket outside the file sandbox; the
  commands then passed without changing their application behavior.

## Remaining uncertainty

1. The exact USDC ATA rent and full Mainnet lifecycle cost have not been
   simulated from the final transaction bytes.
2. Complete delegation enumeration remains unsolved.
3. Metadata permanence and integrity are not finalized.
4. A fixed emergency evacuation path has not been Devnet-tested.
5. A dedicated production RPC and funding route are not selected.
6. The moderate transitive dependency advisory remains open.

## Recommendation

**STOP / NO-GO before Goal 10.** Close every blocker in
`docs/mainnet-checklist.md` through a separately approved Devnet remediation
goal. Do not fund the readiness wallets and do not submit any Mainnet write.
