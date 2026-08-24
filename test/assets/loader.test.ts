import type { MockInstance } from 'vitest';

import { Asset } from '#assets/Asset';
import { AssetCache } from '#assets/AssetCache';
import { encodeContainer } from '#assets/AssetContainer';
import { AssetRef } from '#assets/AssetRef';
import { Assets } from '#assets/Assets';
import type { CacheRecordKey } from '#assets/CacheRecordKey';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader, LoadPriority } from '#assets/Loader';
import { FontAsset, TextAsset } from '#assets/tokens';
import { materializeAssetTypes } from '#extensions/materialize';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';

import { type CacheStoreDouble, createCacheStoreDouble } from './cache-test-doubles';
import { testAssetType } from './test-asset-type';

/** Create a Loader with all built-in asset types installed. */
function createCoreLoader(options?: ConstructorParameters<typeof Loader>[0]): Loader {
  const loader = new Loader(options);
  materializeAssetTypes(loader, coreAssetTypes);
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
    // A package-shaped kind: no seamless adapter, so its leaf is a ref at
    // runtime and the entry mirrors that with `isValue`.
    packageLeaf: { resource: string; config: { source: string }; isValue: true };
  }
}

/**
 * Installs a text asset type on `loader` that applies `create` to the acquired
 * text. It dispatches on `TextAsset` and is named `text`, so it acquires and
 * caches exactly where the built-in text type does and cache-store assertions
 * keyed on that namespace keep working.
 */
