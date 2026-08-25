# Goal 3 review — Devnet identity birth

Status: **PASS**

## Built

- isolated, gitignored Devnet owner key;
- one MPL Core Collection and one Core Asset;
- one registered Agent Identity V2;
- canonical Asset Signer PDA derivation;
- simulation before every submitted program transaction;
- finalized confirmation, read-back invariants, and safe resume after a
  partially completed run;
- public artifact containing addresses and transaction signatures only.

## On-chain result

- owner: `7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c`;
- Collection: `csuvrVdZYpgVT5dVH9LYfdzQuWzXBYwL1xWDkcenThX`;
- Core Asset: `66aw2vNMJHk4xPjc6VAE9CPPahkEaj7EfpQFFuQuvTd2`;
- Agent Identity: `2n9Xko2hRYp7yRxGJCn72RQXdDfXwdpfTMC3ea2zbh57`;
- Asset Signer PDA: `5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD`;
- Asset Signer balance: `0` lamports, intentionally deferred to Goal 4;
- Collection `numMinted = 1` and `currentSize = 1`;
- Agent token: `null`, as expected at birth.

The complete public record is in
[`artifacts/wallet-child-001.devnet.json`](../../artifacts/wallet-child-001.devnet.json).

## Verification

- `pnpm run typecheck`: PASS;
- `pnpm test`: 5 files, 22 tests, PASS;
- all two faucet and three program transaction signatures independently read
  as `finalized` with `err: null`;
- Collection and Asset accounts are finalized and owned by the canonical MPL
  Core program;
- Agent Identity is finalized and owned by the canonical Agent Identity
  program;
- final SDK read-back matched owner, Collection relationship, names, metadata
  URIs, Agent Identity link, PDA derivation, and zero Asset Signer balance;
- no Mainnet endpoint or transaction path was added.

## Unexpected findings and fixes

1. The Solana Foundation faucet credited 1.0 Devnet SOL through two 0.5 SOL
   airdrops. Both public signatures are retained instead of hiding the extra
   credit.
2. The public RPC initially returned a blockhash that another backend did not
   recognize. Transaction construction now uses a `finalized` blockhash.
3. Immediately after Collection confirmation, another RPC backend had not yet
   observed its account and MPL Core simulation panicked while reading empty
   data. Nothing was submitted for the failed Asset attempt. All dependent
   reads and confirmations now use `finalized` commitment.
4. Because the Collection was already on-chain, the birth command gained a
   narrow resume path. It validates the existing artifact and recorded
   transaction before continuing and refuses unrecorded on-chain accounts.

## Remaining uncertainty

1. The metadata is hosted by a public GitHub Gist, which is adequate for this
   lab but not permanent decentralized storage.
2. The canonical Asset Signer exists only as a PDA and remains unfunded; its
   actual signing behavior belongs to Goal 4.
3. No executive, delegation, transfer, or ownership lifecycle has been tested.
4. The known moderate transitive `uuid@8.3.2` advisory remains; the affected
   buffer APIs are not used by this project.

## Recommendation

**PASS Goal 3. STOP before Goal 4.** Funding the Asset Signer is a new Devnet
write and requires explicit user approval after this review.
