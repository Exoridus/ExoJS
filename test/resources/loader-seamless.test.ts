import { logger, LogSeverity } from '#core/logging';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import { Json } from '#resources/tokens';

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

    expect(() => loader.get(Json, 'never-loaded')).toThrow('Missing resource');
  });

  test('array form returns deferred handles in input order and dedups', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const [a, b, aAgain] = loader.get(Texture, ['a.png', 'b.png', 'a.png']);

    expect(a).toBeInstanceOf(Texture);
    expect(b).not.toBe(a);
    expect(aAgain).toBe(a);

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
  });

  test('conflicting options warn once and the first call wins', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnings: string[] = [];
    const removeSink = logger.addSink(entry => {
      if (entry.severity === LogSeverity.Warning) warnings.push(entry.message);
    });

    const handle = loader.get(Texture, 'ship.png', { samplerOptions: { flipY: true } });

    loader.get(Texture, 'ship.png', { samplerOptions: { flipY: false } });
    loader.get(Texture, 'ship.png', { samplerOptions: { flipY: false } });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('first call');

    await handle.loaded;
    expect(handle.flipY).toBe(true); // first options reached the factory; fill transplanted them

    removeSink();
  });

  test('same options (deep-equal) do not warn', () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnings: string[] = [];
    const removeSink = logger.addSink(entry => {
      if (entry.severity === LogSeverity.Warning) warnings.push(entry.message);
    });

    loader.get(Texture, 'ship.png', { samplerOptions: { flipY: true } });
    loader.get(Texture, 'ship.png', { samplerOptions: { flipY: true } });

    expect(warnings).toHaveLength(0);
    removeSink();
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

  test('a failed handle without retry keeps returning the same instance', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const handle = loader.get(Texture, 'gone.png');

    await expect(handle.loaded).rejects.toThrow();

    mockFetch404();
    const again = loader.get(Texture, 'gone.png');

    expect(again).toBe(handle);
    await expect(again.loaded).rejects.toThrow();
    expect(again.loadState).toBe('failed');
  });
});
