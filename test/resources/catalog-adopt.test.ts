import '#resources/seamless';

import { logger } from '#core/logging';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { createLeaf } from '#resources/assetKindRegistry';
import { type AssetRef } from '#resources/AssetRef';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import type { LoadingQueue } from '#resources/LoadingQueue';
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
    const warnSpy = vi.spyOn(logger, 'warn');

    loader._adopt(leaf, claimer);
    loader._adopt(leaf, claimer);

    await expect(leaf.loaded).resolves.toBe(leaf);
    expect(leaf.loadState).toBe('ready');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Idempotent re-adopt of the SAME handle must stay a silent no-op.
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('duplicate source, different handle, still in flight: dev-warns instead of hanging silently (§7 gap)', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnSpy = vi.spyOn(logger, 'warn');

    const a = createLeaf('texture', 'x.png') as Texture;
    const b = createLeaf('texture', 'x.png') as Texture;

    loader._adopt(a, Symbol('claimer-a'));
    loader._adopt(b, Symbol('claimer-b'));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('duplicate source "x.png"');

    warnSpy.mockRestore();
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

describe('Loader.get / load — Assets catalog adoption (end-to-end)', () => {
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

  test('get(catalog) adopts every leaf, returns the SAME leaf objects, and they heal after fetch', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const catalog = new Assets({
      ship: { type: 'texture', source: 'ship.png' },
      logo: { type: 'texture', source: 'logo.png' },
    });

    const got = loader.get(catalog);

    // Per-catalog identity: the returned map holds the catalog's own leaves.
    expect(got.ship).toBe(catalog.ship);
    expect(got.logo).toBe(catalog.logo);
    expect(catalog.ship.loadState).toBe('loading');

    await Promise.all([catalog.ship.loaded, catalog.logo.loaded]);

    expect(catalog.ship.loadState).toBe('ready');
    expect(catalog.ship.width).toBe(4);
    // The loader's own get() for the same source resolves to the adopted leaf.
    expect(loader.get(Texture, 'ship.png')).toBe(catalog.ship);
  });

  test('load(catalog) resolves to a map of loaded values, forwards onProgress, and heals the SAME leaves as get', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const catalog = new Assets({
      ship: { type: 'texture', source: 'ship.png' },
      logo: { type: 'texture', source: 'logo.png' },
    });

    const progress: number[] = [];
    const queue = loader.load(catalog);
    queue.onProgress.add(p => progress.push(p.loaded));

    const result = await queue;

    // A resource leaf's `.loaded` resolves to the handle itself → the resolved
    // map holds the catalog's own leaves, which have healed in place.
    expect(result.ship).toBe(catalog.ship);
    expect(result.logo).toBe(catalog.logo);
    expect(catalog.ship.loadState).toBe('ready');
    expect(progress.at(-1)).toBe(2);
  });

  test('load(catalog) resolves a value leaf to its raw parsed value while healing its ref in place', async () => {
    mockFetchJson({ hp: 7 });
    const loader = createCoreLoader();
    const catalog = new Assets({ config: { type: 'json', source: 'cfg.json' } });

    const result = await loader.load(catalog);

    expect(result.config).toEqual({ hp: 7 }); // raw value in the resolved map
    expect(catalog.config.value).toEqual({ hp: 7 }); // the ref healed in place
  });

  // M1: `load(leaf)` had a single generic overload (`<T extends object>(leaf: T):
  // LoadingQueue<T>`) that types a value leaf's result as the AssetRef itself,
  // while at runtime `AssetRef.loaded` resolves to the raw parsed value (see the
  // `_createAdoptedQueue` "value leaf" case above `LoadingQueue<T>` is right for a
  // resource leaf, but wrong for `AssetRef<T>`). A discriminating `load<T>(leaf:
  // AssetRef<T>): LoadingQueue<T>` overload must be declared first so it wins.
  test('type-level: load(AssetRef leaf) resolves LoadingQueue<T>, not LoadingQueue<AssetRef<T>>', () => {
    const loader = createCoreLoader();
    const catalog = new Assets({ config: { type: 'json', source: 'cfg.json' } });
    const textureCatalog = new Assets({ ship: { type: 'texture', source: 'ship.png' } });

    // Each assertion is wrapped in an uncalled arrow so only the overload
    // resolution is checked — invoking `load()` for real here would fire an
    // unmocked fetch.
    //
    // catalog.config: AssetRef<unknown> — load() must resolve to the raw value
    // type (`unknown`), never to `LoadingQueue<AssetRef<unknown>>`.
    expectTypeOf(() => loader.load(catalog.config)).returns.toEqualTypeOf<LoadingQueue<unknown>>();

    // A resource leaf (Texture) is unaffected: it still resolves to itself.
    expectTypeOf(() => loader.load(textureCatalog.ship)).returns.toEqualTypeOf<LoadingQueue<Texture>>();
  });

  test('two catalogs with the same source get DISTINCT leaf objects that both heal from ONE fetch (source-keyed dedup)', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const a = new Assets({ ship: { type: 'texture', source: 'ship.png' } });
    const b = new Assets({ ship: { type: 'texture', source: 'ship.png' } });

    expect(a.ship).not.toBe(b.ship); // per-catalog identity

    loader.get(a);
    await a.ship.loaded;
    expect(a.ship.loadState).toBe('ready');

    // Adopting b's leaf fills it in place from the already-stored payload.
    loader.get(b);
    await b.ship.loaded;

    expect(b.ship.loadState).toBe('ready');
    expect(b.ship.width).toBe(4);
    expect(b.ship).not.toBe(a.ship); // still distinct objects
    expect(global.fetch).toHaveBeenCalledTimes(1); // one network fetch for the shared source
  });

  // §7 accepted gap: a single catalog with two fields pointing at the same
  // source produces two DIFFERENT leaves for the same key. The first leaf
  // registers and starts the fetch; the second leaf's key is already taken by
  // an in-flight (not-yet-stored) handle, so it can't be filled by either the
  // fresh-registration path or the already-stored fast path — it hangs at
  // 'loading' forever. §7's per-key multi-handle tracking closes this gap;
  // until then, `_adopt` dev-warns instead of hanging silently.
  test('duplicate source within one catalog: adopting the second leaf while the first is in flight dev-warns exactly once', () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnSpy = vi.spyOn(logger, 'warn');
    const catalog = new Assets({
      a: { type: 'texture', source: 'x.png' },
      b: { type: 'texture', source: 'x.png' },
    });

    loader.get(catalog);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('duplicate source "x.png"');

    warnSpy.mockRestore();
  });
});
