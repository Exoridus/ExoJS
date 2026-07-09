import type { AssetHandler } from '#extensions/Extension';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Asset } from '#resources/Asset';
import { encodeContainer } from '#resources/AssetContainer';
import type { AssetFactory } from '#resources/AssetFactory';
import { Assets } from '#resources/Assets';
import type { CacheStore } from '#resources/CacheStore';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { defineAsset } from '#resources/defineAsset';
import { Loader } from '#resources/Loader';
import { BinaryAsset, Json, TextAsset } from '#resources/tokens';

/** Create a Loader with all core asset bindings pre-installed. */
function createCoreLoader(options?: ConstructorParameters<typeof Loader>[0]): Loader {
  const loader = new Loader(options);
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

// Declaration merges for test-only asset types
declare module '#resources/AssetDefinitions' {
  interface AssetDefinitions {
    mockAsset: { resource: string; config: { source: string; format?: string; scale?: number; locale?: string } };
    richAsset: { resource: string; config: { source: string; format: string } };
    boundAsset: { resource: unknown; config: { source: string; scale?: number } };
    dummyAsset: { resource: DummyAsset; config: { source: string } };
    firstType: { resource: unknown; config: { source: string } };
    secondType: { resource: unknown; config: { source: string } };
  }
}

class MockTextFactory implements AssetFactory<string> {
  public readonly storageName = 'text';
  public readonly process = vi.fn(async (_response: Response): Promise<string> => 'fresh-source');
  public readonly create = vi.fn(async (source: string): Promise<string> => `resource:${source}`);

  public destroy(): void {}
}

class DummyAsset {
  constructor(public readonly value: string) {}
}

class DummyFactory implements AssetFactory<DummyAsset> {
  public readonly storageName = 'dummy';
  public readonly process = vi.fn(async (response: Response): Promise<string> => 'raw');
  public readonly create = vi.fn(async (source: string): Promise<DummyAsset> => new DummyAsset(source));

  public destroy(): void {}
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
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    const result = await loader.load('demo.txt');

    expect(result).toBe('resource:fresh-source');
  });

  test('basePath prefixes relative fetch URLs', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/assets/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();
    await loader.load('demo.txt');

    expect(global.fetch).toHaveBeenCalledWith('/assets/demo.txt', expect.anything());
  });

  test('fetchOptions are forwarded to fetch calls', async () => {
    const factory = new MockTextFactory();
    const fetchOptions: RequestInit = { credentials: 'include', mode: 'same-origin' };
    const loader = new Loader({ basePath: '/', fetchOptions });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();
    await loader.load('demo.txt');

    expect(global.fetch).toHaveBeenCalledWith('/demo.txt', fetchOptions);
  });

  test('load() deduplicates concurrent requests for the same alias', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    const [a, b] = await Promise.all([loader.load('same.txt'), loader.load('same.txt')]);

    expect(a).toBe(b);
    expect(factory.process).toHaveBeenCalledTimes(1);
  });

  test('throws on non-ok HTTP response', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch404();

    await expect(loader.load('missing.txt')).rejects.toThrow('404 Not Found');
  });

  test('load() continues independently per item (fail-tolerant via Promise.allSettled pattern)', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    factory.create.mockImplementationOnce(async () => 'ok');
    factory.create.mockImplementationOnce(async () => {
      throw new Error('broken');
    });

    const good = loader.load('good.txt');
    const bad = loader.load('bad.txt');

    await expect(good).resolves.toBe('ok');
    await expect(bad).rejects.toThrow('broken');
  });

  test('get() retrieves a loaded value asset', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    expect(loader._peekResource(TextAsset, 'demo.txt')).toBeNull();

    await loader.load('demo.txt');

    expect(loader.get('demo.txt').value).toBe('resource:fresh-source');
  });

  test('get() returns a loading ref whose value throws for a never-loaded value asset', () => {
    const loader = createCoreLoader({ basePath: '/' });
    // A fetch that never settles keeps the adopted ref in its 'loading' state.
    global.fetch = vi.fn((): Promise<Response> => new Promise<Response>(() => {}));

    const ref = loader.get(TextAsset.of('nope'));

    expect(ref.loadState).toBe('loading');
    expect(() => ref.value).toThrow("'loading'");
  });

  test('unload() removes a resource, unloadAll() clears type', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    await loader.load('a.txt');
    await loader.load('b.txt');

    expect(loader._peekResource(TextAsset, 'a.txt')).not.toBeNull();
    loader.unload(TextAsset, 'a.txt');
    expect(loader._peekResource(TextAsset, 'a.txt')).toBeNull();
    expect(loader._peekResource(TextAsset, 'b.txt')).not.toBeNull();

    loader.unloadAll(TextAsset);
    expect(loader._peekResource(TextAsset, 'b.txt')).toBeNull();
  });

  test('custom asset via defineAsset() with user-defined class', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetBindings(loader, [
      defineAsset<DummyAsset>({
        type: DummyAsset,
        kind: 'dummyAsset',
        isValue: false,
        create: () => ({
          async load(request, ctx) {
            return new DummyAsset(await ctx.fetchText(request.source));
          },
        }),
      }),
    ]);
    mockFetch('raw');

    const result = await loader.load(new Asset({ kind: 'dummyAsset', source: 'thing.dat' }));

    expect(result).toBeInstanceOf(DummyAsset);
    expect(result.value).toBe('raw');
  });

  test('reads from cache hit and skips network fetch', async () => {
    const factory = new MockTextFactory();
    const cacheStore = createCacheStoreMock({
      load: vi.fn(async (): Promise<string> => 'cached-source'),
    });
    const loader = new Loader({ basePath: '/', cache: cacheStore });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    global.fetch = vi.fn(async (): Promise<Response> => {
      throw new Error('Unexpected network fetch on cache hit.');
    });

    const result = await loader.load('cached.txt');

    expect(result).toBe('resource:cached-source');
    expect(cacheStore.load).toHaveBeenCalledWith('text', 'cached.txt');
    expect(cacheStore.save).not.toHaveBeenCalled();
    expect(cacheStore.delete).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('falls back to network and persists source when cache misses', async () => {
    const factory = new MockTextFactory();
    const cacheStore = createCacheStoreMock();
    const loader = new Loader({ basePath: '/', cache: cacheStore });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    const result = await loader.load('miss.txt');

    expect(result).toBe('resource:fresh-source');
    expect(cacheStore.load).toHaveBeenCalledWith('text', 'miss.txt');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(cacheStore.save).toHaveBeenCalledWith('text', 'miss.txt', 'fresh-source');
  });

  test('deletes corrupt cached source and retries via network', async () => {
    const factory = new MockTextFactory();
    const cacheStore = createCacheStoreMock({
      load: vi.fn(async (): Promise<string> => 'corrupt-source'),
    });
    const loader = new Loader({ basePath: '/', cache: cacheStore });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();
    factory.create.mockImplementationOnce(async (): Promise<string> => {
      throw new Error('corrupt-cache');
    });

    const result = await loader.load('corrupt.txt');

    expect(result).toBe('resource:fresh-source');
    expect(cacheStore.delete).toHaveBeenCalledWith('text', 'corrupt.txt');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(factory.create).toHaveBeenCalledTimes(2);
  });

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

  test('does not reinsert a resource when unload() is called during in-flight fetch', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });
    const deferredFetch = createDeferred<Response>();

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);

    global.fetch = vi.fn((_input: RequestInfo | URL): Promise<Response> => deferredFetch.promise);

    const loadPromise = loader.load('inflight.txt');

    loader.unload(TextAsset, 'inflight.txt');

    deferredFetch.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

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
        type: FirstType,
        kind: 'firstType',
        isValue: false,
        create: () => ({
          async load(request, ctx) {
            await ctx.fetchText(request.source);
            return new FirstType();
          },
        }),
      }),
      defineAsset<SecondType>({
        type: SecondType,
        kind: 'secondType',
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
      loader.load(new Asset({ kind: 'firstType', source: 'shared.asset' })),
      loader.load(new Asset({ kind: 'secondType', source: 'shared.asset' })),
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
    const asset = new Asset({ kind: 'mockAsset', source: 'test.dat' });

    const queue = loader.load(asset);
    let lastProgress = queue.progress;

    queue.onProgress.add(p => {
      lastProgress = p;
    });

    await expect(queue).rejects.toThrow('No constructor registered');
    // Progress must have settled — pending must be 0
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
      { type: MockAssetType, typeNames: ['mockAsset'] },
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

    const goodAsset = new Asset({ kind: 'mockAsset', source: 'good.dat' });
    const badAsset = new Asset({ kind: 'mockAsset', source: 'bad.dat' });

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
      { type: MockAssetType, typeNames: ['mockAsset'] },
      {
        load: async (request, ctx) => {
          await ctx.fetchText(request.source);
          return `loaded:${request.source}`;
        },
      },
    );
  }

  test('same Asset under two aliases shares a single network fetch', async () => {
    const loader = new Loader({ basePath: '/' });

    bindMockAsset(loader);
    mockFetch();

    const hero = new Asset({ kind: 'mockAsset', source: 'images/hero.dat' });

    await loader.load({ heroA: hero, heroB: hero });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(loader._peekResource(MockAssetType, 'heroA')).not.toBeNull();
    expect(loader._peekResource(MockAssetType, 'heroB')).not.toBeNull();
  });

  test('get() resolves both aliases after multi-alias load', async () => {
    const loader = new Loader({ basePath: '/' });

    bindMockAsset(loader);
    mockFetch();

    const hero = new Asset({ kind: 'mockAsset', source: 'images/hero.dat' });

    await loader.load({ heroA: hero, heroB: hero });

    expect(loader.get(MockAssetType, 'heroA')).toBe(loader.get(MockAssetType, 'heroB'));
  });

  test('unload(asset) removes asset loaded by source-as-alias (single Asset load)', async () => {
    const loader = new Loader({ basePath: '/' });

    bindMockAsset(loader);
    mockFetch();

    const hero = new Asset({ kind: 'mockAsset', source: 'images/hero.dat' });

    await loader.load(hero);

    expect(loader._peekResource(MockAssetType, 'images/hero.dat')).not.toBeNull();

    loader.unload(hero);

    expect(loader._peekResource(MockAssetType, 'images/hero.dat')).toBeNull();
  });

  test('unload(asset) removes all aliases after keyed-map load', async () => {
    const loader = new Loader({ basePath: '/' });

    bindMockAsset(loader);
    mockFetch();

    const hero = new Asset({ kind: 'mockAsset', source: 'images/hero.dat' });

    await loader.load({ heroA: hero, heroB: hero });

    expect(loader._peekResource(MockAssetType, 'heroA')).not.toBeNull();
    expect(loader._peekResource(MockAssetType, 'heroB')).not.toBeNull();

    loader.unload(hero);

    expect(loader._peekResource(MockAssetType, 'heroA')).toBeNull();
    expect(loader._peekResource(MockAssetType, 'heroB')).toBeNull();
  });

  test('unload(assets) releases every leaf claim, evicting the adopted resources', async () => {
    // Intent preserved: unloading a container drops all of its entries. Under
    // adoption this means releasing each leaf's root claim → last-claim eviction.
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
    const loader = createCoreLoader({ basePath: '/' });
    global.fetch = vi.fn(
      async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response,
    );

    const container = new Assets({
      hero: { kind: 'texture', source: 'hero.png' },
      logo: { kind: 'texture', source: 'logo.png' },
    });

    await loader.load(container);

    expect(loader._peekResource(Texture, 'hero.png')).not.toBeNull();
    expect(loader._peekResource(Texture, 'logo.png')).not.toBeNull();
    expect((container.hero as Texture).loadState).toBe('ready');

    loader.unload(container);

    // Last claim released → payload evicted; the leaves heal back to 'loading'.
    expect(loader._peekResource(Texture, 'hero.png')).toBeNull();
    expect(loader._peekResource(Texture, 'logo.png')).toBeNull();
    expect((container.hero as Texture).loadState).toBe('loading');

    vi.unstubAllGlobals();
  });

  test('aliases are cleared from tracking when underlying asset unloads', async () => {
    const loader = new Loader({ basePath: '/' });

    bindMockAsset(loader);
    mockFetch();

    const hero = new Asset({ kind: 'mockAsset', source: 'hero.dat' });

    await loader.load({ a: hero, b: hero, c: hero });

    loader.unload(hero);

    // Re-load under a single alias — should work cleanly after unload
    await loader.load({ a: hero });

    expect(loader._peekResource(MockAssetType, 'a')).not.toBeNull();
    expect(loader._peekResource(MockAssetType, 'b')).toBeNull();
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
        logo: { kind: 'texture', source: '/logo.png' },
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
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        load: async (_request, ctx) => {
          capturedKey = ctx.identityKey;
          return 'ok';
        },
      },
    );

    await loader.load(new Asset({ kind: 'richAsset', source: 'a.json', format: 'x' }));
    expect(capturedKey).toMatch(/^id:\d+:/);
  });

  test('context.fetchText fetches and returns text', async () => {
    mockFetchText('hello world');
    const loader = new Loader({ basePath: '/assets/' });

    loader.bindAsset<string>({ type: RichAsset, typeNames: ['richAsset'] }, { load: async (request, ctx) => ctx.fetchText(request.source) });

    const result = await loader.load(new Asset({ kind: 'richAsset', source: 'file.txt', format: 'txt' }));
    expect(result).toBe('hello world');
    expect(global.fetch).toHaveBeenCalledWith('/assets/file.txt', expect.anything());
  });

  test('context.fetchText caches: second call skips network', async () => {
    mockFetchText('cached content');
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>({ type: RichAsset, typeNames: ['richAsset'] }, { load: async (request, ctx) => ctx.fetchText(request.source) });

    // First load — populates in-memory result
    await loader.load(new Asset({ kind: 'richAsset', source: 'file.txt', format: 'txt' }));
    // Reset the mock so we can check if it was called during the second load
    (global.fetch as MockInstance).mockClear();
    // Second load — same asset, should be served from _resources (no new fetch call)
    await loader.load(new Asset({ kind: 'richAsset', source: 'file.txt', format: 'txt' }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('context.fetchJson fetches and parses JSON', async () => {
    mockFetchText('{"value":42}');
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>(
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        load: async (request, ctx) => {
          const data = await ctx.fetchJson<{ value: number }>(request.source);
          return String(data.value);
        },
      },
    );

    const result = await loader.load(new Asset({ kind: 'richAsset', source: 'data.json', format: 'json' }));
    expect(result).toBe('42');
  });

  test('context.fetchArrayBuffer fetches binary data', async () => {
    mockFetchText('binary');
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>(
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        load: async (request, ctx) => {
          const buf = await ctx.fetchArrayBuffer(request.source);
          return String(buf.byteLength);
        },
      },
    );

    const result = await loader.load(new Asset({ kind: 'richAsset', source: 'data.bin', format: 'bin' }));
    expect(Number(result)).toBeGreaterThan(0);
  });

  test('getIdentityKey separates assets with same source but different format', async () => {
    const loader = new Loader({ basePath: '/' });
    const loadOrder: string[] = [];

    loader.bindAsset<string, { format: string }>(
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        getIdentityKey: request => `${request.source}:${request.options?.format}`,
        load: async request => {
          loadOrder.push(request.options!.format);
          return `result:${request.options!.format}`;
        },
      },
    );

    const tmx = new Asset({ kind: 'richAsset', source: 'map.tmx', format: 'tmx' });
    const json = new Asset({ kind: 'richAsset', source: 'map.tmx', format: 'tiled-json' });

    const [resTmx, resJson] = await Promise.all([loader.load(tmx), loader.load(json)]);

    // Both variants loaded independently — no cross-contamination
    expect(resTmx).toBe('result:tmx');
    expect(resJson).toBe('result:tiled-json');
    expect(loadOrder).toContain('tmx');
    expect(loadOrder).toContain('tiled-json');
  });

  test('without getIdentityKey, same source deduplicates in-flight calls', async () => {
    let callCount = 0;
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>(
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        load: async request => {
          callCount++;
          return `ok:${request.source}`;
        },
      },
    );

    const a1 = new Asset({ kind: 'richAsset', source: 'shared.dat', format: 'x' });
    const a2 = new Asset({ kind: 'richAsset', source: 'shared.dat', format: 'x' });

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

  test('context.fetchText saves to __ctx_text store with source as key', async () => {
    mockFetch('hello');
    const { store, saves } = makeMockStore();
    const loader = new Loader({ basePath: '/', cache: store });

    loader.bindAsset<string>({ type: RichAsset, typeNames: ['richAsset'] }, { load: async (request, ctx) => ctx.fetchText(request.source) });

    await loader.load(new Asset({ kind: 'richAsset', source: 'file.txt', format: 'txt' }));

    expect(saves).toContainEqual({ storageName: '__ctx_text', key: 'file.txt' });
  });

  test('context.fetchJson saves to __ctx_json store with source as key', async () => {
    mockFetch('{"n":1}');
    const { store, saves } = makeMockStore();
    const loader = new Loader({ basePath: '/', cache: store });

    loader.bindAsset<string>(
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        load: async (request, ctx) => {
          const data = await ctx.fetchJson<{ n: number }>(request.source);
          return String(data.n);
        },
      },
    );

    await loader.load(new Asset({ kind: 'richAsset', source: 'data.json', format: 'json' }));

    expect(saves).toContainEqual({ storageName: '__ctx_json', key: 'data.json' });
  });

  test('context.fetchArrayBuffer saves to __ctx_binary store with source as key', async () => {
    mockFetch('bytes');
    const { store, saves } = makeMockStore();
    const loader = new Loader({ basePath: '/', cache: store });

    loader.bindAsset<string>(
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        load: async (request, ctx) => {
          const buf = await ctx.fetchArrayBuffer(request.source);
          return String(buf.byteLength);
        },
      },
    );

    await loader.load(new Asset({ kind: 'richAsset', source: 'data.bin', format: 'bin' }));

    expect(saves).toContainEqual({ storageName: '__ctx_binary', key: 'data.bin' });
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

    loader.bindAsset<string>({ type: RichAsset, typeNames: ['richAsset'] }, { load: async (request, ctx) => ctx.fetchText(request.source) });

    // First load — populates _resources; context.fetchText goes to network, store has no entry yet
    await loader.load(new Asset({ kind: 'richAsset', source: 'file.txt', format: 'txt' }));
    // Second load — served from _resources, handler not called, store not consulted
    (global.fetch as MockInstance).mockClear();
    await loader.load(new Asset({ kind: 'richAsset', source: 'file.txt', format: 'txt' }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('unload(asset) + getIdentityKey — identity discrimination (Fix 2 regression)', () => {
  class RichAsset {}

  test('unload(asset) removes only aliases for the matching getIdentityKey identity', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string, { format: string }>(
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        getIdentityKey: request => `${request.source}:${request.options?.format}`,
        load: async request => `result:${request.options!.format}`,
      },
    );

    const tmxMap = new Asset({ kind: 'richAsset', source: 'map.dat', format: 'tmx' });
    const rpgMap = new Asset({ kind: 'richAsset', source: 'map.dat', format: 'rpg-maker' });

    await loader.load({ tmxA: tmxMap, tmxB: tmxMap, rpgA: rpgMap });

    const ctor = loader['_assetTypeMap'].get('richAsset')!;

    expect(loader._peekResource(ctor, 'tmxA')).not.toBeNull();
    expect(loader._peekResource(ctor, 'tmxB')).not.toBeNull();
    expect(loader._peekResource(ctor, 'rpgA')).not.toBeNull();

    loader.unload(tmxMap);

    expect(loader._peekResource(ctor, 'tmxA')).toBeNull();
    expect(loader._peekResource(ctor, 'tmxB')).toBeNull();
    expect(loader._peekResource(ctor, 'rpgA')).not.toBeNull(); // unaffected — different identity
  });

  test('unload(asset) without getIdentityKey still removes all source-based aliases', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>({ type: RichAsset, typeNames: ['richAsset'] }, { load: async request => `result:${request.source}` });

    const asset = new Asset({ kind: 'richAsset', source: 'shared.dat', format: 'x' });

    await loader.load({ a: asset, b: asset });

    const ctor = loader['_assetTypeMap'].get('richAsset')!;

    expect(loader._peekResource(ctor, 'a')).not.toBeNull();
    expect(loader._peekResource(ctor, 'b')).not.toBeNull();

    loader.unload(asset);

    expect(loader._peekResource(ctor, 'a')).toBeNull();
    expect(loader._peekResource(ctor, 'b')).toBeNull();
  });

  test('unload(asset) with getIdentityKey does not affect a different format identity', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string, { format: string }>(
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        getIdentityKey: request => `${request.source}:${request.options?.format}`,
        load: async request => `result:${request.options!.format}`,
      },
    );

    const tmxMap = new Asset({ kind: 'richAsset', source: 'map.dat', format: 'tmx' });
    const rpgMap = new Asset({ kind: 'richAsset', source: 'map.dat', format: 'rpg-maker' });

    await loader.load({ tmxA: tmxMap, rpgA: rpgMap });

    const ctor = loader['_assetTypeMap'].get('richAsset')!;

    loader.unload(rpgMap);

    expect(loader._peekResource(ctor, 'tmxA')).not.toBeNull(); // untouched
    expect(loader._peekResource(ctor, 'rpgA')).toBeNull();
  });
});

