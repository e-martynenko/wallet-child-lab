# Wallet Child #001 — Mainnet readiness checklist

Review date: **2026-08-27**

Verdict: **NO-GO for the `0.1 USDC` action; Irys settlement pending**

This checklist is evidence for a future decision. It is not permission to
submit another Mainnet transaction. The exact project phrase
`ENABLE MAINNET EXPERIMENT` was received on 2026-08-26, opening only the phased
remediation sequence. Every individual write still requires a current review,
separate action-time confirmation, and finalized read-back.

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
| Fresh isolated Mainnet owner | PASS, bootstrapped | `6M5uveNxXKNc7t1a36BpRr1ZuLRWgsUsXCS5U2NTR385`, finalized balance `19,976,792` lamports after Goal 10F at slot `441,857,234` |
| Fresh isolated Mainnet executive | PASS | `EJQcuD9FtJ33c2wA7GM6HzvmJJJbPsYnmH5ZjTDdhbjF`, finalized balance `0` lamports |
| Owner/executive/Devnet separation | PASS | generated independently; mode-`0600` key files; tested inequality |
| No main-wallet runtime involvement | PASS so far | Goal 9L fixes the operator-designated experimental wallet as an external source; the lab never loads its key, while upstream on-chain linkage cannot be disproved |
| Mainnet genesis hash | PASS, read-only | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| Authoritative Solana USDC mint | PASS, read-only | Circle address and live initialized 6-decimal SPL mint agree |
| Agent Tools deployed | PASS, read-only | expected program is executable on Mainnet |
| Maximum possible funded loss | PASS | three simultaneous caps above |
| Live Mainnet execution path | PARTIAL, bootstrap and metadata funding only | Goal 10C records the finalized external Jupiter bootstrap and Goal 10F records one exact owner-to-Irys funding write. No Wallet Child treasury/delegate action is live |
| USDC-shaped Devnet lifecycle | PASS | Goal 9A exact TEST-token transfer, revoke, denial, owner rescue, and finalized reconciliation |
| Goal 9A rerun safety | PASS | completed rerun submitted zero transactions after live-state validation |
| Complete Devnet delegate discovery | PASS | Goal 9B full Agent Tools scan, closed-world layout check, all-record PDA/profile validation, and independent filter comparison found zero for the asset |
| Metadata contract and integrity | PASS | Goal 9C strict inactive registration-v1 candidate, canonical bytes, SHA-256 manifest, and false-claim rejection |
| Dependency advisory decision | PASS, bounded | Goal 9D documents the one moderate `uuid` finding, proves the affected APIs unreachable in the reviewed path, rejects an unsupported override, and requires a final recheck |
| Isolated recovery destination | PASS, unfunded | Goal 9E recovery `ABZePapHbYaTg7GU4LGQNcYmfURvue5uVrrf4FUa4x3j`; separate mode-`0600` key, gitignored, no normal-wallet involvement |
| Fixed offline Mainnet USDC contract | PASS | Goal 9E exact `0.1 USDC` intent, official mint, canonical ATAs, `TransferChecked` bytes/metas, and single Core Execute shape; no network/sign/send path |
| Offline owner-only rescue contract | PASS | Goals 9F/9P fix final-address capped USDC and SOL evacuation shapes to recovery with no delegate dependency; live-balance compilation and simulations remain unavailable |
| Offline USDC ATA setup contract | PASS | Goals 9G/9P fix two regular Creates for the final canonical official-USDC ATAs, safe read-back, partial-state STOP, and ≤`5,000,000` lamport setup spend; simulation remains unavailable |
| Aggregate lifecycle budget contract | PASS | Goal 9H sums metadata/rent/setup/reserve/action/revoke/emergency SOL under `0.02 SOL`, fixes `1 USDC`, and enforces ≤`$10` combined acquisition; final values unavailable |
| Mainnet delegate-audit implementation | PASS | Goal 9I requires dedicated HTTPS RPC, verifies Mainnet genesis/owner, repeats full closed-world scan plus independent filter, and hard-fails funding on any record; the final address is frozen but its account is absent |
| Durable metadata verifier | PASS | Goal 9J requires exact frozen bytes from two independent HTTPS origins and the reviewed digest; upload, durable URI, and on-chain binding remain unavailable |
| Irys storage quote | PASS, read-only | Goal 9K fixes the tagged `351`-byte Mainnet quote request; live result on 2026-08-25 was `3,208` lamports; no key, funding, upload, or transaction path exists |
| Isolated funding route | PARTIAL, SOL bootstrap complete | Goal 10C finalizes `19,985,000` lamports to the owner with a `5,001` lamport fee. Source read-back is `68,708,605` lamports plus unchanged `1.078695 USDC`; USDC stays blocked until the final Asset Signer audit |
| Exact unsigned bootstrap fee | PASS, expired quote | Goal 9M fixes `19,990,000` lamports source-to-owner, quotes an exact-message `5,000` lamport fee at slot `441,634,604`, reserves another `5,000` for future USDC funding, and keeps their sum at `0.02 SOL`; no key, signing, simulation, or submission |
| Final standalone identity addresses | PASS, absent | Goal 9N fixes Core Asset `HPaGuh…1Uty`, Agent Identity `EDT4…eXf8`, Asset Signer `5Snge…YWyu`, and both canonical USDC ATAs; all five were absent at finalized slot `441,642,028` |
| Exact unsigned USDC funding fee | PASS, expired quote | Goal 9O fixes direct `1.000000 USDC` source-ATA-to-Asset-Signer-ATA `TransferChecked` and quotes the exact reserved `5,000` lamport fee at slot `441,643,866`; no key, signing, simulation, or submission |
| Final standalone policy contract | PASS, offline | Goal 9P derives final Profile/Delegate PDAs and compiles final ATA setup, delegated action, and both owner rescues with `collection: null`; Profile and Record were absent at slot `441,645,228` |
| Fixed rents and phase order | PARTIAL, exact known slice | Goal 9Q quotes `8,477,280` lamports for Identity, Profile, Delegate Record, and two USDC ATAs at finalized slot `441,646,119`; Core/plugin rent and remaining fees stay explicit blockers |
| URI-independent internal messages | PASS, expired quotes | Goal 9R compiles final ATA/Profile/delegate/action/revoke/USDC-rescue messages and quotes exactly `40,000` lamports total at fee slot `441,647,590`; URI-dependent Asset/Identity and live-balance SOL rescue remain blocked |
| Final pre-approval audit | PASS, STOP | Goal 9S confirms the source balances are stable and all ten final Wallet Child accounts remain absent at finalized slot `441,648,274`; Irys remains unintegrated and every approval/write/spend flag is false |
| Project gate and bootstrap preview | PASS, superseded | Goal 10A records the exact project phrase, repeats the stable preflight at slot `441,794,729`, and simulates the exact first `19,990,000` lamport transfer plus `5,000` lamport fee at monotonic finalized slot `441,796,096`; its later action-time phrase was invalidated by the live Goal 10B fee mismatch, with no signature or submission |
| Jupiter live-fee stop and rework | PASS, superseded | Goal 10B stopped the mismatched first preview and capped the reworked transfer; its new exact phrase was later received and executed by Goal 10C |
| Finalized owner bootstrap | PASS, STOP | Goal 10C finalizes signature `5sB41…8sVq` at slot `441,800,468`: two bounded Compute Budget instructions plus one exact `19,985,000` lamport System transfer, `5,001` fee, reconciled source `68,708,605`, owner `19,985,000`, unchanged source USDC, and no next-write authorization |
| Durable metadata publication plan | PASS, read-only STOP | Goal 10D re-verifies the frozen 351 bytes, current Irys `0.2.0` funding contract and zero balance, `3,208` lamport storage price, exact `5,000` lamport one-instruction funding fee, and `8,208` publication total; no SDK install, key, signature, funding, upload, or write occurred |
| Irys SDK and funding action gate | PASS, confirmation STOP | Goal 10E pins the two official packages, verifies their registry/source contract, records all five audit findings and exact native-SOL reachability, refreshes the `3,208 + 5,000` lamport contract, and publishes a funding-only phrase; no SDK wallet, key, signature, funding, upload, or write occurred |
| Finalized Irys metadata funding | PASS, upload STOP | Goal 10F repeats the audit/reachability and live contract before key load, simulates and finalizes one exact `3,208` lamport System transfer with a `5,000` fee at slot `441,857,234`, reconciles owner `19,976,792`, and verifies exact `3,208` Irys credit; SDK wallet and upload remain unused |
| Permanent Irys metadata upload gate | PASS, confirmation STOP | Goal 10G pins the exact direct-buffer upload and receipt contract, refreshes the tagged quote and exact `3,208` credit, and proves no top-up or Solana transaction is needed; no key, SDK wallet, upload, or write occurred |
| Verified Irys metadata upload | PASS, binding STOP | Goal 10H submits exactly one `351`-byte item, recovers its accepted ID without retry, verifies the signed receipt plus exact bytes through two distinct Irys/CDN origins, and records `3,208 → 3,208` credit (`0` spent); Goal 10I corrects its URI label, while on-chain binding remains pending |
| Canonical Irys transaction verification | PASS, write-review STOP | Goal 10I verifies exact bytes, indexed owner/token/tag/fee, live node public key, receipt signature, canonical URI, and live `CONFIRMED` status without any key or write. It corrects the old Whistleblower Arweave thresholds to supplemental evidence and records the absent Arweave copy without claiming it is finalized |
| Mainnet birth preflight | PASS, write-review STOP | Goal 10J rechecks the exact metadata contract, coherent Agent Registry package graph, all three executable Metaplex programs, exact owner balance, fixed rents, and absence of all seven future accounts at finalized slot `442,643,656`. It has no key/build/sign/send path and stops before the mandatory fresh write-specific review |
| Mainnet birth write review | PASS, confirmation STOP | Goal 10K builds one atomic `566`-byte Core Asset + Agent Identity transaction with the exact owner/asset/identity/URI and two zero signatures. Mainnet simulation passes with `5,989,200` rent, `10,000` fee, and `5,999,200` total debit; no key, signature, or submission occurred |
| Dedicated Mainnet RPC | PASS, read-only | private Helius HTTPS endpoint is stored mode-`0600`, gitignored, and returned Mainnet genesis plus health `ok`; final-asset audit remains unavailable |