function bindTextAsset(loader: Loader, create: (text: string) => string | Promise<string> = text => `resource:${text}`): { create: MockInstance } {
  const createSpy = vi.fn(create);

  loader._installAssetTypes([
    testAssetType<string, string>({ id: 'text', token: TextAsset, extensions: ['txt'], create: async source => createSpy(source) as unknown as string }),
  ]);

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

/** The record key a handler-context text fetch of `source` writes under. */
const contextTextKey = (namespace: string, source: string): CacheRecordKey => ({
  namespace,
  source: `url:${source}`,
  version: 1,
  record: 'value',
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

  test('a custom asset type with a user-defined class', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetTypes(loader, [
      testAssetType<string, DummyAsset>({ id: 'dummyAsset', token: DummyAsset, leaf: 'none', create: async text => new DummyAsset(text) }),
    ]);
    mockFetch('raw');

    const result = await loader.load(new Asset({ type: 'dummyAsset', source: 'thing.dat' }));

    expect(result).toBeInstanceOf(DummyAsset);
    expect(result.value).toBe('raw');
  });

  test('reads from cache hit and skips network fetch', async () => {
    const cacheStore = createCacheStoreDouble();

    await cacheStore.set(contextTextKey('text', '/cached.txt'), 'cached-source');

    const loader = new Loader({ basePath: '/', cache: cacheStore });

    bindTextAsset(loader);
    global.fetch = vi.fn(async (): Promise<Response> => {
      throw new Error('Unexpected network fetch on cache hit.');
    });

    const result = await loader.load('cached.txt');

    expect(result).toBe('resource:cached-source');
    expect(cacheStore.get).toHaveBeenCalledWith(contextTextKey('text', '/cached.txt'));
    expect(cacheStore.delete).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('falls back to network and persists source when cache misses', async () => {
    const cacheStore = createCacheStoreDouble();
    const loader = new Loader({ basePath: '/', cache: cacheStore });

    bindTextAsset(loader);
    mockFetch('fresh-source');

    const result = await loader.load('miss.txt');

    expect(result).toBe('resource:fresh-source');
    expect(cacheStore.get).toHaveBeenCalledWith(contextTextKey('text', '/miss.txt'));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(cacheStore.set).toHaveBeenCalledWith(contextTextKey('text', '/miss.txt'), 'fresh-source');
  });

  test('load(Json, path) returns unknown by default', async () => {
    const loader = createCoreLoader({ basePath: '/' });

    global.fetch = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => '42',
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

    materializeAssetTypes(loader, [
      testAssetType<string, FirstType>({ id: 'firstType', token: FirstType, leaf: 'none', create: async () => new FirstType() }),
      testAssetType<string, SecondType>({ id: 'secondType', token: SecondType, leaf: 'none', create: async () => new SecondType() }),
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

    await expect(queue).rejects.toThrow('No asset type "mockAsset" is installed');
    // Progress must have settled - pending must be 0
    expect(lastProgress.pending).toBe(0);
    expect(lastProgress.failed).toBe(1);
    expect(lastProgress.loaded).toBe(0);
  });

  test('progress counts both successful and failed items in a map load', async () => {
    const loader = new Loader({ basePath: '/' });

    // A type that fails for the 'bad.dat' source: failure is driven by the
    // request rather than by a factory mock.
    loader._installAssetTypes([
      testAssetType<string, string>({
        id: 'mockAsset',
        token: MockAssetType,
        acquires: false,
        create: async (_source, context) => {
          if (context.source === 'bad.dat') {
            throw new Error('bad');
          }

          return 'ok';
        },
      }),
    ]);
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

  // Installs MockAssetType as an acquiring type, so cross-alias network dedup
  // stays observable.
  function bindMockAsset(loader: Loader): void {
    loader._installAssetTypes([
      testAssetType<string, string>({ id: 'mockAsset', token: MockAssetType, create: async (_source, context) => `loaded:${context.source}` }),
    ]);
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

describe('a custom asset type - acquisition, identity and caching', () => {
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

  /** Installs `richAsset` with the given factory body, over the default text codec. */
  function installRich(loader: Loader, create: (source: string, context: { source: string; resourceKey: string }) => Promise<string>): void {
    loader._installAssetTypes([testAssetType<string, string>({ id: 'richAsset', token: RichAsset, create: create as never })]);
  }

  test('the factory sees the resource key its asset is stored under', async () => {
    mockFetchText('body');
    const loader = new Loader({ basePath: '/' });
    let capturedKey = '';

    installRich(loader, async (_source, context) => {
      capturedKey = context.resourceKey;

      return 'ok';
    });

    await loader.load(new Asset({ type: 'richAsset', source: 'a.json', format: 'x' }));

    // The type's own id names it, not a per-session ordinal: the key has to mean
    // the same thing across reloads for a persistent cache to use it.
    expect(capturedKey).toBe('richAsset|url:/a.json');
  });

  test('acquires its source over the network and hands it to the factory', async () => {
    mockFetchText('hello world');
    const loader = new Loader({ basePath: '/assets/' });

    installRich(loader, async source => source);

    const result = await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));

    expect(result).toBe('hello world');
    expect(global.fetch).toHaveBeenCalledWith('/assets/file.txt', expect.anything());
  });

  test('a second load of one asset is served from residency, with no second fetch', async () => {
    mockFetchText('cached content');
    const loader = new Loader({ basePath: '/' });

    installRich(loader, async source => source);

    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    (global.fetch as MockInstance).mockClear();
    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a codec decides what the factory receives', async () => {
    mockFetchText('{"value":42}');
    const loader = new Loader({ basePath: '/' });

    loader._installAssetTypes([
      testAssetType<{ value: number }, string>({
        id: 'richAsset',
        token: RichAsset,
        codec: {
          fromResponse: response => response.text(),
          fromBytes: bytes => Promise.resolve(new TextDecoder().decode(bytes)),
          decode: stored => Promise.resolve(JSON.parse(stored as string) as { value: number }),
        },
        create: async source => String(source.value),
      }),
    ]);

    await expect(loader.load(new Asset({ type: 'richAsset', source: 'data.json', format: 'json' }))).resolves.toBe('42');
  });

  test('a resource discriminator separates two assets that share one source', async () => {
    mockFetchText('body');
    const loader = new Loader({ basePath: '/' });
    const loadOrder: string[] = [];

    loader._installAssetTypes([
      testAssetType<string, string, { format: string }>({
        id: 'richAsset',
        token: RichAsset,
        acquires: false,
        resourceIdentity: request => `${request.source}:${request.options?.format}`,
        create: async (_source, context) => {
          loadOrder.push(context.options!.format);

          return `result:${context.options!.format}`;
        },
      }),
    ]);

    const tmx = new Asset({ type: 'richAsset', source: 'map.tmx', format: 'tmx' });
    const json = new Asset({ type: 'richAsset', source: 'map.tmx', format: 'tiled-json' });

    const [resTmx, resJson] = await Promise.all([loader.load(tmx), loader.load(json)]);

    expect(resTmx).toBe('result:tmx');
    expect(resJson).toBe('result:tiled-json');
    expect(loadOrder).toContain('tmx');
    expect(loadOrder).toContain('tiled-json');
  });

  test('without a resource discriminator, one source deduplicates in-flight loads', async () => {
    let callCount = 0;
    const loader = new Loader({ basePath: '/' });

    loader._installAssetTypes([
      testAssetType<string, string>({
        id: 'richAsset',
        token: RichAsset,
        acquires: false,
        create: async (_source, context) => {
          callCount++;

          return `ok:${context.source}`;
        },
      }),
    ]);

    const a1 = new Asset({ type: 'richAsset', source: 'shared.dat', format: 'x' });
    const a2 = new Asset({ type: 'richAsset', source: 'shared.dat', format: 'x' });

    const [r1, r2] = await Promise.all([loader.load(a1), loader.load(a2)]);

    expect(callCount).toBe(1);
    expect(r1).toBe('ok:shared.dat');
    expect(r2).toBe('ok:shared.dat');
  });
});

describe('a custom asset type caches under its own namespace', () => {
  class RichAsset {}

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function makeMockStore(): { store: CacheStoreDouble; saves: () => CacheRecordKey[] } {
    const store = createCacheStoreDouble();

    return { store, saves: () => store.set.mock.calls.map(call => call[0]) };
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

  function installRich(loader: Loader): void {
    loader._installAssetTypes([testAssetType<string, string>({ id: 'richAsset', token: RichAsset, create: async source => source })]);
  }

  test('writes its record under the type id, not a namespace shared with every other type', async () => {
    mockFetch('hello');
    const { store, saves } = makeMockStore();
    const loader = new Loader({ basePath: '/', cache: store });

    installRich(loader);

    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));

    expect(saves()).toContainEqual(contextTextKey('richAsset', '/file.txt'));
  });

  test('two types reading one URL keep separate records', async () => {
    mockFetch('hello');
    const { store, saves } = makeMockStore();
    const loader = new Loader({ basePath: '/', cache: store });
    class OtherAsset {}

    loader._installAssetTypes([
      testAssetType<string, string>({ id: 'richAsset', token: RichAsset, create: async source => source }),
      testAssetType<string, string>({ id: 'otherAsset', token: OtherAsset, create: async source => `other:${source}` }),
    ]);

    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    await loader.load(new Asset({ type: 'otherAsset', source: 'file.txt' } as never));

    expect(saves()).toContainEqual(contextTextKey('richAsset', '/file.txt'));
    expect(saves()).toContainEqual(contextTextKey('otherAsset', '/file.txt'));
  });

  test('serves a second acquisition from the store, with no network', async () => {
    mockFetch('cached-text');

    const { store } = makeMockStore();
    const first = new Loader({ basePath: '/', cache: store });

    installRich(first);

    await first.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    first.destroy();

    // A second loader shares the store but holds no resident resources, so the
    // next acquisition is a real cache read rather than a residency hit.
    (global.fetch as MockInstance).mockClear();

    const second = new Loader({ basePath: '/', cache: store });

    installRich(second);

    const value = await second.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));

    expect(value).toBe('cached-text');
    expect(global.fetch).not.toHaveBeenCalled();

    second.destroy();
  });
});

describe('identity discrimination — one source, several resource identities', () => {
  class RichAsset {}

  test('an identity-relevant option splits one source into independent canonical assets', async () => {
    const loader = new Loader({ basePath: '/' });

    loader._installAssetTypes([
      testAssetType<string, string, { format: string }>({
        id: 'richAsset',
        token: RichAsset,
        acquires: false,
        resourceIdentity: request => `${request.source}:${request.options?.format}`,
        create: async (_source, context) => `result:${context.options!.format}`,
      }),
    ]);

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

    loader._installAssetTypes([
      testAssetType<string, string>({ id: 'richAsset', token: RichAsset, acquires: false, create: async (_source, context) => `result:${context.source}` }),
    ]);

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

    loader._installAssetTypes([
      testAssetType<string, string, { format: string }>({
        id: 'richAsset',
        token: RichAsset,
        acquires: false,
        resourceIdentity: request => `${request.source}:${request.options?.format}`,
        create: async (_source, context) => `result:${context.options!.format}`,
      }),
    ]);

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

    materializeAssetTypes(loader, [
      testAssetType<string, DummyAsset>({ id: 'dummyAsset', token: DummyAsset, leaf: 'none', create: async text => new DummyAsset(text) }),
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

    loader._installAssetTypes([
      testAssetType<string, string>({ id: 'mockAsset', token: MockAssetType, acquires: false, create: async (_source, context) => `loaded:${context.source}` }),
    ]);

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
  test('reflect an installed type, its id, and the suffixes it claims', () => {
    class ProbeAsset {}
    const loader = new Loader({ basePath: '/' });

    expect(loader.hasLoadable(ProbeAsset)).toBe(false);
    expect(loader.hasAssetType('probeType')).toBe(false);
    expect(loader.hasExtension('probe')).toBe(false);

    loader._installAssetTypes([
      testAssetType<string, ProbeAsset>({ id: 'probeType', token: ProbeAsset, extensions: ['PROBE'], create: async () => new ProbeAsset() }),
    ]);

    expect(loader.hasLoadable(ProbeAsset)).toBe(true);
    expect(loader.hasAssetType('probeType')).toBe(true);
    expect(loader.hasExtension('probe')).toBe(true);
    expect(loader.hasExtension('.probe')).toBe(true);
  });

  test('a type that brought no constructor is still reachable through the token minted for it', () => {
    const loader = new Loader({ basePath: '/' });

    loader._installAssetTypes([testAssetType<string, string>({ id: 'handlerType', acquires: false, create: async () => 'ok' })]);

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
// Coverage sweep - installing a type directly on a loader
// ─────────────────────────────────────────────────────────────────────────────

describe('installing an asset type directly on a loader', () => {
  class BoundAsset {
    public constructor(public readonly value: string) {}
  }

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('load(Asset) resolves through the installed type', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetTypes(loader, [
      testAssetType<string, BoundAsset>({
        id: 'boundAsset',
        token: BoundAsset,
        leaf: 'none',
        acquires: false,
        create: async (_source, context) => new BoundAsset(context.source),
      }),
    ]);

    const result = (await loader.load(new Asset({ type: 'boundAsset', source: 'thing.bin' }))) as BoundAsset;

    expect(result).toBeInstanceOf(BoundAsset);
    expect(result.value).toBe('thing.bin');
  });

  test('extra config fields reach the factory as its options object', async () => {
    const loader = new Loader({ basePath: '/' });
    let receivedOptions: unknown;

    materializeAssetTypes(loader, [
      testAssetType<string, BoundAsset, { scale: number }>({
        id: 'boundAsset',
        token: BoundAsset,
        leaf: 'none',
        acquires: false,
        create: async (_source, context) => {
          receivedOptions = context.options;

          return new BoundAsset(context.source);
        },
      }),
    ]);

    await loader.load(new Asset({ type: 'boundAsset', source: 'thing.bin', scale: 3 }));

    expect(receivedOptions).toEqual({ scale: 3 });
  });

  test('a claimed suffix resolves a bare path to the type', async () => {
    const loader = new Loader({ basePath: '/' });

    loader._installAssetTypes([
      testAssetType<string, BoundAsset>({
        id: 'boundAsset',
        token: BoundAsset,
        extensions: ['bnd'],
        acquires: false,
        create: async (_source, context) => new BoundAsset(context.source),
      }),
    ]);

    // `bnd` is not in ExtensionKindMap, so the typed bare-path overload rejects
    // it at compile time - the app-local table still resolves it at runtime.
    const result = await loader.load('thing.bnd' as never);

    expect(result).toBeInstanceOf(BoundAsset);
  });

  test('a suffix no installed type claims stays unresolvable', () => {
    const loader = new Loader({ basePath: '/' });

    loader._installAssetTypes([
      testAssetType<string, BoundAsset>({ id: 'boundAsset', token: BoundAsset, acquires: false, create: async () => new BoundAsset('x') }),
    ]);

    expect(() => loader.load('thing.bnd' as never)).toThrow('no installed asset type claims any extension');
  });

  test('a resource discriminator deduplicates two in-flight loads that share it', async () => {
    const loader = new Loader({ basePath: '/' });
    let calls = 0;

    loader._installAssetTypes([
      testAssetType<string, BoundAsset, { scale: number }>({
        id: 'boundAsset',
        token: BoundAsset,
        acquires: false,
        resourceIdentity: request => `${request.source}:${request.options?.scale ?? 1}`,
        create: async (_source, context) => {
          calls++;

          return new BoundAsset(context.source);
        },
      }),
    ]);

    const a = new Asset({ type: 'boundAsset', source: 'shared.dat', scale: 2 });
    const b = new Asset({ type: 'boundAsset', source: 'shared.dat', scale: 2 });

    await Promise.all([loader.load(a), loader.load(b)]);

    expect(calls).toBe(1);
  });

  test('a codec that reads bytes powers loadContainer() for the type', async () => {
    const loader = new Loader({ basePath: '/' });

    loader._installAssetTypes([testAssetType<string, BoundAsset>({ id: 'boundAsset', token: BoundAsset, create: async source => new BoundAsset(source) })]);

    const container = encodeContainer([{ source: 'x.dat', type: 'boundAsset', bytes: new TextEncoder().encode('hi') }]);

    global.fetch = vi.fn(
      async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => container }) as unknown as Response,
    );

    await loader.loadContainer('pack.exoa');

    expect((loader._peekResource(BoundAsset, 'x.dat') as BoundAsset).value).toBe('hi');
  });

  test('throws when one type declares the same suffix twice', () => {
    const loader = new Loader({ basePath: '/' });

    expect(() =>
      loader._installAssetTypes([
        testAssetType<string, BoundAsset>({
          id: 'boundAsset',
          token: BoundAsset,
          extensions: ['bnd', 'BND'],
          create: async source => new BoundAsset(source),
        }),
      ]),
    ).toThrow(/declares the extension ".bnd" twice/);
  });

  test('throws when a second type claims an id that is already installed', () => {
    const loader = new Loader({ basePath: '/' });
    const type = (): ReturnType<typeof testAssetType> =>
      testAssetType<string, BoundAsset>({ id: 'boundAsset', token: BoundAsset, create: async source => new BoundAsset(source) });

    loader._installAssetTypes([type()]);

    expect(() => loader._installAssetTypes([type()])).toThrow(/already installed/);
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
    materializeAssetTypes(loader, coreAssetTypes);

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

  test('rejects when the resolved type cannot be read from bytes', async () => {
    class BareAsset {}
    const loader = new Loader({ basePath: '/' });

    loader._installAssetTypes([
      testAssetType<string, BareAsset>({
        id: 'bare',
        token: BareAsset,
        codec: { fromResponse: response => response.text(), decode: stored => Promise.resolve(stored as string) },
        create: async () => new BareAsset(),
      }),
    ]);

    const container = encodeContainer([{ source: 'x.dat', type: 'bare', bytes: new Uint8Array([1]) }]);
    mockContainerFetch(container);

    await expect(loader.loadContainer('pack.exoa')).rejects.toThrow(/cannot be built from container bytes/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - destroy()
// ─────────────────────────────────────────────────────────────────────────────

describe('destroy()', () => {
  test('destroys cache stores, calls destroy() on every installed factory, and clears signals', () => {
    class DestroyAsset {}
    const store = createCacheStoreDouble();
    const factoryDestroy = vi.fn();
    const loader = new Loader({ basePath: '/', cache: store });

    loader._installAssetTypes([testAssetType<string, string>({ id: 'destroyAsset', token: DestroyAsset, create: async () => 'x', destroy: factoryDestroy })]);
    loader.onLoaded.add(() => {});

    loader.destroy();

    expect(store.destroy).toHaveBeenCalledTimes(1);
    expect(factoryDestroy).toHaveBeenCalledTimes(1);
    expect(loader.onLoaded.count).toBe(0);
  });

  test('destroys each installed type once, however many types share a destroy function', () => {
    class DestroyAssetA {}
    class DestroyAssetB {}
    const destroy = vi.fn();
    const loader = new Loader({ basePath: '/' });

    loader._installAssetTypes([
      testAssetType<string, string>({ id: 'destroyA', token: DestroyAssetA, create: async () => 'x', destroy }),
      testAssetType<string, string>({ id: 'destroyB', token: DestroyAssetB, create: async () => 'x', destroy }),
    ]);

    loader.destroy();

    expect(destroy).toHaveBeenCalledTimes(2);
  });

  test('does not throw when an installed factory has no destroy() method', () => {
    class NoDestroyAsset {}
    const loader = new Loader({ basePath: '/' });

    loader._installAssetTypes([testAssetType<string, string>({ id: 'noDestroy', token: NoDestroyAsset, create: async () => 'x' })]);

    expect(() => loader.destroy()).not.toThrow();
  });

  test('leaves an AssetCache it was handed alone, because another loader may still be using it', () => {
    const store = createCacheStoreDouble();
    const shared = new AssetCache({ stores: store });
    const first = new Loader({ basePath: '/', cache: shared });
    const second = new Loader({ basePath: '/', cache: shared });

    first.destroy();

    // The cache is the application's, not the loader's: closing its stores here
    // would tear the database out from under `second`.
    expect(store.destroy).not.toHaveBeenCalled();

    second.destroy();
    expect(store.destroy).not.toHaveBeenCalled();

    shared.destroy();
    expect(store.destroy).toHaveBeenCalledTimes(1);
  });

  test('destroys CacheStores before the installed factories', () => {
    class OrderAsset {}
    const order: string[] = [];
    const store = createCacheStoreDouble();

    store.destroy.mockImplementation(() => order.push('store'));
    const factoryDestroy = vi.fn(() => order.push('factory'));
    const loader = new Loader({ basePath: '/', cache: store });

    loader._installAssetTypes([testAssetType<string, string>({ id: 'orderAsset', token: OrderAsset, create: async () => 'x', destroy: factoryDestroy })]);

    loader.destroy();

    expect(order).toEqual(['store', 'factory']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep - _fetchWithHandler error wrapping
// ─────────────────────────────────────────────────────────────────────────────

describe('handler load() rejection is wrapped with url + cause', () => {
  class RichAsset {}

  test('wraps a thrown Error from a factory', async () => {
    const loader = new Loader({ basePath: '/assets/' });

    loader._installAssetTypes([
      testAssetType<string, string>({
        id: 'richAsset',
        token: RichAsset,
        acquires: false,
        create: async () => {
          throw new Error('handler exploded');
        },
      }),
    ]);

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
    materializeAssetTypes(loader, [
      testAssetType<string, string, { format: string }>({
        id: 'mockAsset',
        token: MockAssetType,
        leaf: 'none',
        acquires: false,
        create: async (_source, context) => {
          receivedOptions.push(context.options);

          return `loaded:${context.source}`;
        },
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
    const storeA = createCacheStoreDouble('a');
    const storeB = createCacheStoreDouble('b');
    const loader = new Loader({ basePath: '/', cache: [storeA, storeB] });

    bindTextAsset(loader);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load('demo.txt');

    expect(storeA.get).toHaveBeenCalledWith(contextTextKey('text', '/demo.txt'));
    expect(storeB.get).toHaveBeenCalledWith(contextTextKey('text', '/demo.txt'));
  });
});

describe('internal-reset-during-in-flight identity cleanup on rejection', () => {
  class RichAsset {}

  test('does not throw when the identity tracking was already cleared before the fetch rejects', async () => {
    const loader = new Loader({ basePath: '/' });
    const deferred = createDeferred<unknown>();

    loader._installAssetTypes([testAssetType<string, unknown>({ id: 'richAsset', token: RichAsset, acquires: false, create: async () => deferred.promise })]);

    const asset = new Asset({ type: 'richAsset', source: 'x.dat', format: 'x' });
    const pending = loader.load(asset);

    // Reset while still in flight: this clears `_aliases` for this
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
    materializeAssetTypes(loader, [
      testAssetType<string, DummyAsset>({ id: 'dummyAsset', token: DummyAsset, leaf: 'none', create: async text => new DummyAsset(text) }),
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

    loader._installAssetTypes([
      testAssetType<string, string>({ id: 'mockAsset', token: MockAssetType, acquires: false, create: async (_source, context) => `loaded:${context.source}` }),
    ]);

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

  test('a factory that throws a non-Error value is wrapped with the url', async () => {
    const loader = new Loader({ basePath: '/assets/' });

    loader._installAssetTypes([
      testAssetType<string, string>({
        id: 'richAsset',
        token: RichAsset,
        acquires: false,
        create: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'plain string failure';
        },
      }),
    ]);

    const asset = new Asset({ type: 'richAsset', source: 'y.json', format: 'y' });

    await expect(loader.load(asset)).rejects.toThrow(/Failed to load "y\.json" from "\/assets\/y\.json": plain string failure/);
  });
});

describe('bare-path descriptor normalization', () => {
  /** Installs `TextAsset` as the app's `text` type so a re-pointed suffix has somewhere to land. */
  function bindTextType(loader: Loader, result = 'overridden'): void {
    loader._installAssetTypes([testAssetType<string, string>({ id: 'text', token: TextAsset, acquires: false, create: async () => result })]);
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

  test('without an override a bare path only resolves through a type installed HERE', () => {
    const loader = new Loader({ basePath: '/' });

    bindTextType(loader);

    // The app-local `text` type claims no suffix, and nothing installed here
    // claims `.json` - proving the path did NOT route to it.
    expect(() => loader.get('config.json')).toThrow(/no installed asset type claims any extension of "config\.json"/);
    expect(() => loader.load('config.json')).toThrow(/no installed asset type claims any extension of "config\.json"/);
  });

  test('an unresolvable suffix names Asset.type() in its guidance', () => {
    const loader = new Loader({ basePath: '/' });

    expect(() => loader.get('theme.custom' as never)).toThrow(/no installed asset type claims any extension of "theme\.custom"/);
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
  // the app-local table an installed type's `extensions` feed, which is what
  // these two tests pin.

  test('load(path) for the font type infers the family from the filename', async () => {
    const loader = new Loader({ basePath: '/' });
    let received: unknown;

    // Mirrors the built-in font type's wiring.
    loader._installAssetTypes([
      testAssetType<string, string, { family: string }>({
        id: 'font',
        token: FontAsset,
        extensions: ['woff2'],
        leaf: 'none',
        acquires: false,
        create: async (_source, context) => {
          received = context.options;

          return 'face';
        },
      }),
    ]);

    await expect(loader.load('fonts/Roboto.woff2' as never)).resolves.toBe('face');
    // The filename (minus directory, extension and query) becomes the family.
    expect(received).toEqual({ family: 'Roboto' });
  });

  test('load(path) for the font type strips a query string before inferring the family', async () => {
    const loader = new Loader({ basePath: '/' });
    let received: unknown;

    loader._installAssetTypes([
      testAssetType<string, string, { family: string }>({
        id: 'font',
        token: FontAsset,
        extensions: ['woff2'],
        leaf: 'none',
        acquires: false,
        create: async (_source, context) => {
          received = context.options;

          return 'face';
        },
      }),
    ]);

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

  test('load(path) for a suffix mapped to a type nobody installed reports the resolved type', () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerType('woff2', 'font');

    expect(() => loader.load('fonts/Roboto.woff2' as never)).toThrow('no asset type "font" is installed on this application');
  });
});

describe('value-kind leaves for declaration-merged package types', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // The runtime half of the `ValueAssetKind` contract. A type's `leaf` defaults
  // to `'ref'` - the normal shape for an extension package type - so it hands
  // out an `AssetRef` wrapper from `get()`, never the bare resource. The type side
  // mirrors this with `isValue: true` on the `AssetDefinitions` entry; this test
  // pins the runtime behaviour that marker claims, so the two cannot drift
  // silently into `get()` being typed as the unwrapped resource.
  test('a bare path for a seamless-less package kind yields an AssetRef, not the resource', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetTypes(loader, [
      testAssetType<string, string>({ id: 'packageLeaf', token: PackageLeafAsset, extensions: ['pkgleaf'], acquires: false, create: async () => 'payload' }),
    ]);

    const leaf = loader.get('level.pkgleaf' as never);

    expect(leaf).toBeInstanceOf(AssetRef);
    await expect((leaf as AssetRef<string>).loaded).resolves.toBe('payload');
  });

  test('the same kind reached through Asset.type() also yields an AssetRef', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetTypes(loader, [
      testAssetType<string, string>({ id: 'packageLeaf', token: PackageLeafAsset, extensions: ['pkgleaf'], acquires: false, create: async () => 'payload' }),
    ]);

    const leaf = loader.get(Asset.type('packageLeaf', 'level.pkgleaf'));

    expect(leaf).toBeInstanceOf(AssetRef);
  });
});
