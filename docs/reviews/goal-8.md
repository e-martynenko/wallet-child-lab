# Goal 8 review — minimal brain

Status: **PASS**

## Built

- strict Zod union accepting only `{ decision: 'HOLD' }` or
  `{ decision: 'REQUEST_TRANSFER' }`;
- tiny, strict context with no wallet addresses or transaction details;
- Responses-style strict JSON Schema request with `tools: []`,
  `tool_choice: 'none'`, and `store: false`;
- fail-closed parsing for malformed output and unavailable providers;
- deterministic handoff from `REQUEST_TRANSFER` to the fixed Goal 6 intent and
  policy;
- offline brain check with no SDK, API key, live model request, RPC, key load,
  signer, transaction builder, or chain write.

## Evidence

- `HOLD -> NO_ACTION`;
- `REQUEST_TRANSFER -> POLICY_ALLOWED -> 100000 fixed lamports`;
- malformed output, extra fields, invented amount/destination/program, and
  provider errors: `DENY`;
- model request contains none of the known owner, executive, Asset Signer, or
  receiver addresses;
- live read-only Devnet status after implementation: original owner unchanged,
  execution delegation `REVOKED`, Asset Signer `9,900,000` lamports, legacy SPL
  accounts `0`, Token-2022 accounts `0`.

## Tests

- `pnpm run typecheck`: PASS;
- `pnpm test`: 10 files, 84 tests, PASS;
- `pnpm run brain:check`: PASS;
- `pnpm run policy:check`: PASS;
- `pnpm run status:devnet`: PASS, read-only state unchanged;
- `git diff --check`: PASS;
- `pnpm audit --prod`: the same one known moderate transitive
  `uuid@8.3.2` advisory, with no new finding.

## Cost

- real money: `$0`;
- Devnet SOL: `0`;
- OpenAI API requests: `0`;
- chain transactions: `0`.

## Security findings

1. The model cannot supply payment parameters. It can only request the fixed
   local intent, which the deterministic policy evaluates again.
2. Strict schemas reject extra fields rather than silently stripping an
   attempted amount, destination, program, account, or instruction.
3. The brain source imports no chain, key, action, signer, transaction-builder,
   Metaplex, or RPC capability.
4. Provider failure is a denial, not an implicit transfer request.
5. The injected provider remains a future integration boundary. Any live
   adapter must preserve this isolation and must not share a process closure
   containing wallet capabilities.

## Unexpected findings

- local `tsx` CLI checks require an IPC socket that the file sandbox blocks;
  the same commands passed outside that sandbox. This is a runner constraint,
  not an application failure.

## Remaining uncertainty

1. No real model provider response has been integrated or observed.
2. Prompt injection and provider-specific refusal/error envelopes must be
   tested when a live adapter is explicitly authorized.
3. The off-chain policy can still be bypassed by a compromised host or an
   unrestricted executive signing path.
4. Full enumeration of possible delegate records remains unsolved.
5. The known moderate transitive `uuid@8.3.2` advisory remains to be rechecked.

## Recommendation

**PASS Goal 8. STOP before Goal 9.** Keep delegation revoked. Goal 9 is a
separate Mainnet-readiness review and remains locked until the user explicitly
approves it.
