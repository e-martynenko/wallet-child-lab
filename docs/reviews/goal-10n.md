# Goal 10N review — post-birth activation preflight

Status: **PASS — read-only baseline closed; STOP before any new write**

## Built

- one fail-closed finalized Mainnet review for the already-born Wallet Child;
- repeated Core Asset owner, Agent Identity linkage, metadata URI, and dangerous
  Core delegate checks;
- repeated full and filtered Agent Tools scans requiring zero active execution
  delegates;
- exact checks that the Asset Signer/recovery USDC ATAs, Executive Profile, and
  Execution Delegate Record are all still absent;
- fresh exact-message quotes for the external `1 USDC` funding transfer and all
  six existing internal lifecycle messages;
- exact remaining rent and conservative owner-balance accounting;
- no wallet key load, signature, simulation, submission, or onchain write.

## Evidence

At finalized slot floor `442,804,933`:

- owner balance: `13,977,592` lamports, unchanged from Goal 10L;
- active execution delegates: `0`;
- both child USDC ATAs: absent;
- Executive Profile and Execution Delegate Record: absent;
- exact external funding amount: `1,000,000` USDC base units;
- external funding fee: `5,000` lamports;
- actual SOL acquisition allocation including both external fees:
  `19,995,001` lamports, leaving `4,999` lamports unallocated inside the
  `20,000,000` cap;
- two ATA rents: `2 × 2,039,280` lamports;
- Executive Profile rent: `1,169,280` lamports;
- Execution Delegate Record rent: `1,614,720` lamports;
- total activation rent: `6,862,560` lamports;
- all six internal message fees: `40,000` lamports;
- conservative owner debit: `6,902,560` lamports;
- conservative owner balance after that debit: `7,075,032` lamports.

Public artifact:
[`wallet-child-001.goal10n.post-birth-activation-review.json`](../../artifacts/wallet-child-001.goal10n.post-birth-activation-review.json).

## Tests

- exact rent/fee arithmetic and positive remaining owner balance: PASS;
- owner, source, empty-account, and zero-delegate baseline: PASS;
- owner drift, insufficient funding, existing ATA/Profile/Record, or rent drift:
  DENY;
- key/sign/simulate/send capability scan: PASS;
- public artifact credential and reusable-byte scan: PASS;
- full suite: `43` files, `325` tests, PASS;
- TypeScript: PASS;
- diff check: PASS.

## Security findings

1. The Metaplex execution delegate is still broad and contains no onchain
   amount/destination cap. The offchain fixed builder and isolated Executive
   key are the spending firewall.
2. The delegate must never be activated before its ATA/Profile/Record write is
   separately reviewed, and the Wallet Child must remain unfunded until that
   finalized read-back passes.
3. The experimental source holds more than the experiment requires. Only the
   exact fixed `1 USDC` message with the `5,000` lamport fee is in scope; the
   lab never loads that source key.
4. The production dependency audit remains at five transitive Irys findings:
   two high, two moderate, and one low. Goal 10N adds no dependency and does
   not invoke Irys.

## Unexpected findings

- no onchain state drift was found after the public Metaplex listing appeared;
- current activation rent and message fees remain exactly equal to the earlier
  reviewed constants.

## Remaining uncertainty

1. ATA creation, Executive registration, and delegation have not been built
   into a fresh signed same-bytes write review.
2. The `1 USDC` funding transaction is not authorized or executed.
3. State-dependent simulations for the funded `0.1 USDC` action, revoke, and
   rescue cannot pass until the preceding accounts and funding exist.
4. A single dedicated RPC can omit data; the audit is closed-world only for
   the currently documented Agent Tools layouts.

## Recommendation

**STOP before all ATA, permission, delegation, funding, and USDC writes.** The
next smallest experiment is a separate exact write review for only the two
canonical USDC ATAs, Executive Profile, and Execution Delegate Record. It must
publish its own action-time phrase and still exclude USDC funding.
