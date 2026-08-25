# Wallet Child #001 — Mainnet readiness checklist

Review date: **2026-08-25**

Verdict: **NO-GO**

This checklist is evidence for a future decision. It is not permission to fund
a wallet or submit a Mainnet transaction. Mainnet writes still require the
exact separate phrase `ENABLE MAINNET EXPERIMENT` and a new review after every
blocker below is closed.

## Hard loss boundary

All three limits apply at the same time:

1. maximum experiment treasury: `1,000,000` USDC base units = `1 USDC`;
2. maximum total experiment SOL acquisition: `20,000,000` lamports =
   `0.02 SOL`, including every rent payment, setup cost, fee, Asset Signer
   reserve, metadata publication payment, and emergency allowance;
3. maximum combined acquisition cost of the USDC and SOL: `USD 10.00`.

If `1 USDC + 0.02 SOL` would cost more than `$10`, the SOL quantity must be
reduced. Fixed setup/rent/fee allowances are subtracted first; the Asset Signer
reserve receives only the remainder. If the remaining total SOL cannot cover
the fully simulated lifecycle, the experiment stops. The whole acquired amount is treated as immediately and
irrecoverably losable, including treasury, fees, rent, operational mistakes,
and theft. Later market appreciation can increase its displayed dollar value;
the fixed unit caps remain unchanged and no top-up is allowed.

Goal 9 spent `$0`, created no token account, and funded neither readiness
wallet.

Goal 9A later spent only `7,721,880` Devnet lamports from the existing isolated
Devnet owner. It used a newly minted TEST token with no monetary value, touched
no real USDC, funded no Mainnet wallet, and submitted no Mainnet transaction.

## Current facts

| Check | Status | Evidence |
|---|---|---|
| Complete Devnet identity lifecycle | PASS | Goals 3–5 artifacts and reviews |
| Bounded Devnet execution and accounting | PASS | Goal 7 finalized transfer and reconciliation |
| Known delegation revoked | PASS | Live Goal 8 read-back: `REVOKED` |
| Fresh isolated Mainnet owner | PASS | `6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385`, finalized balance `0` lamports |
| Fresh isolated Mainnet executive | PASS | `EJQcuD9FtJ33c2wA7GM6HzvmJJJbPsYnmH5ZjTDdhbjF`, finalized balance `0` lamports |
| Owner/executive/Devnet separation | PASS | generated independently; mode-`0600` key files; tested inequality |
| No main-wallet runtime involvement | PASS so far | Goal 9L fixes the operator-designated experimental wallet as an external source; the lab never loads its key, while upstream on-chain linkage cannot be disproved |
| Mainnet genesis hash | PASS, read-only | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| Authoritative Solana USDC mint | PASS, read-only | Circle address and live initialized 6-decimal SPL mint agree |
| Agent Tools deployed | PASS, read-only | expected program is executable on Mainnet |
| Maximum possible funded loss | PASS | three simultaneous caps above |
| Live Mainnet execution path | ABSENT | Goals 9E–9K contain offline builders/readers only; no final-account signer, exact-message simulation, or send command exists |
| USDC-shaped Devnet lifecycle | PASS | Goal 9A exact TEST-token transfer, revoke, denial, owner rescue, and finalized reconciliation |
| Goal 9A rerun safety | PASS | completed rerun submitted zero transactions after live-state validation |
| Complete Devnet delegate discovery | PASS | Goal 9B full Agent Tools scan, closed-world layout check, all-record PDA/profile validation, and independent filter comparison found zero for the asset |
| Metadata contract and integrity | PASS | Goal 9C strict inactive registration-v1 candidate, canonical bytes, SHA-256 manifest, and false-claim rejection |
| Dependency advisory decision | PASS, bounded | Goal 9D documents the one moderate `uuid` finding, proves the affected APIs unreachable in the reviewed path, rejects an unsupported override, and requires a final recheck |
| Isolated recovery destination | PASS, unfunded | Goal 9E recovery `ABZePapHbYaTg7GU4LGQNcYmfURvue5uVrrf4FUa4x3j`; separate mode-`0600` key, gitignored, no normal-wallet involvement |
| Fixed offline Mainnet USDC contract | PASS | Goal 9E exact `0.1 USDC` intent, official mint, canonical ATAs, `TransferChecked` bytes/metas, and single Core Execute shape; no network/sign/send path |
| Offline owner-only rescue contract | PASS | Goal 9F exact capped USDC and SOL evacuation shapes to recovery, no delegate dependency, and full-balance reconciliation; final accounts/simulations remain unavailable |
| Offline USDC ATA setup contract | PASS | Goal 9G exact two regular Creates, canonical official-USDC ATAs, safe read-back, partial-state STOP, and ≤`5,000,000` lamport setup spend; final accounts/simulation unavailable |
| Aggregate lifecycle budget contract | PASS | Goal 9H sums metadata/rent/setup/reserve/action/revoke/emergency SOL under `0.02 SOL`, fixes `1 USDC`, and enforces ≤`$10` combined acquisition; final values unavailable |
| Mainnet delegate-audit implementation | PASS | Goal 9I requires dedicated HTTPS RPC, verifies Mainnet genesis/owner, repeats full closed-world scan plus independent filter, and hard-fails funding on any record; final asset unavailable |
| Durable metadata verifier | PASS | Goal 9J requires exact frozen bytes from two independent HTTPS origins and the reviewed digest; upload, durable URI, and on-chain binding remain unavailable |
| Irys storage quote | PASS, read-only | Goal 9K fixes the tagged `351`-byte Mainnet quote request; live result on 2026-08-25 was `3,208` lamports; no key, funding, upload, or transaction path exists |
| Isolated funding route | PARTIAL, staged only | Goal 9L records `1.078695 USDC` and `0.088698606 SOL` in the external experimental source at finalized slot `441,631,349`; later read-back at slot `441,632,634` confirms Wallet Child remains empty, bootstrap permits only capped SOL to owner, and USDC stays blocked until the final Asset Signer audit |
| Exact unsigned bootstrap fee | PASS, expired quote | Goal 9M fixes `19,990,000` lamports source-to-owner, quotes an exact-message `5,000` lamport fee at slot `441,634,604`, reserves another `5,000` for future USDC funding, and keeps their sum at `0.02 SOL`; no key, signing, simulation, or submission |
| Final standalone identity addresses | PASS, absent | Goal 9N fixes Core Asset `HPaGuh…1Uty`, Agent Identity `EDT4…eXf8`, Asset Signer `5Snge…YWyu`, and both canonical USDC ATAs; all five were absent at finalized slot `441,642,028` |
| Exact unsigned USDC funding fee | PASS, expired quote | Goal 9O fixes direct `1.000000 USDC` source-ATA-to-Asset-Signer-ATA `TransferChecked` and quotes the exact reserved `5,000` lamport fee at slot `441,643,866`; no key, signing, simulation, or submission |
| Final standalone policy contract | PASS, offline | Goal 9P derives final Profile/Delegate PDAs and compiles final ATA setup, delegated action, and both owner rescues with `collection: null`; Profile and Record were absent at slot `441,645,228` |
| Fixed rents and phase order | PARTIAL, exact known slice | Goal 9Q quotes `8,477,280` lamports for Identity, Profile, Delegate Record, and two USDC ATAs at finalized slot `441,646,119`; Core/plugin rent and remaining fees stay explicit blockers |
| Dedicated Mainnet RPC | PASS, read-only | private Helius HTTPS endpoint is stored mode-`0600`, gitignored, and returned Mainnet genesis plus health `ok`; final-asset audit remains unavailable |

