import type { MockInstance } from 'vitest';

import { Asset } from '#assets/Asset';
import { encodeContainer } from '#assets/AssetContainer';
import { AssetRef } from '#assets/AssetRef';
import { Assets } from '#assets/Assets';
import type { CacheStore } from '#assets/CacheStore';
import { coreAssetBindings } from '#assets/coreAssetBindings';
import { defineAsset } from '#assets/defineAsset';
import { Loader, LoadPriority } from '#assets/Loader';
import { FontAsset, TextAsset } from '#assets/tokens';
import type { AssetHandler } from '#extensions/Extension';
import { materializeAssetBindings } from '#extensions/materialize';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';

/** Create a Loader with all core asset bindings pre-installed. */
function createCoreLoader(options?: ConstructorParameters<typeof Loader>[0]): Loader {
  const loader = new Loader(options);
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

interface ResidencyInternals {
  _unloadOne(asset: unknown): void;
  unloadAll(type?: unknown): void;
}

/** The internal hard-reset path. Not public on `Loader`: it forgets every scope's
 *  claim, so only scope-aware `release()` is exposed to users. */
function residencyOf(loader: Loader): ResidencyInternals {
  return (loader as unknown as { _residency: ResidencyInternals })._residency;
}

/**
 * Hard-removes one canonical asset - the internal reset behaviour that
 * `Loader.unload(asset)` used to expose publicly. Kept as a test helper so the
 * bookkeeping stays covered now that no public verb reaches it.
 */
function hardUnloadAsset(loader: Loader, asset: Asset<unknown>): void {
  const registry = (loader as unknown as { _typeRegistry: { resolveTypeName(name: string): unknown } })._typeRegistry;
  const ctor = registry.resolveTypeName(asset.type);

  if (!ctor) return;

  const { type: _type, source, ...options } = asset._config;
  const canonicalize = (loader as unknown as { _canonicalize(type: unknown, source: string, options?: unknown): unknown })._canonicalize.bind(loader);

  residencyOf(loader)._unloadOne(canonicalize(ctor, source, Object.keys(options).length > 0 ? options : undefined));
}

/** Hard-removes the canonical asset a `(type, source)` pair resolves to. */
function hardUnloadPath(loader: Loader, type: unknown, source: string): void {
  const canonicalize = (loader as unknown as { _canonicalize(type: unknown, source: string): unknown })._canonicalize.bind(loader);

  residencyOf(loader)._unloadOne(canonicalize(type, source));
}

// Declaration merges for test-only asset types
declare module '#assets/AssetDefinitions' {
  interface AssetDefinitions {
    mockAsset: { resource: string; config: { source: string; format?: string; scale?: number; locale?: string } };
    richAsset: { resource: string; config: { source: string; format: string } };
    boundAsset: { resource: unknown; config: { source: string; scale?: number } };
    dummyAsset: { resource: DummyAsset; config: { source: string } };
    firstType: { resource: unknown; config: { source: string } };
    secondType: { resource: unknown; config: { source: string } };
    // A package-shaped kind: no seamless adapter, so `defineAsset` defaults it
    // to a value kind at runtime and the entry mirrors that with `isValue`.
    packageLeaf: { resource: string; config: { source: string }; isValue: true };
  }
}

/**
 * Binds TextAsset to a `bindAsset` handler that fetches raw text through
 * `context.fetchText` (so basePath/fetchOptions/cache-strategy routing stays
 * identical to a first-party binding) and then applies `create` to the raw
 * text - the replacement for the removed `register()`-based factory path used
 * throughout this file. `storageName: 'text'` mirrors the old
 * `MockTextFactory.storageName`, so cache-store assertions keyed on `'text'`
 * keep working unchanged.
 */
function bindTextAsset(loader: Loader, create: (text: string) => string | Promise<string> = text => `resource:${text}`): { create: MockInstance } {
  const createSpy = vi.fn(create);

  loader.bindAsset<string>({ ctor: TextAsset, storageName: 'text' }, { load: async (request, ctx) => createSpy(await ctx.fetchText(request.source)) });

  return { create: createSpy };
}

/** Stand-in constructor for a package-declared, seamless-less asset type. */
class PackageLeafAsset {}

class DummyAsset {
  constructor(public readonly value: string) {}
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason: unknown): void;
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const createCacheStoreMock = (overrides: Partial<CacheStore> = {}): CacheStore => ({
  load: vi.fn(async (): Promise<unknown | null> => null),
  save: vi.fn(async (): Promise<void> => undefined),
  delete: vi.fn(async (): Promise<boolean> => true),
  clear: vi.fn(async (): Promise<boolean> => true),
  destroy: vi.fn(),
  ...overrides,
});

describe('Loader', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockFetch = (body = ''): void => {
    global.fetch = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => body,
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
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

  test('load(Type, path) returns a single resource', async () => {
    const loader = new Loader({ basePath: '/' });

    bindTextAsset(loader);
    mockFetch('fresh-source');

    const result = await loader.load('demo.txt');

    expect(result).toBe('resource:fresh-source');
  });

  test('basePath prefixes relative fetch URLs', async () => {
    const loader = new Loader({ basePath: '/assets/' });

    bindTextAsset(loader);
    mockFetch();
    await loader.load('demo.txt');

    expect(global.fetch).toHaveBeenCalledWith('/assets/demo.txt', expect.anything());
  });

  test('fetchOptions are forwarded to fetch calls', async () => {
    const fetchOptions: RequestInit = { credentials: 'include', mode: 'same-origin' };
    const loader = new Loader({ basePath: '/', fetchOptions });

    bindTextAsset(loader);
    mockFetch();
    await loader.load('demo.txt');

    // The loader adds the load's cancellation signal on top of the configured
    // options; every configured field must still ride along untouched.
    expect(global.fetch).toHaveBeenCalledWith('/demo.txt', { ...fetchOptions, signal: expect.any(AbortSignal) });
  });

  test('load() deduplicates concurrent requests for the same alias', async () => {
    const loader = new Loader({ basePath: '/' });

    bindTextAsset(loader);
    mockFetch();

    const [a, b] = await Promise.all([loader.load('same.txt'), loader.load('same.txt')]);

    expect(a).toBe(b);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('throws on non-ok HTTP response', async () => {
    const loader = new Loader({ basePath: '/' });

    bindTextAsset(loader);
    mockFetch404();

    await expect(loader.load('missing.txt')).rejects.toThrow('404 Not Found');
  });

  test('load() continues independently per item (fail-tolerant via Promise.allSettled pattern)', async () => {
    const loader = new Loader({ basePath: '/' });

    const { create } = bindTextAsset(loader);
    mockFetch();

    create.mockImplementationOnce(async () => 'ok');
    create.mockImplementationOnce(async () => {
      throw new Error('broken');
    });

    const good = loader.load('good.txt');
    const bad = loader.load('bad.txt');

    await expect(good).resolves.toBe('ok');
    await expect(bad).rejects.toThrow('broken');
  });

  test('get() retrieves a loaded value asset', async () => {
    const loader = new Loader({ basePath: '/' });

    bindTextAsset(loader);
    mockFetch('fresh-source');

    expect(loader._peekResource(TextAsset, 'demo.txt')).toBeNull();

    await loader.load('demo.txt');

    expect(loader.get('demo.txt').value).toBe('resource:fresh-source');
  });

  test('get() returns a loading ref whose value throws for a never-loaded value asset', () => {
    const loader = createCoreLoader({ basePath: '/' });
    // A fetch that never settles keeps the adopted ref in its 'loading' state.
    global.fetch = vi.fn((): Promise<Response> => new Promise<Response>(() => {}));

    const ref = loader.get(Asset.type('text', 'nope'));

    expect(ref.loadState).toBe('loading');
    expect(() => ref.value).toThrow("'loading'");
  });

  test('the internal reset path removes a single resource, and clears a whole type', async () => {
    const loader = new Loader({ basePath: '/' });

    bindTextAsset(loader);
    mockFetch();

    await loader.load('a.txt');
    await loader.load('b.txt');

    expect(loader._peekResource(TextAsset, 'a.txt')).not.toBeNull();
    hardUnloadPath(loader, TextAsset, 'a.txt');
    expect(loader._peekResource(TextAsset, 'a.txt')).toBeNull();
    expect(loader._peekResource(TextAsset, 'b.txt')).not.toBeNull();

    residencyOf(loader).unloadAll(TextAsset);
    expect(loader._peekResource(TextAsset, 'b.txt')).toBeNull();
  });

  test('custom asset via defineAsset() with user-defined class', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetBindings(loader, [
      defineAsset<DummyAsset>({
        ctor: DummyAsset,
        type: 'dummyAsset',
        isValue: false,
        create: () => ({
          async load(request, ctx) {
            return new DummyAsset(await ctx.fetchText(request.source));
          },
        }),
      }),
    ]);
    mockFetch('raw');

    const result = await loader.load(new Asset({ type: 'dummyAsset', source: 'thing.dat' }));

    expect(result).toBeInstanceOf(DummyAsset);
    expect(result.value).toBe('raw');
  });

  test('reads from cache hit and skips network fetch', async () => {
    const cacheStore = createCacheStoreMock({
      load: vi.fn(async (): Promise<string> => 'cached-source'),
    });
    const loader = new Loader({ basePath: '/', cache: cacheStore });

    bindTextAsset(loader);
    global.fetch = vi.fn(async (): Promise<Response> => {
      throw new Error('Unexpected network fetch on cache hit.');
    });

    const result = await loader.load('cached.txt');

    expect(result).toBe('resource:cached-source');
    expect(cacheStore.load).toHaveBeenCalledWith('text', '/cached.txt');
    expect(cacheStore.save).not.toHaveBeenCalled();
    expect(cacheStore.delete).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('falls back to network and persists source when cache misses', async () => {
    const cacheStore = createCacheStoreMock();
    const loader = new Loader({ basePath: '/', cache: cacheStore });

    bindTextAsset(loader);
    mockFetch('fresh-source');

    const result = await loader.load('miss.txt');

    expect(result).toBe('resource:fresh-source');
    expect(cacheStore.load).toHaveBeenCalledWith('text', '/miss.txt');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(cacheStore.save).toHaveBeenCalledWith('text', '/miss.txt', 'fresh-source');
  });

  // The corrupt-cache-entry delete+retry mechanism itself (a cached value that
  // makes factory.create() throw) now lives entirely inside CacheFirstStrategy -
  // context.fetchText()'s internal cache factory is a pass-through that never
  // throws, so it's no longer reachable through a Loader-level bindAsset
  // handler. See test/assets/cache-first-strategy.test.ts for direct coverage.

  test('load(Json, path) returns unknown by default', async () => {
    const loader = createCoreLoader({ basePath: '/' });

    global.fetch = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => 42,
        }) as unknown as Response,
    );

    const result = await loader.load('data.json');

    expect(result).toBe(42);
  });

  test('does not reinsert a resource when the internal reset runs during an in-flight fetch', async () => {
    const loader = new Loader({ basePath: '/' });
    const deferredFetch = createDeferred<Response>();

    bindTextAsset(loader);

    global.fetch = vi.fn((_input: RequestInfo | URL): Promise<Response> => deferredFetch.promise);

    const loadPromise = loader.load('inflight.txt');

    hardUnloadPath(loader, TextAsset, 'inflight.txt');

    deferredFetch.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'fresh-source',
    } as unknown as Response);

    await expect(loadPromise).resolves.toBe('resource:fresh-source');
    expect(loader._peekResource(TextAsset, 'inflight.txt')).toBeNull();
  });

  test('uses per-type internal keys instead of constructor names', async () => {
    class FirstType {}
    class SecondType {}

    Object.defineProperty(FirstType, 'name', { value: 'MinifiedType' });
    Object.defineProperty(SecondType, 'name', { value: 'MinifiedType' });

    const loader = new Loader({ basePath: '/' });

    materializeAssetBindings(loader, [
      defineAsset<FirstType>({
        ctor: FirstType,
        type: 'firstType',
        isValue: false,
        create: () => ({
          async load(request, ctx) {
            await ctx.fetchText(request.source);
            return new FirstType();
          },
        }),
      }),
      defineAsset<SecondType>({
        ctor: SecondType,
        type: 'secondType',
        isValue: false,
        create: () => ({
          async load(request, ctx) {
            await ctx.fetchText(request.source);
            return new SecondType();
          },
        }),
      }),
    ]);

    mockFetch();

    const [first, second] = await Promise.all([
      loader.load(new Asset({ type: 'firstType', source: 'shared.asset' })),
      loader.load(new Asset({ type: 'secondType', source: 'shared.asset' })),
    ]);

    expect(first).toBeInstanceOf(FirstType);
    expect(second).toBeInstanceOf(SecondType);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// New Asset / Assets / LoadingQueue stabilisation tests
// ─────────────────────────────────────────────────────────────────────────────

class MockAssetType {}

describe('LoadingQueue progress tracking', () => {
  test('progress is updated to failed when asset type is unknown', async () => {
    const loader = new Loader();
    // 'mockAsset' is in AssetDefinitions (via declaration merge above) but we
    // deliberately do NOT call loader.registerAssetType() so that the runtime
    // has no constructor registered for it → "no constructor" rejection path.
    const asset = new Asset({ type: 'mockAsset', source: 'test.dat' });

    const queue = loader.load(asset);
    let lastProgress = queue.progress;

    queue.onProgress.add(p => {
      lastProgress = p;
    });

    await expect(queue).rejects.toThrow('No constructor registered');
    // Progress must have settled - pending must be 0
    expect(lastProgress.pending).toBe(0);
    expect(lastProgress.failed).toBe(1);
    expect(lastProgress.loaded).toBe(0);
  });

  test('progress counts both successful and failed items in a map load', async () => {
    const loader = new Loader({ basePath: '/' });

    // A handler that fails for the 'bad.dat' source (replaces the removed
    // registerAssetType form; failure is driven by source rather than a factory
    // mock).
    loader.bindAsset<string>(
      { ctor: MockAssetType, typeNames: ['mockAsset'] },
      {
        load: async request => {
          if (request.source === 'bad.dat') {
            throw new Error('bad');
          }

          return 'ok';
        },
      },
    );
    mockFetch();

    const goodAsset = new Asset({ type: 'mockAsset', source: 'good.dat' });
    const badAsset = new Asset({ type: 'mockAsset', source: 'bad.dat' });

    const queue = loader.load({ good: goodAsset, bad: badAsset });
    let lastProgress = queue.progress;

    queue.onProgress.add(p => {
      lastProgress = p;
    });

    await expect(queue).rejects.toThrow();
    expect(lastProgress.total).toBe(2);
    expect(lastProgress.pending).toBe(0);
    expect(lastProgress.loaded + lastProgress.failed).toBe(2);
  });

  // Shared mockFetch helper (redeclare locally in scope)
  function mockFetch(): void {
    global.fetch = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => '',
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
        }) as unknown as Response,
    );
  }

  afterEach(() => {
    global.fetch = vi.fn();
  });
});

