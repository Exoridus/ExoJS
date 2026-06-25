import * as exo from '#index';

describe('root index resources exports', () => {
  test('re-exports resource tokens, stores, and factories', () => {
    expect(exo.Json).toBeDefined();
    expect(exo.TextAsset).toBeDefined();
    expect(exo.SvgAsset).toBeDefined();
    expect(exo.IndexedDbStore).toBeDefined();
    expect(exo.MemoryStore).toBeDefined();
    expect(exo.WebStorageStore).toBeDefined();
    expect(exo.IndexedDbKeyValueStore).toBeDefined();
    expect(exo.Loader).toBeDefined();
    expect(exo.defineAssetManifest).toBeDefined();
    expect(exo.BundleLoadError).toBeDefined();
    expect(exo.JsonFactory).toBeDefined();
    expect(exo.TextFactory).toBeDefined();
    expect(exo.SvgFactory).toBeDefined();
  });
});
