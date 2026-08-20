import { Asset } from '#assets/Asset';
import { Assets } from '#assets/Assets';
import { coreAssetBindings } from '#assets/coreAssetBindings';
import { Loader, LoadPriority } from '#assets/Loader';
import type { LoaderScope } from '#assets/LoaderScope';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';

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
  _claims: Map<string, { scopes: Set<LoaderScope> }>;
  _deferred: Map<string, unknown>;
  _refs: Map<string, unknown>;
  _unloadOne(asset: unknown): void;
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
  return (loader as unknown as { _canonicalize(t: unknown, s: string): { key: string } })._canonicalize(type, source).key;
}
function scopesFor(loader: Loader, type: unknown, source: string): Set<LoaderScope> | undefined {
  return residencyOf(loader)._claims.get(keyOf(loader, type, source))?.scopes;
}

describe('LoaderScope.release() scope safety', () => {
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

  test('release() drops only the releasing scope claim, leaving another scope holding the payload', async () => {
    const loader = createCoreLoader();
    const owner = loader.scope('owner');
    const sceneScope = loader.scope('scene');

    const handle = owner.get('ship.png');
    sceneScope.get('ship.png');
    await handle.loaded;

    expect(scopesFor(loader, Texture, 'ship.png')?.size).toBe(2);

    owner.release(handle);

    // The scene still owns it: payload resident, claim entry alive.
    expect(handle.loadState).toBe('ready');
    expect(loader._peekResource(Texture, 'ship.png')).not.toBeNull();
    expect(scopesFor(loader, Texture, 'ship.png')?.size).toBe(1);

    // Only when the last owner lets go does the payload go away.
    sceneScope.release(handle);

    expect(handle.loadState).toBe('loading');
    expect(loader._peekResource(Texture, 'ship.png')).toBeNull();
  });

  test('assets acquired on the loader itself are held for the application lifetime', async () => {
    const loader = createCoreLoader();
    const scope = loader.scope('scene');

    const handle = loader.get('ship.png');
    scope.get('ship.png');
    await handle.loaded;

    expect(scopesFor(loader, Texture, 'ship.png')?.size).toBe(2);

    // A scope can only ever drop its own claim; the application-lifetime claim
    // has no public release at all, so no consumer can free another's assets.
    scope.destroy();

    expect(scopesFor(loader, Texture, 'ship.png')?.size).toBe(1);
    expect(handle.loadState).toBe('ready');
    expect(loader._peekResource(Texture, 'ship.png')).not.toBeNull();
  });

  test('release(catalog) never touches a claim held by another scope', async () => {
    const loader = createCoreLoader();
    const owner = loader.scope('owner');
    const sceneScope = loader.scope('scene');

    const catalog = new Assets({ hero: { type: 'texture', source: 'hero.png' } });

    await owner.load(catalog);
    sceneScope.get('hero.png');

    expect(scopesFor(loader, Texture, 'hero.png')?.size).toBe(2);

    owner.release(catalog);

    expect(scopesFor(loader, Texture, 'hero.png')?.size).toBe(1);
    expect(loader._peekResource(Texture, 'hero.png')).not.toBeNull();
  });

  test('release(asset) resolves the same claim key the load path registered', async () => {
    const loader = createCoreLoader();
    const owner = loader.scope('owner');
    const asset = new Asset({ type: 'texture', source: 'boss.png' });

    await owner.load(asset);

    expect(scopesFor(loader, Texture, 'boss.png')?.size).toBe(1);

    owner.release(asset);

    // Last claim gone → key forgotten and payload evicted in place.
    expect(scopesFor(loader, Texture, 'boss.png')).toBeUndefined();
    expect(loader._peekResource(Texture, 'boss.png')).toBeNull();
  });

  test('release() is idempotent and a no-op for an unclaimed key', async () => {
    const loader = createCoreLoader();
    const owner = loader.scope('owner');
    const handle = owner.get('ship.png');
    await handle.loaded;

    owner.release(handle);

    expect(() => owner.release(handle)).not.toThrow();
    expect(() => owner.release(Texture, 'never-claimed.png')).not.toThrow();
  });

  test('two scopes taken under the same name are independent owners', async () => {
    const loader = createCoreLoader();
    const first = loader.scope('world');
    const second = loader.scope('world');

    const handle = first.get('ship.png');
    second.get('ship.png');
    await handle.loaded;

    expect(first).not.toBe(second);
    expect(first.id).not.toBe(second.id);
    expect(scopesFor(loader, Texture, 'ship.png')?.size).toBe(2);

    first.destroy();

    expect(handle.loadState).toBe('ready');
    expect(scopesFor(loader, Texture, 'ship.png')?.size).toBe(1);
  });

  test('release() on a background-queued entry drops it from the queue', async () => {
    const loader = createCoreLoader();
    const owner = loader.scope('owner');
    loader.setConcurrency(0); // nothing drains

    const catalog = new Assets({ late: { type: 'texture', source: 'late.png' } });
    owner.load(catalog, { priority: LoadPriority.Background });

    const queue = (loader as unknown as { _residency: { _backgroundQueue: unknown[] } })._residency._backgroundQueue;
    expect(queue.length).toBe(1);

    owner.release(catalog);

    expect(queue.length).toBe(0);
  });
});

describe('internal hard-reset claim consistency', () => {
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

    residencyOf(loader)._unloadOne((loader as unknown as { _canonicalize(t: unknown, s: string): unknown })._canonicalize(Texture, 'ship.png'));

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
    const owner = loader.scope('owner');

    const first = owner.get('ship.png');
    await first.loaded;
    residencyOf(loader).unloadAll();
    expect(claimSize(loader)).toBe(0);

    // Reload: a fresh claim + handle, then release must still evict in place.
    const second = owner.get('ship.png');
    await second.loaded;
    expect(second.loadState).toBe('ready');

    owner.release(second); // refcount 0 → evict in place
    expect(second.loadState).toBe('loading');
    expect(second.source).toBeNull();
  });
});
