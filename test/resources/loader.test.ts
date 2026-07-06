import type { AssetHandler } from '#extensions/Extension';
import { materializeAssetBindings } from '#extensions/materialize';
import { Asset } from '#resources/Asset';
import { encodeContainer } from '#resources/AssetContainer';
import type { AssetFactory } from '#resources/AssetFactory';
import { BundleLoadError, defineAssetManifest } from '#resources/AssetManifest';
import { Assets } from '#resources/Assets';
import type { CacheStore } from '#resources/CacheStore';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import { BinaryAsset, FontAsset, Json, TextAsset } from '#resources/tokens';

/** Create a Loader with all core asset bindings pre-installed. */
function createCoreLoader(options?: ConstructorParameters<typeof Loader>[0]): Loader {
  const loader = new Loader(options);
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

// Declaration merges for test-only asset types
declare module '#resources/AssetDefinitions' {
  interface AssetDefinitions {
    mockAsset: { resource: string; config: { source: string } };
    richAsset: { resource: string; config: { source: string; format: string } };
    boundAsset: { resource: unknown; config: { source: string; scale?: number } };
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

class InstanceFactory<T> implements AssetFactory<T> {
  public readonly storageName = 'instance';
  public readonly process = vi.fn(async (_response: Response): Promise<string> => 'raw');
  public readonly create: (source: string) => Promise<T>;

  public constructor(resource: T) {
    this.create = vi.fn(async (_source: string): Promise<T> => resource);
  }

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

    const result = await loader.load(TextAsset, 'demo.txt');

    expect(result).toBe('resource:fresh-source');
  });

  test('basePath prefixes relative fetch URLs', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/assets/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();
    await loader.load(TextAsset, 'demo.txt');

    expect(global.fetch).toHaveBeenCalledWith('/assets/demo.txt', expect.anything());
  });

  test('fetchOptions are forwarded to fetch calls', async () => {
    const factory = new MockTextFactory();
    const fetchOptions: RequestInit = { credentials: 'include', mode: 'same-origin' };
    const loader = new Loader({ basePath: '/', fetchOptions });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();
    await loader.load(TextAsset, 'demo.txt');

    expect(global.fetch).toHaveBeenCalledWith('/demo.txt', fetchOptions);
  });

  test('load(Type, [paths]) returns an array of resources', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    const results = await loader.load(TextAsset, ['a.txt', 'b.txt']);

    expect(results).toHaveLength(2);
    expect(results[0]).toBe('resource:fresh-source');
    expect(results[1]).toBe('resource:fresh-source');
  });

  test('load(Type, { alias: path }) returns a record', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    const result = await loader.load(TextAsset, { greeting: 'hello.txt', farewell: 'bye.txt' });

    expect(result.greeting).toBe('resource:fresh-source');
    expect(result.farewell).toBe('resource:fresh-source');
  });

  test('load() deduplicates concurrent requests for the same alias', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    const [a, b] = await Promise.all([loader.load(TextAsset, 'same.txt'), loader.load(TextAsset, 'same.txt')]);

    expect(a).toBe(b);
    expect(factory.process).toHaveBeenCalledTimes(1);
  });

  test('throws on non-ok HTTP response', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch404();

    await expect(loader.load(TextAsset, 'missing.txt')).rejects.toThrow('404 Not Found');
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

    const good = loader.load(TextAsset, 'good.txt');
    const bad = loader.load(TextAsset, 'bad.txt');

    await expect(good).resolves.toBe('ok');
    await expect(bad).rejects.toThrow('broken');
  });

  test('get() retrieves loaded resource, peek() returns null for missing', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    expect(loader.peek(TextAsset, 'demo.txt')).toBeNull();
    expect(loader.has(TextAsset, 'demo.txt')).toBe(false);

    await loader.load(TextAsset, 'demo.txt');

    expect(loader.has(TextAsset, 'demo.txt')).toBe(true);
    expect(loader.get(TextAsset, 'demo.txt')).toBe('resource:fresh-source');
  });

  test('get() throws for missing resource', () => {
    const loader = new Loader({ basePath: '/' });

    expect(() => loader.get(TextAsset, 'nope')).toThrow('Missing resource');
  });

  test('add() registers aliases, load() resolves them', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    loader.add(TextAsset, { greeting: 'hello.txt' });
    const result = await loader.load(TextAsset, 'greeting');

    expect(result).toBe('resource:fresh-source');
    expect(global.fetch).toHaveBeenCalledWith('/hello.txt', expect.anything());
  });

  test('unload() removes a resource, unloadAll() clears type', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    await loader.load(TextAsset, { a: 'a.txt', b: 'b.txt' });

    expect(loader.has(TextAsset, 'a')).toBe(true);
    loader.unload(TextAsset, 'a');
    expect(loader.has(TextAsset, 'a')).toBe(false);
    expect(loader.has(TextAsset, 'b')).toBe(true);

    loader.unloadAll(TextAsset);
    expect(loader.has(TextAsset, 'b')).toBe(false);
  });

  test('custom factory via register() with user-defined class', async () => {
    const factory = new DummyFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(DummyAsset, factory);
    mockFetch();

    const result = await loader.load(DummyAsset, 'thing.dat');

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

    const result = await loader.load(TextAsset, 'cached.txt');

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

    const result = await loader.load(TextAsset, 'miss.txt');

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

    const result = await loader.load(TextAsset, 'corrupt.txt');

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

    const result = await loader.load(Json, 'data.json');

    expect(result).toBe(42);
  });

  test('backgroundLoad() + load() priority boost', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/', concurrency: 1 });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);

    let fetchCount = 0;
    global.fetch = vi.fn(async (): Promise<Response> => {
      fetchCount++;
      return { ok: true, status: 200, statusText: 'OK' } as Response;
    });

    loader.add(TextAsset, { a: 'a.txt', b: 'b.txt', c: 'c.txt' });
    loader.backgroundLoad();

    // Priority boost: load 'c' should resolve even though it was last in queue
    const cResult = await loader.load(TextAsset, 'c');

    expect(cResult).toBe('resource:fresh-source');
  });

  test('background load dispatches onLoaded exactly once per successful resource', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });
    const onLoaded = vi.fn();

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.onLoaded.add(onLoaded);
    loader.add(TextAsset, { queued: 'queued.txt' });
    mockFetch();

    await loader.loadAll();

    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledWith(TextAsset, 'queued', 'resource:fresh-source');
  });

  test('boosted background items keep loadAll pending and report full progress', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/', concurrency: 1 });
    const firstFetch = createDeferred<Response>();
    const boostedFetch = createDeferred<Response>();
    const progress: Array<[number, number]> = [];

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.add(TextAsset, { first: 'first.txt', boosted: 'boosted.txt' });
    loader.onProgress.add((loaded, total) => {
      progress.push([loaded, total]);
    });

    global.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/first.txt')) {
        return firstFetch.promise;
      }

      if (url.endsWith('/boosted.txt')) {
        return boostedFetch.promise;
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const loadAllPromise = loader.loadAll();
    let loadAllResolved = false;

    loadAllPromise.then(() => {
      loadAllResolved = true;
    });

    const boostedPromise = loader.load(TextAsset, 'boosted');

    firstFetch.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    await loader.load(TextAsset, 'first');
    await Promise.resolve();

    expect(loadAllResolved).toBe(false);

    boostedFetch.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    await expect(boostedPromise).resolves.toBe('resource:fresh-source');
    await expect(loadAllPromise).resolves.toBeUndefined();

    expect(progress).toContainEqual([1, 2]);
    expect(progress[progress.length - 1]).toEqual([2, 2]);
  });

  test('does not reinsert a resource when unload() is called during in-flight fetch', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });
    const deferredFetch = createDeferred<Response>();

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);

    global.fetch = vi.fn((_input: RequestInfo | URL): Promise<Response> => deferredFetch.promise);

    const loadPromise = loader.load(TextAsset, 'inflight.txt');

    loader.unload(TextAsset, 'inflight.txt');

    deferredFetch.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    await expect(loadPromise).resolves.toBe('resource:fresh-source');
    expect(loader.has(TextAsset, 'inflight.txt')).toBe(false);
    expect(loader.peek(TextAsset, 'inflight.txt')).toBeNull();
  });

  test('uses per-type internal keys instead of constructor names', async () => {
    class FirstType {}
    class SecondType {}

    Object.defineProperty(FirstType, 'name', { value: 'MinifiedType' });
    Object.defineProperty(SecondType, 'name', { value: 'MinifiedType' });

    const firstFactory = new InstanceFactory(new FirstType());
    const secondFactory = new InstanceFactory(new SecondType());
    const loader = new Loader({ basePath: '/' });

    loader.register(FirstType, firstFactory as AssetFactory<FirstType>);
    loader.register(SecondType, secondFactory as AssetFactory<SecondType>);

    mockFetch();

    const [first, second] = await Promise.all([loader.load(FirstType, 'shared.asset'), loader.load(SecondType, 'shared.asset')]);

    expect(first).toBeInstanceOf(FirstType);
    expect(second).toBeInstanceOf(SecondType);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('registerManifest() registers one manifest without loading', () => {
    const loader = new Loader({ basePath: '/' });
    const manifest = defineAssetManifest({
      bundles: {
        boot: [{ type: TextAsset, alias: 'intro', path: 'intro.txt' }],
      },
    });

    loader.registerManifest(manifest);

    expect(loader.hasBundle('boot')).toBe(false);
    expect(loader.peek(TextAsset, 'intro')).toBeNull();
  });

  test('registerManifest() throws when bundle name is already registered', () => {
    const loader = new Loader({ basePath: '/' });
    const firstManifest = defineAssetManifest({
      bundles: {
        boot: [{ type: TextAsset, alias: 'intro', path: 'intro.txt' }],
      },
    });
    const secondManifest = defineAssetManifest({
      bundles: {
        boot: [{ type: TextAsset, alias: 'menu', path: 'menu.txt' }],
      },
    });

    loader.registerManifest(firstManifest);

    expect(() => loader.registerManifest(secondManifest)).toThrow('already registered');
  });

  test('registerManifest() throws on conflicting (type, alias) across bundles', () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [{ type: TextAsset, alias: 'shared', path: 'shared-a.txt' }],
        },
      }),
    );

    expect(() =>
      loader.registerManifest(
        defineAssetManifest({
          bundles: {
            gameplay: [{ type: TextAsset, alias: 'shared', path: 'shared-b.txt' }],
          },
        }),
      ),
    ).toThrow('Conflicting asset definition');
  });

  test('registerManifest() allows equivalent (type, alias) definitions across bundles', () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [
            {
              type: TextAsset,
              alias: 'shared',
              path: 'shared.txt',
              options: { locale: 'en', retries: [1, 2, 3] },
            },
          ],
        },
      }),
    );

    expect(() =>
      loader.registerManifest(
        defineAssetManifest({
          bundles: {
            gameplay: [
              {
                type: TextAsset,
                alias: 'shared',
                path: 'shared.txt',
                options: { locale: 'en', retries: [1, 2, 3] },
              },
            ],
          },
        }),
      ),
    ).not.toThrow();
  });

  test('registerManifest() throws on conflict with prior manual add()', () => {
    const loader = new Loader({ basePath: '/' });

    loader.add(TextAsset, { hero: 'hero-v1.txt' });

    expect(() =>
      loader.registerManifest(
        defineAssetManifest({
          bundles: {
            boot: [{ type: TextAsset, alias: 'hero', path: 'hero-v2.txt' }],
          },
        }),
      ),
    ).toThrow('Conflicting asset definition');
  });

  test('loadBundle() loads a known bundle successfully', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [
            { type: TextAsset, alias: 'hero', path: 'hero.txt' },
            { type: TextAsset, alias: 'menu', path: 'menu.txt' },
          ],
        },
      }),
    );
    mockFetch();

    await expect(loader.loadBundle('boot')).resolves.toBeUndefined();
    expect(loader.get(TextAsset, 'hero')).toBe('resource:fresh-source');
    expect(loader.get(TextAsset, 'menu')).toBe('resource:fresh-source');
  });

  test('loadBundle() rejects clearly for unknown bundle name', async () => {
    const loader = new Loader({ basePath: '/' });

    await expect(loader.loadBundle('missing')).rejects.toThrow('Unknown bundle');
  });

  test('repeated loadBundle() calls are safe and do not refetch cached assets', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [{ type: TextAsset, alias: 'hero', path: 'hero.txt' }],
        },
      }),
    );
    mockFetch();

    await loader.loadBundle('boot');
    await loader.loadBundle('boot');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('overlapping bundle loads deduplicate shared assets', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [{ type: TextAsset, alias: 'shared', path: 'shared.txt' }],
          gameplay: [
            { type: TextAsset, alias: 'shared', path: 'shared.txt' },
            { type: TextAsset, alias: 'level', path: 'level.txt' },
          ],
        },
      }),
    );
    mockFetch();

    await Promise.all([loader.loadBundle('boot'), loader.loadBundle('gameplay')]);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('loadBundle() rejects with BundleLoadError on partial failure', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [
            { type: TextAsset, alias: 'ok', path: 'ok.txt' },
            { type: TextAsset, alias: 'missing', path: 'missing.txt' },
          ],
        },
      }),
    );

    global.fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/missing.txt')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response;
    });

    let thrown: unknown;

    try {
      await loader.loadBundle('boot');
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BundleLoadError);

    const bundleError = thrown as BundleLoadError;

    expect(bundleError.bundle).toBe('boot');
    expect(bundleError.failures).toHaveLength(1);
    expect(bundleError.failures[0].alias).toBe('missing');
    expect(bundleError.failures[0].type).toBe(TextAsset);
    expect(bundleError.failures[0].error).toBeInstanceOf(Error);
  });

  test('successful assets remain cached after partial bundle failure', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [
            { type: TextAsset, alias: 'ok', path: 'ok.txt' },
            { type: TextAsset, alias: 'missing', path: 'missing.txt' },
          ],
        },
      }),
    );

    global.fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/missing.txt')) {
        return {
          ok: false,
          status: 500,
          statusText: 'Server Error',
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response;
    });

    await expect(loader.loadBundle('boot')).rejects.toBeInstanceOf(BundleLoadError);
    expect(loader.has(TextAsset, 'ok')).toBe(true);
    expect(loader.has(TextAsset, 'missing')).toBe(false);
  });

  test('bundle progress callback and signal report expected totals and final completion', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });
    const callbackProgress: Array<[number, number]> = [];
    const signalProgress: Array<[string, number, number]> = [];

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [
            { type: TextAsset, alias: 'cached', path: 'cached.txt' },
            { type: TextAsset, alias: 'fresh', path: 'fresh.txt' },
          ],
        },
      }),
    );
    loader.onBundleProgress.add((name, loaded, total) => {
      signalProgress.push([name, loaded, total]);
    });
    mockFetch();

    await loader.load(TextAsset, { cached: 'cached.txt' });
    await loader.loadBundle('boot', {
      onProgress: (loaded, total) => {
        callbackProgress.push([loaded, total]);
      },
    });

    expect(callbackProgress).toContainEqual([1, 2]);
    expect(callbackProgress[callbackProgress.length - 1]).toEqual([2, 2]);
    expect(signalProgress).toContainEqual(['boot', 1, 2]);
    expect(signalProgress[signalProgress.length - 1]).toEqual(['boot', 2, 2]);
  });

  test('background bundle load works', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/', concurrency: 1 });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [
            { type: TextAsset, alias: 'a', path: 'a.txt' },
            { type: TextAsset, alias: 'b', path: 'b.txt' },
          ],
        },
      }),
    );
    mockFetch();

    await expect(loader.loadBundle('boot', { background: true })).resolves.toBeUndefined();
    expect(loader.has(TextAsset, 'a')).toBe(true);
    expect(loader.has(TextAsset, 'b')).toBe(true);
  });

  test('foreground load after background bundle queue uses normal priority boost behavior', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/', concurrency: 1 });
    const firstFetch = createDeferred<Response>();
    const boostedFetch = createDeferred<Response>();

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [
            { type: TextAsset, alias: 'first', path: 'first.txt' },
            { type: TextAsset, alias: 'boosted', path: 'boosted.txt' },
          ],
        },
      }),
    );

    global.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/first.txt')) {
        return firstFetch.promise;
      }

      if (url.endsWith('/boosted.txt')) {
        return boostedFetch.promise;
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const bundlePromise = loader.loadBundle('boot', { background: true });
    let bundleResolved = false;

    bundlePromise.then(() => {
      bundleResolved = true;
    });

    const boostedPromise = loader.load(TextAsset, 'boosted');

    boostedFetch.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    await expect(boostedPromise).resolves.toBe('resource:fresh-source');
    await Promise.resolve();
    expect(bundleResolved).toBe(false);

    firstFetch.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    await expect(bundlePromise).resolves.toBeUndefined();
  });

  test('hasBundle() is false for unknown bundle and true after full successful load', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [{ type: TextAsset, alias: 'hero', path: 'hero.txt' }],
        },
      }),
    );
    mockFetch();

    expect(loader.hasBundle('missing')).toBe(false);
    expect(loader.hasBundle('boot')).toBe(false);

    await loader.loadBundle('boot');

    expect(loader.hasBundle('boot')).toBe(true);
  });

  test('hasBundle() stays false after partial bundle failure', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [
            { type: TextAsset, alias: 'ok', path: 'ok.txt' },
            { type: TextAsset, alias: 'bad', path: 'bad.txt' },
          ],
        },
      }),
    );

    global.fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/bad.txt')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response;
    });

    await expect(loader.loadBundle('boot')).rejects.toBeInstanceOf(BundleLoadError);
    expect(loader.hasBundle('boot')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// New Asset / Assets / LoadingQueue stabilisation tests
// ─────────────────────────────────────────────────────────────────────────────

class MockAssetFactory implements AssetFactory<string> {
  public readonly storageName = 'mockAsset';
  public readonly process = vi.fn(async (_response: Response): Promise<string> => 'raw');
  public readonly create = vi.fn(async (source: string): Promise<string> => `loaded:${source}`);
  public destroy(): void {}
}

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
    // Progress must have settled — pending must be 0
    expect(lastProgress.pending).toBe(0);
    expect(lastProgress.failed).toBe(1);
    expect(lastProgress.loaded).toBe(0);
  });

  test('progress counts both successful and failed items in a map load', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('mockAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);
    mockFetch();

    const goodAsset = new Asset({ type: 'mockAsset', source: 'good.dat' });
    // force the factory to fail on the second call
    factory.create.mockImplementationOnce(async () => 'ok');
    factory.create.mockImplementationOnce(async () => {
      throw new Error('bad');
    });

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

  test('same Asset under two aliases shares a single network fetch', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('mockAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);
    mockFetch();

    const hero = new Asset({ type: 'mockAsset', source: 'images/hero.dat' });

    await loader.load({ heroA: hero, heroB: hero });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(loader.has(MockAssetType, 'heroA')).toBe(true);
    expect(loader.has(MockAssetType, 'heroB')).toBe(true);
  });

  test('get() resolves both aliases after multi-alias load', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('mockAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);
    mockFetch();

    const hero = new Asset({ type: 'mockAsset', source: 'images/hero.dat' });

    await loader.load({ heroA: hero, heroB: hero });

    expect(loader.get(MockAssetType, 'heroA')).toBe(loader.get(MockAssetType, 'heroB'));
  });

  test('unload(asset) removes asset loaded by source-as-alias (single Asset load)', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('mockAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);
    mockFetch();

    const hero = new Asset({ type: 'mockAsset', source: 'images/hero.dat' });

    await loader.load(hero);

    expect(loader.has(MockAssetType, 'images/hero.dat')).toBe(true);

    loader.unload(hero);

    expect(loader.has(MockAssetType, 'images/hero.dat')).toBe(false);
  });

  test('unload(asset) removes all aliases after keyed-map load', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('mockAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);
    mockFetch();

    const hero = new Asset({ type: 'mockAsset', source: 'images/hero.dat' });

    await loader.load({ heroA: hero, heroB: hero });

    expect(loader.has(MockAssetType, 'heroA')).toBe(true);
    expect(loader.has(MockAssetType, 'heroB')).toBe(true);

    loader.unload(hero);

    expect(loader.has(MockAssetType, 'heroA')).toBe(false);
    expect(loader.has(MockAssetType, 'heroB')).toBe(false);
  });

  test('unload(assets) unloads all entries from an Assets container', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('mockAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);
    mockFetch();

    const container = new Assets({
      hero: { type: 'mockAsset', source: 'hero.dat' },
      logo: { type: 'mockAsset', source: 'logo.dat' },
    });

    await loader.load(container);

    expect(loader.has(MockAssetType, 'hero')).toBe(true);
    expect(loader.has(MockAssetType, 'logo')).toBe(true);

    loader.unload(container);

    expect(loader.has(MockAssetType, 'hero')).toBe(false);
    expect(loader.has(MockAssetType, 'logo')).toBe(false);
  });

  test('aliases are cleared from tracking when underlying asset unloads', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('mockAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);
    mockFetch();

    const hero = new Asset({ type: 'mockAsset', source: 'hero.dat' });

    await loader.load({ a: hero, b: hero, c: hero });

    loader.unload(hero);

    // Re-load under a single alias — should work cleanly after unload
    await loader.load({ a: hero });

    expect(loader.has(MockAssetType, 'a')).toBe(true);
    expect(loader.has(MockAssetType, 'b')).toBe(false);
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
        logo: { type: 'mockAsset', source: '/logo.dat' },
      });
    }).not.toThrow();
  });
});

