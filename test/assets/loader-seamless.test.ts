import { expectTypeOf } from 'vitest';

import { Asset } from '#assets/Asset';
import { AssetNetworkError } from '#assets/AssetNetworkError';
import { Assets } from '#assets/Assets';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader, LoadPriority } from '#assets/Loader';
import { textureSeamlessAdapter } from '#assets/seamless';
import { logger, LogSeverity } from '#core/Logger';
import { materializeAssetTypes } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes } from '#rendering/types';

import { testAssetType } from './test-asset-type';

/** Loader with all core asset bindings (mirrors createCoreLoader in loader.test.ts). */
const createCoreLoader = (): Loader => {
  const loader = new Loader();
  materializeAssetTypes(loader, coreAssetTypes);
  return loader;
};

// Declaration merge for the test-only asset type used below.
declare module '#assets/AssetDefinitions' {
  interface AssetDefinitions {
    nullable: { resource: null | undefined; config: { source: string } };
  }
}

/**
 * `get()` has no overload for an unsupported input - the rejection under test
 * is a runtime one, so the call goes through the implementation signature.
 */
const getUnsupported = (loader: Loader, input: object): unknown => (loader as unknown as { get(input: object): unknown }).get(input);

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

const mockFetch404 = (): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }) as Response,
  );
};

