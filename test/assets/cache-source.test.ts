import { Asset } from '#assets/Asset';
import { AssetCache } from '#assets/AssetCache';
import { AssetCacheMissError } from '#assets/AssetCacheMissError';
import { CacheOnlyPolicy } from '#assets/cachePolicies';
import type { CacheRecordKey } from '#assets/CacheRecordKey';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { TextAsset } from '#assets/tokens';
import { materializeAssetTypes } from '#extensions/materialize';

import { type CacheStoreDouble, createCacheStoreDouble } from './cache-test-doubles';
import { testAssetType } from './test-asset-type';

/** The record key an acquisition of `source` writes under, for `namespace`. */
const recordKey = (namespace: string, source: string): CacheRecordKey => ({ namespace, source: `url:${source}`, version: 1, record: 'value' });

const originalFetch = global.fetch;

function mockFetch(body = 'payload'): ReturnType<typeof vi.fn> {
  const spy = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => body,
        json: async () => JSON.parse(body),
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
        blob: async () => new Blob([body]),
      }) as unknown as Response,
  );

  global.fetch = spy as unknown as typeof fetch;

  return spy;
}

function createLoader(store: CacheStoreDouble): Loader {
  const loader = new Loader({ basePath: '/', cache: store });

  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('Loader.cacheSource', () => {
  test('acquires the source and persists it under the type namespace', async () => {
    const store = createCacheStoreDouble();
    const loader = createLoader(store);

    mockFetch('cached body');

    await loader.cacheSource(Asset.type('text', 'notes.txt'));

    expect(store.set).toHaveBeenCalledWith(recordKey('text', '/notes.txt'), 'cached body');

    loader.destroy();
  });

  test('builds nothing: no resource, no claim, nothing resident', async () => {
    const store = createCacheStoreDouble();
    const loader = createLoader(store);

    mockFetch();

    await loader.cacheSource(Asset.type('text', 'notes.txt'));

    expect(loader.inspect()).toHaveLength(0);
    expect(loader._peekResource(TextAsset, 'notes.txt')).toBeNull();

    loader.destroy();
  });

  test('never runs the type factory', async () => {
    const store = createCacheStoreDouble();
    const loader = new Loader({ basePath: '/', cache: store });
    const create = vi.fn(async (source: string) => source);

    class Probe {}

    loader._installAssetTypes([testAssetType<string, string>({ id: 'probe', token: Probe, extensions: ['probe'], create })]);
    mockFetch();

    await loader.cacheSource(Asset.type('probe' as never, 'thing.probe'));

    expect(create).not.toHaveBeenCalled();
    expect(store.set).toHaveBeenCalledWith(recordKey('probe', '/thing.probe'), 'payload');

    loader.destroy();
  });

  test('warms exactly the record a later load reads back', async () => {
    const store = createCacheStoreDouble();
    const warmer = createLoader(store);

    const fetchSpy = mockFetch('warmed');

    await warmer.cacheSource(Asset.type('text', 'notes.txt'));
    warmer.destroy();

    // A second loader shares the store but holds nothing resident, so this is a
    // real cache read rather than a residency hit.
    fetchSpy.mockClear();

    const reader = createLoader(store);

    await expect(reader.load(Asset.type('text', 'notes.txt'))).resolves.toBe('warmed');
    expect(fetchSpy).not.toHaveBeenCalled();

    reader.destroy();
  });

  test('a cached source is not acquired again', async () => {
    const store = createCacheStoreDouble();
    const loader = createLoader(store);
    const fetchSpy = mockFetch();

    await loader.cacheSource(Asset.type('text', 'notes.txt'));
    await loader.cacheSource(Asset.type('text', 'notes.txt'));

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    loader.destroy();
  });

  test('the route policy decides, so a cache-only route misses loudly instead of fetching', async () => {
    const store = createCacheStoreDouble();
    const loader = new Loader({ basePath: '/', cache: new AssetCache({ stores: store, policy: new CacheOnlyPolicy() }) });
    const fetchSpy = mockFetch();

    materializeAssetTypes(loader, coreAssetTypes);

    await expect(loader.cacheSource(Asset.type('text', 'notes.txt'))).rejects.toBeInstanceOf(AssetCacheMissError);
    expect(fetchSpy).not.toHaveBeenCalled();

    loader.destroy();
  });

  test('forwards cancellation', async () => {
    const store = createCacheStoreDouble();
    const loader = createLoader(store);
    const controller = new AbortController();

    global.fetch = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const fail = (): void => reject(new DOMException('Aborted.', 'AbortError'));

        // The acquisition awaits the cache read before it fetches, so the abort
        // may already have happened by the time this runs.
        if (signal?.aborted === true) {
          fail();
        } else {
          signal?.addEventListener('abort', fail);
        }
      });
    }) as unknown as typeof fetch;

    const pending = loader.cacheSource(Asset.type('text', 'notes.txt'), { signal: controller.signal });

    controller.abort();

    await expect(pending).rejects.toThrow(/Aborted/);

    loader.destroy();
  });

  test('rejects for an asset type this application never installed', async () => {
    const store = createCacheStoreDouble();
    const loader = new Loader({ basePath: '/', cache: store });

    expect(() => loader.cacheSource(Asset.type('text', 'notes.txt'))).toThrow(/no asset type "text" is installed/);

    loader.destroy();
  });

  test('rejects for a type that supplies its own source, naming what would make it cacheable', async () => {
    const store = createCacheStoreDouble();
    const loader = createLoader(store);

    await expect(loader.cacheSource(Asset.type('music', 'theme.mp3'))).rejects.toThrow(/supplies its own source .* nothing to cache/s);
    await expect(loader.cacheSource(Asset.type('music', 'theme.mp3'))).rejects.toThrow(/"download: true"/);

    loader.destroy();
  });

  test('caches streaming media once the request opts into acquiring it', async () => {
    const store = createCacheStoreDouble();
    const loader = createLoader(store);

    mockFetch('audio bytes');

    await loader.cacheSource(Asset.type('music', 'theme.mp3', { download: true }));

    const stored = store.records.get([...store.records.keys()][0]!);

    expect(store.set).toHaveBeenCalledTimes(1);
    // A media representation is kept as a Blob, which is what an element can be
    // pointed at and what a persistent store can structured-clone.
    expect(stored).toBeInstanceOf(Blob);

    loader.destroy();
  });
});