describe('registerAssetType() handler form — full config forwarding', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('handler receives config.source and extra config fields', async () => {
    const loader = new Loader({ basePath: '/' });
    const receivedConfigs: unknown[] = [];

    loader.registerAssetType('richAsset', {
      load: async config => {
        receivedConfigs.push(config);
        return `${config.source}:${config.format}`;
      },
    });

    const asset = new Asset({ type: 'richAsset', source: 'level.json', format: 'tiled' });
    const result = await loader.load(asset);

    expect(receivedConfigs).toHaveLength(1);
    expect(receivedConfigs[0]).toMatchObject({ source: 'level.json', format: 'tiled' });
    expect(result).toBe('level.json:tiled');
  });

  test('handler result is stored and retrievable via the alias', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('richAsset', {
      load: async config => `parsed:${config.source}`,
    });

    await loader.load({ map: new Asset({ type: 'richAsset', source: 'level.json', format: 'tiled' }) });

    // The asset is stored under the alias 'map', not under 'level.json'
    const stored = loader.get(loader['_assetTypeMap'].get('richAsset')!, 'map');
    expect(stored).toBe('parsed:level.json');
  });
});

describe('registerAssetType() handler form — cache-aware context', () => {
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

    loader.registerAssetType('richAsset', {
      load: async (_config, ctx) => {
        capturedKey = ctx.identityKey;
        return 'ok';
      },
    });

    await loader.load(new Asset({ type: 'richAsset', source: 'a.json', format: 'x' }));
    expect(capturedKey).toMatch(/^id:\d+:/);
  });

  test('context.fetchText fetches and returns text', async () => {
    mockFetchText('hello world');
    const loader = new Loader({ basePath: '/assets/' });

    loader.registerAssetType('richAsset', {
      load: async (config, ctx) => ctx.fetchText(config.source),
    });

    const result = await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    expect(result).toBe('hello world');
    expect(global.fetch).toHaveBeenCalledWith('/assets/file.txt', expect.anything());
  });

  test('context.fetchText caches: second call skips network', async () => {
    mockFetchText('cached content');
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('richAsset', {
      load: async (config, ctx) => ctx.fetchText(config.source),
    });

    // First load — populates in-memory result
    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    // Reset the mock so we can check if it was called during the second load
    (global.fetch as MockInstance).mockClear();
    // Second load — same asset, should be served from _resources (no new fetch call)
    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('context.fetchJson fetches and parses JSON', async () => {
    mockFetchText('{"value":42}');
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('richAsset', {
      load: async (config, ctx) => {
        const data = await ctx.fetchJson<{ value: number }>(config.source);
        return String(data.value);
      },
    });

    const result = await loader.load(new Asset({ type: 'richAsset', source: 'data.json', format: 'json' }));
    expect(result).toBe('42');
  });

  test('context.fetchArrayBuffer fetches binary data', async () => {
    mockFetchText('binary');
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('richAsset', {
      load: async (config, ctx) => {
        const buf = await ctx.fetchArrayBuffer(config.source);
        return String(buf.byteLength);
      },
    });

    const result = await loader.load(new Asset({ type: 'richAsset', source: 'data.bin', format: 'bin' }));
    expect(Number(result)).toBeGreaterThan(0);
  });

  test('getIdentityKey separates assets with same source but different format', async () => {
    const loader = new Loader({ basePath: '/' });
    const loadOrder: string[] = [];

    loader.registerAssetType('richAsset', {
      getIdentityKey: config => `${config.source}:${config.format}`,
      load: async config => {
        loadOrder.push(config.format);
        return `result:${config.format}`;
      },
    });

    const tmx = new Asset({ type: 'richAsset', source: 'map.tmx', format: 'tmx' });
    const json = new Asset({ type: 'richAsset', source: 'map.tmx', format: 'tiled-json' });

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

    loader.registerAssetType('richAsset', {
      load: async config => {
        callCount++;
        return `ok:${config.source}`;
      },
    });

    const a1 = new Asset({ type: 'richAsset', source: 'shared.dat', format: 'x' });
    const a2 = new Asset({ type: 'richAsset', source: 'shared.dat', format: 'x' });

    const [r1, r2] = await Promise.all([loader.load(a1), loader.load(a2)]);

    expect(callCount).toBe(1);
    expect(r1).toBe('ok:shared.dat');
    expect(r2).toBe('ok:shared.dat');
  });
});