describe('Loader seamless get (Texture)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
    logger._resetOnce();
  });

  test('returns a Texture synchronously in the loading state', () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get('ship.png');

    expect(handle).toBeInstanceOf(Texture);
    expect(handle.loadState).toBe('loading');
    expect(handle.width).toBe(0);
  });

  test('fills the handle in place when the fetch completes', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get('ship.png');
    const versionBefore = handle.version;

    await expect(handle.loaded).resolves.toBe(handle);
    expect(handle.loadState).toBe('ready');
    expect(handle.width).toBe(16);
    expect(handle.version).toBeGreaterThan(versionBefore);
  });

  test('same source returns the same instance, before and after completion', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const first = loader.get('ship.png');
    const second = loader.get('ship.png');

    expect(second).toBe(first);

    await first.loaded;

    expect(loader.get('ship.png')).toBe(first);
    expect(loader._peekResource(Texture, 'ship.png')).not.toBeNull();
  });

  test('load() after get() resolves to the SAME handle instance', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get('ship.png');
    const loaded = await loader.load('ship.png');

    expect(loaded).toBe(handle);
    expect(handle.loadState).toBe('ready');
  });

  test('get() after a completed load() returns the stored instance', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const loaded = await loader.load('ship.png');
    const handle = loader.get('ship.png');

    expect(handle).toBe(loaded);
    expect(handle.loadState).toBe('ready');
  });

  test('onLoaded dispatches with the handle as the stored resource', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const seen: unknown[] = [];

    loader.onLoaded.add((_type, _alias, resource) => seen.push(resource));

    const handle = loader.get('ship.png');

    await handle.loaded;
    expect(seen).toEqual([handle]);
  });

  test('get() rejects an input that is neither a path, a descriptor, a catalog, nor a leaf', () => {
    const loader = createCoreLoader();

    // The constructor-token lookup form `get(SomeType, alias)` is gone: a plain
    // object/constructor no longer has a branch to fall through to.
    class Adapterless {}

    expect(() => getUnsupported(loader, Adapterless)).toThrow('accepts a path string');
    expect(() => getUnsupported(loader, {})).toThrow('accepts a path string');
  });

  test('a handler that legitimately resolves to null/undefined stores that value (presence, not truthiness)', async () => {
    const loader = createCoreLoader();

    // A custom type with no catalog leaf whose factory resolves `null`/`undefined`
    // as the actual stored resource. The residency store must distinguish "never
    // loaded" from "loaded, and the resource itself is nullish" - presence, not
    // truthiness (a `Map.has()` check, not a `!== null` check on the read value).
    // Observable through the load fast path: a re-load of a stored nullish
    // resource must NOT re-invoke the factory.
    class Nullable {}

    let calls = 0;

    loader._installAssetTypes([
      testAssetType<string, null | undefined>({
        id: 'nullable',
        token: Nullable,
        leaf: 'none',
        acquires: false,
        create: async (_source, context) => {
          calls++;

          return context.source === 'undef' ? undefined : null;
        },
      }),
    ]);

    await expect(loader.load(new Asset({ type: 'nullable', source: 'null' }))).resolves.toBeNull();
    await expect(loader.load(new Asset({ type: 'nullable', source: 'undef' }))).resolves.toBeUndefined();
    expect(calls).toBe(2);

    // Re-loading either source reads the stored nullish value instead of refetching.
    await expect(loader.load(new Asset({ type: 'nullable', source: 'null' }))).resolves.toBeNull();
    await expect(loader.load(new Asset({ type: 'nullable', source: 'undef' }))).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  test('an identity-relevant option (mimeType) splits one source into independent handles, silently', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnings: string[] = [];
    const removeSink = logger.addSink(entry => {
      if (entry.severity === LogSeverity.Warning) warnings.push(entry.message);
    });

    try {
      const png = loader.get('ship.png', { mimeType: 'image/png' });
      const webp = loader.get('ship.png', { mimeType: 'image/webp' });

      // mimeType decides the decode, so these are two resources - not one
      // resource with a losing second opinion about how to read it.
      expect(webp).not.toBe(png);
      // The same identity-relevant option resolves back to the same handle.
      expect(loader.get('ship.png', { mimeType: 'image/webp' })).toBe(webp);
      expect(warnings).toHaveLength(0);

      await Promise.all([png.loaded, webp.loaded]);
      expect(png.loadState).toBe('ready');
      expect(webp.loadState).toBe('ready');
    } finally {
      removeSink();
    }
  });

  test('differing per-handle textureOptions across get() do NOT warn; the first sampler wins on the shared handle', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnings: string[] = [];
    const removeSink = logger.addSink(entry => {
      if (entry.severity === LogSeverity.Warning) warnings.push(entry.message);
    });

    try {
      // get() returns the SAME handle per source; sampler options are per-handle
      // now, so a later differing sampler is silently first-wins (no warn). Use a
      // distinct handle (e.g. an Assets catalog leaf) for an independent sampler.
      const handle = loader.get('ship.png', { textureOptions: { scaleMode: ScaleModes.Nearest } });

      expect(handle).toBe(loader.get('ship.png', { textureOptions: { scaleMode: ScaleModes.Linear } }));
      expect(warnings).toHaveLength(0);
      expect(handle.scaleMode).toBe(ScaleModes.Nearest); // first call's sampler, baked at createPlaceholder

      await handle.loaded;
      expect(handle.scaleMode).toBe(ScaleModes.Nearest); // fill transplanted source only — sampler kept
    } finally {
      removeSink();
    }
  });

  test('textureOptions on a background-adopted catalog leaf survive a later bare get()', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const catalog = new Assets({ ship: { type: 'texture', source: 'ship.png', textureOptions: { scaleMode: ScaleModes.Nearest } } });
    loader.load(catalog, { priority: LoadPriority.Background });

    // A bare get() for the same source returns the adopted leaf, whose sampler
    // options were baked at createPlaceholder - not just applied at fetch time.
    const handle = loader.get('ship.png');
    expect(handle.scaleMode).toBe(ScaleModes.Nearest);

    await handle.loaded;
    expect(handle.scaleMode).toBe(ScaleModes.Nearest);
  });

  test('inline get() options are baked into the placeholder', () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get('ship.png', { textureOptions: { scaleMode: ScaleModes.Nearest } });

    expect(handle.scaleMode).toBe(ScaleModes.Nearest);
  });

  test('same options (deep-equal) do not warn', () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnings: string[] = [];
    const removeSink = logger.addSink(entry => {
      if (entry.severity === LogSeverity.Warning) warnings.push(entry.message);
    });

    try {
      loader.get('ship.png', { textureOptions: { flipY: true } });
      loader.get('ship.png', { textureOptions: { flipY: true } });

      expect(warnings).toHaveLength(0);
    } finally {
      removeSink();
    }
  });

  test('an internal reset while the fetch is in flight fails the handle; a later get() heals it', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get('ship.png');

    // The hard reset path is internal-only: it forgets every scope's claim, so
    // it is deliberately not reachable through the public surface.
    (loader as unknown as { _residency: { _unloadOne(asset: unknown): void } })._residency._unloadOne(loader['_canonicalize'](Texture, 'ship.png'));

    await expect(handle.loaded).rejects.toThrow('unloaded while');
    expect(handle.loadState).toBe('failed');

    // Fetch mock is still OK - a later get() must retry and heal the SAME handle.
    const again = loader.get('ship.png');

    expect(again).toBe(handle);
    expect(handle.loadState).toBe('loading');

    await expect(handle.loaded).resolves.toBe(handle);
    expect(handle.loadState).toBe('ready');
  });

  test('a 404 marks the handle failed with the missing checker; loaded rejects', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get('gone.png');

    // The transport failure reaches the caller as itself: an AssetNetworkError
    // already names the URL and carries the status, and re-wrapping it would
    // take the branch away from an offline-capable caller.
    await expect(handle.loaded).rejects.toThrow(AssetNetworkError);
    await expect(handle.loaded).rejects.toThrow('Failed to fetch "gone.png" (404 Not Found).');
    expect(handle.loadState).toBe('failed');
    expect(handle.source).toBe(Texture.missing.source);
    expect(loader._peekResource(Texture, 'gone.png')).toBeNull();
  });

  test('get() on a failed source retries and heals the SAME handle in place', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get('flaky.png');

    await expect(handle.loaded).rejects.toThrow();
    const rejectedPromise = handle.loaded;

    mockFetchImage();
    const retried = loader.get('flaky.png');

    expect(retried).toBe(handle);
    expect(handle.loadState).toBe('loading');

    const freshPromise = handle.loaded;

    expect(freshPromise).not.toBe(rejectedPromise);

    await expect(freshPromise).resolves.toBe(handle);
    expect(handle.loadState).toBe('ready');
    expect(handle.width).toBe(16);
    expect(handle.source).not.toBe(Texture.missing.source);
    expect(loader._peekResource(Texture, 'flaky.png')).not.toBeNull();

    await expect(rejectedPromise).rejects.toThrow(); // the old promise stays rejected
  });

  test('repeated get() on a persistently failing source retries and fails again on the same instance', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get('gone.png');

    await expect(handle.loaded).rejects.toThrow();

    mockFetch404();
    const again = loader.get('gone.png');

    expect(again).toBe(handle);
    expect(again.loadState).toBe('loading');
    await expect(again.loaded).rejects.toThrow();
    expect(again.loadState).toBe('failed');
  });

  test('load() after a get() that failed re-materializes loaded and heals the handle', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get('healme.png');

    await expect(handle.loaded).rejects.toThrow();
    const rejectedPromise = handle.loaded;

    mockFetchImage();
    const loaded = await loader.load('healme.png');

    expect(loaded).toBe(handle);
    expect(handle.loadState).toBe('ready');
    expect(handle.width).toBe(16);

    await expect(handle.loaded).resolves.toBe(handle); // fresh promise
    await expect(rejectedPromise).rejects.toThrow(); // the old promise stays rejected
  });

  test('a failed seamless get dispatches onError exactly once', async () => {
    mockFetch404();
    const loader = createCoreLoader();
    const errors: string[] = [];

    loader.onError.add((_type, alias) => errors.push(alias));

    const handle = loader.get('gone.png');

    await expect(handle.loaded).rejects.toThrow();
    expect(errors).toEqual(['gone.png']);
  });

  test('background + boosting get for the same source dispatch onError exactly once', async () => {
    mockFetch404();
    const loader = createCoreLoader();
    const errors: string[] = [];

    loader.setConcurrency(0); // park the queue so the boosting get() owns (and awaits) the single fetch
    loader.onError.add((_type, alias) => errors.push(alias));
    // The background catalog queue rejects when its leaf 404s; the failure is
    // asserted below via `handle.loaded`, so swallow the queue's own rejection.
    loader.load(Assets.from({ gone: 'gone.png' }), { priority: LoadPriority.Background }).catch(() => {});

    const handle = loader.get('gone.png');

    await expect(handle.loaded).rejects.toThrow();
    expect(errors).toEqual(['gone.png']);
  });

  test('plain load() rejects and dispatches the same failure through onError exactly once', async () => {
    mockFetch404();
    const loader = createCoreLoader();
    const errors: Array<{ alias: string; error: Error }> = [];

    loader.onError.add((_type, alias, error) => errors.push({ alias, error }));

    let rejected: unknown;
    await loader.load('gone.png').catch(error => {
      rejected = error;
    });

    expect(rejected).toBeInstanceOf(Error);
    expect(errors).toEqual([{ alias: 'gone.png', error: rejected }]);
  });

  test('an explicit Asset.type() load rejects and also dispatches onError', async () => {
    mockFetch404();
    const loader = createCoreLoader();
    const errors: Array<{ alias: string; error: Error }> = [];

    loader.onError.add((_type, alias, error) => errors.push({ alias, error }));

    let rejected: unknown;
    await loader.load(Asset.type('texture', 'explicit-gone.png')).catch(error => {
      rejected = error;
    });

    expect(rejected).toBeInstanceOf(Error);
    expect(errors).toEqual([{ alias: 'explicit-gone.png', error: rejected }]);
  });

  test('a load()-initiated retry that fails again refreshes the handle error', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get('gone.png');

    await expect(handle.loaded).rejects.toThrow();

    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: false, status: 500, statusText: 'Server Error' }) as Response);
    await expect(loader.load('gone.png')).rejects.toThrow();
    await expect(handle.loaded).rejects.toThrow('500'); // fresh error, fresh promise
  });

  test('type-level: seamless get forms', () => {
    const loader = createCoreLoader();

    expectTypeOf(loader.get('a.png')).toEqualTypeOf<Texture>();
    expectTypeOf(new Texture(null).loaded).toEqualTypeOf<Promise<Texture>>();
  });

  test("get('ship.png') infers Texture via extension and is seamless", async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get('ship.png');

    expect(handle).toBeInstanceOf(Texture);
    expect(handle.loadState).toBe('loading');
    expect(loader.get('ship.png')).toBe(handle);

    await expect(handle.loaded).resolves.toBe(handle);
    expect(handle.width).toBe(16);
  });

  test('get(path) with an unregistered extension throws a clear error (dynamic strings)', () => {
    const loader = createCoreLoader();

    expect(() => loader.get('theme.custom' as never)).toThrow('no installed asset type claims any extension');
  });

  test('get(path) whose inferred type has no seamless adapter throws with guidance', () => {
    const loader = createCoreLoader();

    // .fnt → BmFont has no seamless adapter in this slice.
    expect(() => loader.get('fonts/ui.fnt' as never)).toThrow('hands out no catalog leaf');
  });

  test('get with pre-size options reserves layout and heals to real size', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get('ship.png', { width: 16, height: 16 });

    expect(handle.width).toBe(16); // reserved immediately, while loading
    await handle.loaded;
    expect(handle.width).toBe(16); // matches payload — no warning path
  });

  test('type-level: get(path) accepts only seamless-inferrable extensions', () => {
    const loader = createCoreLoader();

    expectTypeOf(loader.get('ship.png')).toEqualTypeOf<Texture>();
    expectTypeOf(loader.get('sprites/hero.jpeg')).toEqualTypeOf<Texture>();
    // @ts-expect-error - BmFont is not seamless in slice 2
    void (() => loader.get('fonts/ui.fnt'));
    // @ts-expect-error - unregistered extension
    void (() => loader.get('theme.custom'));
  });

  test('a second type dispatching on an already-installed constructor is rejected', () => {
    const loader = createCoreLoader();

    expect(() =>
      loader._installAssetTypes([
        testAssetType<string, unknown>({ id: 'secondTexture', token: Texture, leaf: textureSeamlessAdapter, create: async source => source }),
      ]),
    ).toThrow('another installed type already uses');
  });
});