describe('Asset / Assets identity and alias semantics', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(): void {
    global.fetch = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => 'raw',
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
        }) as unknown as Response,
    );
  }

  // Binds MockAssetType as a handler type (replacing the removed
  // registerAssetType(name, ctor, factory) form). The handler fetches through
  // the context so cross-alias network dedup stays observable.
  function bindMockAsset(loader: Loader): void {
    loader.bindAsset<string>(
      { ctor: MockAssetType, typeNames: ['mockAsset'] },
      {
        load: async (request, ctx) => {
          await ctx.fetchText(request.source);
          return `loaded:${request.source}`;
        },
      },
    );
  }

  test('one Asset named twice shares a single network fetch and one resident entry', async () => {
    const loader = new Loader({ basePath: '/' });

    bindMockAsset(loader);
    mockFetch();

    const hero = new Asset({ type: 'mockAsset', source: 'images/hero.dat' });

    await loader.load({ heroA: hero, heroB: hero });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Record keys are NAMES, not identities: both resolve to the one canonical
    // asset, which is resident under its own source.
    expect(loader._peekResource(MockAssetType, 'images/hero.dat')).not.toBeNull();
    expect(loader._peekResource(MockAssetType, 'heroA')).toBeNull();
    expect(loader.inspect()).toHaveLength(1);
  });

  test('two spellings of one source resolve to the same resident resource', async () => {
    const loader = new Loader({ basePath: '/' });

    bindMockAsset(loader);
    mockFetch();

    await Promise.all([
      loader.load(new Asset({ type: 'mockAsset', source: 'images/hero.dat' })),
      loader.load(new Asset({ type: 'mockAsset', source: './images/sub/../hero.dat' })),
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(loader._peekResource(MockAssetType, 'images/hero.dat')).toBe(loader._peekResource(MockAssetType, './images/sub/../hero.dat'));
    expect(loader._peekResource(MockAssetType, 'images/hero.dat')).not.toBeNull();
  });

  test('internal reset removes an asset loaded by source-as-alias (single Asset load)', async () => {
    const loader = new Loader({ basePath: '/' });

    bindMockAsset(loader);
    mockFetch();

    const hero = new Asset({ type: 'mockAsset', source: 'images/hero.dat' });

    await loader.load(hero);

    expect(loader._peekResource(MockAssetType, 'images/hero.dat')).not.toBeNull();

    hardUnloadAsset(loader, hero);

    expect(loader._peekResource(MockAssetType, 'images/hero.dat')).toBeNull();
  });

  test('internal reset removes the one canonical entry a keyed-map load produced', async () => {
    const loader = new Loader({ basePath: '/' });

    bindMockAsset(loader);
    mockFetch();

    const hero = new Asset({ type: 'mockAsset', source: 'images/hero.dat' });

    await loader.load({ heroA: hero, heroB: hero });

    expect(loader._peekResource(MockAssetType, 'images/hero.dat')).not.toBeNull();

    hardUnloadAsset(loader, hero);

    expect(loader._peekResource(MockAssetType, 'images/hero.dat')).toBeNull();
    expect(loader.inspect()).toHaveLength(0);
  });

  test('release(assets) releases every leaf claim, evicting the adopted resources', async () => {
    // Releasing a container drops all of its entries: each leaf's root claim is
    // released → last-claim eviction.
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
    const loader = createCoreLoader({ basePath: '/' });
    global.fetch = vi.fn(
      async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response,
    );

    const container = new Assets({
      hero: { type: 'texture', source: 'hero.png' },
      logo: { type: 'texture', source: 'logo.png' },
    });

    const scope = loader.createScope();

    await scope.load(container);

    expect(loader._peekResource(Texture, 'hero.png')).not.toBeNull();
    expect(loader._peekResource(Texture, 'logo.png')).not.toBeNull();
    expect((container.hero as Texture).loadState).toBe('ready');

    scope.release(container);

    // Last claim released → payload evicted; the leaves heal back to 'loading'.
    expect(loader._peekResource(Texture, 'hero.png')).toBeNull();
    expect(loader._peekResource(Texture, 'logo.png')).toBeNull();
    expect((container.hero as Texture).loadState).toBe('loading');

    vi.unstubAllGlobals();
  });

  test('a reset key reloads cleanly and leaves no stale bookkeeping behind', async () => {
    const loader = new Loader({ basePath: '/' });

    bindMockAsset(loader);
    mockFetch();

    const hero = new Asset({ type: 'mockAsset', source: 'hero.dat' });

    await loader.load({ a: hero, b: hero, c: hero });

    hardUnloadAsset(loader, hero);

    expect(loader._peekResource(MockAssetType, 'hero.dat')).toBeNull();

    await loader.load({ a: hero });

    expect(loader._peekResource(MockAssetType, 'hero.dat')).not.toBeNull();
    expect(loader.inspect()).toHaveLength(1);
  });
});