describe('load(Type, { alias: BatchValue }) — extended legacy batch API', () => {
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

  test('accepts a config object value with source and extra fields', async () => {
    const factory = new MockAssetFactory();
    const receivedOptions: unknown[] = [];

    factory.create.mockImplementation(async (source: string, options?: unknown) => {
      receivedOptions.push(options);
      return `loaded:${source}`;
    });

    const loader = new Loader({ basePath: '/' });

    loader.register(MockAssetType, factory as AssetFactory<MockAssetType>);
    mockFetch();

    const result = await loader.load(MockAssetType, {
      heroA: 'images/hero.png',
      heroB: { source: 'images/hero-alt.png', scale: 2, format: 'png' },
    });

    expect(result.heroA).toBe('loaded:raw');
    expect(result.heroB).toBe('loaded:raw');
    // heroB's extra fields must be forwarded to factory.create as options
    expect(receivedOptions).toContainEqual(expect.objectContaining({ source: 'images/hero-alt.png', scale: 2, format: 'png' }));
  });

  test('string values in batch continue to work unchanged', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(MockAssetType, factory as AssetFactory<MockAssetType>);
    mockFetch();

    const result = await loader.load(MockAssetType, { heroA: 'images/hero.png' });

    expect(result.heroA).toBe('loaded:raw');
    expect(global.fetch).toHaveBeenCalledWith('/images/hero.png', expect.anything());
  });
});