describe('loadAll() early exit', () => {
  test('resolves immediately when nothing is queued', async () => {
    const loader = new Loader({ basePath: '/' });
    const fetchSpy = vi.fn();

    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(loader.loadAll()).resolves.toBeUndefined();
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
    loader.load(Assets.from({ a: 'a.png', b: 'b.png', c: 'c.png' }), { background: true });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — keyFor()
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
        type: DummyAsset,
        kind: 'dummyAsset',
        isValue: false,
        create: () => ({
          async load(request, ctx) {
            return new DummyAsset(await ctx.fetchText(request.source));
          },
        }),
      }),
    ]);
    mockFetch();

    const result = await loader.load(new Asset({ kind: 'dummyAsset', source: 'thing.dat' }));

    expect(loader.keyFor(result)).toEqual({ type: DummyAsset, source: 'thing.dat' });
  });

  test('returns null for a resource object that was never loaded', () => {
    const loader = new Loader({ basePath: '/' });

    expect(loader.keyFor({})).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — unload() edge cases: unregistered type, never-loaded fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('unload() edge cases', () => {
  test('unload(asset) is a no-op when the asset type was never registered', () => {
    const loader = new Loader({ basePath: '/' });
    const orphan = new Asset({ kind: 'mockAsset', source: 'x.dat' });

    expect(() => loader.unload(orphan)).not.toThrow();
  });

  test('unload(asset) falls back to source-as-alias when the asset was never loaded', () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>({ type: MockAssetType, typeNames: ['mockAsset'] }, { load: async request => `loaded:${request.source}` });

    const neverLoaded = new Asset({ kind: 'mockAsset', source: 'never.dat' });

    expect(() => loader.unload(neverLoaded)).not.toThrow();
    expect(loader._peekResource(MockAssetType, 'never.dat')).toBeNull();
  });

  test('unload(assets) is a silent no-op for a leaf whose kind this loader never bound', () => {
    // Intent preserved: a catalog entry the loader doesn't know is skipped, not
    // thrown. A bare loader (no core bindings) never adopted the leaf, so its
    // release finds no registered key and does nothing.
    const loader = new Loader({ basePath: '/' });
    const container = new Assets({ orphan: { kind: 'texture', source: 'x.png' } });

    expect(() => loader.unload(container)).not.toThrow();
  });

  test('unload(assets) is a silent no-op when the container was never adopted/loaded', () => {
    // Intent preserved: unloading entries that were never tracked does nothing.
    const loader = createCoreLoader({ basePath: '/' });
    const container = new Assets({ orphan: { kind: 'texture', source: 'never.png' } });

    expect(() => loader.unload(container)).not.toThrow();
    expect(loader._peekResource(Texture, 'never.png')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — basePath / fetchOptions property accessors
// ─────────────────────────────────────────────────────────────────────────────

describe('basePath / fetchOptions property accessors', () => {
  test('basePath getter/setter takes effect on subsequent loads', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/a/' });

    expect(loader.basePath).toBe('/a/');

    loader.basePath = '/b/';
    expect(loader.basePath).toBe('/b/');

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load('demo.txt');

    expect(global.fetch).toHaveBeenCalledWith('/b/demo.txt', expect.anything());
  });

  test('fetchOptions getter/setter takes effect on subsequent loads', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/', fetchOptions: { mode: 'cors' } });

    expect(loader.fetchOptions).toEqual({ mode: 'cors' });

    loader.fetchOptions = { mode: 'no-cors' };
    expect(loader.fetchOptions).toEqual({ mode: 'no-cors' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load('demo.txt');

    expect(global.fetch).toHaveBeenCalledWith('/demo.txt', { mode: 'no-cors' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — _resolveUrl absolute-URL passthrough
// ─────────────────────────────────────────────────────────────────────────────

describe('absolute URL passthrough', () => {
  test('an absolute https:// path bypasses basePath prefixing', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/assets/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load('https://cdn.example.com/x.txt');

    expect(global.fetch).toHaveBeenCalledWith('https://cdn.example.com/x.txt', expect.anything());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — hasLoadable() / hasAssetType() / hasExtension()
// ─────────────────────────────────────────────────────────────────────────────

describe('hasLoadable() / hasAssetType() / hasExtension()', () => {
  test('reflect factory, type-name, and extension registrations', () => {
    class ProbeAsset {}
    const loader = new Loader({ basePath: '/' });

    expect(loader.hasLoadable(ProbeAsset)).toBe(false);
    loader.register(ProbeAsset, new DummyFactory() as unknown as AssetFactory<ProbeAsset>);
    expect(loader.hasLoadable(ProbeAsset)).toBe(true);

    expect(loader.hasAssetType('probeType')).toBe(false);
    expect(loader.hasExtension('probe')).toBe(false);
    loader.bindAsset<ProbeAsset>({ type: ProbeAsset, typeNames: ['probeType'], extensions: ['PROBE'] }, { load: async () => new ProbeAsset() });
    expect(loader.hasAssetType('probeType')).toBe(true);
    expect(loader.hasExtension('probe')).toBe(true);
    expect(loader.hasExtension('.probe')).toBe(true);
  });

  test('hasLoadable() is true for a bindAsset() handler registration', () => {
    const loader = new Loader({ basePath: '/' });
    class HandlerAsset {}

    expect(loader.hasLoadable(HandlerAsset)).toBe(false);
    loader.bindAsset<string>({ type: HandlerAsset, typeNames: ['handlerType'] }, { load: async () => 'ok' });
    const ctor = loader['_assetTypeMap'].get('handlerType')!;

    expect(loader.hasLoadable(ctor)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — bindAsset() direct handler binding
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
        type: BoundAsset,
        kind: 'boundAsset',
        isValue: false,
        create: () => ({ load: async request => new BoundAsset(request.source) }),
      }),
    ]);

    const result = (await loader.load(new Asset({ kind: 'boundAsset', source: 'thing.bin' }))) as BoundAsset;

    expect(result).toBeInstanceOf(BoundAsset);
    expect(result.value).toBe('thing.bin');
  });

  test('extra config fields are forwarded as an options object into the handler request', async () => {
    const loader = new Loader({ basePath: '/' });
    let receivedConfig: unknown;

    materializeAssetBindings(loader, [
      defineAsset<BoundAsset, { scale: number }>({
        type: BoundAsset,
        kind: 'boundAsset',
        isValue: false,
        create: () => ({
          load: async request => {
            receivedConfig = request;
            return new BoundAsset(request.source);
          },
        }),
      }),
    ]);

    await loader.load(new Asset({ kind: 'boundAsset', source: 'thing.bin', scale: 3 }));

    expect(receivedConfig).toMatchObject({ source: 'thing.bin', options: { scale: 3 } });
  });

  test('binds by typeName: config-map load resolves via the handler', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<BoundAsset>({ type: BoundAsset, typeNames: ['boundAsset'] }, { load: async request => new BoundAsset(request.source) });

    const result = await loader.load(new Asset({ kind: 'boundAsset', source: 'level.dat' }));

    expect(result).toBeInstanceOf(BoundAsset);
  });

  test('binds by extension: load(path) resolves via the handler', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<BoundAsset>({ type: BoundAsset, extensions: ['bnd'] }, { load: async request => new BoundAsset(request.source) });

    const result = await loader.load<BoundAsset>('thing.bnd');

    expect(result).toBeInstanceOf(BoundAsset);
  });

  test('getIdentityKey is forwarded and deduplicates in-flight loads', async () => {
    const loader = new Loader({ basePath: '/' });
    let calls = 0;

    loader.bindAsset<BoundAsset, { scale: number }>(
      { type: BoundAsset, typeNames: ['boundAsset'] },
      {
        getIdentityKey: request => `${request.source}:${request.options?.scale ?? 1}`,
        load: async request => {
          calls++;
          return new BoundAsset(request.source);
        },
      },
    );

    const a = new Asset({ kind: 'boundAsset', source: 'shared.dat', scale: 2 });
    const b = new Asset({ kind: 'boundAsset', source: 'shared.dat', scale: 2 });

    await Promise.all([loader.load(a), loader.load(b)]);

    expect(calls).toBe(1);
  });

  test('createFromBytes is forwarded and powers loadContainer() for the bound type', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<BoundAsset>(
      { type: BoundAsset, typeNames: ['boundAsset'] },
      {
        load: async request => new BoundAsset(request.source),
        createFromBytes: async bytes => new BoundAsset(new TextDecoder().decode(bytes)),
      },
    );

    const container = encodeContainer([{ alias: 'x', type: 'boundAsset', bytes: new TextEncoder().encode('hi') }]);

    global.fetch = vi.fn(
      async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => container }) as unknown as Response,
    );

    await loader.loadContainer('pack.exoa');

    expect((loader.get(BoundAsset, 'x') as BoundAsset).value).toBe('hi');
  });

  test('throws on a duplicate extension within the same bindAsset() call', () => {
    const loader = new Loader({ basePath: '/' });
    const handler: AssetHandler<BoundAsset> = { load: async request => new BoundAsset(request.source) };

    expect(() => loader.bindAsset<BoundAsset>({ type: BoundAsset, extensions: ['bnd', 'BND'] }, handler)).toThrow(/Duplicate extension key/);
  });

  test('throws when a handler is already registered for the type', () => {
    const loader = new Loader({ basePath: '/' });
    const handler: AssetHandler<BoundAsset> = { load: async request => new BoundAsset(request.source) };

    loader.bindAsset<BoundAsset>({ type: BoundAsset }, handler);

    expect(() => loader.bindAsset<BoundAsset>({ type: BoundAsset }, handler)).toThrow(/already registered/);
  });

  test('throws when a typeName is already registered', () => {
    const loader = new Loader({ basePath: '/' });
    const handlerA: AssetHandler<BoundAsset> = { load: async request => new BoundAsset(request.source) };
    const handlerB: AssetHandler<OtherBoundAsset> = { load: async () => new OtherBoundAsset() };

    loader.bindAsset<BoundAsset>({ type: BoundAsset, typeNames: ['dupName'] }, handlerA);

    expect(() => loader.bindAsset<OtherBoundAsset>({ type: OtherBoundAsset, typeNames: ['dupName'] }, handlerB)).toThrow(/already registered/);
  });

  test('throws when an extension is already mapped to another type', () => {
    const loader = new Loader({ basePath: '/' });
    const handlerA: AssetHandler<BoundAsset> = { load: async request => new BoundAsset(request.source) };
    const handlerB: AssetHandler<OtherBoundAsset> = { load: async () => new OtherBoundAsset() };

    loader.bindAsset<BoundAsset>({ type: BoundAsset, extensions: ['dupext'] }, handlerA);

    expect(() => loader.bindAsset<OtherBoundAsset>({ type: OtherBoundAsset, extensions: ['dupext'] }, handlerB)).toThrow(/already mapped/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — Loader.loadContainer() (exercised from within loader.test.ts's
// own coverage scope; a broader format/roundtrip suite lives in
// test/resources/asset-container.test.ts)
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
      { alias: 'level', type: 'json', bytes: new TextEncoder().encode('{"score":42}') },
      { alias: 'readme', type: 'text', bytes: new TextEncoder().encode('hello world') },
      { alias: 'blob', type: 'binary', bytes: new Uint8Array([1, 2, 3, 4]) },
    ]);
    mockContainerFetch(container);

    const loader = createCoreLoaderLocal();
    await loader.loadContainer('assets/pack.exoa');

    expect(loader.get(Json.of('level')).value).toEqual({ score: 42 });
    expect(loader.get(TextAsset.of('readme')).value).toBe('hello world');
    expect(new Uint8Array(loader.get(BinaryAsset.of('blob')).value)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test('throws on an unknown asset type and stores nothing', async () => {
    const container = encodeContainer([{ alias: 'x', type: 'nonsense', bytes: new TextEncoder().encode('x') }]);
    mockContainerFetch(container);

    const loader = createCoreLoaderLocal();

    await expect(loader.loadContainer('x.exoa')).rejects.toThrow(/unknown asset type "nonsense"/);
  });

  test('uses a register()-based factory when the bound handler has no createFromBytes', async () => {
    const factory = new DummyFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(DummyAsset, factory);
    // A handler binds the 'dummy' type name but supplies no createFromBytes, so
    // container injection falls back to the registered factory.
    loader.bindAsset<DummyAsset>({ type: DummyAsset, typeNames: ['dummy'] }, { load: async request => new DummyAsset(request.source) });

    const container = encodeContainer([{ alias: 'x', type: 'dummy', bytes: new TextEncoder().encode('raw-bytes') }]);
    mockContainerFetch(container);

    await loader.loadContainer('pack.exoa');

    expect(loader.get(DummyAsset, 'x')).toBeInstanceOf(DummyAsset);
  });

  test('rejects when the resolved type supports neither createFromBytes nor a registered factory', async () => {
    class BareAsset {}
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<BareAsset>({ type: BareAsset, typeNames: ['bare'] }, { load: async () => new BareAsset() });

    const container = encodeContainer([{ alias: 'x', type: 'bare', bytes: new Uint8Array([1]) }]);
    mockContainerFetch(container);

    await expect(loader.loadContainer('pack.exoa')).rejects.toThrow(/cannot be built from container bytes/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — destroy()
// ─────────────────────────────────────────────────────────────────────────────

describe('destroy()', () => {
  test('destroys cache stores, calls destroy() on bound handlers, and clears signals', () => {
    class DestroyAsset {}
    const store = createCacheStoreMock();
    const handlerDestroy = vi.fn();
    const loader = new Loader({ basePath: '/', cache: store });

    loader.bindAsset<unknown>({ type: DestroyAsset }, { load: async () => 'x', destroy: handlerDestroy });
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

    loader.bindAsset({ type: DestroyAssetA }, handler);
    loader.bindAsset({ type: DestroyAssetB }, handler);

    loader.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test('does not throw when a bound handler has no destroy() method', () => {
    class NoDestroyAsset {}
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset({ type: NoDestroyAsset }, { load: async () => 'x' });

    expect(() => loader.destroy()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — _fetchWithHandler error wrapping
// ─────────────────────────────────────────────────────────────────────────────

describe('handler load() rejection is wrapped with url + cause', () => {
  class RichAsset {}

  test('wraps a thrown Error from a bindAsset() handler', async () => {
    const loader = new Loader({ basePath: '/assets/' });

    loader.bindAsset<string>(
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        load: async () => {
          throw new Error('handler exploded');
        },
      },
    );

    const asset = new Asset({ kind: 'richAsset', source: 'x.json', format: 'x' });
    const error: Error = await loader.load(asset).catch((e: unknown) => e as Error);

    expect(error.message).toMatch(/Failed to load "x\.json" from "\/assets\/x\.json": handler exploded/);
    expect(error.cause).toBeInstanceOf(Error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — Asset config: extra config fields surface as handler options
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
        type: MockAssetType,
        kind: 'mockAsset',
        isValue: false,
        create: () => ({
          async load(request) {
            receivedOptions.push(request.options);
            return `loaded:${request.source}`;
          },
        }),
      }),
    ]);

    await loader.load(new Asset({ kind: 'mockAsset', source: 'extra.dat', format: 'tiled' }));

    expect(receivedOptions[0]).toMatchObject({ format: 'tiled' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — remaining small branch gaps
// ─────────────────────────────────────────────────────────────────────────────

describe('Loader constructor — cache option as an array of stores', () => {
  test('accepts an array of CacheStore instances', async () => {
    const factory = new MockTextFactory();
    const storeA = createCacheStoreMock();
    const storeB = createCacheStoreMock();
    const loader = new Loader({ basePath: '/', cache: [storeA, storeB] });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load('demo.txt');

    expect(storeA.load).toHaveBeenCalledWith('text', 'demo.txt');
    expect(storeB.load).toHaveBeenCalledWith('text', 'demo.txt');
  });
});

describe('unload()-during-in-flight identity cleanup on rejection', () => {
  class RichAsset {}

  test('does not throw when the identity tracking was already cleared before the fetch rejects', async () => {
    const loader = new Loader({ basePath: '/' });
    const deferred = createDeferred<unknown>();

    loader.bindAsset<unknown>({ type: RichAsset, typeNames: ['richAsset'] }, { load: async () => deferred.promise });

    const asset = new Asset({ kind: 'richAsset', source: 'x.dat', format: 'x' });
    const pending = loader.load(asset);

    // Unload while still in flight: this clears `_identityKeyToAliases` for this
    // identity synchronously, before the underlying load settles.
    loader.unload(asset);

    deferred.reject(new Error('boom'));

    await expect(pending).rejects.toThrow('boom');
  });
});

describe('unloadAll() with no type argument', () => {
  test('clears every loaded type', async () => {
    const textFactory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, textFactory as AssetFactory<TextAsset>);
    materializeAssetBindings(loader, [
      defineAsset<DummyAsset>({
        type: DummyAsset,
        kind: 'dummyAsset',
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
    await loader.load(new Asset({ kind: 'dummyAsset', source: 'b.dat' }));

    expect(loader._peekResource(TextAsset, 'a.txt')).not.toBeNull();
    expect(loader._peekResource(DummyAsset, 'b.dat')).not.toBeNull();

    loader.unloadAll();

    expect(loader._peekResource(TextAsset, 'a.txt')).toBeNull();
    expect(loader._peekResource(DummyAsset, 'b.dat')).toBeNull();
  });
});

describe('load({ alias: config }) — plain object values are auto-wrapped in an Asset', () => {
  test('a plain (non-Asset) config object value loads correctly', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<string>({ type: MockAssetType, typeNames: ['mockAsset'] }, { load: async request => `loaded:${request.source}` });

    await loader.load({ hero: { kind: 'mockAsset', source: 'hero.dat' } });

    expect(loader._peekResource(MockAssetType, 'hero')).not.toBeNull();
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
      { type: RichAsset, typeNames: ['richAsset'] },
      {
        load: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'plain string failure';
        },
      },
    );

    const asset = new Asset({ kind: 'richAsset', source: 'y.json', format: 'y' });

    await expect(loader.load(asset)).rejects.toThrow(/Failed to load "y\.json" from "\/assets\/y\.json": plain string failure/);
  });

  test('_fetch wraps a thrown non-Error value from a factory', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);
    factory.create.mockImplementationOnce(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'raw string boom';
    });

    await expect(loader.load('boom.txt')).rejects.toThrow(/raw string boom/);
  });
});