Public key evidence:
[`artifacts/wallet-child-001.goal9.mainnet-readiness.json`](../artifacts/wallet-child-001.goal9.mainnet-readiness.json).
The corresponding secret files stay under gitignored
`.wallet-child/mainnet-readiness/` and must never be copied into Git, prompts,
artifacts, or normal runtime configuration.

## Blocking checklist

| Requirement | Status | What must happen before a GO |
|---|---|---|
| USDC-specific fixed intent and builder | PARTIAL | Goal 9E fixes official USDC and exactly `0.1 USDC` to isolated recovery; Goals 9P/9R compile and quote its final-address standalone message, but same-bytes funded-state simulation does not exist |
| USDC-shaped Devnet test | PASS | TEST mint/ATAs, fixed supply, bounded transfer, denial, revoke, rescue, accounting, and idempotency all finalized |
| Exact allowed programs/accounts | PARTIAL | Goals 9E–9G assert exact Core/Token/System/ATA programs, bytes, and metas; Goals 9N/9P/9R freeze all final addresses and six static exact messages, while URI-dependent and live-balance messages remain unavailable |
| Hard limits enforced in code | PARTIAL | Goals 9E–9R enforce action, treasury, setup, rescue, total-SOL, total-USD, storage quote, exact external/internal funding fees, and the fixed-rent slice; Goal 10C reconciles the bootstrap boundary and Goal 10F enforces and reconciles the exact `8,208` lamport metadata-funding outflow, while Core/plugin rent and later simulations remain |
| Exact Mainnet transaction simulation | PARTIAL | Goal 10K keylessly simulates the exact two-instruction birth message with zero signatures; execution must still simulate the freshly signed bytes with signature verification and submit those identical bytes |
| Metadata finalized and durable | PASS at Irys assurance boundary | Goal 9C freezes bytes, Goal 10H records one signed upload, and Goal 10I requires the exact bytes, fixed provenance, verified receipt, canonical URI, and live `CONFIRMED` status. Independent Arweave finalization is not observed and is explicitly supplemental rather than misreported |
| Reliable delegate enumeration | PARTIAL | Goal 9I implements the Mainnet-capable keyless path, Goal 9N fixes the final asset address, and the private Helius RPC is verified; the asset does not exist, so the required immediate post-create/pre-funding scan remains unavailable |
| Emergency rescue implementation | PARTIAL | Goals 9F/9P provide final-address owner-only capped USDC/SOL builders and Goal 9G provides recovery ATA setup; exact-message simulations remain absent |
| Funding route without main-wallet runtime | PARTIAL, bootstrap verified | Goal 10C proves the experimental source-to-owner SOL bootstrap without loading its key into the lab. Direct USDC funding, its fresh preflight/simulation/confirmation, and the public upstream-linkage caveat remain |
| Dedicated Mainnet RPC | PASS | private Helius HTTPS RPC is locally configured, secret-safe, healthy, and Mainnet genesis verified; rerun health immediately before the final asset audit |
| Dependency advisory decision | BOUNDED, RECHECK | Goal 10E records the expanded five-finding Irys graph, Goals 10F–10G pin and repeat the exact path, and Goal 10H reruns the guard immediately before key load. No further signer-capable action is authorized |

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
- [Irys SDK setup](https://docs.irys.xyz/build/d/sdk/setup) identifies the
  current `@irys/upload` and `@irys/upload-solana` packages.
- [Irys transaction IDs](https://docs.irys.xyz/build/d/features/txids)
  defines the receipt transaction ID used for gateway retrieval and
  verification.
- [Solana `getLatestBlockhash`](https://solana.com/docs/rpc/http/getlatestblockhash)
  defines the blockhash and last-valid-height read used by Goal 9M.
- [Solana `getFeeForMessage`](https://solana.com/docs/rpc/http/getfeeformessage)
  defines the exact serialized-message fee query used by Goal 9M.
- [Metaplex Core creating assets](https://www.metaplex.com/docs/smart-contracts/core/create-asset)
  documents that a Core Asset may be standalone without a Collection.
- [Solana token transfer guide](https://solana.com/docs/tokens/basics/transfer-tokens)
  documents the checked token-transfer account relationship used by Goal 9O.

## Final decision

**NO-GO for the bounded treasury action.** Goals 9A–10J close the safe local,
quote-only, external-route, approval, bootstrap execution, and finalized
read-back slice. Exactly two Solana Mainnet transactions and one Irys data
upload have occurred: the reviewed owner bootstrap, exact Irys funding
transfer, and exact metadata item. Goal 10I now passes at the documented signed
Irys assurance boundary, while the absent independent Arweave copy stays
explicit. None authorizes another write. Exact Asset/Identity messages, live audits and same-bytes simulations,
Core/plugin rent, remaining live acquisition quotes, and per-action
confirmations remain mandatory.
