# Goal 6 review — policy firewall

Status: **PASS**

## Built

- strict Zod schemas for a transfer intent and policy configuration;
- fail-closed `validateAction(action, policy)`;
- one fixed native-SOL System Transfer builder;
- exact assertions for the forwarded instruction and outer MPL Core Execute;
- balance-delta reconciliation with a separate fee-payer ceiling;
- an offline `pnpm policy:check` command using public no-op signers only.

## Fixed policy

- action: `TRANSFER` only;
- network: `devnet` only;
- token: native `SOL` only;
- source: canonical Asset Signer
  `5ZaoSJxJhZ7cK3kCHZun9Bv3K6TdUj5QJ92MjYZKxaSD`;
- destination: Goal 5 isolated `TEST_RECEIVER`
  `B96kUFzEvVzmW9DKfg3VDV9ZagXXjZ9rc3vyZeMk5svy`;
- maximum: `1,000,000` lamports = `0.001` SOL;
- example/Goal 7 candidate: `100,000` lamports = `0.0001` SOL;
- maximum fee-payer spend: `100,000` lamports;
- inner program: System Program only;
- exactly one System Transfer inside exactly one MPL Core Execute.

The caller cannot provide source, program, instruction data, account metas,
signers, token approval, authority change, close-account flag, or extra
instructions. Those fields make the strict intent malformed and produce
`DENY`.

## Evidence

- `pnpm policy:check`: PASS;
- offline builder produced exactly one 12-byte System Transfer with
  discriminator `2` and the expected little-endian `u64` amount;
- forwarded accounts are exactly delegate record, Asset Signer, and receiver;
- outer instruction is exactly MPL Core Execute with the pinned Core `1.8.0`
  account order and exact embedded transfer data;
- no key file was loaded by the policy checker;
- no transaction was built-and-signed, simulated, or submitted;
- final live status still reports original owner, delegation `REVOKED`, Asset
  Signer `10,000,000` lamports, and zero SPL/Token-2022 accounts;
- real and Devnet transaction cost for Goal 6: zero.

## Tests

- `pnpm run typecheck`: PASS;
- `pnpm test`: 8 files, 62 tests, PASS;
- `pnpm audit --prod`: the same one known moderate transitive
  `uuid@8.3.2` advisory, with no new finding;
- valid exact intent: ALLOW;
- Mainnet/wrong network: DENY;
- non-SOL token: DENY;
- over-limit, zero, and negative amounts: DENY;
- number/fraction instead of integer bigint lamports: DENY;
- unknown destination: DENY;
- caller-supplied source/program/instructions: DENY;
- SPL approval, authority-change, and close-account-shaped input: DENY;
- non-System program, extra account, extra instruction, wrong source,
  destination, amount, or writable flag: rejected by instruction assertions;
- tampered outer program/message: rejected;
- unexplained source, receiver, or fee-payer balance delta: rejected.

## Security findings

1. The primary control is construction from a tiny domain intent, not attempted
   sanitization of an arbitrary transaction.
2. The second assertion layer is intentionally coupled to pinned MPL Core
   `1.8.0`; SDK account/data drift will stop the build instead of silently
   changing the signed message.
3. Integer lamports avoid decimal SOL ambiguity. `0.0001` as a JavaScript number
   is rejected; the candidate must be `100_000n` lamports.
4. This is an off-chain firewall. It is effective only if no other runtime gets
   unrestricted access to the executive signer.
5. Goal 6 deliberately leaves delegation revoked, so the builder shape is not
   currently executable by the executive.

## Remaining uncertainty

1. The exact builder has not yet been simulated or executed on Devnet.
2. Live Core protocol fee and transaction fee must be reconciled in Goal 7,
   within the `100,000` lamport fee-payer ceiling.
3. The firewall does not enumerate unknown delegate records or enforce limits
   on-chain.
4. The known moderate transitive `uuid@8.3.2` advisory remains unchanged.

## Recommendation

**PASS Goal 6. STOP before Goal 7.** Goal 7 would create a fresh delegation,
simulate and submit exactly one `100,000` lamport transfer, reconcile balances,
and revoke again. It requires separate user approval.
