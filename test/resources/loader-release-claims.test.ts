import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Asset } from '#resources/Asset';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader, LoadPriority } from '#resources/Loader';

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
interface ResidencyInternals {
  _claims: Map<string, { scopes: Set<symbol> }>;
  _deferred: Map<string, unknown>;
  _refs: Map<string, unknown>;
  _unloadOne(type: unknown, alias: string): void;
  unloadAll(type?: unknown): void;
}

function residencyOf(loader: Loader): ResidencyInternals {
  return (loader as unknown as { _residency: ResidencyInternals })._residency;
}
function claimSize(loader: Loader): number {
  return residencyOf(loader)._claims.size;
}
function deferredSize(loader: Loader): number {
  return residencyOf(loader)._deferred.size;
}
function refSize(loader: Loader): number {
  return residencyOf(loader)._refs.size;
}
function keyOf(loader: Loader, type: unknown, source: string): string {
  return (loader as unknown as { _typeRegistry: { _key(t: unknown, s: string): string } })._typeRegistry._key(type, source);
}
function scopesFor(loader: Loader, type: unknown, source: string): Set<symbol> | undefined {
  return residencyOf(loader)._claims.get(keyOf(loader, type, source))?.scopes;
}

describe('Loader.release() scope safety', () => {
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

  test('release() drops only the root claim, leaving another scope holding the payload', async () => {
    const loader = createCoreLoader();
    const sceneScope = Symbol('scene');

    const handle = loader.get('ship.png');
    loader._getClaimed(sceneScope, 'ship.png');
    await handle.loaded;

    expect(scopesFor(loader, Texture, 'ship.png')?.size).toBe(2);

    loader.release(handle);

    // The scene still owns it: payload resident, claim entry alive.
    expect(handle.loadState).toBe('ready');
    expect(loader._peekResource(Texture, 'ship.png')).not.toBeNull();
    expect(scopesFor(loader, Texture, 'ship.png')?.size).toBe(1);

    // Only when the last owner lets go does the payload go away.
    loader._release(keyOf(loader, Texture, 'ship.png'), sceneScope);

    expect(handle.loadState).toBe('loading');
    expect(loader._peekResource(Texture, 'ship.png')).toBeNull();
  });

  test('release(catalog) never touches a claim held by another scope', async () => {
    const loader = createCoreLoader();
    const sceneScope = Symbol('scene');

    const catalog = new Assets({ hero: { type: 'texture', source: 'hero.png' } });

    await loader.load(catalog);
    loader._getClaimed(sceneScope, 'hero.png');

    expect(scopesFor(loader, Texture, 'hero.png')?.size).toBe(2);

    loader.release(catalog);

    expect(scopesFor(loader, Texture, 'hero.png')?.size).toBe(1);
    expect(loader._peekResource(Texture, 'hero.png')).not.toBeNull();
  });

  test('release(asset) resolves the same claim key the load path registered', async () => {
    const loader = createCoreLoader();
    const asset = new Asset({ type: 'texture', source: 'boss.png' });

    await loader.load(asset);

    expect(scopesFor(loader, Texture, 'boss.png')?.size).toBe(1);

    loader.release(asset);

    // Last claim gone → key forgotten and payload evicted in place.
    expect(scopesFor(loader, Texture, 'boss.png')).toBeUndefined();
    expect(loader._peekResource(Texture, 'boss.png')).toBeNull();
  });

  test('release() is idempotent and a no-op for an unclaimed key', async () => {
    const loader = createCoreLoader();
    const handle = loader.get('ship.png');
    await handle.loaded;

    loader.release(handle);

    expect(() => loader.release(handle)).not.toThrow();
    expect(() => loader.release(Texture, 'never-claimed.png')).not.toThrow();
  });

  test('release() on a background-queued entry drops it from the queue', async () => {
    const loader = createCoreLoader();
    loader.setConcurrency(0); // nothing drains

    const catalog = new Assets({ late: { type: 'texture', source: 'late.png' } });
    loader.load(catalog, { priority: LoadPriority.Background });

    const queue = (loader as unknown as { _residency: { _backgroundQueue: unknown[] } })._residency._backgroundQueue;
    expect(queue.length).toBe(1);

    loader.release(catalog);

    expect(queue.length).toBe(0);
  });
});

describe('internal hard-reset claim consistency (A3)', () => {
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

  test('_unloadOne() releases the claim, not just the resource', async () => {
    const loader = createCoreLoader();
    const handle = loader.get('ship.png');
    await handle.loaded;

    const key = keyOf(loader, Texture, 'ship.png');
    expect(residencyOf(loader)._claims.has(key)).toBe(true);

    residencyOf(loader)._unloadOne(Texture, 'ship.png');

    // Resource is gone AND the stale claim was cleared (previously it leaked,
    // holding refcount > 0 forever).
    expect(loader._peekResource(Texture, 'ship.png')).toBeNull();
    expect(residencyOf(loader)._claims.has(key)).toBe(false);
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

      residencyOf(loader).unloadAll();

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

    residencyOf(loader).unloadAll(Texture);

    expect(loader._peekResource(Texture, 'a.png')).toBeNull();
    expect(loader._peekResource(Texture, 'b.png')).toBeNull();
    expect(claimSize(loader)).toBe(0);
  });

  test('a source evicts correctly again after a reset -> reload cycle', async () => {
    const loader = createCoreLoader();

    const first = loader.get('ship.png');
    await first.loaded;
    residencyOf(loader).unloadAll();
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
