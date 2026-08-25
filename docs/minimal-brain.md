# Goal 8 minimal brain

## Purpose

Let a model choose between doing nothing and requesting the one already-defined
test payment without giving the model control of payment details or wallet
capabilities.

## Exact flow

```text
tiny context
    -> strict model request with no tools
    -> exact HOLD | REQUEST_TRANSFER parser
    -> fixed local transfer intent
    -> existing Goal 6 policy
    -> data result only
```

- `HOLD` becomes `NO_ACTION`.
- `REQUEST_TRANSFER` selects the fixed local intent and still needs policy
  approval.
- malformed output or provider failure becomes `DENY`.
- no Goal 8 function builds, signs, simulates, or submits a transaction.

The model never chooses the network, token, amount, destination, source,
program, accounts, instructions, fee payer, or signer. Its request contains no
wallet addresses and no secret material.

## Current implementation boundary

`src/brain/minimal-brain.ts` defines the strict schemas and creates a
Responses-style request with an empty tool list and `tool_choice: 'none'`.
`src/brain/decision-gate.ts` parses the returned data and hands the fixed intent
to the deterministic policy. `src/cli/check-brain.ts` proves the flow with fake
offline providers.

No OpenAI SDK or API adapter is installed. No API key is read, and no live model
request is sent. This keeps Goal 8 independently testable and avoids pretending
that provider integration has been secured before it is explicitly approved.

The request shape follows OpenAI's current Responses documentation: strict
`json_schema` Structured Outputs are preferred over the older JSON mode, and
`tool_choice: 'none'` prevents tool calls. Source:
[OpenAI Responses API reference](https://developers.openai.com/api/reference/java/resources/beta/subresources/responses).

## Verification

```sh
pnpm run brain:check
pnpm test
pnpm run typecheck
```

The offline check must say `API request sent: NO`, `RPC used: NO`, `Keys loaded:
NO`, and `Transaction built/signed/submitted: NO`.
