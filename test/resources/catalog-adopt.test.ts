import '#resources/seamless';

import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { createLeaf } from '#resources/assetKindRegistry';
import { type AssetRef } from '#resources/AssetRef';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import { Json } from '#resources/tokens';

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

  test('resource already stored elsewhere before adopt: fills the adopted handle in place, preserves per-catalog identity, and release() finds its claim', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    // "Loaded elsewhere earlier" — the core catalog scenario: some other
    // consumer already claimed and fully loaded this source under its own
    // scope, well before this leaf is ever adopted.
    const stored = loader.get(Texture, 'x.png');
    await stored.loaded;
    expect(stored.loadState).toBe('ready');
    expect(stored.width).toBe(4);

    // Built with NO loader at all — mirrors what Assets.from() hands back —
    // and is a DISTINCT object from the already-stored resource.
    const leaf = createLeaf('texture', 'x.png') as Texture;
    expect(leaf.loadState).toBe('loading');
    expect(leaf).not.toBe(stored);

    const claimer = Symbol('adopter');
    loader._adopt(leaf, claimer);

    // Bug: previously only _claim() ran for the already-stored branch, so the
    // adopted leaf never healed and stayed 'loading' forever.
    expect(leaf.loadState).toBe('ready');
    await expect(leaf.loaded).resolves.toBe(leaf);
    expect(leaf.width).toBe(4);
    expect(leaf).not.toBe(stored); // filled in place, not swapped — identity preserved

    // Bug: _handleKeys was never registered for this branch, so release(handle)
    // silently couldn't resolve the key and the claim leaked. release(handle)
    // always targets the app-lifetime root claimer (same scope loader.get()
    // claimed under above), so it must now actually drop that scope.
    const key = loader['_key'](Texture, 'x.png');
    expect(loader['_claims'].get(key)?.scopes.has(loader['_rootClaimer'])).toBe(true);

    loader.release(leaf);

    expect(loader['_claims'].get(key)?.scopes.has(loader['_rootClaimer'])).toBe(false);
    expect(stored.loadState).toBe('ready'); // adopter's own claim still holds it alive
    expect(stored.width).toBe(4);

    // Releasing the adopter's own claim too drops the last scope → eviction.
    loader._release(key, claimer);
    expect(stored.loadState).toBe('loading');
    expect(stored.width).toBe(0);
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

  test('value already stored elsewhere before adopt: fills the adopted AssetRef in place and release() finds its claim', async () => {
    mockFetchJson({ hp: 3 });
    const loader = createCoreLoader();

    // "Loaded elsewhere earlier" — the core catalog scenario: a bulk load()
    // (not get()) already resolved this value under its own scope, well
    // before this leaf is ever adopted, and — crucially — WITHOUT ever
    // creating an AssetRef for the key (load() never touches `_refs`), so
    // this exercises the exact stored-raw-value fast path `_getRef` uses.
    await loader.load(Json, 'cfg.json');

    const leaf = createLeaf('json', 'cfg.json') as AssetRef<unknown>;
    expect(leaf.loadState).toBe('loading');

    const claimer = Symbol('adopter');
    loader._adopt(leaf, claimer);

    // Bug: previously only _claim() ran, so the adopted ref never filled and
    // .value stayed stuck throwing "'loading'" forever.
    expect(leaf.loadState).toBe('ready');
    await expect(leaf.loaded).resolves.toEqual({ hp: 3 });
    expect(leaf.value).toEqual({ hp: 3 });

    // Bug: release(handle) couldn't resolve the key for this branch either.
    const key = loader['_key'](Json, 'cfg.json');
    expect(loader['_claims'].get(key)?.scopes.has(loader['_rootClaimer'])).toBe(true);

    loader.release(leaf);

    expect(loader['_claims'].get(key)?.scopes.has(loader['_rootClaimer'])).toBe(false);
  });

  test('throws for a value with no assetMeta stamp', () => {
    const loader = createCoreLoader();

    expect(() => loader._adopt({}, Symbol('claimer'))).toThrow('no assetMeta');
  });
});