Public key evidence:
[`artifacts/wallet-child-001.goal9.mainnet-readiness.json`](../artifacts/wallet-child-001.goal9.mainnet-readiness.json).
The corresponding secret files stay under gitignored
`.wallet-child/mainnet-readiness/` and must never be copied into Git, prompts,
artifacts, or normal runtime configuration.

## Blocking checklist

| Requirement | Status | What must happen before a GO |
|---|---|---|
| USDC-specific fixed intent and builder | PARTIAL | Goal 9E fixes official USDC and exactly `0.1 USDC` to isolated recovery; Goal 9P compiles the final-address standalone builder, but a blockhash-bound message and same-bytes simulation do not exist |
| USDC-shaped Devnet test | PASS | TEST mint/ATAs, fixed supply, bounded transfer, denial, revoke, rescue, accounting, and idempotency all finalized |
| Exact allowed programs/accounts | PARTIAL | Goals 9E–9G assert exact Core/Token/System/ATA programs, bytes, and metas; Goals 9N/9P freeze all final addresses and standalone builder contracts, but exact blockhash-bound messages remain unavailable |
| Hard limits enforced in code | PARTIAL | Goals 9E–9Q enforce action, treasury, setup, rescue, total-SOL, total-USD, storage quote, both exact external funding fees, and the exact fixed-rent slice; Core/plugin rent, simulations, and final acquisition reconciliation remain |
| Exact Mainnet transaction simulation | BLOCKED | Build only after the USDC path passes Devnet; simulate the same signed bytes intended for submission |
| Metadata finalized and durable | PARTIAL | Goal 9C freezes bytes; Goal 9J implements two-origin exact retrieval verification; Goal 9K obtains a bounded Irys storage quote; permanent upload, live retrieval verification, on-chain binding, and immutability decision remain undone |
| Reliable delegate enumeration | PARTIAL | Goal 9I implements the Mainnet-capable keyless path, Goal 9N fixes the final asset address, and the private Helius RPC is verified; the asset does not exist, so the required immediate post-create/pre-funding scan remains unavailable |
| Emergency rescue implementation | PARTIAL | Goals 9F/9P provide final-address owner-only capped USDC/SOL builders and Goal 9G provides recovery ATA setup; exact-message simulations remain absent |
| Funding route without main-wallet runtime | PARTIAL, operator-attested | Goals 9L–9O fix a separate experimental source plus exact SOL and USDC destinations/messages/fees without loading the source key; live preflights, simulations, action-time confirmations, and the public upstream-linkage caveat remain |
| Dedicated Mainnet RPC | PASS | private Helius HTTPS RPC is locally configured, secret-safe, healthy, and Mainnet genesis verified; rerun health immediately before the final asset audit |
| Dependency advisory decision | ACCEPTED, RECHECK | Goal 9D accepts one real moderate advisory only while the exact graph and unreachable `v3/v5/v6` buffer path remain unchanged; repeat the audit and guard immediately before signing review |

