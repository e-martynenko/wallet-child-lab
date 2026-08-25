# Goal 9O review — exact unsigned Mainnet USDC funding fee

Status: **PASS — direct treasury destination and reserved fee closed**

## Built

- one fixed legacy Token Program `TransferChecked` from the canonical external
  source ATA directly to the final Asset Signer ATA;
- exact amount: `1,000,000` base units (`1.000000 USDC`);
- canonical source/destination ATA assertions for official Circle USDC;
- exact assertions for message header, ordered accounts, compiled indexes,
  Token Program, discriminator, amount bytes, and six decimals;
- dedicated-HTTPS Mainnet genesis, finalized blockhash, and non-stale
  `getFeeForMessage` checks;
- no wallet key loading, signing, simulation, or submission path.

## Evidence

- implementation:
  [`usdc-funding-fee.ts`](../../src/goal9o/usdc-funding-fee.ts);
- CLI:
  [`quote-usdc-funding-mainnet.ts`](../../src/cli/quote-usdc-funding-mainnet.ts);
- public artifact:
  [`wallet-child-001.goal9o.usdc-funding-fee.json`](../../artifacts/wallet-child-001.goal9o.usdc-funding-fee.json);
- source ATA: `2RETLnM6iGVayfXP9ynTLmgk5oB5gqHpY8BbVuG1oVyQ`;
- Asset Signer ATA: `hCmisMZFRL7SWKvgdtFWXMTDW3PY858Kmvg6dQ8GQMU`;
- blockhash context slot: `441,643,865`;
- fee context slot: `441,643,866`;
- last valid block height: `419,692,760`;
- expiring message SHA-256:
  `f499d43d9eb6a856b50740b70bd4900e83f97f44cd15b3305cfe49ab511e43cc`;
- exact live fee: `5,000` lamports.

## Tests

- exact deterministic unsigned `TransferChecked` message: PASS;
- canonical source and destination ATAs: PASS;
- verified Mainnet genesis plus non-stale exact-message fee: PASS;
- wrong cluster, null/changed fee, or stale context: DENY;
- quoted fee equals Goal 9M reserve: PASS;
- mutation-capability source scan: PASS;
- public artifact excludes reusable bytes and secret fields: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 26 files, 214 tests, PASS.

## Security findings

1. The builder uses only a noop signer carrying the public source address. The
   lab still has no Jupiter-wallet private key or signature.
2. `getFeeForMessage` prices bytes but neither simulates nor submits them.
3. The destination is the Asset Signer ATA, not the owner, executive, recovery,
   or Core Asset account.
4. The quoted `5,000` lamports exactly consumes the existing funding-fee
   reserve; it does not increase the `0.02 SOL` boundary.
5. An accidental root double slash in the local Helius URL caused HTTP `404`.
   Strict root-path normalization fixed both Goal 9M and Goal 9O reads without
   exposing or changing the API key.

## Remaining uncertainty

1. The destination ATA and Asset Signer are not live yet; this was not an
   execution simulation.
2. A fresh blockhash, live source/destination preflight, fee quote, and action
   confirmation are required immediately before any later source signature.
3. Durable metadata and exact identity/bootstrap messages remain incomplete.
4. The exact phrase `ENABLE MAINNET EXPERIMENT` has not been provided.

## Recommendation

**PASS Goal 9O and continue offline/read-only remediation.** Freeze exact rent
and phased bootstrap requirements next. Do not fund the treasury.

## Authoritative sources

- [Solana `getFeeForMessage`](https://solana.com/docs/rpc/http/getfeeformessage)
  defines the read-only fee query for serialized message bytes;
- [Solana token integration guide](https://solana.com/docs/tokens/basics/transfer-tokens)
  documents token transfer accounts and checked transfer construction.
