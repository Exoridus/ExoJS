import { AssetCache } from '#assets/AssetCache';
import { AssetCacheMissError } from '#assets/AssetCacheMissError';
import { CacheFirstPolicy, CacheOnlyPolicy, NetworkOnlyPolicy } from '#assets/cachePolicies';
import type { CachePolicy } from '#assets/CachePolicy';
import type { CachePolicyResolutionContext, CachePolicyResolver } from '#assets/CachePolicyResolver';
import { CacheRoute } from '#assets/CacheRoute';
import { ConnectivityPolicyResolver } from '#assets/ConnectivityPolicyResolver';
import { SingleEntryLayout } from '#assets/SingleEntryLayout';
import { Connectivity, unrestrictedNetwork } from '#core/Connectivity';
import type { NetworkHint, NetworkHintSource, PlatformSubscription } from '#platform/PlatformAdapter';

import { createCacheStoreDouble } from './cache-test-doubles';

/** A hint source a test drives directly. */
const hintSource = (initial: NetworkHint = 'online') => {
  const listeners = new Set<(hint: NetworkHint) => void>();
  let current = initial;

  const source: NetworkHintSource = {
    get networkHint(): NetworkHint {
      return current;
    },
    onNetworkHintChange(listener: (hint: NetworkHint) => void): PlatformSubscription {
      listeners.add(listener);

      return () => void listeners.delete(listener);
    },
  };

  return {
    source,
    emit(hint: NetworkHint): void {
      current = hint;

      for (const listener of [...listeners]) {
        listener(hint);
      }
    },
  };
};

/**
 * Drives one acquisition through `cache`, the way the loader does: the
 * connectivity facts are read once, here, and travel as a value.
 */
const acquire = (
  cache: AssetCache,
  source = 'url:/a.txt',
  fetch: () => Promise<string> = () => Promise.resolve('fresh'),
  connectivity?: Connectivity,
): Promise<string> => {
  return cache.resolve<string>({
    namespace: 'text',
    sourceKey: source,
    layout: SingleEntryLayout.version<string>(1),
    network: connectivity?.snapshot() ?? unrestrictedNetwork,
    fetch,
    report: () => undefined,
  });
};

describe('a route resolves its policy per acquisition', () => {
  test('a fixed policy is used as-is', async () => {
    const cache = new AssetCache({ policy: new NetworkOnlyPolicy() });

    await expect(acquire(cache)).resolves.toBe('fresh');
  });

  test('a resolver is asked once per acquisition, with the namespace and source key', async () => {
    const seen: CachePolicyResolutionContext[] = [];
    const resolver: CachePolicyResolver = {
      policyFor: context => {
        seen.push(context);

        return new NetworkOnlyPolicy();
      },
    };
    const cache = new AssetCache({ policy: resolver });

    await acquire(cache, 'url:/a.txt');
    await acquire(cache, 'url:/b.txt');

    expect(seen).toEqual([
      { namespace: 'text', sourceKey: 'url:/a.txt', network: unrestrictedNetwork },
      { namespace: 'text', sourceKey: 'url:/b.txt', network: unrestrictedNetwork },
    ]);
  });

  test('a route with a resolver and one with a fixed policy coexist, chosen by asset type', async () => {
    const store = createCacheStoreDouble();
    const cache = new AssetCache({
      stores: store,
      routes: [new CacheRoute({ types: ['config'], policy: { policyFor: () => new NetworkOnlyPolicy() } as CachePolicyResolver, stores: store })],
    });

    await cache.resolve<string>({
      namespace: 'config',
      sourceKey: 'url:/settings.json',
      layout: SingleEntryLayout.version<string>(1),
      network: unrestrictedNetwork,
      fetch: () => Promise.resolve('fresh'),
      report: () => undefined,
    });

    // NetworkOnly writes nothing, so the config route left the store empty
    // while the default route would have filled it.
    expect(store.set).not.toHaveBeenCalled();

    await acquire(cache);

    expect(store.set).toHaveBeenCalledTimes(1);
  });

  test('the answer is fixed for the whole acquisition, whatever changes underneath it', async () => {
    const host = hintSource('online');
    const connectivity = new Connectivity(host.source);
    const store = createCacheStoreDouble();
    const cache = new AssetCache({ stores: store, policy: new ConnectivityPolicyResolver() });

    let release: (() => void) | undefined;
    const started = new Promise<void>(resolve => {
      release = resolve;
    });

    const pending = acquire(
      cache,
      'url:/slow.txt',
      async () => {
        release!();
        // The application goes offline WHILE this request is in flight.
        connectivity.mode = 'offline';

        return 'fresh';
      },
      connectivity,
    );

    await started;

    // The running request keeps the contract it started under.
    await expect(pending).resolves.toBe('fresh');

    // The next one resolves again, and now sees the offline mode.
    await expect(acquire(cache, 'url:/other.txt', undefined, connectivity)).rejects.toBeInstanceOf(AssetCacheMissError);
  });
});