Because one BLOCKED item is sufficient for `NO-GO`, none may be downgraded to
a warning.

## Emergency procedure

This is the required operational sequence. The USDC-shaped rescue passed
Devnet and Goal 9P compiles the final standalone paths offline; exact Mainnet
same-bytes simulation remains a blocker before funding.

1. stop the brain/provider and executive runtime;
2. disable all automated restarts and preserve logs without secret material;
3. use only the isolated owner boundary from a clean local environment;
4. verify Mainnet by genesis hash and read current asset owner, identity,
   Asset Signer, token accounts, balances, and every discoverable delegation;
5. revoke each active execution delegation and wait for finalized read-back;
6. verify each known record is closed and the old Execute path is denied;
7. inspect the USDC token account for delegate, close authority, and owner
   changes that revocation would not undo;
8. use the prebuilt fixed owner rescue path to move remaining USDC and excess
   SOL to the isolated recovery destination;
9. reconcile source, destination, fee-payer, token, and SOL deltas at finalized
   commitment;
10. preserve public signatures and write an incident report;
11. do not re-delegate or refund without a fresh review.

Revocation only blocks future execution through a closed record. It cannot
undo transfers, approvals, authority changes, escrows, or other durable state
created earlier.

## Read-only verification

```sh
WALLET_CHILD_MAINNET_READ_RPC_URL=https://your-dedicated-mainnet-rpc.example \
  pnpm run readiness:mainnet
```

This command performs only `getGenesisHash` and `getAccountInfo`. It does not
load either readiness key and contains no transaction builder, signer identity,
simulation, or send function.

## Authoritative sources

- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
  lists Solana Mainnet USDC as
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- [Solana clusters and public RPC endpoints](https://solana.com/docs/references/clusters)
  identifies Mainnet as the production cluster and warns that public RPC is
  rate-limited and not intended for production applications.
- [Solana `getGenesisHash`](https://solana.com/docs/rpc/http/getgenesishash)
  defines the read used to verify cluster identity.
- [Metaplex Agent Tools](https://www.metaplex.com/docs/smart-contracts/mpl-agent/tools)
  documents the Mainnet program ID, broad arbitrary execution authority,
  revocation limits, and delegation persistence across ownership transfer.
- [Registry package](https://www.npmjs.com/package/@metaplex-foundation/mpl-agent-registry)
  remained `0.2.6` at this review; the registry still depends on exact MPL Core
  `1.8.0`.
- [Irys metadata upload guide](https://docs.irys.xyz/build/d/guides/uploading-nfts)
  defines the storage-price check that precedes any funding or upload.
- [Irys supported tokens](https://docs.irys.xyz/build/d/features/supported-tokens)
  lists SOL with the Mainnet token parameter `solana`.
- [Solana `getLatestBlockhash`](https://solana.com/docs/rpc/http/getlatestblockhash)
  defines the blockhash and last-valid-height read used by Goal 9M.
- [Solana `getFeeForMessage`](https://solana.com/docs/rpc/http/getfeeformessage)
  defines the exact serialized-message fee query used by Goal 9M.
- [Metaplex Core creating assets](https://www.metaplex.com/docs/smart-contracts/core/create-asset)
  documents that a Core Asset may be standalone without a Collection.
- [Solana token transfer guide](https://solana.com/docs/tokens/basics/transfer-tokens)
  documents the checked token-transfer account relationship used by Goal 9O.

## Final decision

**NO-GO for Goal 10.** Goals 9A–9Q now close the safe local, quote-only, and
external-route remediation slice available before external choices: the
real-token policy, recovery, USDC ATA setup, aggregate budget, Mainnet delegate
scanner, metadata
integrity, durable retrieval verifier, private RPC, and bounded Irys storage
quote all exist and pass. This is still not a claim that Mainnet execution is
safe. Durable publication, exact identity/setup messages, live audits and
same-bytes simulations, final identity/setup rents and fees, remaining live
acquisition quotes, and the exact approval phrase remain mandatory.
