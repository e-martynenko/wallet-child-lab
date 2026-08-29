# Goal 10K review — keyless Mainnet birth write review

Status: **PASS — exact atomic birth is ready for action-time confirmation**

## Built

- one standalone Core Asset create instruction and one Agent Identity register
  instruction in the same atomic legacy transaction;
- exact fixed owner, Core Asset, Agent Identity, metadata URI, programs, and
  signer set;
- a fresh fee quote and `sigVerify: false` Mainnet simulation using zero
  signatures only;
- exact caps for transaction size, rent, fee, and total owner debit.

## Live evidence

At finalized/simulation slot `442,646,200`:

- transaction size: `566` bytes;
- instructions: `2`;
- required signers: isolated owner and frozen Core Asset only;
- fee: `10,000` lamports;
- Core Asset rent: `4,374,480` lamports;
- Agent Identity rent: `1,614,720` lamports;
- total rent: `5,989,200` lamports;
- simulated total owner debit including fee: `5,999,200` lamports;
- compute units: `44,039`;
- simulation: PASS.

The simulation created post-state accounts owned by the exact MPL Core and MPL
Agent Identity programs. The owner debit reconciled exactly. No collection,
funding, ATA, executive, delegation, or USDC instruction was present.

Public evidence is in
[`wallet-child-001.goal10k.mainnet-birth-write-review.json`](../../artifacts/wallet-child-001.goal10k.mainnet-birth-write-review.json).

## Security review

1. No key file was read and both required signatures were 64 zero bytes.
2. Wrong cluster, stale slot, fee drift, rent drift, account-owner drift,
   metadata drift, occupied future accounts, or a non-`CONFIRMED` Irys status
   fails closed.
3. The current message hash is intentionally marked ephemeral because a fresh
   blockhash is mandatory at execution time.
4. Execution must sign, simulate with signature verification, and submit the
   exact same serialized transaction; rebuilding after simulation is forbidden.
5. The five known Irys transitive audit findings remain unchanged. This goal
   adds no dependency.

## Goal review

```text
GOAL REVIEW

Status: PASS
Built: exact keyless one-transaction Mainnet birth review
Evidence: exact fee/rents/debit, two-instruction simulation, fixed post-state owners
Tests: 41 files / 308 tests pass; typecheck, diff, and credential scan pass
Security findings: no key/write path; action-time signer execution still gated
Unexpected findings: Core Asset + Agent Identity fit atomically in 566 bytes
Remaining uncertainty: fresh signed same-bytes simulation and finalized read-back
Recommendation: require the exact Goal 10K action-time phrase and stop
```

Goal 10K does not authorize a signature or Mainnet write.
