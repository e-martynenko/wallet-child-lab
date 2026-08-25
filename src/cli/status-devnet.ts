import { parseWalletChildConfig, type WalletChildConfig } from '../config/env.js';
import {
  readGoal4WalletStatus,
  type TokenAccountSummary,
} from '../goal4/wallet.js';
import { readGoal5Status } from '../goal5/status.js';

function redactRpcUrl(message: string, config?: WalletChildConfig): string {
  return config ? message.replaceAll(config.rpcUrl, config.rpcOrigin) : message;
}

function formatSol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n)
    .toString()
    .padStart(9, '0');
  return `${whole}.${fraction} SOL`;
}

function printTokenAccounts(
  label: string,
  accounts: TokenAccountSummary[],
): void {
  console.info(`${label}: ${accounts.length}`);
  for (const account of accounts) {
    console.info(
      `  ${account.address} | mint ${account.mint} | raw ${account.amount} | decimals ${account.decimals}`,
    );
  }
}

async function main(): Promise<void> {
  let config: WalletChildConfig | undefined;
  try {
    config = parseWalletChildConfig(process.env);
    const [status, lifecycle] = await Promise.all([
      readGoal4WalletStatus(config),
      readGoal5Status(config),
    ]);
    console.info('Wallet Child #001');
    console.info('Network: devnet');
    console.info(`Owner: ${status.owner}`);
    console.info(`Core Asset: ${status.asset}`);
    console.info(`Collection: ${status.collection}`);
    console.info(`Agent Identity PDA: ${status.agentIdentity}`);
    console.info(`Asset Signer Wallet: ${status.assetSigner}`);
    console.info(`Registration URI: ${status.registrationUri}`);
    console.info('Registered: YES');
    console.info(`Executive: ${lifecycle.executive}`);
    if (lifecycle.delegation !== 'NONE') {
      console.info(`Executive Profile: ${lifecycle.executiveProfile}`);
    }
    console.info(`Execution delegation: ${lifecycle.delegation}`);
    console.info(
      `Agent wallet balance: ${status.balanceLamports} lamports (${formatSol(status.balanceLamports)})`,
    );
    printTokenAccounts('SPL Token accounts', status.tokenAccounts.legacy);
    printTokenAccounts('Token-2022 accounts', status.tokenAccounts.token2022);
    console.info(`Relationship: owner -> asset = ${status.relationship.assetOwner}`);
    console.info(
      `Relationship: asset -> collection = ${status.relationship.assetCollection}`,
    );
    console.info(
      `Relationship: identity -> asset = ${status.relationship.identityAsset}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.';
    throw new Error(redactRpcUrl(message, config));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown failure.';
  console.error(`Status stopped: ${message}`);
  process.exitCode = 1;
});
