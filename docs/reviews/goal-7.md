# Goal 7 review — one bounded Devnet action

Status: **PASS**

## Built

- exact `--confirm-goal-7` write gate and Devnet genesis-hash verification;
- resumable transaction attempts recorded before send with signature,
  blockhash, and expiry height;
- fixed owner-funded rent preparation for the otherwise empty test receiver;
- fresh per-asset execution delegation;
- simulation and submission of the exact same signed bounded transaction;
- finalized source, receiver, and fee-payer balance reconciliation;
- `finally`-protected revoke plus post-revoke `NoApprovals` proof;
- completed-state live verification and zero-write idempotent rerun.

## Evidence

- receiver preparation: `2x3cVqoY8iVCG11Dm8R3YhxXQwhYaT91wb7A9kJ7uzLx64U3mrLGKxACU3uUVbNkW6igWNFAM8Wbd4CiCnSc38AY`;
- action delegation: `27PZ4XK272jjVyqVy4e9QwnDR7F73fjQdGf5okCy187yAtn52XikV9epAQFwxorGZcSyjBgWiG6NgJvYJoaDnfQH`;
- bounded transfer: `3bgnCUmNYfCHxqPtvVot83dAYcjjyrPg4N6fehC1Mj8vTPNcBANPzgU32WYi3KXu2KDh2cr3PcyEscwED3FWk823`;
- final revoke: `252TzHhRdzxJejnfRSDwHfqbvBjUFK3qcKBsTLREFTpAaMxpKfRCUKrwcopAEgSmRuFyVeZ2YaVeDY36mhAZJoB3`;
- all six Goal 7 lifecycle signatures, including the safe first attempt, read
  back as `finalized` with `err: null`;
- Asset Signer: `10,000,000 -> 9,900,000` lamports;
- TEST_RECEIVER during the action: `890,880 -> 990,880` lamports;
- action fee payer: `976,764,840 -> 976,706,120`, a `58,720` lamport spend;
- final delegation: `REVOKED`;
- post-revoke identical Execute simulation: Core `NoApprovals`;
- legacy SPL accounts: `0`; Token-2022 accounts: `0`;
- idempotent rerun: `Goal 7 is already complete; no transaction submitted.`

Public artifact: `artifacts/wallet-child-001.goal7.devnet.json`.

## Tests

- `pnpm run typecheck`: PASS;
- `pnpm test`: 9 files, 65 tests, PASS;
- `pnpm policy:check`: PASS before live writes;
- `pnpm audit --prod`: the same one known moderate transitive
  `uuid@8.3.2` advisory, with no new finding;
- forbidden 1 SOL action: DENY;
- unknown destination: DENY;
- caller-injected program field: DENY;
- exact outer and inner instruction assertions: PASS;
- exact balance reconciliation: PASS;
- completed command idempotency: PASS.

## Cost

- real money: `$0`;
- Asset Signer action: `100,000` Devnet lamports (`0.0001` Devnet SOL);
- owner-funded receiver rent preparation: `890,880` Devnet lamports;
- transaction base fees across six successful lifecycle transactions:
  `35,000` Devnet lamports;
- Core Execute fee observed inside the action delta: `48,720` Devnet lamports;
- owner total delta: `974,600` Devnet lamports;
- delegate-record rent was returned by each revoke, so its net cost was zero.

## Security findings

1. The fixed off-chain policy produced the intended live transaction and the
   observed action deltas matched exactly.
2. The first simulation failure submitted no transfer, while the `finally`
   cleanup still revoked and verified the delegate. This exercised the
   emergency path with no Asset Signer loss.
3. A recipient with zero lamports cannot receive this very small transfer
   until it meets Solana's zero-data rent requirement. Receiver readiness is
   now explicit and fixed rather than delegated to an unreliable faucet.
4. Delegation remains broad on-chain. The `100,000` lamport limit exists only
   in the one local signer path tested here.
5. The artifact records a prepared signature before RPC send, preventing an
   ambiguous restart from silently submitting the bounded action twice.

## Unexpected findings

- the Solana Foundation web faucet had exhausted its two-request/eight-hour
  allowance;
- public RPC `requestAirdrop` returned RPC `-32603`;
- the first transfer simulation exposed the receiver rent requirement before
  the transaction was submitted.

## Remaining uncertainty

1. The lab still cannot enumerate every possible delegate record for an asset.
2. A compromised host or unrestricted executive signing path can bypass this
   off-chain policy.
3. The known moderate transitive `uuid@8.3.2` advisory remains to be rechecked.
4. Goal 8 model/proposer isolation has not been built or authorized.

## Recommendation

**PASS Goal 7. STOP before Goal 8.** Keep delegation revoked. Goal 8 remains
locked until the user explicitly approves the minimal-brain scope.
