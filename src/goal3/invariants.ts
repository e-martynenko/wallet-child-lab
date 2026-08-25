export type Goal3ReadBack = {
  owner: string;
  collection: {
    publicKey: string;
    programOwner: string;
    updateAuthority: string;
    name: string;
    uri: string;
    numMinted: number;
    currentSize: number;
  };
  asset: {
    publicKey: string;
    programOwner: string;
    owner: string;
    updateAuthorityType: string;
    updateAuthorityAddress: string | undefined;
    name: string;
    uri: string;
    agentIdentityUris: string[];
  };
  agentIdentity: {
    publicKey: string;
    programOwner: string;
    linkedAsset: string;
    agentToken: null | string;
  };
  assetSigner: {
    publicKey: string;
    balanceLamports: bigint;
  };
};

export type Goal3Expected = {
  coreProgram: string;
  agentIdentityProgram: string;
  collection: string;
  asset: string;
  agentIdentity: string;
  assetSigner: string;
  collectionName: string;
  collectionUri: string;
  assetName: string;
  assetUri: string;
  agentIdentityUri: string;
};

export class Goal3InvariantError extends Error {
  override readonly name = 'Goal3InvariantError';
}

function requireEqual(
  label: string,
  actual: string | number | bigint | null | undefined,
  expected: string | number | bigint | null,
): void {
  if (actual !== expected) {
    throw new Goal3InvariantError(`${label} did not match the expected value.`);
  }
}

export function assertGoal3ReadBack(
  actual: Goal3ReadBack,
  expected: Goal3Expected,
): void {
  requireEqual('Collection address', actual.collection.publicKey, expected.collection);
  requireEqual('Collection program owner', actual.collection.programOwner, expected.coreProgram);
  requireEqual('Collection update authority', actual.collection.updateAuthority, actual.owner);
  requireEqual('Collection name', actual.collection.name, expected.collectionName);
  requireEqual('Collection URI', actual.collection.uri, expected.collectionUri);
  requireEqual('Collection minted count', actual.collection.numMinted, 1);
  requireEqual('Collection current size', actual.collection.currentSize, 1);

  requireEqual('Asset address', actual.asset.publicKey, expected.asset);
  requireEqual('Asset program owner', actual.asset.programOwner, expected.coreProgram);
  requireEqual('Asset owner', actual.asset.owner, actual.owner);
  requireEqual('Asset update authority type', actual.asset.updateAuthorityType, 'Collection');
  requireEqual('Asset collection', actual.asset.updateAuthorityAddress, expected.collection);
  requireEqual('Asset name', actual.asset.name, expected.assetName);
  requireEqual('Asset URI', actual.asset.uri, expected.assetUri);

  if (
    actual.asset.agentIdentityUris.length !== 1 ||
    actual.asset.agentIdentityUris[0] !== expected.agentIdentityUri
  ) {
    throw new Goal3InvariantError(
      'Asset Agent Identity plugin did not contain exactly the expected URI.',
    );
  }

  requireEqual('Agent Identity address', actual.agentIdentity.publicKey, expected.agentIdentity);
  requireEqual(
    'Agent Identity program owner',
    actual.agentIdentity.programOwner,
    expected.agentIdentityProgram,
  );
  requireEqual('Agent Identity linked asset', actual.agentIdentity.linkedAsset, expected.asset);
  requireEqual('Agent Identity token', actual.agentIdentity.agentToken, null);

  requireEqual('Asset Signer address', actual.assetSigner.publicKey, expected.assetSigner);
  requireEqual('Asset Signer balance', actual.assetSigner.balanceLamports, 0n);

  const roleAddresses = [actual.owner, expected.asset, expected.agentIdentity, expected.assetSigner];
  if (new Set(roleAddresses).size !== roleAddresses.length) {
    throw new Goal3InvariantError('Owner, asset, Agent Identity, and Asset Signer must be distinct.');
  }
}
