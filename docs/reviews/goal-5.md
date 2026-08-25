# Goal 5 review — executive and ownership lifecycle

Status: **PASS**

## Built

- isolated, gitignored Executive and next-owner key files with mode `0600`;
- one registered `ExecutiveProfileV1`;
- deterministic `ExecutionDelegateRecordV1` derivation and full field checks;
- delegate, verify, harmless Execute simulation, revoke, and verify-denial flow;
- controlled ownership transfer with an active delegate and return transfer;
- resumable transaction artifact and idempotent lifecycle command;
- live status that distinguishes a registered Executive Profile from an active
  execution delegation.

## Public addresses

- owner: `7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c`;
- temporary next owner: `B96kUFzEvVzmW9DKfg3VDV9ZagXXjZ9rc3vyZeMk5svy`;
- executive authority: `ET7sHJiBdS5VgXfQvgzenS9U1iPAa5b3dUZKotCDW2dn`;
- Executive Profile: `5JCE3kBRz6U9hGWdEjAoPKrieucfgrnZ9n66Fz3R2Ymq`;
- Execution Delegate Record PDA:
  `4nzrCQWJNXRdyd7To3vtzMQioNkDrn4RduW4g3QcqFaH`;
- Core Asset: `66aw2vNMJHk4xPjc6VAE9CPPahkEaj7EfpQFFuQuvTd2`;
- Asset Signer: `5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD`.

The public machine-readable record is
[`artifacts/wallet-child-001.goal5.devnet.json`](../../artifacts/wallet-child-001.goal5.devnet.json).

## Finalized transactions

1. register Executive Profile:
   `5MN2hucV2rU2RbTbYPPxnwVgd7o8s5vCJ2XMw44NtWKTifehVAxQ9SjZJ8GheutGYhJuTwMBS27FcdnEHWMkRoLM`;
2. initial delegation:
   `5Jct14AUPzPQNschxYVBainRDUWMiubE3wqXF2N8Yv4X5ehXJ8qAuhsUSpwc8Uu5trcPp7acUEkjTr5DvggqHVXn`;
3. initial revoke, signed by the executive:
   `59gD9V2RQ3VcyjzMatNp6WReYn8xeyDp4kBjtiVfEBASEzqFaSsZ55SYpmmFdVseZBQmDvif1Zb5RB6yQAduX8be`;
4. delegation for the ownership test:
   `5A3iusZp7chR1wnKktn4ExLkuej4bq2Lwcs2K4qNyF6Wd6cJGUiJTHYSB9DnMTvTD44foV9WSbz5WHYdn6QENqJu`;
5. transfer to the isolated next owner:
   `3puSMFHAXtqnwdzqr4e6ERomCjoTrKK1AjqTaxLsyd1BFcHJQ2BvFwomHgzfHidWvsfG3rHQ1LZhySpSeXMB9wTj`;
6. revoke by the new owner:
   `3Tehhdapj7RHTtZT3eihYKbGPczEXQ9Wuf6pco3SYfzUGJis7h4M75RnytMWxpUrpPaN7SjpyZrtFiFDXGASrXhk`;
7. return transfer to the original owner:
   `297rcZSJgZPsdkp17pXh8w6xGBjzG7SB1Z7XRwwX7ngTd4gPm6r3Kf98ZEDAVmmVuuHpB1PBFMamB8p3QFCSZJPy`.

Independent RPC read-back returned `finalized` and `err: null` for all seven.

## Evidence and tests

- current official Metaplex docs and official repository tests were checked
  before implementation;
- the active executive passed only a harmless SPL Noop simulation; Goal 5 sent
  no Asset-Signer transfer and changed no inner-program state;
- after each revoke, the record account was absent and the identical simulation
  failed with Core `NoApprovals` (`0x1a`);
- after ownership changed, the record still existed and the executive still
  passed that simulation, proving delegate persistence;
- the final Core Asset owner is the original owner;
- final Execution Delegate Record: closed;
- final Asset Signer balance: exactly `10,000,000` lamports;
- final SPL Token accounts: `0`; Token-2022 accounts: `0`;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 7 files, 33 tests, PASS;
- repeated lifecycle command: live read-back PASS, no transaction submitted;
- owner, executive, and next-owner files are all `0600` and remain gitignored.

## Devnet accounting

The owner's Devnet balance changed from `980,514,720` to `979,290,440`
lamports: `1,224,280` lamports total. This equals:

- `1,169,280` lamports retained as rent in the Executive Profile;
- `35,000` lamports for seven transaction fees;
- `20,000` lamports for two Core transfer fees.

This is Devnet SOL only and has no real-money cost. Delegate-record rent was
returned on each revoke. The Executive Profile deliberately remains on-chain.

## Security findings

1. Ownership transfer does **not** revoke an active execution delegate. The
   delegate is agent runtime configuration tied to the stable Asset address.
2. A recipient must treat an incoming agent as arriving with possible active
   operators and should revoke unknown delegates before funding its Asset
   Signer.
3. Revocation closes one known record and blocks future Execute through that
   record; it cannot undo earlier actions or prove that another executive has
   no separate record.
4. The Executive Profile itself is not an active delegation and safely remains
   registered after the per-asset record is closed.
5. Owner, executive, next owner, and Asset Signer are distinct. For this small
   local Devnet lab their keys were loaded by one lifecycle process; this is not
   a production custody boundary.

## Unexpected finding

The ownership-transfer persistence was not merely theoretical: the same
executive still passed Execute validation after transfer, exactly as the June
2026 Agent Tools documentation now states.

## Remaining uncertainty

1. There is no reliable local method yet to enumerate every possible Executive
   Profile/Asset delegate PDA; Goal 5 verified the one known lab record.
2. No value moved from the Asset Signer. The fixed transfer policy and actual
   bounded action remain Goals 6 and 7.
3. Revocation cannot repair downstream approvals or authority changes created
   by an earlier arbitrary execution; Goal 5 intentionally created none.
4. The known moderate transitive `uuid@8.3.2` advisory remains unchanged.

## Recommendation

**PASS Goal 5. STOP before Goal 6.** Build the policy firewall next only after
explicit user approval. Do not re-delegate or transfer Asset-Signer funds as
part of this review.
