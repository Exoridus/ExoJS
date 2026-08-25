/**
 * Route selection, multi-store ordering and record identity in {@link AssetCache}.
 *
 * The coordinator is the only layer that knows about several stores at once,
 * so it is where read order, promotion and the observability of a per-store
 * failure have to be decided - deterministically, because a raced read makes
 * which store answered (and therefore which failure surfaced) a matter of
 * timing.
 */

import { AssetCache, type CacheAcquisition } from '#assets/AssetCache';
import { type AssetCacheError } from '#assets/AssetCacheError';
import { CacheFirstPolicy, NetworkOnlyPolicy } from '#assets/cachePolicies';
import { serializeCacheRecordKey } from '#assets/CacheRecordKey';
import { CacheRoute } from '#assets/CacheRoute';
import { MemoryCacheStore } from '#assets/MemoryCacheStore';
import { SingleEntryLayout } from '#assets/SingleEntryLayout';
import { unrestrictedNetwork } from '#core/Connectivity';

import { type CacheStoreDouble, createCacheStoreDouble, createRecordingPolicy } from './cache-test-doubles';

const sourceKey = 'url:https://assets.test/level.world';

const acquisition = (overrides: Partial<CacheAcquisition<string>> = {}): CacheAcquisition<string> => {
  return {
    namespace: 'com.example.world',
    sourceKey,
    layout: SingleEntryLayout.version<string>(1),
    network: unrestrictedNetwork,
    fetch: () => Promise.resolve('from-network'),
    report: () => undefined,
    ...overrides,
  };
};

const recordKeyOf = (namespace: string, version = 1): string => serializeCacheRecordKey({ namespace, source: sourceKey, version, record: 'value' });

describe('route selection', () => {
  test('a store passed on its own becomes one cache-first route', async () => {
    const store = createCacheStoreDouble();
    const cache = AssetCache.from(store);

    await expect(cache.resolve(acquisition())).resolves.toBe('from-network');
    expect(store.records.get(recordKeyOf('com.example.world'))).toBe('from-network');
  });

  test('an existing cache passes through unchanged', () => {
    const cache = new AssetCache();

    expect(AssetCache.from(cache)).toBe(cache);
  });

  test('a typed route wins over the default for the types it claims', () => {
    const typed = new CacheRoute({ types: ['config'], policy: new NetworkOnlyPolicy() });
    const cache = new AssetCache({ routes: [typed] });

    expect(cache.routeFor('config')).toBe(typed);
    expect(cache.routeFor('com.example.world')).not.toBe(typed);
  });

  test('the first matching route wins, so declaration order is the precedence', () => {
    const first = new CacheRoute({ types: ['config'] });
    const second = new CacheRoute({ types: ['config'] });
    const cache = new AssetCache({ routes: [first, second] });

    expect(cache.routeFor('config')).toBe(first);
  });

  test('a route without types claims everything from its position onwards', () => {
    const catchAll = new CacheRoute({});
    const cache = new AssetCache({ routes: [catchAll] });

    expect(cache.routeFor('anything')).toBe(catchAll);
    expect(cache.routeFor('com.example.world')).toBe(catchAll);
  });

  test('a namespace no route claims falls to the default route', () => {
    const cache = new AssetCache({ routes: [new CacheRoute({ types: ['config'] })] });

    expect(cache.routeFor('com.example.world')).toBe(cache.routeFor('com.example.other'));
  });
});