describe('Assets reserved "entries" key', () => {
  test('throws a clear error when an asset is named "entries"', () => {
    expect(() => {
      new Assets({
        entries: { type: 'mockAsset', source: '/entries.dat' },
      });
    }).toThrow('"entries"');
  });

  test('does not throw for a normal asset name', () => {
    expect(() => {
      new Assets({
        logo: { type: 'texture', source: '/logo.png' },
      });
    }).not.toThrow();
  });
});

describe('bindAsset() handler — cache-aware AssetLoaderContext', () => {
  class RichAsset {}

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetchText(body: string): void {
    global.fetch = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => body,
          json: async () => JSON.parse(body),
          arrayBuffer: async () => Buffer.from(body).buffer,
        }) as unknown as Response,
    );
  }

  test('context exposes identityKey as a non-empty string', async () => {
    const loader = new Loader({ basePath: '/' });
    let capturedKey = '';

    loader.bindAsset<string>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        load: async (_request, ctx) => {
          capturedKey = ctx.identityKey;
          return 'ok';
        },
      },
    );

    await loader.load(new Asset({ type: 'richAsset', source: 'a.json', format: 'x' }));
    expect(capturedKey).toMatch(/^\d+\|url:\/a\.json$/);
  });

  test('context.fetchText fetches and returns text', async () => {
    mockFetchText('hello world');
    const loader = new Loader({ basePath: '/assets/' });

    loader.bindAsset<string>({ ctor: RichAsset, typeNames: ['richAsset'] }, { load: async (request, ctx) => ctx.fetchText(request.source) });

    const result = await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    expect(result).toBe('hello world');
    expect(global.fetch).toHaveBeenCalledWith('/assets/file.txt', expect.anything());
  });

  test('context.fetchText caches: second call skips network', async () => {
    mockFetchText('cached content');
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>({ ctor: RichAsset, typeNames: ['richAsset'] }, { load: async (request, ctx) => ctx.fetchText(request.source) });

    // First load - populates in-memory result
    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    // Reset the mock so we can check if it was called during the second load
    (global.fetch as MockInstance).mockClear();
    // Second load - same asset, should be served from _resources (no new fetch call)
    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('context.fetchJson fetches and parses JSON', async () => {
    mockFetchText('{"value":42}');
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        load: async (request, ctx) => {
          const data = await ctx.fetchJson<{ value: number }>(request.source);
          return String(data.value);
        },
      },
    );

    const result = await loader.load(new Asset({ type: 'richAsset', source: 'data.json', format: 'json' }));
    expect(result).toBe('42');
  });

  test('context.fetchArrayBuffer fetches binary data', async () => {
    mockFetchText('binary');
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        load: async (request, ctx) => {
          const buf = await ctx.fetchArrayBuffer(request.source);
          return String(buf.byteLength);
        },
      },
    );

    const result = await loader.load(new Asset({ type: 'richAsset', source: 'data.bin', format: 'bin' }));
    expect(Number(result)).toBeGreaterThan(0);
  });

  test('getIdentityDiscriminator separates assets with same source but different format', async () => {
    const loader = new Loader({ basePath: '/' });
    const loadOrder: string[] = [];

    loader.bindAsset<string, { format: string }>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        getIdentityDiscriminator: request => `${request.source}:${request.options?.format}`,
        load: async request => {
          loadOrder.push(request.options!.format);
          return `result:${request.options!.format}`;
        },
      },
    );

    const tmx = new Asset({ type: 'richAsset', source: 'map.tmx', format: 'tmx' });
    const json = new Asset({ type: 'richAsset', source: 'map.tmx', format: 'tiled-json' });

    const [resTmx, resJson] = await Promise.all([loader.load(tmx), loader.load(json)]);

    // Both variants loaded independently - no cross-contamination
    expect(resTmx).toBe('result:tmx');
    expect(resJson).toBe('result:tiled-json');
    expect(loadOrder).toContain('tmx');
    expect(loadOrder).toContain('tiled-json');
  });

  test('without getIdentityDiscriminator, same source deduplicates in-flight calls', async () => {
    let callCount = 0;
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        load: async request => {
          callCount++;
          return `ok:${request.source}`;
        },
      },
    );

    const a1 = new Asset({ type: 'richAsset', source: 'shared.dat', format: 'x' });
    const a2 = new Asset({ type: 'richAsset', source: 'shared.dat', format: 'x' });

    const [r1, r2] = await Promise.all([loader.load(a1), loader.load(a2)]);

    expect(callCount).toBe(1);
    expect(r1).toBe('ok:shared.dat');
    expect(r2).toBe('ok:shared.dat');
  });
});

