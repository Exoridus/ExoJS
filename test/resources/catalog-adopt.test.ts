import '#resources/seamless';

import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { createLeaf } from '#resources/assetKindRegistry';
import { type AssetRef } from '#resources/AssetRef';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

/** Loader with all core asset bindings (mirrors createCoreLoader in loader-seamless.test.ts / asset-ref.test.ts). */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

const mockFetchImage = (): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  );
};

const mockFetchJson = (payload: unknown): void => {
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
};

describe('Loader._adopt', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('fills an externally-created placeholder Texture in place after fetch (identity preserved)', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    // Built with NO loader at all — mirrors what Assets.from() hands back.
    const leaf = createLeaf('texture', 'ship.png') as Texture;

    expect(leaf.loadState).toBe('loading');
    expect(leaf.width).toBe(0);

    loader._adopt(leaf, Symbol('claimer'));

    await expect(leaf.loaded).resolves.toBe(leaf); // heals in place — SAME object
    expect(leaf.loadState).toBe('ready');
    expect(leaf).toBeInstanceOf(Texture);
    expect(leaf.width).toBe(4);

    // The loader's own get() for the same source resolves to the adopted handle.
    expect(loader.get(Texture, 'ship.png')).toBe(leaf);
  });

  test('adopting the same handle twice does not restart the fetch (idempotent)', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const leaf = createLeaf('texture', 'ship.png') as Texture;
    const claimer = Symbol('claimer');

    loader._adopt(leaf, claimer);
    loader._adopt(leaf, claimer);

    await expect(leaf.loaded).resolves.toBe(leaf);
    expect(leaf.loadState).toBe('ready');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('fills an externally-created value leaf (AssetRef) in place after fetch', async () => {
    mockFetchJson({ hp: 3 });
    const loader = createCoreLoader();

    const leaf = createLeaf('json', 'cfg.json') as AssetRef<unknown>;

    expect(leaf.loadState).toBe('loading');
    expect(() => leaf.value).toThrow("'loading'");

    loader._adopt(leaf, Symbol('claimer'));

    await expect(leaf.loaded).resolves.toEqual({ hp: 3 });
    expect(leaf.loadState).toBe('ready');
    expect(leaf.value).toEqual({ hp: 3 });
  });

  test('throws for a value with no assetMeta stamp', () => {
    const loader = createCoreLoader();

    expect(() => loader._adopt({}, Symbol('claimer'))).toThrow('no assetMeta');
  });
});
