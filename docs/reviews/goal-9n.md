# Goal 9N review — final standalone Mainnet identity addresses

Status: **PASS — final addresses frozen; all remain absent on Mainnet**

## Built

- one isolated Core Asset account stored locally at mode `0600`;
- standalone-asset architecture with no Mainnet Collection;
- canonical derivation of the Agent Identity PDA, Asset Signer PDA, official
  USDC ATA for the Asset Signer, and official USDC ATA for recovery;
- strict separation from every Mainnet/Devnet principal and the funding source;
- one finalized Mainnet availability read for every new address;
- no transaction builder, signer invocation, simulation, or send path.

## Evidence

- address implementation:
  [`identity-addresses.ts`](../../src/goal9n/identity-addresses.ts);
- preparation CLI:
  [`prepare-mainnet-identity.ts`](../../src/cli/prepare-mainnet-identity.ts);
- public artifact:
  [`wallet-child-001.goal9n.identity-addresses.json`](../../artifacts/wallet-child-001.goal9n.identity-addresses.json);
- Core Asset: `HPaGuhYf2qu8UQ7ofJsfjiEzhnoqVmTN9WrGWmuC1Uty`;
- Agent Identity: `EDT4DguQoQgUcEWP7h9z7F4Z5N75oinW6r9PhhuReXf8`;
- Asset Signer PDA: `5Snge43iBczUT16b4ndffdgB4xxR2Bev9vxvLRe5YWyu`;
- Asset Signer USDC ATA: `hCmisMZFRL7SWKvgdtFWXMTDW3PY858Kmvg6dQ8GQMU`;
- recovery USDC ATA: `8dbJMqCGAMTuJZ5ZZZeQMT43WqkkrwmBiyEJRH8szAd`;
- finalized Mainnet absence slot: `441,642,028`;
- focused tests: 5, PASS.

## Tests

- isolated file creation, mode `0600`, and idempotent reload: PASS;
- canonical PDA and ATA derivation: PASS;
- Devnet/Mainnet principal reuse: DENY;
- mutation-capability source scan: PASS;
- public artifact derivation and secret-field scan: PASS;
- `pnpm run typecheck`: PASS;
- `pnpm test`: 25 files, 208 tests, PASS.

## Security findings

1. The Core Asset account requires local signing only when it is first created
   on-chain. Its local material remains gitignored and was never printed.
2. The Asset Signer PDA is not this Core Asset account signer. It has no private
   key and is derived from the final Core Asset address.
3. Removing the optional Collection reduces the message count, metadata
   surface, rent, and failure modes without weakening Asset Signer ownership.
4. Final addresses are not final live state. All five accounts were still
   absent at the recorded finalized slot.

## Unexpected findings

- current official Metaplex Core guidance explicitly treats Collections as
  optional; the original Devnet learning topology need not be copied into the
  minimal Mainnet experiment;
- fixing the Core Asset address now also closes the unknown destination for the
  future direct USDC transfer, although that message remains unbuilt.

## Remaining uncertainty

1. The durable metadata URI is still unavailable.
2. Exact standalone create/register/ATA/delegate messages, rents, fees, and
   simulations are not yet frozen.
3. The final Asset cannot pass a live delegate audit before it exists.
4. No source-wallet or local Mainnet signer has signed anything.
5. The exact phrase `ENABLE MAINNET EXPERIMENT` has not been provided.

## Recommendation

**PASS Goal 9N and continue offline/read-only remediation.** Populate every
final-address policy and compile the exact unsigned phased message set next.
Keep all Mainnet accounts unfunded and absent.

## Authoritative sources

- [Metaplex Core creating assets](https://www.metaplex.com/docs/smart-contracts/core/create-asset)
  documents standalone Assets and optional Collection membership;
- [Metaplex Agent Registry identity](https://www.metaplex.com/docs/smart-contracts/mpl-agent/identity)
  documents the Agent Identity PDA and single registration instruction.