describe('multi-store reads', () => {
  let first: CacheStoreDouble;
  let second: CacheStoreDouble;

  beforeEach(() => {
    first = createCacheStoreDouble('first');
    second = createCacheStoreDouble('second');
  });

  test('are consulted in the configured order, and stop at the first hit', async () => {
    const cache = new AssetCache({ read: [first, second], write: [] });

    await first.set({ namespace: 'com.example.world', source: sourceKey, version: 1, record: 'value' }, 'from-first');
    await second.set({ namespace: 'com.example.world', source: sourceKey, version: 1, record: 'value' }, 'from-second');
    first.get.mockClear();
    second.get.mockClear();

    await expect(cache.resolve(acquisition())).resolves.toBe('from-first');
    expect(first.get).toHaveBeenCalledTimes(1);
    expect(second.get).not.toHaveBeenCalled();
  });

  test('a miss in an earlier store falls through to the later one', async () => {
    const cache = new AssetCache({ read: [first, second], write: [] });

    await second.set({ namespace: 'com.example.world', source: sourceKey, version: 1, record: 'value' }, 'from-second');

    await expect(cache.resolve(acquisition())).resolves.toBe('from-second');
  });

  test('a failing store does not hide a healthy one behind it, but is still reported', async () => {
    const reported: AssetCacheError[] = [];
    const cache = new AssetCache({ read: [first, second], write: [] });

    first.get.mockRejectedValueOnce(new Error('first is broken'));
    await second.set({ namespace: 'com.example.world', source: sourceKey, version: 1, record: 'value' }, 'from-second');

    await expect(cache.resolve(acquisition({ report: error => reported.push(error) }))).resolves.toBe('from-second');
    expect(reported).toHaveLength(1);
    expect(reported[0]!.operation).toBe('read');
  });

  test('a read where every store missed but one failed is a failure, not a miss', async () => {
    const policy = new CacheFirstPolicy();
    const cache = new AssetCache({ policy, read: [first, second], write: [] });
    const reported: AssetCacheError[] = [];

    first.get.mockRejectedValueOnce(new Error('first is broken'));

    // Cache-first degrades it, which is what keeps the load alive - but the
    // failure still reached the diagnostics, which is what keeps it visible.
    await expect(cache.resolve(acquisition({ report: error => reported.push(error) }))).resolves.toBe('from-network');
    expect(reported).toHaveLength(1);
  });
});

describe('writes', () => {
  test('go to every write store', async () => {
    const first = createCacheStoreDouble('first');
    const second = createCacheStoreDouble('second');
    const cache = new AssetCache({ read: [], write: [first, second] });

    await cache.resolve(acquisition());

    expect(first.records.get(recordKeyOf('com.example.world'))).toBe('from-network');
    expect(second.records.get(recordKeyOf('com.example.world'))).toBe('from-network');
  });

  test('a store may be read without being written', async () => {
    const readOnly = createCacheStoreDouble('shipped');
    const cache = new AssetCache({ read: [readOnly], write: [] });

    await cache.resolve(acquisition());

    expect(readOnly.set).not.toHaveBeenCalled();
  });

  test('every store is attempted even when an earlier one refuses', async () => {
    const failing = createCacheStoreDouble('failing');
    const healthy = createCacheStoreDouble('healthy');
    const reported: AssetCacheError[] = [];
    const cache = new AssetCache({ read: [], write: [failing, healthy] });

    failing.set.mockRejectedValueOnce(new Error('quota exceeded'));

    await cache.resolve(acquisition({ report: error => reported.push(error) }));

    expect(healthy.records.get(recordKeyOf('com.example.world'))).toBe('from-network');
    expect(reported).toHaveLength(1);
  });

  test('a cancelled acquisition writes nothing', async () => {
    const store = createCacheStoreDouble();
    const controller = new AbortController();
    const cache = new AssetCache({ stores: store });

    controller.abort();

    await cache.resolve(acquisition({ signal: controller.signal }));

    expect(store.set).not.toHaveBeenCalled();
  });
});

describe('promotion', () => {
  test('copies a later hit into the earlier writable store when asked', async () => {
    const memory = new MemoryCacheStore();
    const persistent = createCacheStoreDouble('persistent');
    const key = { namespace: 'com.example.world', source: sourceKey, version: 1, record: 'value' };
    const cache = new AssetCache({ read: [memory, persistent], write: [memory, persistent], promote: true });

    await persistent.set(key, 'from-persistent');

    await expect(cache.resolve(acquisition())).resolves.toBe('from-persistent');
    await expect(memory.get(key)).resolves.toEqual({ hit: true, value: 'from-persistent' });
  });

  test('is off unless asked for', async () => {
    const memory = new MemoryCacheStore();
    const persistent = createCacheStoreDouble('persistent');
    const key = { namespace: 'com.example.world', source: sourceKey, version: 1, record: 'value' };
    const cache = new AssetCache({ read: [memory, persistent], write: [memory, persistent] });

    await persistent.set(key, 'from-persistent');

    await expect(cache.resolve(acquisition())).resolves.toBe('from-persistent');
    await expect(memory.get(key)).resolves.toEqual({ hit: false });
  });

  test('does not write into a store the route only reads', async () => {
    const readOnly = createCacheStoreDouble('shipped');
    const persistent = createCacheStoreDouble('persistent');
    const key = { namespace: 'com.example.world', source: sourceKey, version: 1, record: 'value' };
    const cache = new AssetCache({ read: [readOnly, persistent], write: [persistent], promote: true });

    await persistent.set(key, 'from-persistent');
    readOnly.set.mockClear();

    await expect(cache.resolve(acquisition())).resolves.toBe('from-persistent');
    expect(readOnly.set).not.toHaveBeenCalled();
  });

  test('a failed promotion does not fail the read it came from', async () => {
    const memory = createCacheStoreDouble('memory');
    const persistent = createCacheStoreDouble('persistent');
    const key = { namespace: 'com.example.world', source: sourceKey, version: 1, record: 'value' };
    const reported: AssetCacheError[] = [];
    const cache = new AssetCache({ read: [memory, persistent], write: [memory, persistent], promote: true });

    await persistent.set(key, 'from-persistent');
    memory.set.mockRejectedValueOnce(new Error('promotion refused'));

    await expect(cache.resolve(acquisition({ report: error => reported.push(error) }))).resolves.toBe('from-persistent');
    expect(reported).toHaveLength(1);
  });
});

