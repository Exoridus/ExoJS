/**
 * Routing of degraded cache failures from the cache to `Loader.onCacheError`.
 *
 * A `CachePolicy` is a stateless policy object and an `AssetCache` may be
 * handed to several loaders. Diagnostics therefore travel with the acquisition
 * rather than through a subscription on either: a per-instance signal would
 * report every loader's failures to every other loader, and would keep a
 * destroyed loader reachable from a cache that outlives it.
 */

import type { AssetDecoder } from '#assets/AssetDecoder';
import { AssetCache } from '#assets/cache/AssetCache';
import { AssetCacheError } from '#assets/cache/AssetCacheError';
import { CacheFirstPolicy } from '#assets/cache/cachePolicies';
import { SingleEntryLayout } from '#assets/cache/SingleEntryLayout';
import { canonicalizeSource } from '#assets/canonicalKey';
import { Loader } from '#assets/Loader';

import { type CacheStoreDouble, createCacheStoreDouble } from './cache-test-doubles';

/** A store whose every write fails, the way an exhausted quota does. */
const createFullStore = (id = 'full'): CacheStoreDouble => {
  const store = createCacheStoreDouble(id);

  store.set.mockImplementation(() => Promise.reject(new Error('quota exceeded')));

  return store;
};

/** The loader's own decoder - the object that builds the acquisition-scoped sink. */
const decoderOf = (loader: Loader): AssetDecoder => (loader as unknown as { _decoder: AssetDecoder })._decoder;

/** Drive one acquisition through the real cache path of `loader`. */
const fetchThrough = (loader: Loader, source: string): Promise<string> =>
  decoderOf(loader)._acquire(source, 'text', SingleEntryLayout.version<string>(1), canonicalizeSource('', source), async response => response.text());

describe('Loader.onCacheError routing', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(
      async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'payload' }) as unknown as Response,
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('a degraded store write reaches the loader that issued the acquisition', async () => {
    const loader = new Loader({ cache: createFullStore() });
    const reported: AssetCacheError[] = [];

    loader.onCacheError.add(error => reported.push(error));

    await expect(fetchThrough(loader, 'a.txt')).resolves.toBe('payload');

    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(AssetCacheError);
    expect(reported[0]!.operation).toBe('write');
    expect(reported[0]!.store).toBe('text');

    loader.destroy();
  });

  test('two loaders sharing one policy instance do not receive each other errors', async () => {
    const sharedPolicy = new CacheFirstPolicy();
    const failingLoader = new Loader({ cache: new AssetCache({ policy: sharedPolicy, stores: createFullStore() }) });
    const healthyLoader = new Loader({ cache: new AssetCache({ policy: sharedPolicy, stores: createCacheStoreDouble('healthy') }) });

    const failingReports: AssetCacheError[] = [];
    const healthyReports: AssetCacheError[] = [];

    failingLoader.onCacheError.add(error => failingReports.push(error));
    healthyLoader.onCacheError.add(error => healthyReports.push(error));

    await fetchThrough(failingLoader, 'a.txt');
    await fetchThrough(healthyLoader, 'b.txt');
    await fetchThrough(failingLoader, 'c.txt');

    expect(failingReports).toHaveLength(2);
    expect(healthyReports).toHaveLength(0);

    failingLoader.destroy();
    healthyLoader.destroy();
  });

  test('a destroyed loader stops receiving reports from a cache that outlives it', async () => {
    const shared = new AssetCache({ policy: new CacheFirstPolicy(), stores: createFullStore() });
    const loader = new Loader({ cache: shared });
    const survivor = new Loader({ cache: shared });

    const reported: AssetCacheError[] = [];

    loader.onCacheError.add(error => reported.push(error));

    await fetchThrough(loader, 'a.txt');
    expect(reported).toHaveLength(1);

    loader.destroy();

    // The cache is still live and still failing; the destroyed loader must
    // neither be notified nor throw when the shared cache keeps working.
    await expect(fetchThrough(survivor, 'b.txt')).resolves.toBe('payload');
    expect(reported).toHaveLength(1);

    survivor.destroy();
  });

  test('a policy exposes no per-instance subscription that could outlive a loader', () => {
    const policy = new CacheFirstPolicy();

    // Structural guard for the decision above: nothing on the policy holds
    // listeners, so there is no registration for `Loader.destroy()` to undo
    // and no way for one loader to be reachable from another loader's traffic.
    expect('onCacheError' in policy).toBe(false);
  });
});
