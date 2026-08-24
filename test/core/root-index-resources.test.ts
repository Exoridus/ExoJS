import * as exo from '#index';

describe('root index resources exports', () => {
  test('re-exports resource tokens, stores, and the built-in asset types', () => {
    expect(exo.Json).toBeDefined();
    expect(exo.TextAsset).toBeDefined();
    expect(exo.SvgAsset).toBeDefined();
    expect(exo.IndexedDbStore).toBeDefined();
    expect(exo.MemoryStore).toBeDefined();
    expect(exo.WebStorageStore).toBeDefined();
    expect(exo.IndexedDbKeyValueStore).toBeDefined();
    expect(exo.Loader).toBeDefined();
    expect(exo.coreAssetTypes).toBeDefined();
    expect(exo.jsonType).toBeDefined();
    expect(exo.textType).toBeDefined();
    expect(exo.svgType).toBeDefined();
    expect(exo.textureType).toBeDefined();
  });
});
