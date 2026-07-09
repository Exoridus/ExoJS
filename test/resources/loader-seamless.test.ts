import { expectTypeOf } from 'vitest';

import { logger, LogSeverity } from '#core/logging';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes } from '#rendering/types';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import { textureSeamlessAdapter } from '#resources/seamless';

/** Loader with all core asset bindings (mirrors createCoreLoader in loader.test.ts). */
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

    const handle = loader.get(Texture, 'ship.png');

    expect(handle).toBeInstanceOf(Texture);
    expect(handle.loadState).toBe('loading');
    expect(handle.width).toBe(0);
  });

  test('fills the handle in place when the fetch completes', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get(Texture, 'ship.png');
    const versionBefore = handle.version;

    await expect(handle.loaded).resolves.toBe(handle);
    expect(handle.loadState).toBe('ready');
    expect(handle.width).toBe(16);
    expect(handle.version).toBeGreaterThan(versionBefore);
  });

  test('same source returns the same instance, before and after completion', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const first = loader.get(Texture, 'ship.png');
    const second = loader.get(Texture, 'ship.png');

    expect(second).toBe(first);

    await first.loaded;

    expect(loader.get(Texture, 'ship.png')).toBe(first);
    expect(loader.has(Texture, 'ship.png')).toBe(true);
  });

  test('load() after get() resolves to the SAME handle instance', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get(Texture, 'ship.png');
    const loaded = await loader.load(Texture, 'ship.png');

    expect(loaded).toBe(handle);
    expect(handle.loadState).toBe('ready');
  });

  test('get() after a completed load() returns the stored instance', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const loaded = await loader.load(Texture, 'ship.png');
    const handle = loader.get(Texture, 'ship.png');

    expect(handle).toBe(loaded);
    expect(handle.loadState).toBe('ready');
  });

  test('onLoaded dispatches with the handle as the stored resource', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const seen: unknown[] = [];

    loader.onLoaded.add((_type, _alias, resource) => seen.push(resource));

    const handle = loader.get(Texture, 'ship.png');

    await handle.loaded;
    expect(seen).toEqual([handle]);
  });

  test('legacy alias lookup still throws for adapterless types', () => {
    const loader = createCoreLoader();

    // A type that is neither a seamless handle nor a value token still falls
    // through to the throwing legacy lookup (value tokens now return AssetRef).
    class Adapterless {}

    expect(() => loader.get(Adapterless, 'never-loaded')).toThrow('Missing resource');
  });

  test('array form returns deferred handles in input order and dedups', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const [a, b, aAgain] = loader.get(Texture, ['a.png', 'b.png', 'a.png']);

    expect(a).toBeInstanceOf(Texture);
    expect(b).not.toBe(a);
    expect(aAgain).toBe(a);
    expect(a).toBe(loader.get(Texture, 'a.png'));

    await Promise.all([a.loaded, b.loaded]);
    expect(a.loadState).toBe('ready');
    expect(b.loadState).toBe('ready');
  });

  test('record form returns handles under the input keys', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const { ship, gradient } = loader.get(Texture, { ship: 'ship.png', gradient: 'gradient.png' });

    expect(ship).toBeInstanceOf(Texture);
    expect(gradient).not.toBe(ship);
    expect(ship).toBe(loader.get(Texture, 'ship.png'));

    await ship.loaded;
    expect(ship.loadState).toBe('ready');

    await gradient.loaded;
    expect(gradient.loadState).toBe('ready');
  });

  test('conflicting FETCH options (mimeType) warn once and the first call wins', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnings: string[] = [];
    const removeSink = logger.addSink(entry => {
      if (entry.severity === LogSeverity.Warning) warnings.push(entry.message);
    });

    try {
      const handle = loader.get(Texture, 'ship.png', { mimeType: 'image/png' });

      // A different mimeType for one source cannot share the source-keyed decode.
      loader.get(Texture, 'ship.png', { mimeType: 'image/webp' });
      loader.get(Texture, 'ship.png', { mimeType: 'image/webp' });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('first call');

      await handle.loaded;
      expect(handle.loadState).toBe('ready');
    } finally {
      removeSink();
    }
  });

  test('differing per-handle samplerOptions across get() do NOT warn; the first sampler wins on the shared handle', async () => {
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
      const handle = loader.get(Texture, 'ship.png', { samplerOptions: { scaleMode: ScaleModes.Nearest } });

      expect(handle).toBe(loader.get(Texture, 'ship.png', { samplerOptions: { scaleMode: ScaleModes.Linear } }));
      expect(warnings).toHaveLength(0);
      expect(handle.scaleMode).toBe(ScaleModes.Nearest); // first call's sampler, baked at createPlaceholder

      await handle.loaded;
      expect(handle.scaleMode).toBe(ScaleModes.Nearest); // fill transplanted source only — sampler kept
    } finally {
      removeSink();
    }
  });

  test('same options (deep-equal) do not warn', () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnings: string[] = [];
    const removeSink = logger.addSink(entry => {
      if (entry.severity === LogSeverity.Warning) warnings.push(entry.message);
    });

    try {
      loader.get(Texture, 'ship.png', { samplerOptions: { flipY: true } });
      loader.get(Texture, 'ship.png', { samplerOptions: { flipY: true } });

      expect(warnings).toHaveLength(0);
    } finally {
      removeSink();
    }
  });

  test('unload() while the fetch is in flight fails the handle; a later get() heals it', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get(Texture, 'ship.png');

    loader.unload(Texture, 'ship.png');

    await expect(handle.loaded).rejects.toThrow('unloaded while');
    expect(handle.loadState).toBe('failed');

    // Fetch mock is still OK — a later get() must retry and heal the SAME handle.
    const again = loader.get(Texture, 'ship.png');

    expect(again).toBe(handle);
    expect(handle.loadState).toBe('loading');

    await expect(handle.loaded).resolves.toBe(handle);
    expect(handle.loadState).toBe('ready');
  });

  test('a 404 marks the handle failed with the missing checker; loaded rejects', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get(Texture, 'gone.png');

    await expect(handle.loaded).rejects.toThrow('Failed to load');
    expect(handle.loadState).toBe('failed');
    expect(handle.source).toBe(Texture.missing.source);
    expect(loader.has(Texture, 'gone.png')).toBe(false);
  });

  test('get() on a failed source retries and heals the SAME handle in place', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get(Texture, 'flaky.png');

    await expect(handle.loaded).rejects.toThrow();
    const rejectedPromise = handle.loaded;

    mockFetchImage();
    const retried = loader.get(Texture, 'flaky.png');

    expect(retried).toBe(handle);
    expect(handle.loadState).toBe('loading');

    const freshPromise = handle.loaded;

    expect(freshPromise).not.toBe(rejectedPromise);

    await expect(freshPromise).resolves.toBe(handle);
    expect(handle.loadState).toBe('ready');
    expect(handle.width).toBe(16);
    expect(handle.source).not.toBe(Texture.missing.source);
    expect(loader.has(Texture, 'flaky.png')).toBe(true);

    await expect(rejectedPromise).rejects.toThrow(); // the old promise stays rejected
  });

  test('repeated get() on a persistently failing source retries and fails again on the same instance', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get(Texture, 'gone.png');

    await expect(handle.loaded).rejects.toThrow();

    mockFetch404();
    const again = loader.get(Texture, 'gone.png');

    expect(again).toBe(handle);
    expect(again.loadState).toBe('loading');
    await expect(again.loaded).rejects.toThrow();
    expect(again.loadState).toBe('failed');
  });

  test('load() after a get() that failed re-materializes loaded and heals the handle', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get(Texture, 'healme.png');

    await expect(handle.loaded).rejects.toThrow();
    const rejectedPromise = handle.loaded;

    mockFetchImage();
    const loaded = await loader.load(Texture, 'healme.png');

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

    const handle = loader.get(Texture, 'gone.png');

    await expect(handle.loaded).rejects.toThrow();
    expect(errors).toEqual(['gone.png']);
  });

  test('background + boosting get for the same source dispatch onError exactly once', async () => {
    mockFetch404();
    const loader = createCoreLoader();
    const errors: string[] = [];

    loader.onError.add((_type, alias) => errors.push(alias));
    loader.backgroundLoad(Texture, ['gone.png']);

    const handle = loader.get(Texture, 'gone.png');

    await expect(handle.loaded).rejects.toThrow();
    expect(errors).toEqual(['gone.png']);
  });

  test('plain load() failures do NOT dispatch onError (legacy semantics unchanged)', async () => {
    mockFetch404();
    const loader = createCoreLoader();
    const errors: string[] = [];

    loader.onError.add((_type, alias) => errors.push(alias));

    await expect(loader.load(Texture, 'gone.png')).rejects.toThrow();
    expect(errors).toEqual([]);
  });

  test('a load()-initiated retry that fails again refreshes the handle error', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get(Texture, 'gone.png');

    await expect(handle.loaded).rejects.toThrow();

    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: false, status: 500, statusText: 'Server Error' }) as Response);
    await expect(loader.load(Texture, 'gone.png')).rejects.toThrow();
    await expect(handle.loaded).rejects.toThrow('500'); // fresh error, fresh promise
  });

  test('type-level: seamless get forms', () => {
    const loader = createCoreLoader();

    expectTypeOf(loader.get(Texture, 'a.png')).toEqualTypeOf<Texture>();
    expectTypeOf(loader.get(Texture, ['a.png', 'b.png'])).toEqualTypeOf<Texture[]>();
    expectTypeOf(loader.get(Texture, { a: 'a.png', b: 'b.png' })).toEqualTypeOf<Record<'a' | 'b', Texture>>();
    expectTypeOf(new Texture(null).loaded).toEqualTypeOf<Promise<Texture>>();
  });

  test("get('ship.png') infers Texture via extension and is seamless", async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get('ship.png');

    expect(handle).toBeInstanceOf(Texture);
    expect(handle.loadState).toBe('loading');
    expect(loader.get(Texture, 'ship.png')).toBe(handle);

    await expect(handle.loaded).resolves.toBe(handle);
    expect(handle.width).toBe(16);
  });

  test('get(path) with an unregistered extension throws a clear error (dynamic strings)', () => {
    const loader = createCoreLoader();

    expect(() => loader.get('theme.custom' as never)).toThrow('no type registered');
  });

  test('get(path) whose inferred type has no seamless adapter throws with guidance', () => {
    const loader = createCoreLoader();

    // .fnt → BmFont has no seamless adapter in this slice.
    expect(() => loader.get('fonts/ui.fnt' as never)).toThrow('no seamless adapter');
  });

  test('get with pre-size options reserves layout and heals to real size', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const handle = loader.get(Texture, 'ship.png', { width: 16, height: 16 });

    expect(handle.width).toBe(16); // reserved immediately, while loading
    await handle.loaded;
    expect(handle.width).toBe(16); // matches payload — no warning path
  });

  test('type-level: get(path) accepts only seamless-inferrable extensions', () => {
    const loader = createCoreLoader();

    expectTypeOf(loader.get('ship.png')).toEqualTypeOf<Texture>();
    expectTypeOf(loader.get('sprites/hero.jpeg')).toEqualTypeOf<Texture>();
    // @ts-expect-error — BmFont is not seamless in slice 2
    void (() => loader.get('fonts/ui.fnt'));
    // @ts-expect-error — unregistered extension
    void (() => loader.get('theme.custom'));
  });

  test('registering a second seamless adapter for the same type throws', () => {
    const loader = createCoreLoader();

    expect(() => loader.registerSeamlessAdapter(Texture, textureSeamlessAdapter)).toThrow('already registered');
  });
});
