/**
 * What each built-in {@link CachePolicy} does with the cache and the network,
 * and which failures it is allowed to degrade.
 *
 * The distinction these tests exist for: a cache MISS and a store FAILURE are
 * not the same event. `CacheFirstPolicy` may treat them alike because it has a
 * network leg to fall back on; `CacheOnlyPolicy` may not, because a caller
 * asking for a cached representation has to know whether the entry is absent or
 * the database is broken.
 */

import { AssetCache, type CacheAcquisition } from '#assets/AssetCache';
import { AssetCacheError } from '#assets/AssetCacheError';
import { AssetCacheMissError } from '#assets/AssetCacheMissError';
import { AssetNetworkError } from '#assets/AssetNetworkError';
import { CacheFirstPolicy, CacheOnlyPolicy, NetworkFirstPolicy, NetworkOnlyPolicy } from '#assets/cachePolicies';
import type { CachePolicy } from '#assets/CachePolicy';
import { serializeCacheRecordKey } from '#assets/CacheRecordKey';
import { SingleEntryLayout } from '#assets/SingleEntryLayout';

import { type CacheStoreDouble, createCacheStoreDouble } from './cache-test-doubles';

const namespace = 'com.example.notes';
const sourceKey = 'url:https://assets.test/note.txt';
const recordKey = { namespace, source: sourceKey, version: 1, record: 'value' };

interface Harness {
  readonly store: CacheStoreDouble;
  readonly reported: AssetCacheError[];
  resolve(overrides?: Partial<CacheAcquisition<string>>): Promise<string>;
  seed(value: string): Promise<void>;
}

function harness(policy: CachePolicy, fetchImpl: () => Promise<string> = () => Promise.resolve('from-network')): Harness {
  const store = createCacheStoreDouble();
  const reported: AssetCacheError[] = [];
  const cache = new AssetCache({ policy, stores: store });

  return {
    store,
    reported,
    seed: value => store.set(recordKey, value),
    resolve: (overrides = {}) =>
      cache.resolve<string>({
        namespace,
        sourceKey,
        layout: SingleEntryLayout.version<string>(1),
        fetch: fetchImpl,
        report: error => reported.push(error),
        ...overrides,
      }),
  };
}