describe('handler context.fetch* — IDB store names (Fix 1 regression)', () => {
  class RichAsset {}

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function makeMockStore(): { store: CacheStore; saves: Array<{ storageName: string; key: string }> } {
    const saves: Array<{ storageName: string; key: string }> = [];
    const store: CacheStore = {
      load: async () => null,
      save: async (storageName, key) => {
        saves.push({ storageName, key });
      },
      delete: async () => true,
      clear: async () => true,
      destroy: () => {},
    };
    return { store, saves };
  }

  function mockFetch(body: string): void {
    global.fetch = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => body,
          json: async () => JSON.parse(body),
          arrayBuffer: async () => Buffer.from(body).buffer,
        }) as unknown as Response,
    );
  }

  test('context.fetchText saves to __ctx_text store under the resolved URL', async () => {
    mockFetch('hello');
    const { store, saves } = makeMockStore();
    const loader = new Loader({ basePath: '/', cache: store });

    loader.bindAsset<string>({ ctor: RichAsset, typeNames: ['richAsset'] }, { load: async (request, ctx) => ctx.fetchText(request.source) });

    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));

    expect(saves).toContainEqual({ storageName: '__ctx_text', key: '/file.txt' });
  });

  test('context.fetchJson saves to __ctx_json store under the resolved URL', async () => {
    mockFetch('{"n":1}');
    const { store, saves } = makeMockStore();
    const loader = new Loader({ basePath: '/', cache: store });

    loader.bindAsset<string>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        load: async (request, ctx) => {
          const data = await ctx.fetchJson<{ n: number }>(request.source);
          return String(data.n);
        },
      },
    );

    await loader.load(new Asset({ type: 'richAsset', source: 'data.json', format: 'json' }));

    expect(saves).toContainEqual({ storageName: '__ctx_json', key: '/data.json' });
  });

  test('context.fetchArrayBuffer saves to __ctx_binary store under the resolved URL', async () => {
    mockFetch('bytes');
    const { store, saves } = makeMockStore();
    const loader = new Loader({ basePath: '/', cache: store });

    loader.bindAsset<string>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        load: async (request, ctx) => {
          const buf = await ctx.fetchArrayBuffer(request.source);
          return String(buf.byteLength);
        },
      },
    );

    await loader.load(new Asset({ type: 'richAsset', source: 'data.bin', format: 'bin' }));

    expect(saves).toContainEqual({ storageName: '__ctx_binary', key: '/data.bin' });
  });

  test('context.fetchText serves from store cache on second call (no network)', async () => {
    mockFetch('cached-text');
    const cachedText = 'cached-text';
    let loadCallCount = 0;
    const store: CacheStore = {
      load: async (storageName, key) => {
        if (storageName === '__ctx_text' && key === 'file.txt') {
          loadCallCount++;
          return cachedText;
        }
        return null;
      },
      save: async () => {},
      delete: async () => true,
      clear: async () => true,
      destroy: () => {},
    };
    const loader = new Loader({ basePath: '/', cache: store });

    loader.bindAsset<string>({ ctor: RichAsset, typeNames: ['richAsset'] }, { load: async (request, ctx) => ctx.fetchText(request.source) });

    // First load - populates _resources; context.fetchText goes to network, store has no entry yet
    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    // Second load - served from _resources, handler not called, store not consulted
    (global.fetch as MockInstance).mockClear();
    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('identity discrimination — one source, several resource identities', () => {
  class RichAsset {}

  test('an identity-relevant option splits one source into independent canonical assets', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string, { format: string }>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        getIdentityDiscriminator: request => `${request.source}:${request.options?.format}`,
        load: async request => `result:${request.options!.format}`,
      },
    );

    const tmxMap = new Asset({ type: 'richAsset', source: 'map.dat', format: 'tmx' });
    const rpgMap = new Asset({ type: 'richAsset', source: 'map.dat', format: 'rpg-maker' });

    await loader.load({ tmxA: tmxMap, tmxB: tmxMap, rpgA: rpgMap });

    const ctor = loader['_typeRegistry']['resolveTypeName']('richAsset')!;

    // One source, two identity-relevant formats: two canonical assets, not two aliases.
    expect(loader._peekResource(ctor, 'map.dat', { format: 'tmx' })).toBe('result:tmx');
    expect(loader._peekResource(ctor, 'map.dat', { format: 'rpg-maker' })).toBe('result:rpg-maker');

    hardUnloadAsset(loader, tmxMap);

    expect(loader._peekResource(ctor, 'map.dat', { format: 'tmx' })).toBeNull();
    expect(loader._peekResource(ctor, 'map.dat', { format: 'rpg-maker' })).not.toBeNull(); // unaffected — different identity
  });

  test('without a discriminator, one source is one canonical asset however many names point at it', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>({ ctor: RichAsset, typeNames: ['richAsset'] }, { load: async request => `result:${request.source}` });

    const asset = new Asset({ type: 'richAsset', source: 'shared.dat', format: 'x' });

    await loader.load({ a: asset, b: asset });

    const ctor = loader['_typeRegistry']['resolveTypeName']('richAsset')!;

    expect(loader._peekResource(ctor, 'shared.dat')).not.toBeNull();
    expect(loader.inspect()).toHaveLength(1);

    hardUnloadAsset(loader, asset);

    expect(loader._peekResource(ctor, 'shared.dat')).toBeNull();
  });

  test('resetting one identity leaves a sibling identity of the same source untouched', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string, { format: string }>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        getIdentityDiscriminator: request => `${request.source}:${request.options?.format}`,
        load: async request => `result:${request.options!.format}`,
      },
    );

    const tmxMap = new Asset({ type: 'richAsset', source: 'map.dat', format: 'tmx' });
    const rpgMap = new Asset({ type: 'richAsset', source: 'map.dat', format: 'rpg-maker' });

    await loader.load({ tmxA: tmxMap, rpgA: rpgMap });

    const ctor = loader['_typeRegistry']['resolveTypeName']('richAsset')!;

    hardUnloadAsset(loader, rpgMap);

    expect(loader._peekResource(ctor, 'map.dat', { format: 'tmx' })).not.toBeNull(); // untouched
    expect(loader._peekResource(ctor, 'map.dat', { format: 'rpg-maker' })).toBeNull();
  });
});