describe('ConnectivityPolicyResolver', () => {
  const setup = (hint: NetworkHint) => {
    const host = hintSource(hint);
    const connectivity = new Connectivity(host.source);
    const store = createCacheStoreDouble();
    const cache = new AssetCache({ stores: store, policy: new ConnectivityPolicyResolver() });

    return { host, connectivity, store, cache };
  };

  test('an online host acquires and fills the cache', async () => {
    const { cache, store, connectivity } = setup('online');

    await expect(acquire(cache, undefined, undefined, connectivity)).resolves.toBe('fresh');
    expect(store.set).toHaveBeenCalledTimes(1);
  });

  test('an unknown host still acquires - nothing said the network is gone', async () => {
    const { cache, connectivity } = setup('unknown');

    await expect(acquire(cache, undefined, undefined, connectivity)).resolves.toBe('fresh');
  });

  test('an offline host serves a cached record without touching the network', async () => {
    const { cache, host, connectivity } = setup('online');
    const fetch = vi.fn(() => Promise.resolve('fresh'));

    await acquire(cache, 'url:/a.txt', fetch, connectivity);
    host.emit('offline');
    fetch.mockClear();

    await expect(acquire(cache, 'url:/a.txt', fetch, connectivity)).resolves.toBe('fresh');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('an offline host misses loudly for a record nobody cached, and never fetches', async () => {
    const { cache, host, connectivity } = setup('online');
    const fetch = vi.fn(() => Promise.resolve('fresh'));

    host.emit('offline');

    await expect(acquire(cache, 'url:/missing.txt', fetch, connectivity)).rejects.toBeInstanceOf(AssetCacheMissError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('an explicit offline mode is hard, even while the host reports online', async () => {
    const { cache, connectivity } = setup('online');
    const fetch = vi.fn(() => Promise.resolve('fresh'));

    connectivity.mode = 'offline';

    await expect(acquire(cache, 'url:/missing.txt', fetch, connectivity)).rejects.toBeInstanceOf(AssetCacheMissError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('an explicit online mode acquires even while the host reports offline', async () => {
    const { cache, connectivity } = setup('offline');

    connectivity.mode = 'online';

    await expect(acquire(cache, undefined, undefined, connectivity)).resolves.toBe('fresh');
  });

  test('the two policies it chooses between are configurable', async () => {
    const host = hintSource('offline');
    const connectivity = new Connectivity(host.source);
    const offline: CachePolicy = { resolve: () => Promise.resolve('from the shipped cache' as never) };
    const cache = new AssetCache({ policy: new ConnectivityPolicyResolver({ online: new CacheFirstPolicy(), offline }) });

    await expect(acquire(cache, undefined, undefined, connectivity)).resolves.toBe('from the shipped cache');
  });

  test('its default offline policy is cache-only', () => {
    const connectivity = new Connectivity(hintSource('offline').source);
    const resolver = new ConnectivityPolicyResolver();

    expect(resolver.policyFor({ namespace: 'text', sourceKey: 'url:/a.txt', network: connectivity.snapshot() })).toBeInstanceOf(CacheOnlyPolicy);
  });

  test('it holds no connectivity, so one resolver serves applications that disagree', () => {
    const resolver = new ConnectivityPolicyResolver();
    const offlineApp = new Connectivity(hintSource('offline').source);
    const onlineApp = new Connectivity(hintSource('online').source);
    const context = { namespace: 'text', sourceKey: 'url:/a.txt' };

    expect(resolver.policyFor({ ...context, network: offlineApp.snapshot() })).toBeInstanceOf(CacheOnlyPolicy);
    expect(resolver.policyFor({ ...context, network: onlineApp.snapshot() })).toBeInstanceOf(CacheFirstPolicy);
  });
});
