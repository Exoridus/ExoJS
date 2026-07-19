import type { Application } from '#core/Application';
import { SceneLoader } from '#core/scene/SceneLoader';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import type { LoadingQueue } from '#resources/LoadingQueue';

// Mirrors test/resources/catalog-adopt.test.ts's texture harness (createImageBitmap
// stub + fetch mock) combined with test/core/scene-loader.test.ts's fake-Application
// pattern (a real Loader wrapped in `{ loader } as unknown as Application`).
const originalFetch = global.fetch;

function mockFetchImage(): void {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  );
}

function mockFetchJson(payload: unknown): void {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => JSON.stringify(payload),
        arrayBuffer: async () => new ArrayBuffer(0),
      }) as unknown as Response,
  );
}

function makeSceneLoaderWithTextures(): { sceneLoader: SceneLoader; loader: Loader } {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  const app = { loader } as unknown as Application;
  const sceneLoader = new SceneLoader(app);

  return { sceneLoader, loader };
}

describe('SceneLoader catalog adopt', () => {
  beforeEach(() => {
    mockFetchImage();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('claims catalog leaves under its own scope and releases on destroy', async () => {
    const { sceneLoader, loader } = makeSceneLoaderWithTextures();
    const assets = new Assets({ ship: { kind: 'texture', source: 'ship.png' } });

    sceneLoader.load(assets);
    await assets.ship.loaded;
    expect(assets.ship.loadState).toBe('ready');

    const key = loader['_key'](Texture, 'ship.png');
    expect(loader['_claims'].get(key)?.scopes.size).toBe(1);

    sceneLoader.destroy();
    // last claim gone → evicted (payload dropped, identity kept, back to 'loading')
    expect(assets.ship.loadState).toBe('loading');
  });

  test('get(catalog) adopts every leaf under its own scope', async () => {
    const { sceneLoader, loader } = makeSceneLoaderWithTextures();
    const assets = new Assets({ ship: { kind: 'texture', source: 'ship.png' } });

    const got = sceneLoader.get(assets);
    expect(got.ship).toBe(assets.ship);

    await assets.ship.loaded;
    expect(assets.ship.loadState).toBe('ready');
    expect(assets.ship).toBeInstanceOf(Texture);

    const key = loader['_key'](Texture, 'ship.png');
    expect(loader['_claims'].get(key)?.scopes.size).toBe(1);

    sceneLoader.destroy();
    expect(assets.ship.loadState).toBe('loading');
  });

  // NEW-1: `SceneLoader.load` was missing the single-leaf overloads that
  // `SceneLoader.get` already had, so `sceneLoader.load(assets.ship)` typed
  // against the wrong (greedy) overload. These mirror Loader.load's leaf
  // overloads (including the M1 AssetRef discriminator) verbatim.
  test('load(single resource leaf) claims under its own scope', async () => {
    const { sceneLoader, loader } = makeSceneLoaderWithTextures();
    const assets = new Assets({ ship: { kind: 'texture', source: 'ship.png' } });

    const result = await sceneLoader.load(assets.ship);

    expect(result).toBe(assets.ship); // resource leaf resolves to the healed handle itself
    expect(assets.ship.loadState).toBe('ready');

    const key = loader['_key'](Texture, 'ship.png');
    expect(loader['_claims'].get(key)?.scopes.size).toBe(1);

    sceneLoader.destroy();
    expect(assets.ship.loadState).toBe('loading');
  });

  test('load(single value leaf) resolves the raw value, mirroring Loader.load(AssetRef leaf)', async () => {
    mockFetchJson({ hp: 3 });
    const { sceneLoader } = makeSceneLoaderWithTextures(); // loader carries coreAssetBindings, incl. json
    const assets = new Assets({ config: { kind: 'json', source: 'cfg.json' } });

    const result = await sceneLoader.load(assets.config);

    expect(result).toEqual({ hp: 3 }); // raw value, not the AssetRef itself
    expect(assets.config.value).toEqual({ hp: 3 }); // ref healed in place
  });

  test('type-level: SceneLoader.load leaf/catalog overloads mirror Loader.load', () => {
    const { sceneLoader } = makeSceneLoaderWithTextures();
    const assets = new Assets({
      ship: { kind: 'texture', source: 'ship.png' },
      config: { kind: 'json', source: 'cfg.json' },
    });

    // Each assertion is wrapped in an uncalled arrow so only the overload
    // resolution is checked — invoking `load()` for real here would fire an
    // unmocked fetch.
    //
    // Value leaf (AssetRef<T>): resolves to LoadingQueue<T>, never LoadingQueue<AssetRef<T>>.
    expectTypeOf(() => sceneLoader.load(assets.config)).returns.toEqualTypeOf<LoadingQueue<unknown>>();
    // Resource leaf: resolves to LoadingQueue<T> for the handle type itself.
    expectTypeOf(() => sceneLoader.load(assets.ship)).returns.toEqualTypeOf<LoadingQueue<Texture>>();
    // Catalog form still resolves to the full loaded map.
    expectTypeOf(() => sceneLoader.load(assets)).returns.toEqualTypeOf<LoadingQueue<{ ship: Texture; config: unknown }>>();
  });
});
