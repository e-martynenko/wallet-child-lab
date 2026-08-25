# Goal 4 review — prove the wallet exists

Status: **PASS**

## Built

- canonical Asset Signer derivation through `findAssetSignerPda`;
- read-only Devnet status CLI showing the owner, Core Asset, Collection, Agent
  Identity, Asset Signer, registration, SOL balance, and token accounts;
- legacy SPL Token and Token-2022 account reads through finalized RPC calls;
- one explicitly gated funding command;
- simulation, finalized confirmation, exact balance-delta reconciliation, and
  a duplicate-resistant public artifact.

## Funding result

- source owner: `7Pz13XTximTybgNrWrMQDWWw2LsM6QPsGjsSharggs5c`;
- Asset Signer: `5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD`;
- amount: `10,000,000` lamports = `0.01` Devnet SOL;
- Asset Signer balance: `0 -> 10,000,000` lamports;
- owner balance: `990,519,720 -> 980,514,720` lamports;
- transaction fee: `5,000` lamports;
- signature:
  `4T27EFVfNov3VmeW8RY8jQDZsru3jjtV16rMznpSoouQHcpkZqkSqJdWZnUVt3PfuSX5TAbSPQe6j2r2hXEcUt4Z`.

The public machine-readable record is
[`artifacts/wallet-child-001.goal4.devnet.json`](../../artifacts/wallet-child-001.goal4.devnet.json).

## Verification

- current npm versions were rechecked before implementation;
- Agent Registry `0.2.6` still depends on exactly Core `1.8.0`, so Core was not
  independently upgraded to `1.10.0`;
- the current official Execute/Asset Signer documentation still specifies
  `findAssetSignerPda` as the canonical helper;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 6 files, 27 tests, PASS;
- production dependency audit re-confirmed the one known moderate transitive
  `uuid@8.3.2` advisory and found no additional vulnerability;
- pre-funding status: `0` lamports, `0` SPL Token accounts, `0` Token-2022
  accounts;
- funding signature independently read as `finalized` with `err: null`;
- independent finalized RPC balance: exactly `10,000,000` lamports;
- post-funding relationship remained owner -> Asset -> Collection and
  Identity -> Asset;
- post-funding token-account counts remained zero;
- a repeated funding command detected `status: complete` and submitted no
  transaction;
- public artifacts and metadata contain no secret, seed, private, or keypair
  fields.

Official reference:
[Execute and Asset Signer](https://www.metaplex.com/docs/smart-contracts/core/execute-asset-signing).

## Security findings

1. Funding the PDA proves it can hold SOL; it does not yet prove that an
   executive can safely move that SOL.
2. The PDA has no private key. Future withdrawals require MPL Core `execute`
   and an authorized outer signer.
3. The funding path sends only a fixed System Program transfer from the owner
   to the already verified canonical PDA. It does not expose arbitrary
   transaction construction.
4. Goal 4 creates no executive, delegation, token account, approval, authority
   change, transfer out, or Mainnet path.

## Remaining uncertainty

1. Executive registration, delegation, revocation, and ownership-change
   behavior remain untested.
2. Asset Signer `execute` behavior remains intentionally untested until the
   next approved goal.
3. No SPL token has been deposited; both token-account lists are empty.
4. Core `1.10.0` cannot be adopted independently while the latest Registry
   package pins Core `1.8.0`; that upgrade needs a separate compatibility test.
5. The transitive `uuid@8.3.2` advisory remains; Wallet Child does not use the
   affected UUID buffer APIs, and no unsafe major-version override was added.

## Recommendation

**PASS Goal 4. STOP before Goal 5.** Executive creation and delegation add a
new key, new on-chain accounts, and materially broader authority, so they need
explicit user approval after this review.
