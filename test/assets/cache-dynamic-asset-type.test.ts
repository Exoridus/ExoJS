/**
 * An asset type nobody shipped must cache with no further ceremony.
 *
 * This is the property the whole redesign exists for. A type installed at
 * runtime - by an extension, by an application, by a package this engine has
 * never heard of - gets a cache namespace from its own `id`, a record layout
 * from its own `layout`, and nothing else. There is no cache-side registration,
 * no schema declaration and no declaration merging, and the acquisition still
 * goes through the codec on the way in and on the way back out.
 */

import type { AssetFactory } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import { AssetType } from '#assets/AssetType';
import { AssetCache } from '#assets/cache/AssetCache';
import { NetworkOnlyPolicy } from '#assets/cache/cachePolicies';
import { serializeCacheRecordKey } from '#assets/cache/CacheRecordKey';
import { CacheRoute } from '#assets/cache/CacheRoute';
import { SingleEntryLayout } from '#assets/cache/SingleEntryLayout';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

import { createCacheStoreDouble } from './cache-test-doubles';

interface WorldData {
  readonly name: string;
}

class World {
  public constructor(public readonly data: WorldData) {}
}

/** Counts how often the codec had to interpret a representation. */
const decodes: string[] = [];

class WorldAssetType extends AssetType<WorldData, World, undefined, string> {
  public readonly id = 'com.example.world';
  public override readonly extensions = ['world'];

  public override readonly codec: AssetSourceCodec<WorldData, string> = {
    fromResponse: response => response.text(),
    fromBytes: bytes => Promise.resolve(new TextDecoder().decode(bytes)),
    decode: stored => {
      decodes.push(stored);

      return Promise.resolve(JSON.parse(stored) as WorldData);
    },
  };

  public createFactory(): AssetFactory<WorldData, World, undefined> {
    return { create: data => Promise.resolve(new World(data)) };
  }
}

/** A second type over the same URL, keeping a different representation of it. */
class RawWorldAssetType extends AssetType<string, string, undefined, string> {
  public readonly id = 'com.example.world-raw';

  public override readonly codec: AssetSourceCodec<string> = {
    fromResponse: response => response.text(),
    decode: stored => Promise.resolve(stored.toUpperCase()),
  };

  public createFactory(): AssetFactory<string, string, undefined> {
    return { create: source => Promise.resolve(source) };
  }
}

const payload = '{"name":"level-1"}';

const mockFetch = (): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => payload }) as unknown as Response) as unknown as ReturnType<
    typeof vi.fn
  >;

  global.fetch = fetchMock as unknown as typeof fetch;

  return fetchMock;
};

/** A loader with `worldType` installed, sharing `cache` with any other loader given the same one. */
const createLoader = (cache: AssetCache, ...types: Array<AssetType<never, never, never, never>>): Loader => {
  const loader = new Loader({ basePath: 'https://assets.test/', cache });

  materializeAssetTypes(loader, types as never[]);

  return loader;
};

describe('a runtime-installed asset type', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    decodes.length = 0;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('caches on first load and is served from the cache on the next, with no cache-side registration', async () => {
    const store = createCacheStoreDouble();
    const cache = new AssetCache({ stores: store });
    const fetchMock = mockFetch();
    const worldType = new WorldAssetType();

    const first = createLoader(cache, worldType as never);
    const loaded = await first.load(worldType.asset('level.world'));

    expect(loaded).toBeInstanceOf(World);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    first.destroy();

    // A second loader shares the application's cache but starts with no
    // resident resources, which is what makes the next acquisition a real
    // cache read rather than a residency hit.
    const second = createLoader(cache, new WorldAssetType() as never);
    const again = await second.load(worldType.asset('level.world'));

    expect(again).toBeInstanceOf(World);
    expect((again as World).data.name).toBe('level-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    second.destroy();
  });

  test('a cache hit still goes through the codec, so the factory never sees the persisted form', async () => {
    const store = createCacheStoreDouble();
    const cache = new AssetCache({ stores: store });

    mockFetch();

    const worldType = new WorldAssetType();
    const first = createLoader(cache, worldType as never);

    await first.load(worldType.asset('level.world'));
    first.destroy();

    const second = createLoader(cache, new WorldAssetType() as never);

    await second.load(worldType.asset('level.world'));
    second.destroy();

    // Once per acquisition, from the stored TEXT both times - the factory is
    // handed `WorldData`, never the representation the store held.
    expect(decodes).toEqual([payload, payload]);
  });

  test('needs no schema change for its namespace, and does not collide with another type over one URL', async () => {
    const store = createCacheStoreDouble();
    const cache = new AssetCache({ stores: store });

    mockFetch();

    const worldType = new WorldAssetType();
    const rawType = new RawWorldAssetType();
    const loader = createLoader(cache, worldType as never, rawType as never);

    await loader.load(worldType.asset('level.world'));
    await loader.load(rawType.asset('level.world'));

    const source = 'url:https://assets.test/level.world';

    const version = worldType.layout.version;

    expect(store.records.get(serializeCacheRecordKey({ namespace: 'com.example.world', source, version, record: 'value' }))).toBe(payload);
    expect(store.records.get(serializeCacheRecordKey({ namespace: 'com.example.world-raw', source, version, record: 'value' }))).toBe(payload);
    expect(store.records.size).toBe(2);

    loader.destroy();
  });

  test('is routable by its id without the cache knowing anything else about it', async () => {
    const routed = createCacheStoreDouble('routed');
    const fallback = createCacheStoreDouble('fallback');
    const cache = new AssetCache({
      routes: [new CacheRoute({ types: ['com.example.world-raw'], policy: new NetworkOnlyPolicy(), stores: routed })],
      stores: fallback,
    });

    mockFetch();

    const worldType = new WorldAssetType();
    const rawType = new RawWorldAssetType();
    const loader = createLoader(cache, worldType as never, rawType as never);

    await loader.load(worldType.asset('level.world'));
    await loader.load(rawType.asset('level.world'));

    expect(routed.records.size).toBe(0);
    expect(fallback.records.size).toBe(1);

    loader.destroy();
  });

  test('a raised layout version re-acquires rather than decoding the old representation', async () => {
    class VersionedWorldAssetType extends WorldAssetType {
      public override readonly layout = SingleEntryLayout.version<string>(new WorldAssetType().layout.version + 1);
    }

    const store = createCacheStoreDouble();
    const cache = new AssetCache({ stores: store });
    const fetchMock = mockFetch();

    const worldType = new WorldAssetType();
    const first = createLoader(cache, worldType as never);

    await first.load(worldType.asset('level.world'));
    first.destroy();

    const versionedType = new VersionedWorldAssetType();
    const second = createLoader(cache, versionedType as never);

    await second.load(versionedType.asset('level.world'));
    second.destroy();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.records.size).toBe(2);
  });
});