describe('CacheFirstPolicy', () => {
  test('serves a hit without touching the network', async () => {
    const fetch = vi.fn(() => Promise.resolve('from-network'));
    const cache = harness(new CacheFirstPolicy(), fetch);

    await cache.seed('from-cache');

    await expect(cache.resolve()).resolves.toBe('from-cache');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('fetches on a miss and writes what it fetched', async () => {
    const cache = harness(new CacheFirstPolicy());

    await expect(cache.resolve()).resolves.toBe('from-network');
    expect(cache.store.records.get(serializeCacheRecordKey(recordKey))).toBe('from-network');
  });

  test('a failing read degrades to the network, and is still reported', async () => {
    const cache = harness(new CacheFirstPolicy());

    cache.store.get.mockRejectedValueOnce(new Error('database is gone'));

    await expect(cache.resolve()).resolves.toBe('from-network');
    expect(cache.reported).toHaveLength(1);
    expect(cache.reported[0]!.operation).toBe('read');
  });

  test('a failing write still delivers the fetched value, and is still reported', async () => {
    const cache = harness(new CacheFirstPolicy());

    cache.store.set.mockRejectedValueOnce(new Error('quota exceeded'));

    await expect(cache.resolve()).resolves.toBe('from-network');
    expect(cache.reported).toHaveLength(1);
    expect(cache.reported[0]!.operation).toBe('write');
  });

  test('a network failure after a cache miss fails the load', async () => {
    const cache = harness(new CacheFirstPolicy(), () => Promise.reject(new AssetNetworkError({ url: 'x', message: 'offline' })));

    await expect(cache.resolve()).rejects.toBeInstanceOf(AssetNetworkError);
  });
});

describe('NetworkFirstPolicy', () => {
  test('prefers the network and writes what it fetched, even with a hit in the cache', async () => {
    const cache = harness(new NetworkFirstPolicy());

    await cache.seed('stale');

    await expect(cache.resolve()).resolves.toBe('from-network');
    expect(cache.store.records.get(serializeCacheRecordKey(recordKey))).toBe('from-network');
  });

  test('falls back to the cache when the network could not deliver', async () => {
    const cache = harness(new NetworkFirstPolicy(), () => Promise.reject(new AssetNetworkError({ url: 'x', message: 'offline' })));

    await cache.seed('stale');

    await expect(cache.resolve()).resolves.toBe('stale');
  });

  test('surfaces the network failure when the cache has nothing either', async () => {
    const networkFailure = new AssetNetworkError({ url: 'x', message: 'offline' });
    const cache = harness(new NetworkFirstPolicy(), () => Promise.reject(networkFailure));

    await expect(cache.resolve()).rejects.toBe(networkFailure);
  });

  test('an unreadable response is not a reason to serve stale data', async () => {
    // A codec failure happens inside the fetch leg. It says the SOURCE is
    // broken, not that the network is down, so falling back would replace a
    // visible failure with a silently wrong asset.
    const codecFailure = new SyntaxError('Unexpected token in JSON');
    const cache = harness(new NetworkFirstPolicy(), () => Promise.reject(codecFailure));

    await cache.seed('stale');

    await expect(cache.resolve()).rejects.toBe(codecFailure);
  });

  test('a cancelled load stays cancelled rather than turning into a cache hit', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const cache = harness(new NetworkFirstPolicy(), () => Promise.reject(abortError));

    await cache.seed('stale');

    await expect(cache.resolve()).rejects.toBe(abortError);
  });
});

describe('NetworkOnlyPolicy', () => {
  test('never reads and never writes', async () => {
    const cache = harness(new NetworkOnlyPolicy());

    await cache.seed('ignored');
    cache.store.get.mockClear();
    cache.store.set.mockClear();

    await expect(cache.resolve()).resolves.toBe('from-network');
    expect(cache.store.get).not.toHaveBeenCalled();
    expect(cache.store.set).not.toHaveBeenCalled();
  });
});

describe('CacheOnlyPolicy', () => {
  test('serves a hit without a network leg', async () => {
    const fetch = vi.fn(() => Promise.resolve('from-network'));
    const cache = harness(new CacheOnlyPolicy(), fetch);

    await cache.seed('from-cache');

    await expect(cache.resolve()).resolves.toBe('from-cache');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('an absent entry rejects with a miss, distinguishable from a broken store', async () => {
    const cache = harness(new CacheOnlyPolicy());
    const error = await cache.resolve().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AssetCacheMissError);
    expect(error).not.toBeInstanceOf(AssetCacheError);
    expect((error as AssetCacheMissError).namespace).toBe(namespace);
    expect((error as AssetCacheMissError).sourceKey).toBe(sourceKey);
  });

  test('a store failure rejects as a store failure, not as a miss', async () => {
    const cache = harness(new CacheOnlyPolicy());

    cache.store.get.mockRejectedValueOnce(new AssetCacheError({ operation: 'read', message: 'transaction failed' }));

    const error = await cache.resolve().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AssetCacheError);
    expect(error).not.toBeInstanceOf(AssetCacheMissError);
  });
});

describe('a custom policy', () => {
  test('needs nothing but read, fetch and write', async () => {
    // The acceptance criterion this file exists to hold: cache-first is
    // expressible in a handful of lines against the context alone. If it ever
    // needs an asset type, a factory or a store handle, the seam has leaked.
    class MyCacheFirstPolicy implements CachePolicy {
      public async resolve<T>(context: { read(): Promise<{ hit: boolean; value?: T }>; fetch(): Promise<T>; write(value: T): Promise<void> }): Promise<T> {
        const cached = await context.read();

        if (cached.hit) {
          return cached.value as T;
        }

        const value = await context.fetch();

        await context.write(value);

        return value;
      }
    }

    const cache = harness(new MyCacheFirstPolicy() as CachePolicy);

    await expect(cache.resolve()).resolves.toBe('from-network');
    await expect(cache.resolve()).resolves.toBe('from-network');
    expect(cache.store.records.get(serializeCacheRecordKey(recordKey))).toBe('from-network');
  });
});