describe('awaitBackground() early exit', () => {
  test('resolves immediately when nothing is queued', async () => {
    const loader = new Loader({ basePath: '/' });
    const fetchSpy = vi.fn();

    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(loader.awaitBackground()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('setConcurrency()', () => {
  test('is chainable and limits how many background fetches start immediately', () => {
    const loader = createCoreLoader({ basePath: '/', concurrency: 6 });

    const deferred = createDeferred<Response>();
    global.fetch = vi.fn((): Promise<Response> => deferred.promise);

    expect(loader.setConcurrency(1)).toBe(loader);

    // Three background-adopted sources, but concurrency 1 → only one fetch starts.
    loader.load(Assets.from({ a: 'a.png', b: 'b.png', c: 'c.png' }), { priority: LoadPriority.Background });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - keyFor()
// ─────────────────────────────────────────────────────────────────────────────

describe('keyFor()', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(): void {
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);
  }

  test('returns the type + first alias for a loaded object resource', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetBindings(loader, [
      defineAsset<DummyAsset>({
        ctor: DummyAsset,
        type: 'dummyAsset',
        isValue: false,
        create: () => ({
          async load(request, ctx) {
            return new DummyAsset(await ctx.fetchText(request.source));
          },
        }),
      }),
    ]);
    mockFetch();

    const result = await loader.load(new Asset({ type: 'dummyAsset', source: 'thing.dat' }));

    expect(loader.keyFor(result)).toEqual({ type: DummyAsset, source: 'thing.dat' });
  });

  test('returns null for a resource object that was never loaded', () => {
    const loader = new Loader({ basePath: '/' });

    expect(loader.keyFor({})).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - release() edge cases: unregistered type, never-loaded fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('LoaderScope.release() edge cases', () => {
  test('release(asset) is a no-op when the asset type was never registered', () => {
    const loader = new Loader({ basePath: '/' });
    const scope = loader.createScope();
    const orphan = new Asset({ type: 'mockAsset', source: 'x.dat' });

    expect(() => scope.release(orphan)).not.toThrow();
  });

  test('release(asset) is a no-op when the asset was never loaded, and is idempotent', () => {
    const loader = new Loader({ basePath: '/' });
    const scope = loader.createScope();

    loader.bindAsset<string>({ ctor: MockAssetType, typeNames: ['mockAsset'] }, { load: async request => `loaded:${request.source}` });

    const neverLoaded = new Asset({ type: 'mockAsset', source: 'never.dat' });

    expect(() => scope.release(neverLoaded)).not.toThrow();
    expect(() => scope.release(neverLoaded)).not.toThrow();
    expect(loader._peekResource(MockAssetType, 'never.dat')).toBeNull();
  });

  test('release(assets) is a silent no-op for a leaf whose kind this loader never bound', () => {
    // Intent preserved: a catalog entry the loader doesn't know is skipped, not
    // thrown. A bare loader (no core bindings) never adopted the leaf, so its
    // release finds no registered key and does nothing.
    const loader = new Loader({ basePath: '/' });
    const scope = loader.createScope();
    const container = new Assets({ orphan: { type: 'texture', source: 'x.png' } });

    expect(() => scope.release(container)).not.toThrow();
  });

  test('release(assets) is a silent no-op when the container was never adopted/loaded', () => {
    // Releasing entries that were never tracked does nothing.
    const loader = createCoreLoader({ basePath: '/' });
    const scope = loader.createScope();
    const container = new Assets({ orphan: { type: 'texture', source: 'never.png' } });

    expect(() => scope.release(container)).not.toThrow();
    expect(loader._peekResource(Texture, 'never.png')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - basePath / fetchOptions property accessors
// ─────────────────────────────────────────────────────────────────────────────

describe('basePath / fetchOptions property accessors', () => {
  test('basePath getter/setter takes effect on subsequent loads', async () => {
    const loader = new Loader({ basePath: '/a/' });

    expect(loader.basePath).toBe('/a/');

    loader.basePath = '/b/';
    expect(loader.basePath).toBe('/b/');

    bindTextAsset(loader);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load('demo.txt');

    expect(global.fetch).toHaveBeenCalledWith('/b/demo.txt', expect.anything());
  });

  test('fetchOptions getter/setter takes effect on subsequent loads', async () => {
    const loader = new Loader({ basePath: '/', fetchOptions: { mode: 'cors' } });

    expect(loader.fetchOptions).toEqual({ mode: 'cors' });

    loader.fetchOptions = { mode: 'no-cors' };
    expect(loader.fetchOptions).toEqual({ mode: 'no-cors' });

    bindTextAsset(loader);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load('demo.txt');

    expect(global.fetch).toHaveBeenCalledWith('/demo.txt', { mode: 'no-cors', signal: expect.any(AbortSignal) });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - _resolveUrl absolute-URL passthrough
// ─────────────────────────────────────────────────────────────────────────────

describe('absolute URL passthrough', () => {
  test('an absolute https:// path bypasses basePath prefixing', async () => {
    const loader = new Loader({ basePath: '/assets/' });

    bindTextAsset(loader);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load('https://cdn.example.com/x.txt');

    expect(global.fetch).toHaveBeenCalledWith('https://cdn.example.com/x.txt', expect.anything());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - hasLoadable() / hasAssetType() / hasExtension()
// ─────────────────────────────────────────────────────────────────────────────

describe('hasLoadable() / hasAssetType() / hasExtension()', () => {
  test('reflect a bindAsset() type-handler, type-name, and extension registration', () => {
    class ProbeAsset {}
    const loader = new Loader({ basePath: '/' });

    expect(loader.hasLoadable(ProbeAsset)).toBe(false);
    expect(loader.hasAssetType('probeType')).toBe(false);
    expect(loader.hasExtension('probe')).toBe(false);

    loader.bindAsset<ProbeAsset>({ ctor: ProbeAsset, typeNames: ['probeType'], extensions: ['PROBE'] }, { load: async () => new ProbeAsset() });

    expect(loader.hasLoadable(ProbeAsset)).toBe(true);
    expect(loader.hasAssetType('probeType')).toBe(true);
    expect(loader.hasExtension('probe')).toBe(true);
    expect(loader.hasExtension('.probe')).toBe(true);
  });

  test('hasLoadable() is true for a bindAsset() handler registration', () => {
    const loader = new Loader({ basePath: '/' });
    class HandlerAsset {}

    expect(loader.hasLoadable(HandlerAsset)).toBe(false);
    loader.bindAsset<string>({ ctor: HandlerAsset, typeNames: ['handlerType'] }, { load: async () => 'ok' });
    const ctor = loader['_typeRegistry']['resolveTypeName']('handlerType')!;

    expect(loader.hasLoadable(ctor)).toBe(true);
  });
});

describe('registerType()', () => {
  test('passes through to the underlying AssetTypeRegistry and returns `this` for chaining', () => {
    const loader = new Loader({ basePath: '/' });

    const result = loader.registerType('probe', 'text');

    expect(result).toBe(loader);
    expect(loader['_typeRegistry'].resolveExtensionType('probe')).toBe('text');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - bindAsset() direct handler binding
// ─────────────────────────────────────────────────────────────────────────────

describe('bindAsset() — direct handler binding', () => {
  class BoundAsset {
    public constructor(public readonly value: string) {}
  }
  class OtherBoundAsset {}

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('binds by kind: load(Asset) resolves via the handler', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetBindings(loader, [
      defineAsset<BoundAsset>({
        ctor: BoundAsset,
        type: 'boundAsset',
        isValue: false,
        create: () => ({ load: async request => new BoundAsset(request.source) }),
      }),
    ]);

    const result = (await loader.load(new Asset({ type: 'boundAsset', source: 'thing.bin' }))) as BoundAsset;

    expect(result).toBeInstanceOf(BoundAsset);
    expect(result.value).toBe('thing.bin');
  });

  test('extra config fields are forwarded as an options object into the handler request', async () => {
    const loader = new Loader({ basePath: '/' });
    let receivedConfig: unknown;

    materializeAssetBindings(loader, [
      defineAsset<BoundAsset, { scale: number }>({
        ctor: BoundAsset,
        type: 'boundAsset',
        isValue: false,
        create: () => ({
          load: async request => {
            receivedConfig = request;
            return new BoundAsset(request.source);
          },
        }),
      }),
    ]);

    await loader.load(new Asset({ type: 'boundAsset', source: 'thing.bin', scale: 3 }));

    expect(receivedConfig).toMatchObject({ source: 'thing.bin', options: { scale: 3 } });
  });

  test('binds by typeName: config-map load resolves via the handler', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<BoundAsset>({ ctor: BoundAsset, typeNames: ['boundAsset'] }, { load: async request => new BoundAsset(request.source) });

    const result = await loader.load(new Asset({ type: 'boundAsset', source: 'level.dat' }));

    expect(result).toBeInstanceOf(BoundAsset);
  });

  test('binds by extension + type: load(path) normalizes the suffix and resolves via the handler', async () => {
    const loader = new Loader({ basePath: '/' });

    // `type` is what puts an extension into the bare-path resolution table;
    // `typeNames` is what maps that type back to this constructor.
    loader.bindAsset<BoundAsset>(
      { ctor: BoundAsset, type: 'boundAsset', typeNames: ['boundAsset'], extensions: ['bnd'] },
      { load: async request => new BoundAsset(request.source) },
    );

    // `bnd` is not in ExtensionKindMap, so the typed bare-path overload rejects
    // it at compile time - the runtime override table still resolves it.
    const result = await loader.load('thing.bnd' as never);

    expect(result).toBeInstanceOf(BoundAsset);
  });

  test('binds by extension WITHOUT a type: the bare path stays unresolvable', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<BoundAsset>({ ctor: BoundAsset, extensions: ['bnd'] }, { load: async request => new BoundAsset(request.source) });

    expect(() => loader.load('thing.bnd' as never)).toThrow('no type registered');
  });

  test('getIdentityDiscriminator is forwarded and deduplicates in-flight loads', async () => {
    const loader = new Loader({ basePath: '/' });
    let calls = 0;

    loader.bindAsset<BoundAsset, { scale: number }>(
      { ctor: BoundAsset, typeNames: ['boundAsset'] },
      {
        getIdentityDiscriminator: request => `${request.source}:${request.options?.scale ?? 1}`,
        load: async request => {
          calls++;
          return new BoundAsset(request.source);
        },
      },
    );

    const a = new Asset({ type: 'boundAsset', source: 'shared.dat', scale: 2 });
    const b = new Asset({ type: 'boundAsset', source: 'shared.dat', scale: 2 });

    await Promise.all([loader.load(a), loader.load(b)]);

    expect(calls).toBe(1);
  });

  test('createFromBytes is forwarded and powers loadContainer() for the bound type', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<BoundAsset>(
      { ctor: BoundAsset, typeNames: ['boundAsset'] },
      {
        load: async request => new BoundAsset(request.source),
        createFromBytes: async bytes => new BoundAsset(new TextDecoder().decode(bytes)),
      },
    );

    const container = encodeContainer([{ source: 'x.dat', type: 'boundAsset', bytes: new TextEncoder().encode('hi') }]);

    global.fetch = vi.fn(
      async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => container }) as unknown as Response,
    );

    await loader.loadContainer('pack.exoa');

    expect((loader._peekResource(BoundAsset, 'x.dat') as BoundAsset).value).toBe('hi');
  });

  test('throws on a duplicate extension within the same bindAsset() call', () => {
    const loader = new Loader({ basePath: '/' });
    const handler: AssetHandler<BoundAsset> = { load: async request => new BoundAsset(request.source) };

    expect(() => loader.bindAsset<BoundAsset>({ ctor: BoundAsset, extensions: ['bnd', 'BND'] }, handler)).toThrow(/Duplicate extension key/);
  });

  test('throws when a handler is already registered for the type', () => {
    const loader = new Loader({ basePath: '/' });
    const handler: AssetHandler<BoundAsset> = { load: async request => new BoundAsset(request.source) };

    loader.bindAsset<BoundAsset>({ ctor: BoundAsset }, handler);

    expect(() => loader.bindAsset<BoundAsset>({ ctor: BoundAsset }, handler)).toThrow(/already registered/);
  });

  test('throws when a typeName is already registered', () => {
    const loader = new Loader({ basePath: '/' });
    const handlerA: AssetHandler<BoundAsset> = { load: async request => new BoundAsset(request.source) };
    const handlerB: AssetHandler<OtherBoundAsset> = { load: async () => new OtherBoundAsset() };

    loader.bindAsset<BoundAsset>({ ctor: BoundAsset, typeNames: ['dupName'] }, handlerA);

    expect(() => loader.bindAsset<OtherBoundAsset>({ ctor: OtherBoundAsset, typeNames: ['dupName'] }, handlerB)).toThrow(/already registered/);
  });

  test('throws when an extension is already mapped to another type', () => {
    const loader = new Loader({ basePath: '/' });
    const handlerA: AssetHandler<BoundAsset> = { load: async request => new BoundAsset(request.source) };
    const handlerB: AssetHandler<OtherBoundAsset> = { load: async () => new OtherBoundAsset() };

    loader.bindAsset<BoundAsset>({ ctor: BoundAsset, extensions: ['dupext'] }, handlerA);

    expect(() => loader.bindAsset<OtherBoundAsset>({ ctor: OtherBoundAsset, extensions: ['dupext'] }, handlerB)).toThrow(/already mapped/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - Loader.loadContainer() (exercised from within loader.test.ts's
// own coverage scope; a broader format/roundtrip suite lives in
// test/assets/asset-container.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

describe('loadContainer()', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function createCoreLoaderLocal(): Loader {
    const loader = new Loader({ basePath: '/' });
    materializeAssetBindings(loader, coreAssetBindings);

    return loader;
  }

  function mockContainerFetch(container: ArrayBuffer): void {
    global.fetch = vi.fn(
      async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => container }) as unknown as Response,
    );
  }

  test('loads N assets from one container in a single request', async () => {
    const container = encodeContainer([
      { source: 'data/level.json', type: 'json', bytes: new TextEncoder().encode('{"score":42}') },
      { source: 'docs/readme.txt', type: 'text', bytes: new TextEncoder().encode('hello world') },
      { source: 'data/blob.bin', type: 'binary', bytes: new Uint8Array([1, 2, 3, 4]) },
    ]);
    mockContainerFetch(container);

    const loader = createCoreLoaderLocal();
    await loader.loadContainer('assets/pack.exoa');

    expect(loader.get(Asset.type('json', 'data/level.json')).value).toEqual({ score: 42 });
    expect(loader.get(Asset.type('text', 'docs/readme.txt')).value).toBe('hello world');
    expect(new Uint8Array(loader.get(Asset.type('binary', 'data/blob.bin')).value)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test('throws on an unknown asset type and stores nothing', async () => {
    const container = encodeContainer([{ source: 'x.dat', type: 'nonsense', bytes: new TextEncoder().encode('x') }]);
    mockContainerFetch(container);

    const loader = createCoreLoaderLocal();

    await expect(loader.loadContainer('x.exoa')).rejects.toThrow(/unknown asset type "nonsense"/);
  });

  test('rejects when the resolved type has no createFromBytes handler', async () => {
    class BareAsset {}
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<BareAsset>({ ctor: BareAsset, typeNames: ['bare'] }, { load: async () => new BareAsset() });

    const container = encodeContainer([{ source: 'x.dat', type: 'bare', bytes: new Uint8Array([1]) }]);
    mockContainerFetch(container);

    await expect(loader.loadContainer('pack.exoa')).rejects.toThrow(/cannot be built from container bytes/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - destroy()
// ─────────────────────────────────────────────────────────────────────────────

describe('destroy()', () => {
  test('destroys cache stores, calls destroy() on bound handlers, and clears signals', () => {
    class DestroyAsset {}
    const store = createCacheStoreMock();
    const handlerDestroy = vi.fn();
    const loader = new Loader({ basePath: '/', cache: store });

    loader.bindAsset<unknown>({ ctor: DestroyAsset }, { load: async () => 'x', destroy: handlerDestroy });
    loader.onLoaded.add(() => {});

    loader.destroy();

    expect(store.destroy).toHaveBeenCalledTimes(1);
    expect(handlerDestroy).toHaveBeenCalledTimes(1);
    expect(loader.onLoaded.count).toBe(0);
  });

  test('deduplicates destroy() calls when the same handler instance is bound under multiple types', () => {
    class DestroyAssetA {}
    class DestroyAssetB {}
    const destroy = vi.fn();
    const handler: AssetHandler<unknown> = { load: async () => 'x', destroy };
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset({ ctor: DestroyAssetA }, handler);
    loader.bindAsset({ ctor: DestroyAssetB }, handler);

    loader.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test('does not throw when a bound handler has no destroy() method', () => {
    class NoDestroyAsset {}
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset({ ctor: NoDestroyAsset }, { load: async () => 'x' });

    expect(() => loader.destroy()).not.toThrow();
  });

  test('destroys CacheStores before bound bindAsset handlers', () => {
    class OrderAsset {}
    const order: string[] = [];
    const store = createCacheStoreMock({ destroy: vi.fn(() => order.push('store')) });
    const handlerDestroy = vi.fn(() => order.push('handler'));
    const loader = new Loader({ basePath: '/', cache: store });

    loader.bindAsset({ ctor: OrderAsset }, { load: async () => 'x', destroy: handlerDestroy });

    loader.destroy();

    expect(order).toEqual(['store', 'handler']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - _fetchWithHandler error wrapping
// ─────────────────────────────────────────────────────────────────────────────

describe('handler load() rejection is wrapped with url + cause', () => {
  class RichAsset {}

  test('wraps a thrown Error from a bindAsset() handler', async () => {
    const loader = new Loader({ basePath: '/assets/' });

    loader.bindAsset<string>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        load: async () => {
          throw new Error('handler exploded');
        },
      },
    );

    const asset = new Asset({ type: 'richAsset', source: 'x.json', format: 'x' });
    const error: Error = await loader.load(asset).catch((e: unknown) => e as Error);

    expect(error.message).toMatch(/Failed to load "x\.json" from "\/assets\/x\.json": handler exploded/);
    expect(error.cause).toBeInstanceOf(Error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - Asset config: extra config fields surface as handler options
// ─────────────────────────────────────────────────────────────────────────────

describe('Asset-based load() — extra config fields as handler options', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('extra config fields are forwarded to the handler request options', async () => {
    const loader = new Loader({ basePath: '/' });

    const receivedOptions: unknown[] = [];
    materializeAssetBindings(loader, [
      defineAsset<string, { format: string }>({
        ctor: MockAssetType,
        type: 'mockAsset',
        isValue: false,
        create: () => ({
          async load(request) {
            receivedOptions.push(request.options);
            return `loaded:${request.source}`;
          },
        }),
      }),
    ]);

    await loader.load(new Asset({ type: 'mockAsset', source: 'extra.dat', format: 'tiled' }));

    expect(receivedOptions[0]).toMatchObject({ format: 'tiled' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - remaining small branch gaps
// ─────────────────────────────────────────────────────────────────────────────

describe('Loader constructor — cache option as an array of stores', () => {
  test('accepts an array of CacheStore instances', async () => {
    const storeA = createCacheStoreMock();
    const storeB = createCacheStoreMock();
    const loader = new Loader({ basePath: '/', cache: [storeA, storeB] });

    bindTextAsset(loader);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load('demo.txt');

    expect(storeA.load).toHaveBeenCalledWith('text', '/demo.txt');
    expect(storeB.load).toHaveBeenCalledWith('text', '/demo.txt');
  });
});

describe('internal-reset-during-in-flight identity cleanup on rejection', () => {
  class RichAsset {}

  test('does not throw when the identity tracking was already cleared before the fetch rejects', async () => {
    const loader = new Loader({ basePath: '/' });
    const deferred = createDeferred<unknown>();

    loader.bindAsset<unknown>({ ctor: RichAsset, typeNames: ['richAsset'] }, { load: async () => deferred.promise });

    const asset = new Asset({ type: 'richAsset', source: 'x.dat', format: 'x' });
    const pending = loader.load(asset);

    // Reset while still in flight: this clears `_identityKeyToAliases` for this
    // identity synchronously, before the underlying load settles.
    hardUnloadAsset(loader, asset);

    deferred.reject(new Error('boom'));

    await expect(pending).rejects.toThrow('boom');
  });
});

describe('internal unloadAll() with no type argument', () => {
  test('clears every loaded type', async () => {
    const loader = new Loader({ basePath: '/' });

    bindTextAsset(loader);
    materializeAssetBindings(loader, [
      defineAsset<DummyAsset>({
        ctor: DummyAsset,
        type: 'dummyAsset',
        isValue: false,
        create: () => ({
          async load(request, ctx) {
            return new DummyAsset(await ctx.fetchText(request.source));
          },
        }),
      }),
    ]);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load('a.txt');
    await loader.load(new Asset({ type: 'dummyAsset', source: 'b.dat' }));

    expect(loader._peekResource(TextAsset, 'a.txt')).not.toBeNull();
    expect(loader._peekResource(DummyAsset, 'b.dat')).not.toBeNull();

    residencyOf(loader).unloadAll();

    expect(loader._peekResource(TextAsset, 'a.txt')).toBeNull();
    expect(loader._peekResource(DummyAsset, 'b.dat')).toBeNull();
  });
});

describe('load({ alias: config }) — plain object values are auto-wrapped in an Asset', () => {
  test('a plain (non-Asset) config object value loads correctly', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>({ ctor: MockAssetType, typeNames: ['mockAsset'] }, { load: async request => `loaded:${request.source}` });

    await loader.load({ hero: { type: 'mockAsset', source: 'hero.dat' } });

    expect(loader._peekResource(MockAssetType, 'hero.dat')).not.toBeNull();
  });
});

describe('non-Error throws are stringified when wrapping fetch/handler failures', () => {
  class RichAsset {}

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('_fetchWithHandler wraps a thrown non-Error value from a handler', async () => {
    const loader = new Loader({ basePath: '/assets/' });

    loader.bindAsset<string>(
      { ctor: RichAsset, typeNames: ['richAsset'] },
      {
        load: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'plain string failure';
        },
      },
    );

    const asset = new Asset({ type: 'richAsset', source: 'y.json', format: 'y' });

    await expect(loader.load(asset)).rejects.toThrow(/Failed to load "y\.json" from "\/assets\/y\.json": plain string failure/);
  });
});

describe('bare-path descriptor normalization', () => {
  /** Binds `TextAsset` as the app's `text` type so a re-pointed suffix has somewhere to land. */
  function bindTextType(loader: Loader, result = 'overridden'): void {
    loader.bindAsset<string>({ ctor: TextAsset, type: 'text', typeNames: ['text'] }, { load: async () => result });
  }

  test('get() resolves a bare path through the app-local type override, not the global default', async () => {
    const loader = new Loader({ basePath: '/' });

    // Globally `.json` maps to the `json` value type; this app re-points it.
    loader.registerType('json', 'text');
    bindTextType(loader);

    const ref = loader.get('config.json');

    expect(ref).toBeInstanceOf(AssetRef);
    await expect(ref.loaded).resolves.toBe('overridden');
    // Keyed under the OVERRIDE's constructor, not the global default's.
    expect(loader._peekResource(TextAsset, 'config.json')).toBe('overridden');
  });

  test('load() resolves a bare path through the app-local type override', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerType('json', 'text');
    bindTextType(loader);

    await expect(loader.load('config.json')).resolves.toBe('overridden');
  });

  test('without an override the same bare path resolves to the unbound global default and throws synchronously', () => {
    const loader = new Loader({ basePath: '/' });

    bindTextType(loader);

    // `.json` → the global `json` type, whose constructor has no handler here -
    // proving the path did NOT route to the bound `text` handler.
    expect(() => loader.get('config.json')).toThrow(/no asset handler bound for type "json"/);
    expect(() => loader.load('config.json')).toThrow(/no asset handler bound for type "json"/);
  });

  test('an unresolvable suffix names Asset.type() in its guidance', () => {
    const loader = new Loader({ basePath: '/' });

    expect(() => loader.get('theme.custom' as never)).toThrow(/no type registered for any extension of "theme\.custom"/);
    expect(() => loader.get('theme.custom' as never)).toThrow(/Asset\.type\(type, "theme\.custom"\)/);
  });

  test('the longest registered suffix wins over its bare tail', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerType('aseprite.json', 'text');
    bindTextType(loader);

    // `aseprite.json` beats `json`; a plain `.json` still takes the global default.
    await expect(loader.load('hero.aseprite.json' as never)).resolves.toBe('overridden');
    expect(loader._peekResource(TextAsset, 'plain.json')).toBeNull();
  });

  test('rejects the removed load(path, options) call shape instead of silently dropping options', () => {
    const loader = new Loader({ basePath: '/' });
    bindTextType(loader);
    loader.registerType('txt', 'text');

    const legacyLoad = loader.load as unknown as (path: string, options: object) => unknown;

    expect(() => legacyLoad.call(loader, 'notes.txt', { priority: LoadPriority.Background })).toThrow(/load\(path, options\) is not supported/);
    expect(() => legacyLoad.call(loader, 'notes.txt', { priority: LoadPriority.Background })).toThrow(/Asset\.type\(type, path, options\)/);
  });

  test('rejects second-argument options for Asset.type() descriptors instead of silently dropping them', () => {
    const loader = new Loader();
    const descriptor = Asset.type('json', 'config.json');
    const descriptorLoad = loader.load as unknown as (asset: typeof descriptor, options: object) => unknown;
    const descriptorGet = loader.get as unknown as (asset: typeof descriptor, options: object) => unknown;

    expect(() => descriptorLoad.call(loader, descriptor, { priority: LoadPriority.Background })).toThrow(
      /load\(Asset\.type\(\.\.\.\), options\) is not supported/,
    );
    expect(() => descriptorGet.call(loader, descriptor, { delimiter: ',' })).toThrow(/get\(Asset\.type\(\.\.\.\), options\) is not supported/);
  });
});

describe('bare-path loading for non-leaf resource types', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Non-leaf types (font, bmFont, svg, image, music, video) have no bare-path
  // inference at the TYPE level - `KindByPath` resolves them to `never`, so these
  // calls need the `as never` cast. The RUNTIME branch still resolves them via
  // the app-local override table that `bindAsset`'s `type` + `extensions` feed,
  // which is what these two tests pin.

  test('load(path) for the font type infers the family from the filename', async () => {
    const loader = new Loader({ basePath: '/' });
    let received: unknown;

    // Mirrors the core font binding's wiring (jsdom has no FontFace, so the
    // conditional core binding is absent here).
    loader.bindAsset<string, { family: string }>(
      { ctor: FontAsset, type: 'font', typeNames: ['font'], extensions: ['woff2'] },
      {
        load: async request => {
          received = request.options;

          return 'face';
        },
      },
    );

    await expect(loader.load('fonts/Roboto.woff2' as never)).resolves.toBe('face');
    // The filename (minus directory, extension and query) becomes the family.
    expect(received).toEqual({ family: 'Roboto' });
  });

  test('load(path) for the font type strips a query string before inferring the family', async () => {
    const loader = new Loader({ basePath: '/' });
    let received: unknown;

    loader.bindAsset<string, { family: string }>(
      { ctor: FontAsset, type: 'font', typeNames: ['font'], extensions: ['woff2'] },
      {
        load: async request => {
          received = request.options;

          return 'face';
        },
      },
    );

    await loader.load('fonts/Roboto.woff2?v=2' as never);

    expect(received).toEqual({ family: 'Roboto' });
  });

  test('load(path) resolves a bmFont suffix through the override table to the bmFont handler', async () => {
    const loader = createCoreLoader({ basePath: '/' });

    global.fetch = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => 'common lineHeight=32 base=26\nchars count=0\n',
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
        }) as unknown as Response,
    );

    const font = await loader.load('fonts/ui.fnt' as never);

    expect(font).toBeInstanceOf(BmFont);
    // Resolved through `_resolveTypeForPath` → 'bmFont' → `_resolveBarePath` → BmFont,
    // not through any leaf/value channel.
    expect(loader._peekResource(BmFont, 'fonts/ui.fnt')).toBe(font);
  });

  test('load(path) for a non-leaf type whose handler is unbound reports the resolved type', () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerType('woff2', 'font');

    expect(() => loader.load('fonts/Roboto.woff2' as never)).toThrow('no asset handler bound for type "font"');
  });
});

describe('value-kind leaves for declaration-merged package types', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // The runtime half of the `ValueAssetKind` contract. `defineAsset` computes
  // `isValue ?? seamless === undefined`, so a binding that ships no seamless
  // adapter - the normal shape for an extension package type - hands out an
  // `AssetRef` wrapper from `get()`, never the bare resource. The type side
  // mirrors this with `isValue: true` on the `AssetDefinitions` entry; this test
  // pins the runtime behaviour that marker claims, so the two cannot drift
  // silently into `get()` being typed as the unwrapped resource.
  test('a bare path for a seamless-less package kind yields an AssetRef, not the resource', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetBindings(loader, [
      defineAsset<string>({
        ctor: PackageLeafAsset,
        type: 'packageLeaf',
        extensions: ['pkgleaf'],
        create: () => ({ load: async () => 'payload' }),
      }),
    ]);

    const leaf = loader.get('level.pkgleaf' as never);

    expect(leaf).toBeInstanceOf(AssetRef);
    await expect((leaf as AssetRef<string>).loaded).resolves.toBe('payload');
  });

  test('the same kind reached through Asset.type() also yields an AssetRef', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetBindings(loader, [
      defineAsset<string>({
        ctor: PackageLeafAsset,
        type: 'packageLeaf',
        extensions: ['pkgleaf'],
        create: () => ({ load: async () => 'payload' }),
      }),
    ]);

    const leaf = loader.get(Asset.type('packageLeaf', 'level.pkgleaf'));

    expect(leaf).toBeInstanceOf(AssetRef);
  });
});