describe('handler context.fetch* — IDB store names (Fix 1 regression)', () => {
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

    loader.registerAssetType('richAsset', {
      load: async (config, ctx) => ctx.fetchText(config.source),
    });

    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));

    expect(saves).toContainEqual({ storageName: '__ctx_text', key: 'file.txt' });
  });

  test('context.fetchJson saves to __ctx_json store with source as key', async () => {
    mockFetch('{"n":1}');
    const { store, saves } = makeMockStore();
    const loader = new Loader({ basePath: '/', cache: store });

    loader.registerAssetType('richAsset', {
      load: async (config, ctx) => {
        const data = await ctx.fetchJson<{ n: number }>(config.source);
        return String(data.n);
      },
    });

    await loader.load(new Asset({ type: 'richAsset', source: 'data.json', format: 'json' }));

    expect(saves).toContainEqual({ storageName: '__ctx_json', key: 'data.json' });
  });

  test('context.fetchArrayBuffer saves to __ctx_binary store with source as key', async () => {
    mockFetch('bytes');
    const { store, saves } = makeMockStore();
    const loader = new Loader({ basePath: '/', cache: store });

    loader.registerAssetType('richAsset', {
      load: async (config, ctx) => {
        const buf = await ctx.fetchArrayBuffer(config.source);
        return String(buf.byteLength);
      },
    });

    await loader.load(new Asset({ type: 'richAsset', source: 'data.bin', format: 'bin' }));

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

    loader.registerAssetType('richAsset', {
      load: async (config, ctx) => ctx.fetchText(config.source),
    });

    // First load — populates _resources; context.fetchText goes to network, store has no entry yet
    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    // Second load — served from _resources, handler not called, store not consulted
    (global.fetch as MockInstance).mockClear();
    await loader.load(new Asset({ type: 'richAsset', source: 'file.txt', format: 'txt' }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('unload(asset) + getIdentityKey — identity discrimination (Fix 2 regression)', () => {
  test('unload(asset) removes only aliases for the matching getIdentityKey identity', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('richAsset', {
      getIdentityKey: config => `${config.source}:${config.format}`,
      load: async config => `result:${config.format}`,
    });

    const tmxMap = new Asset({ type: 'richAsset', source: 'map.dat', format: 'tmx' });
    const rpgMap = new Asset({ type: 'richAsset', source: 'map.dat', format: 'rpg-maker' });

    await loader.load({ tmxA: tmxMap, tmxB: tmxMap, rpgA: rpgMap });

    const ctor = loader['_assetTypeMap'].get('richAsset')!;

    expect(loader.has(ctor, 'tmxA')).toBe(true);
    expect(loader.has(ctor, 'tmxB')).toBe(true);
    expect(loader.has(ctor, 'rpgA')).toBe(true);

    loader.unload(tmxMap);

    expect(loader.has(ctor, 'tmxA')).toBe(false);
    expect(loader.has(ctor, 'tmxB')).toBe(false);
    expect(loader.has(ctor, 'rpgA')).toBe(true); // unaffected — different identity
  });

  test('unload(asset) without getIdentityKey still removes all source-based aliases', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('richAsset', {
      load: async config => `result:${config.source}`,
    });

    const asset = new Asset({ type: 'richAsset', source: 'shared.dat', format: 'x' });

    await loader.load({ a: asset, b: asset });

    const ctor = loader['_assetTypeMap'].get('richAsset')!;

    expect(loader.has(ctor, 'a')).toBe(true);
    expect(loader.has(ctor, 'b')).toBe(true);

    loader.unload(asset);

    expect(loader.has(ctor, 'a')).toBe(false);
    expect(loader.has(ctor, 'b')).toBe(false);
  });

  test('unload(asset) with getIdentityKey does not affect a different format identity', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('richAsset', {
      getIdentityKey: config => `${config.source}:${config.format}`,
      load: async config => `result:${config.format}`,
    });

    const tmxMap = new Asset({ type: 'richAsset', source: 'map.dat', format: 'tmx' });
    const rpgMap = new Asset({ type: 'richAsset', source: 'map.dat', format: 'rpg-maker' });

    await loader.load({ tmxA: tmxMap, rpgA: rpgMap });

    const ctor = loader['_assetTypeMap'].get('richAsset')!;

    loader.unload(rpgMap);

    expect(loader.has(ctor, 'tmxA')).toBe(true); // untouched
    expect(loader.has(ctor, 'rpgA')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — registerExtension() + extension-based load('path.ext')
// ─────────────────────────────────────────────────────────────────────────────

describe('registerExtension() + extension-based load(path)', () => {
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

  test('load(path) infers the type from a registered extension', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerExtension('txt', TextAsset);
    mockFetch();

    const result = await loader.load<string>('notes.txt');

    expect(result).toBe('resource:fresh-source');
  });

  test('registerExtension() normalizes a leading dot and casing', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerExtension('.TXT', TextAsset);
    mockFetch();

    await expect(loader.load<string>('notes.txt')).resolves.toBe('resource:fresh-source');
  });

  test('FontAsset infers the "family" option from the filename when loaded by path', async () => {
    const receivedOptions: unknown[] = [];
    const factory: AssetFactory<FontFace> = {
      storageName: 'font',
      process: vi.fn(async () => 'raw'),
      create: vi.fn(async (_source: unknown, options?: unknown) => {
        receivedOptions.push(options);
        return {} as FontFace;
      }),
      destroy: vi.fn(),
    };
    const loader = new Loader({ basePath: '/' });

    loader.register(FontAsset, factory);
    loader.registerExtension('woff2', FontAsset);
    mockFetch();

    await loader.load('fonts/Roboto.woff2');

    expect(receivedOptions[0]).toMatchObject({ family: 'Roboto' });
  });

  test('throws a clear error for an unregistered extension', () => {
    const loader = new Loader({ basePath: '/' });

    expect(() => loader.load('mystery.foo')).toThrow(/no type registered for any extension of "mystery.foo"/);
  });

  test('throws a clear error for a path with no extension at all', () => {
    const loader = new Loader({ basePath: '/' });

    expect(() => loader.load('no-extension-here')).toThrow(/no type registered for any extension of "no-extension-here"/);
  });

  test('rejects when the extension-inferred load fails', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerExtension('txt', TextAsset);
    mockFetch();
    factory.create.mockImplementationOnce(async () => {
      throw new Error('extension-load-broken');
    });

    await expect(loader.load('broken.txt')).rejects.toThrow('extension-load-broken');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — add() single-string and array forms
// ─────────────────────────────────────────────────────────────────────────────

describe('add() — single string and array-of-paths forms', () => {
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

  test('add(type, path) registers the path as both its own alias and URL', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    loader.add(TextAsset, 'solo.txt');
    const result = await loader.load(TextAsset, 'solo.txt');

    expect(result).toBe('resource:fresh-source');
    expect(global.fetch).toHaveBeenCalledWith('/solo.txt', expect.anything());
  });

  test('add(type, [paths]) registers every path as its own alias', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();

    loader.add(TextAsset, ['one.txt', 'two.txt']);

    await expect(loader.load(TextAsset, 'one.txt')).resolves.toBe('resource:fresh-source');
    await expect(loader.load(TextAsset, 'two.txt')).resolves.toBe('resource:fresh-source');
    expect(global.fetch).toHaveBeenCalledWith('/one.txt', expect.anything());
    expect(global.fetch).toHaveBeenCalledWith('/two.txt', expect.anything());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — legacy batch load() failure branches (array / record forms)
// ─────────────────────────────────────────────────────────────────────────────

describe('load(Type, ...) legacy batch forms — per-item failure branches', () => {
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

  test('load(Type, [paths]) rejects when one array item fails', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();
    factory.create.mockImplementationOnce(async () => 'ok');
    factory.create.mockImplementationOnce(async () => {
      throw new Error('array-item-broken');
    });

    await expect(loader.load(TextAsset, ['good-array.txt', 'bad-array.txt'])).rejects.toThrow('array-item-broken');
  });

  test('load(Type, { alias: BatchValue }) rejects when one record item fails', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    mockFetch();
    factory.create.mockImplementationOnce(async () => 'ok');
    factory.create.mockImplementationOnce(async () => {
      throw new Error('record-item-broken');
    });

    await expect(loader.load(TextAsset, { good: 'good-rec.txt', bad: 'bad-rec.txt' })).rejects.toThrow('record-item-broken');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — backgroundLoad() re-scan skip branches, loadAll() early exit,
// setConcurrency()
// ─────────────────────────────────────────────────────────────────────────────

describe('backgroundLoad() re-scan skip branches', () => {
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

  test('skips manifest entries that are already resolved', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.add(TextAsset, { a: 'a.txt' });
    mockFetch();

    await loader.load(TextAsset, 'a');
    (global.fetch as MockInstance).mockClear();

    loader.backgroundLoad();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('skips manifest entries that are already in flight', () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });
    const deferred = createDeferred<Response>();

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.add(TextAsset, { a: 'a.txt' });
    global.fetch = vi.fn((): Promise<Response> => deferred.promise);

    void loader.load(TextAsset, 'a');
    loader.backgroundLoad();

    expect(global.fetch).toHaveBeenCalledTimes(1);

    deferred.resolve({ ok: true, status: 200, statusText: 'OK' } as Response);
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
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/', concurrency: 6 });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.add(TextAsset, { a: 'a.txt', b: 'b.txt', c: 'c.txt' });

    expect(loader.setConcurrency(1)).toBe(loader);

    const deferred = createDeferred<Response>();
    global.fetch = vi.fn((): Promise<Response> => deferred.promise);

    loader.backgroundLoad();

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
    const factory = new DummyFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(DummyAsset, factory);
    mockFetch();

    const result = await loader.load(DummyAsset, 'thing.dat');

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
    const orphan = new Asset({ type: 'mockAsset', source: 'x.dat' });

    expect(() => loader.unload(orphan)).not.toThrow();
  });

  test('unload(asset) falls back to source-as-alias when the asset was never loaded', () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('mockAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);

    const neverLoaded = new Asset({ type: 'mockAsset', source: 'never.dat' });

    expect(() => loader.unload(neverLoaded)).not.toThrow();
    expect(loader.has(MockAssetType, 'never.dat')).toBe(false);
  });

  test('unload(assets) skips container entries whose asset type was never registered', () => {
    const loader = new Loader({ basePath: '/' });
    const container = new Assets({ orphan: { type: 'mockAsset', source: 'x.dat' } });

    expect(() => loader.unload(container)).not.toThrow();
  });

  test('unload(assets) falls back to per-alias unload when identity was never tracked', () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('mockAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);

    const container = new Assets({ orphan: { type: 'mockAsset', source: 'never.dat' } });

    expect(() => loader.unload(container)).not.toThrow();
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

    await loader.load(TextAsset, 'demo.txt');

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

    await loader.load(TextAsset, 'demo.txt');

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

    await loader.load(TextAsset, 'https://cdn.example.com/x.txt');

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
    loader.registerAssetType('probeType', ProbeAsset);
    expect(loader.hasAssetType('probeType')).toBe(true);

    expect(loader.hasExtension('probe')).toBe(false);
    loader.registerExtension('.PROBE', ProbeAsset);
    expect(loader.hasExtension('probe')).toBe(true);
    expect(loader.hasExtension('.probe')).toBe(true);
  });

  test('hasLoadable() is true for a handler-based registerAssetType() registration', () => {
    const loader = new Loader({ basePath: '/' });
    class HandlerAsset {}

    expect(loader.hasLoadable(HandlerAsset)).toBe(false);
    loader.registerAssetType('handlerType', {
      load: async () => 'ok',
    });
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

  test('binds by type token: load(Type, path) resolves via the handler', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<BoundAsset>({ type: BoundAsset }, { load: async request => new BoundAsset(request.source) });

    const result = await loader.load(BoundAsset, 'thing.bin');

    expect(result).toBeInstanceOf(BoundAsset);
    expect(result.value).toBe('thing.bin');
  });

  test('load(Type, path, options) forwards an options object into the handler request', async () => {
    const loader = new Loader({ basePath: '/' });
    let receivedConfig: unknown;

    loader.bindAsset<BoundAsset, { scale: number }>(
      { type: BoundAsset },
      {
        load: async request => {
          receivedConfig = request;
          return new BoundAsset(request.source);
        },
      },
    );

    await loader.load(BoundAsset, 'thing.bin', { scale: 3 });

    expect(receivedConfig).toMatchObject({ source: 'thing.bin', options: { scale: 3 } });
  });

  test('binds by typeName: config-map load resolves via the handler', async () => {
    const loader = new Loader({ basePath: '/' });

    loader.bindAsset<BoundAsset>({ type: BoundAsset, typeNames: ['boundAsset'] }, { load: async request => new BoundAsset(request.source) });

    const result = await loader.load(new Asset({ type: 'boundAsset', source: 'level.dat' }));

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

    const a = new Asset({ type: 'boundAsset', source: 'shared.dat', scale: 2 });
    const b = new Asset({ type: 'boundAsset', source: 'shared.dat', scale: 2 });

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

    expect(loader.get(Json, 'level')).toEqual({ score: 42 });
    expect(loader.get(TextAsset, 'readme')).toBe('hello world');
    expect(new Uint8Array(loader.get(BinaryAsset, 'blob') as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test('throws on an unknown asset type and stores nothing', async () => {
    const container = encodeContainer([{ alias: 'x', type: 'nonsense', bytes: new TextEncoder().encode('x') }]);
    mockContainerFetch(container);

    const loader = createCoreLoaderLocal();

    await expect(loader.loadContainer('x.exoa')).rejects.toThrow(/unknown asset type "nonsense"/);
  });

  test('uses a register()/registerAssetType-based factory when no createFromBytes handler is bound', async () => {
    const factory = new DummyFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('dummy', DummyAsset, factory);

    const container = encodeContainer([{ alias: 'x', type: 'dummy', bytes: new TextEncoder().encode('raw-bytes') }]);
    mockContainerFetch(container);

    await loader.loadContainer('pack.exoa');

    expect(loader.get(DummyAsset, 'x')).toBeInstanceOf(DummyAsset);
  });

  test('rejects when the resolved type supports neither createFromBytes nor a registered factory', async () => {
    class BareAsset {}
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('bare', BareAsset);

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
  test('wraps a thrown Error from a registerAssetType() handler', async () => {
    const loader = new Loader({ basePath: '/assets/' });

    loader.registerAssetType('richAsset', {
      load: async () => {
        throw new Error('handler exploded');
      },
    });

    const asset = new Asset({ type: 'richAsset', source: 'x.json', format: 'x' });
    const error: Error = await loader.load(asset).catch((e: unknown) => e as Error);

    expect(error.message).toMatch(/Failed to load "x\.json" from "\/assets\/x\.json": handler exploded/);
    expect(error.cause).toBeInstanceOf(Error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — _loadSingleAsset non-handler branch: extra config fields
// forwarded as fetch options for a plain register()/registerAssetType() factory
// ─────────────────────────────────────────────────────────────────────────────

describe('Asset-based load() without a handler — extra config fields as options', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('extra config fields are forwarded to factory.create() as options', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('richAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    const receivedOptions: unknown[] = [];
    factory.create.mockImplementation(async (source: string, options?: unknown) => {
      receivedOptions.push(options);
      return `loaded:${source}`;
    });

    const asset = new Asset({ type: 'richAsset', source: 'extra.dat', format: 'tiled' });
    await loader.load(asset);

    expect(receivedOptions[0]).toMatchObject({ format: 'tiled' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — _describeType() anonymous-constructor fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('registerManifest() conflict message — anonymous constructor', () => {
  test('falls back to "(anonymous type)" for an unnamed constructor', () => {
    const loader = new Loader({ basePath: '/' });
    const Anon = class {};

    Object.defineProperty(Anon, 'name', { value: '' });

    loader.registerManifest(
      defineAssetManifest({
        bundles: { boot: [{ type: Anon, alias: 'x', path: 'a.txt' }] },
      }),
    );

    expect(() =>
      loader.registerManifest(
        defineAssetManifest({
          bundles: { other: [{ type: Anon, alias: 'x', path: 'b.txt' }] },
        }),
      ),
    ).toThrow('(anonymous type)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — _areOptionsEquivalent() full branch matrix
// ─────────────────────────────────────────────────────────────────────────────

describe('registerManifest() option-equivalence branch matrix', () => {
  function registerTwice(firstOptions: unknown, secondOptions: unknown): () => void {
    const loader = new Loader({ basePath: '/' });

    loader.registerManifest(
      defineAssetManifest({
        bundles: { boot: [{ type: TextAsset, alias: 'x', path: 'a.txt', options: firstOptions }] },
      }),
    );

    return () =>
      loader.registerManifest(
        defineAssetManifest({
          bundles: { other: [{ type: TextAsset, alias: 'x', path: 'a.txt', options: secondOptions }] },
        }),
      );
  }

  test('rejects when one side has options and the other has none (typeof mismatch)', () => {
    expect(registerTwice(undefined, {})).toThrow('Conflicting asset definition');
  });

  test('rejects when one options value is null and the other a non-null object', () => {
    expect(registerTwice(null, {})).toThrow('Conflicting asset definition');
  });

  test('rejects when both options are non-object primitives with different values', () => {
    expect(registerTwice(1, 2)).toThrow('Conflicting asset definition');
  });

  test('allows deeply-equal nested plain-object and array options', () => {
    expect(registerTwice({ nested: { a: [1, 2, { b: 3 }] } }, { nested: { a: [1, 2, { b: 3 }] } })).not.toThrow();
  });

  test('rejects arrays of different lengths', () => {
    expect(registerTwice({ list: [1, 2] }, { list: [1] })).toThrow('Conflicting asset definition');
  });

  test('rejects options objects with a different number of keys', () => {
    expect(registerTwice({ a: 1 }, { a: 1, b: 2 })).toThrow('Conflicting asset definition');
  });

  test('rejects options objects with the same key count but different key names', () => {
    expect(registerTwice({ a: 1 }, { b: 1 })).toThrow('Conflicting asset definition');
  });

  test('rejects options with matching keys but a differing nested value', () => {
    expect(registerTwice({ a: { b: 1 } }, { a: { b: 2 } })).toThrow('Conflicting asset definition');
  });

  test('rejects when options prototypes differ (plain object vs. class instance)', () => {
    class OptionsBox {
      public constructor(public readonly value: number) {}
    }

    expect(registerTwice(new OptionsBox(1), { value: 1 })).toThrow('Conflicting asset definition');
  });

  test('accepts two structurally-identical same-class option instances as equivalent', () => {
    class OptionsBox {
      public constructor(public readonly value: number) {}
    }

    expect(registerTwice(new OptionsBox(1), new OptionsBox(1))).not.toThrow();
  });

  test('rejects two same-class option instances with differing fields', () => {
    class OptionsBox {
      public constructor(public readonly value: number) {}
    }

    expect(registerTwice(new OptionsBox(1), new OptionsBox(2))).toThrow('Conflicting asset definition');
  });

  test('compares Date options by timestamp', () => {
    expect(registerTwice({ since: new Date(1000) }, { since: new Date(1000) })).not.toThrow();
    expect(registerTwice({ since: new Date(1000) }, { since: new Date(2000) })).toThrow('Conflicting asset definition');
  });

  test('exotic containers stay reference-only (two similar Maps still conflict)', () => {
    expect(
      registerTwice(
        { lookup: new Map([['a', 1]]) },
        {
          lookup: new Map([['a', 1]]),
        },
      ),
    ).toThrow('Conflicting asset definition');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage sweep — background bundle loading: cache-hit / in-flight shortcuts in
// _loadSingleBackground, _isQueuedInBackground dedup, and _waitForBackgroundEntry's
// onLoaded/onError mismatch-ignore branches
// ─────────────────────────────────────────────────────────────────────────────

describe('background bundle loading — _loadSingleBackground shortcuts', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(): void {
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);
  }

  test('background bundle load resolves instantly for an alias already in memory', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: { boot: [{ type: TextAsset, alias: 'preloaded', path: 'preloaded.txt' }] },
      }),
    );
    mockFetch();

    await loader.load(TextAsset, 'preloaded');
    (global.fetch as MockInstance).mockClear();

    await loader.loadBundle('boot', { background: true });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('background bundle load attaches to an already-in-flight foreground fetch', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/' });
    const deferred = createDeferred<Response>();

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: { boot: [{ type: TextAsset, alias: 'shared', path: 'shared.txt' }] },
      }),
    );

    global.fetch = vi.fn((): Promise<Response> => deferred.promise);

    const foreground = loader.load(TextAsset, 'shared');
    const bundlePromise = loader.loadBundle('boot', { background: true });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    deferred.resolve({ ok: true, status: 200, statusText: 'OK' } as Response);

    await foreground;
    await bundlePromise;

    expect(loader.has(TextAsset, 'shared')).toBe(true);
  });

  test('two overlapping background bundle loads for the same not-yet-started alias dedupe via _isQueuedInBackground', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/', concurrency: 1 });
    const blocker = createDeferred<Response>();
    const shared = createDeferred<Response>();

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          first: [
            { type: TextAsset, alias: 'blocker', path: 'blocker.txt' },
            { type: TextAsset, alias: 'shared', path: 'shared2.txt' },
          ],
          second: [{ type: TextAsset, alias: 'shared', path: 'shared2.txt' }],
        },
      }),
    );

    global.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/blocker.txt')) return blocker.promise;
      if (url.endsWith('/shared2.txt')) return shared.promise;
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const firstBundle = loader.loadBundle('first', { background: true });
    const secondBundle = loader.loadBundle('second', { background: true });

    blocker.resolve({ ok: true, status: 200, statusText: 'OK' } as Response);
    shared.resolve({ ok: true, status: 200, statusText: 'OK' } as Response);

    await Promise.all([firstBundle, secondBundle]);

    expect(global.fetch).toHaveBeenCalledTimes(2); // blocker.txt + shared2.txt only — no duplicate fetch for "shared"
  });

  test('_waitForBackgroundEntry ignores onLoaded/onError events for other aliases while waiting for its own', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/', concurrency: 2 });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [
            { type: TextAsset, alias: 'first', path: 'first.txt' },
            { type: TextAsset, alias: 'second', path: 'second.txt' },
            { type: TextAsset, alias: 'third', path: 'third.txt' },
          ],
        },
      }),
    );

    global.fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/second.txt')) {
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }

      return { ok: true, status: 200, statusText: 'OK' } as Response;
    });

    await expect(loader.loadBundle('boot', { background: true })).rejects.toBeInstanceOf(BundleLoadError);

    expect(loader.has(TextAsset, 'first')).toBe(true);
    expect(loader.has(TextAsset, 'third')).toBe(true);
    expect(loader.has(TextAsset, 'second')).toBe(false);
  });

  test('_waitForBackgroundEntry rejects when the entry it is waiting for itself fails', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/', concurrency: 1 });

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.registerManifest(
      defineAssetManifest({
        bundles: {
          boot: [
            { type: TextAsset, alias: 'first', path: 'first.txt' },
            { type: TextAsset, alias: 'waiting', path: 'waiting.txt' },
          ],
        },
      }),
    );

    global.fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/waiting.txt')) {
        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      }

      return { ok: true, status: 200, statusText: 'OK' } as Response;
    });

    // concurrency: 1 -> 'first' starts immediately, 'waiting' sits in the queue and
    // is only observed via `_waitForBackgroundEntry`'s onLoaded/onError listeners.
    await expect(loader.loadBundle('boot', { background: true })).rejects.toBeInstanceOf(BundleLoadError);

    expect(loader.has(TextAsset, 'first')).toBe(true);
    expect(loader.has(TextAsset, 'waiting')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// backgroundLoad() re-entrancy — queued entries must not be duplicated
// ─────────────────────────────────────────────────────────────────────────────

describe('backgroundLoad() re-entrancy', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('calling backgroundLoad() again before the queue drains does not double-queue entries or corrupt onProgress', async () => {
    const factory = new MockTextFactory();
    const loader = new Loader({ basePath: '/', concurrency: 1 });
    const deferredA = createDeferred<Response>();
    const deferredB = createDeferred<Response>();
    const progress: Array<[number, number]> = [];

    loader.register(TextAsset, factory as AssetFactory<TextAsset>);
    loader.add(TextAsset, { a: 'a.txt', b: 'b.txt' });

    const done = new Promise<void>(resolve => {
      loader.onProgress.add((loaded, total) => {
        progress.push([loaded, total]);
        if (loaded === total) resolve();
      });
    });

    global.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/a.txt')) return deferredA.promise;
      if (url.endsWith('/b.txt')) return deferredB.promise;
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    loader.backgroundLoad(); // queue=[a,b] -> starts 'a' (active=1), 'b' stays queued
    loader.backgroundLoad(); // 'a' in-flight -> skipped; 'b' already queued -> skipped too

    deferredA.resolve({ ok: true, status: 200, statusText: 'OK' } as Response);
    deferredB.resolve({ ok: true, status: 200, statusText: 'OK' } as Response);

    await done;

    expect(global.fetch).toHaveBeenCalledTimes(2); // a.txt + b.txt fetched once each
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]); // loaded never exceeds total
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

    await loader.load(TextAsset, 'demo.txt');

    expect(storeA.load).toHaveBeenCalledWith('text', 'demo.txt');
    expect(storeB.load).toHaveBeenCalledWith('text', 'demo.txt');
  });
});

describe('unload()-during-in-flight identity cleanup on rejection', () => {
  test('does not throw when the identity tracking was already cleared before the fetch rejects', async () => {
    const loader = new Loader({ basePath: '/' });
    const deferred = createDeferred<unknown>();

    loader.registerAssetType('richAsset', {
      load: async () => deferred.promise,
    });

    const asset = new Asset({ type: 'richAsset', source: 'x.dat', format: 'x' });
    const pending = loader.load(asset);

    // Unload while still in flight: this clears `_identityKeyToAliases` for this
    // identity synchronously, before the underlying load settles.
    loader.unload(asset);

    deferred.reject(new Error('boom'));

    await expect(pending).rejects.toThrow('boom');
  });
});

describe('loadBundle() with an empty bundle', () => {
  test('resolves immediately and reports zero/zero progress', async () => {
    const loader = new Loader({ basePath: '/' });
    const signalProgress: Array<[string, number, number]> = [];

    loader.registerManifest(defineAssetManifest({ bundles: { empty: [] } }));
    loader.onBundleProgress.add((name, loaded, total) => {
      signalProgress.push([name, loaded, total]);
    });

    const callbackProgress: Array<[number, number]> = [];

    await expect(
      loader.loadBundle('empty', {
        onProgress: (loaded, total) => {
          callbackProgress.push([loaded, total]);
        },
      }),
    ).resolves.toBeUndefined();

    expect(signalProgress).toContainEqual(['empty', 0, 0]);
    expect(callbackProgress).toContainEqual([0, 0]);
  });
});

describe('unloadAll() with no type argument', () => {
  test('clears every loaded type', async () => {
    const textFactory = new MockTextFactory();
    const dummyFactory = new DummyFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(TextAsset, textFactory as AssetFactory<TextAsset>);
    loader.register(DummyAsset, dummyFactory);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load(TextAsset, 'a.txt');
    await loader.load(DummyAsset, 'b.dat');

    expect(loader.has(TextAsset, 'a.txt')).toBe(true);
    expect(loader.has(DummyAsset, 'b.dat')).toBe(true);

    loader.unloadAll();

    expect(loader.has(TextAsset, 'a.txt')).toBe(false);
    expect(loader.has(DummyAsset, 'b.dat')).toBe(false);
  });
});

describe('legacy Record<string, BatchValue> — third-argument options merge', () => {
  test('merges third-argument options into an object-shaped BatchValue', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.register(MockAssetType, factory as AssetFactory<MockAssetType>);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    const receivedOptions: unknown[] = [];
    factory.create.mockImplementation(async (source: string, options?: unknown) => {
      receivedOptions.push(options);
      return `loaded:${source}`;
    });

    await loader.load(MockAssetType, { hero: { source: 'images/hero.png', scale: 2 } }, { locale: 'en' });

    expect(receivedOptions[0]).toMatchObject({ source: 'images/hero.png', scale: 2, locale: 'en' });
  });
});

describe('load({ alias: config }) — plain object values are auto-wrapped in an Asset', () => {
  test('a plain (non-Asset) config object value loads correctly', async () => {
    const factory = new MockAssetFactory();
    const loader = new Loader({ basePath: '/' });

    loader.registerAssetType('mockAsset', MockAssetType as never, factory as AssetFactory<MockAssetType>);
    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'raw' }) as unknown as Response);

    await loader.load({ hero: { type: 'mockAsset', source: 'hero.dat' } });

    expect(loader.has(MockAssetType, 'hero')).toBe(true);
  });
});

describe('non-Error throws are stringified when wrapping fetch/handler failures', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('_fetchWithHandler wraps a thrown non-Error value from a handler', async () => {
    const loader = new Loader({ basePath: '/assets/' });

    loader.registerAssetType('richAsset', {
      load: async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'plain string failure';
      },
    });

    const asset = new Asset({ type: 'richAsset', source: 'y.json', format: 'y' });

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

    await expect(loader.load(TextAsset, 'boom.txt')).rejects.toThrow(/raw string boom/);
  });
});

describe('registerManifest() option-equivalence — array element mismatch (same length)', () => {
  test('rejects same-length arrays with a differing element', () => {
    const loader = new Loader({ basePath: '/' });

    loader.registerManifest(
      defineAssetManifest({
        bundles: { boot: [{ type: TextAsset, alias: 'x', path: 'a.txt', options: { list: [1, 2, 3] } }] },
      }),
    );

    expect(() =>
      loader.registerManifest(
        defineAssetManifest({
          bundles: { other: [{ type: TextAsset, alias: 'x', path: 'a.txt', options: { list: [1, 2, 4] } }] },
        }),
      ),
    ).toThrow('Conflicting asset definition');
  });
});