describe('record identity', () => {
  test('two asset types over one source key do not share a record', async () => {
    const store = createCacheStoreDouble();
    const cache = new AssetCache({ stores: store });

    await cache.resolve(acquisition({ namespace: 'type.a', fetch: () => Promise.resolve('a-representation') }));
    await cache.resolve(acquisition({ namespace: 'type.b', fetch: () => Promise.resolve('b-representation') }));

    expect(store.records.get(recordKeyOf('type.a'))).toBe('a-representation');
    expect(store.records.get(recordKeyOf('type.b'))).toBe('b-representation');
  });

  test('one asset type and source key share a record whatever the resource looks like', async () => {
    // Two resources may differ only in how one download is interpreted. That
    // splits the ResourceKey, never the SourceKey - and the cache is keyed by
    // the second, so the download is persisted once.
    const store = createCacheStoreDouble();
    const cache = new AssetCache({ stores: store });
    const fetch = vi.fn(() => Promise.resolve('from-network'));

    await cache.resolve(acquisition({ fetch }));
    await cache.resolve(acquisition({ fetch }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.records.size).toBe(1);
  });

  test('a raised layout version misses rather than decoding the old representation', async () => {
    const store = createCacheStoreDouble();
    const cache = new AssetCache({ stores: store });

    await cache.resolve(acquisition({ fetch: () => Promise.resolve('v1-representation') }));

    await expect(cache.resolve(acquisition({ layout: SingleEntryLayout.version<string>(2), fetch: () => Promise.resolve('v2-representation') }))).resolves.toBe(
      'v2-representation',
    );

    expect(store.records.get(recordKeyOf('com.example.world', 1))).toBe('v1-representation');
    expect(store.records.get(recordKeyOf('com.example.world', 2))).toBe('v2-representation');
  });
});

describe('what a policy is given', () => {
  test('is the acquisition identity plus read, fetch and write', async () => {
    // The typed surface is what actually constrains a policy, and that is
    // asserted in test/type-tests/cache-seams.type-test.ts. This holds the
    // runtime half: everything the contract promises is really there.
    const { policy, contexts } = createRecordingPolicy();
    const cache = new AssetCache({ policy, stores: createCacheStoreDouble() });

    await cache.resolve(acquisition({ namespace: 'type.a' }));

    expect(contexts[0]!.namespace).toBe('type.a');
    expect(contexts[0]!.sourceKey).toBe(sourceKey);
    expect(typeof contexts[0]!.read).toBe('function');
    expect(typeof contexts[0]!.fetch).toBe('function');
    expect(typeof contexts[0]!.write).toBe('function');
  });
});

describe('clear', () => {
  test('drops one namespace across every store the cache knows', async () => {
    const routed = createCacheStoreDouble('routed');
    const fallback = createCacheStoreDouble('fallback');
    const cache = new AssetCache({ routes: [new CacheRoute({ types: ['type.a'], stores: routed })], stores: fallback });

    await cache.resolve(acquisition({ namespace: 'type.a' }));
    await cache.resolve(acquisition({ namespace: 'type.b' }));

    await cache.clear('type.a');

    expect(routed.records.size).toBe(0);
    expect(fallback.records.size).toBe(1);
  });

  test('destroys every store exactly once', () => {
    const shared = createCacheStoreDouble('shared');
    const cache = new AssetCache({ routes: [new CacheRoute({ types: ['type.a'], stores: shared })], stores: shared });

    cache.destroy();

    expect(shared.destroy).toHaveBeenCalledTimes(1);
  });
});
