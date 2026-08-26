import { type AssetFactory, type AssetSourceCodec, AssetType, jsonSourceCodec, SingleEntryLayout } from '@codexo/exojs';

// #region guide:custom-asset-type
interface WorldData {
  readonly name: string;
}

class World {
  public constructor(public readonly data: WorldData) {}
}

class WorldAssetType extends AssetType<WorldData, World, undefined, string> {
  public readonly id = 'com.example.world';
  public readonly codec = jsonSourceCodec as AssetSourceCodec<WorldData, string>;

  // Raised because the codec now keeps the response text, where version 1
  // kept the parsed object. Records written under version 1 are re-acquired.
  public override readonly layout = SingleEntryLayout.version<string>(2);

  public createFactory(): AssetFactory<WorldData, World> {
    return { create: data => Promise.resolve(new World(data)) };
  }
}
// #endregion guide:custom-asset-type
