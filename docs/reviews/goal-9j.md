# Goal 9J review — durable metadata retrieval verifier

Status: **PASS — verifier complete; publication remains BLOCKED**

## Built

- one read-only verifier for the frozen Goal 9C metadata bytes;
- one durable URI restricted to HTTPS, `ar://`, or `ipfs://`;
- exactly two credential-free HTTPS retrieval URLs on independent origins;
- parallel retrieval with timeout, redirect refusal, HTTP status check, and
  `10,000` byte safety bound;
- exact byte-for-byte, byte-length, and SHA-256 comparison to the local frozen
  candidate;
- output that reports origins, never URL credentials;
- no upload, key, signer, transaction builder, on-chain update, signing, or send
  path.

## Evidence

- verifier:
  [`durable-metadata.ts`](../../src/goal9j/durable-metadata.ts);
- CLI:
  [`verify-durable-metadata.ts`](../../src/cli/verify-durable-metadata.ts);
- command:
  `pnpm run metadata:verify-durable`;
- expected digest:
  `7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`;
- expected byte length: `351`;
- focused tests: 5, PASS.

## Tests

- valid durable URI plus two independent origins: PASS;
- missing/insecure/credential-bearing/same-origin/extra URLs: DENY;
- two exact frozen copies: PASS;
- byte drift or HTTP failure from either origin: DENY;
- source isolation: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 21 files, 182 tests, PASS.

## Security findings

1. Two gateways improve availability evidence but do not prove provider or
   storage-network permanence.
2. Exact bytes are required; semantically equivalent reformatting fails.
3. Redirects are refused so each reviewed retrieval origin remains explicit.
4. Retrieval is not publication and does not authorize an on-chain URI update.
5. The immutability decision remains after successful multi-origin retrieval,
   because locking a wrong URI is irreversible.

## Unexpected findings

- no storage SDK is required for verification; standard HTTPS byte retrieval
  plus the frozen SHA-256 contract is smaller and easier to audit;
- a durable-scheme URI and gateway URLs are separate concerns, so both are kept
  explicit rather than inferred from one provider.

## Remaining uncertainty

1. No Arweave or pinned-IPFS provider has been selected.
2. No content has been uploaded and no durable URI exists.
3. The verifier has not made a real network request.
4. No on-chain URI has been set or made immutable.
5. Dedicated RPC, funding route, final asset/audits/simulations, live budget,
   and exact Mainnet approval remain unresolved.

## Recommendation

**PASS Goal 9J implementation and STOP before publication.** Select a durable
provider, upload the exact frozen bytes, then require this verifier to pass from
two independent origins before any on-chain URI or immutability decision.
