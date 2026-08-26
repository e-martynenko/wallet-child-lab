# Goal 10D review — durable metadata publication plan

Status: **PASS — read-only plan complete; STOP before SDK integration or write**

## Built

- one public-data-only planner for the exact frozen 351-byte metadata file;
- current Irys version, SOL funding address, owner balance, storage price, and
  gateway contract checks;
- one exact unsigned legacy System transfer from the isolated owner to the
  current Irys funding address;
- finalized Mainnet owner balance, fixed-rent, blockhash, and exact-message fee
  reads through the dedicated RPC;
- fail-closed checks for metadata, owner, Irys, message-shape, fee, and budget
  drift;
- a narrow three-attempt retry only for RPC `-32016` minimum-context lag.

## Evidence

- public artifact:
  [`wallet-child-001.goal10d.metadata-publication-plan.json`](../../artifacts/wallet-child-001.goal10d.metadata-publication-plan.json);
- frozen metadata SHA-256:
  `7f43011c5eed503f2373717a4d9f31e1f9f5cc4c598c89651bf283f6cbb8777c`;
- owner balance at finalized slot `441,813,007`: `19,985,000` lamports;
- Irys version `0.2.0`, owner Irys balance `0`, storage quote `3,208`
  lamports;
- exact one-instruction funding message fee at slot `441,813,009`: `5,000`
  lamports;
- metadata publication total: `8,208` lamports;
- fixed known future owner costs after publication: `8,525,488` lamports;
- owner remaining after that known slice: `11,459,512` lamports.

## Tests

- full regression suite: `34/34` files and `259/259` tests PASS;
- TypeScript: PASS;
- production dependency audit: the same previously accepted moderate
  transitive `uuid` advisory remains; no new dependency was installed;
- exact legacy System transfer accounts, bytes, amount, and digest: PASS;
- public Irys and finalized RPC read sequence: PASS;
- owner/Irys/address/fee drift rejection: PASS;
- narrow minimum-context retry: PASS;
- absence of keys, signing, funding, upload, simulation, or send paths: PASS.

## Security findings

1. Irys funding and metadata upload are separate actions. Funding is a Solana
   transfer; upload signs an Irys data item and submits it to the uploader.
2. The current official Node workflow uses `@irys/upload` and
   `@irys/upload-solana`. Their current reviewed versions are `0.0.15` and
   `0.1.8`; neither package was installed in this goal.
3. The reviewed Solana adapter exposes `disablePriorityFees: true`. Goal 10E
   must use that option and compare the SDK-built funding bytes with this exact
   one-instruction contract before any signature.
4. No message bytes were published. The live blockhash expired and the public
   digest cannot be signed or submitted.
5. The RPC credential, owner key, and external source key were not printed,
   loaded, or copied into the repository.
6. The `0.02 SOL` acquisition accounting remains `19,995,001` allocated and
   `4,999` unallocated. Spending owner-held SOL does not acquire additional
   SOL, and no top-up is allowed.
7. The production audit is not clean. Its sole finding is the unchanged Goal
   9D `uuid` buffer-path advisory, and the existing reachability guard passed.

## Unexpected findings

- one live run encountered Helius `-32016` because a backend had not reached
  the requested minimum context. The planner stopped. A bounded retry for only
  this exact read-only condition was then added and tested; `minContextSlot`
  was not removed.

## Remaining uncertainty

1. Exact Core Asset rent and Agent Identity plugin top-up remain unknown.
2. URI-dependent Asset/Identity messages and fees cannot be frozen before a
   durable URI exists.
3. The live SOL rescue amount/fee and all same-signed-bytes simulations remain
   blocked on later state.
4. The signer-capable Irys SDK integration and its exact funding/upload action
   contract do not yet exist.
5. The final `0.1 USDC` treasury action remains `NO_GO`.

## Recommendation

**PASS Goal 10D and STOP.** Goal 10E may install only the two pinned official
Irys packages and build a preview-only action path. It must not fund or upload
without a new exact action-time review and confirmation.

## Current primary sources

- [Irys Node SDK setup](https://docs.irys.xyz/build/d/sdk/setup)
- [Irys NFT metadata upload guide](https://docs.irys.xyz/build/d/guides/uploading-nfts)
- [Irys supported tokens](https://docs.irys.xyz/build/d/features/supported-tokens)
- [Irys networks](https://docs.irys.xyz/build/d/networks)
- [Irys JavaScript SDK repository](https://github.com/Irys-xyz/js-sdk)
- [Irys Solana package source](https://github.com/Irys-xyz/js-sdk/blob/master/packages/solana-node/README.md)
