import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

/** Loader with all core asset bindings (mirrors createCoreLoader in loader-seamless.test.ts). */
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

/** Introspection helpers over the private claim/handle maps. */
function claimSize(loader: Loader): number {
  return (loader as unknown as { _claims: Map<string, unknown> })._claims.size;
}
function deferredSize(loader: Loader): number {
  return (loader as unknown as { _deferred: Map<string, unknown> })._deferred.size;
}
function refSize(loader: Loader): number {
  return (loader as unknown as { _refs: Map<string, unknown> })._refs.size;
}
function keyOf(loader: Loader, type: unknown, source: string): string {
  return (loader as unknown as { _key(t: unknown, s: string): string })._key(type, source);
}

describe('Loader unload()/unloadAll() claim consistency (A3)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16 })),
    );
    mockFetchImage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('unload(type, alias) releases the claim, not just the resource', async () => {
    const loader = createCoreLoader();
    const handle = loader.get('ship.png');
    await handle.loaded;

    const key = keyOf(loader, Texture, 'ship.png');
    expect((loader as unknown as { _claims: Map<string, unknown> })._claims.has(key)).toBe(true);

    loader.unload(Texture, 'ship.png');

    // Resource is gone AND the stale claim was cleared (previously it leaked,
    // holding refcount > 0 forever).
    expect(loader._peekResource(Texture, 'ship.png')).toBeNull();
    expect((loader as unknown as { _claims: Map<string, unknown> })._claims.has(key)).toBe(false);
  });

  test('repeated load -> unloadAll cycles do not grow the claim/deferred/ref maps', async () => {
    const loader = createCoreLoader();

    for (let cycle = 0; cycle < 5; cycle++) {
      const handles = [];
      for (let i = 0; i < 4; i++) {
        handles.push(loader.get(`cycle${cycle}-asset${i}.png`));
      }
      await Promise.all(handles.map(h => h.loaded));

      // Each distinct source registered a claim (and a deferred handle before it
      // settled) — unloadAll must forget them all.
      expect(claimSize(loader)).toBeGreaterThan(0);

      loader.unloadAll();

      expect(claimSize(loader)).toBe(0);
      expect(deferredSize(loader)).toBe(0);
      expect(refSize(loader)).toBe(0);
    }
  });

  test('unloadAll(type) forgets that type without leaking claims', async () => {
    const loader = createCoreLoader();

    const a = loader.get('a.png');
    const b = loader.get('b.png');
    await Promise.all([a.loaded, b.loaded]);

    expect(claimSize(loader)).toBe(2);

    loader.unloadAll(Texture);

    expect(loader._peekResource(Texture, 'a.png')).toBeNull();
    expect(loader._peekResource(Texture, 'b.png')).toBeNull();
    expect(claimSize(loader)).toBe(0);
  });

  test('a source evicts correctly again after an unload -> reload cycle', async () => {
    const loader = createCoreLoader();

    const first = loader.get('ship.png');
    await first.loaded;
    loader.unloadAll();
    expect(claimSize(loader)).toBe(0);

    // Reload: a fresh claim + handle, then release must still evict in place.
    const second = loader.get('ship.png');
    await second.loaded;
    expect(second.loadState).toBe('ready');

    loader.release(second); // refcount 0 → evict in place
    expect(second.loadState).toBe('loading');
    expect(second.source).toBeNull();
  });
});
