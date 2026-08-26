# Goal 10C review — finalized Mainnet owner bootstrap

Status: **PASS — finalized and reconciled; STOP before the next write**

## Built

- one exact action-time confirmation bound to the Goal 10B amount, recipient,
  and fee cap;
- a same-session finalized preflight over source SOL, source USDC, owner SOL,
  and all ten Wallet Child accounts;
- one official Jupiter Send submission from the connected experimental source;
- finalized RPC decoding of every account and instruction in the actual legacy
  transaction;
- finalized post-balance and USDC read-back at a later monotonic slot;
- exact actual-fee and acquisition-boundary reconciliation;
- a public signature/receipt with no private key, RPC credential, or reusable
  transaction bytes.

## Evidence

- public artifact:
  [`wallet-child-001.goal10c.bootstrap-receipt.json`](../../artifacts/wallet-child-001.goal10c.bootstrap-receipt.json);
- [finalized Solscan transaction](https://solscan.io/tx/5sB41GfGqTbPjiz4FZKia3TnoicCDTEW81yDCZeW7AoEZSKxTsDriYzjeTcaXjdw2Xx9p3pRgWEZtSRmwvih8sVq);
- preflight slot: `441,800,275`;
- finalized transaction slot: `441,800,468`;
- finalized read-back slot: `441,800,651`;
- transfer: `19,985,000` lamports from the exact external source to the exact
  isolated owner;
- fee: `5,001` lamports, matching the live preview and below the `10,000`
  lamport cap;
- finalized balances: source `68,708,605`, owner `19,985,000` lamports;
- source official USDC: unchanged at `1,078,695` base units;
- remaining nine Wallet Child accounts: absent.

## Tests

- exact confirmation and drift-free finalized preflight: PASS;
- official-origin preview and finalized receipt: PASS;
- exact accounts, Compute Budget settings, and System transfer: PASS;
- finalized balance and `0.02 SOL` boundary reconciliation: PASS;
- next-write STOP and secret scan: PASS.

## Security findings

1. The actual legacy transaction has one source signature, no address lookup
   tables, exactly four accounts, and exactly three instructions.
2. The first two instructions only set a `500` compute-unit limit and `1,602`
   micro-lamports per compute unit. They produced the expected one-lamport
   priority fee and reference no accounts.
3. The only value-moving instruction is the exact System transfer of
   `19,985,000` lamports to the isolated owner. No token, delegate, ATA,
   metadata, or arbitrary program instruction exists.
4. Source outflow is exactly `19,990,001` lamports: transfer plus `5,001` fee.
   With the retained future `5,000` lamport USDC-funding fee reserve, total
   allocated acquisition is `19,995,001`; `4,999` stays unallocated. No top-up
   is allowed.
5. The external Jupiter Wallet signed the transaction. The lab never loaded,
   exported, or published the source key.
6. This bootstrap does not authorize metadata funding, asset creation, USDC
   funding, delegation, or the `0.1 USDC` action.

## Unexpected findings

- the live fee settled at the lower observed value of `5,001` lamports;
- Jupiter added two bounded Compute Budget instructions, exactly accounting for
  the one-lamport priority fee anticipated by Goal 10B's closed-source boundary.

## Remaining uncertainty

1. Durable metadata has not been uploaded or verified from two origins.
2. Exact Asset/Identity creation bytes, remaining rents/fees, live delegate
   audit, and same-signed-bytes simulations remain blocked.
3. The staged `1.078695 USDC` remains entirely outside Wallet Child.
4. The final `0.1 USDC` treasury action remains `NO_GO`.

## Recommendation

**PASS Goal 10C and STOP before another write.** The next goal may review only
the durable metadata publication path and remaining budget. It must obtain a
new action-time confirmation before any upload funding, on-chain creation, or
other spend.
