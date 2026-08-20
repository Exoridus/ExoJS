/**
 * Routing of degraded cache failures from the cache strategy to `Loader.onCacheError`.
 *
 * A `CacheStrategy` is a stateless policy object and `options.cacheStrategy`
 * lets callers hand the same instance to several loaders. Diagnostics
 * therefore travel with the request rather than through a subscription on the
 * strategy: a per-instance signal would report every loader's failures to
 * every other loader, and would keep a destroyed loader reachable from a
 * strategy that outlives it.
 */

import { AssetCacheError } from '#assets/AssetCacheError';
import type { AssetDecoder } from '#assets/AssetDecoder';
import { CacheFirstStrategy } from '#assets/CacheFirstStrategy';
import type { CacheStore } from '#assets/CacheStore';
import { Loader } from '#assets/Loader';

const makeStore = (overrides: Partial<CacheStore> = {}): CacheStore => ({
  load: vi.fn(async (): Promise<unknown | null> => null),
  save: vi.fn(async (): Promise<void> => undefined),
  delete: vi.fn(async (): Promise<boolean> => true),
  clear: vi.fn(async (): Promise<boolean> => true),
  destroy: vi.fn(),
  ...overrides,
});

/** The loader's own decoder - the object that builds the request-scoped sink. */
const decoderOf = (loader: Loader): AssetDecoder => (loader as unknown as { _decoder: AssetDecoder })._decoder;

/** Drive one asset through the real cache-strategy path of `loader`. */
const fetchThrough = (loader: Loader, source: string): Promise<string> => decoderOf(loader)._contextFetch(source, 'text', async response => response.text());

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

  test('a degraded store.save reaches the loader that issued the request', async () => {
    const store = makeStore({ save: vi.fn(async () => Promise.reject(new Error('quota exceeded'))) });
    const loader = new Loader({ cache: [store] });
    const reported: AssetCacheError[] = [];

    loader.onCacheError.add(error => reported.push(error));

    await expect(fetchThrough(loader, 'a.txt')).resolves.toBe('payload');

    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(AssetCacheError);
    expect(reported[0]!.operation).toBe('save');
    expect(reported[0]!.key).toBe('a.txt');

    loader.destroy();
  });

  test('two loaders sharing one strategy instance do not receive each other errors', async () => {
    const sharedStrategy = new CacheFirstStrategy();
    const failingStore = makeStore({ save: vi.fn(async () => Promise.reject(new Error('quota exceeded'))) });
    const healthyStore = makeStore();

    const failingLoader = new Loader({ cache: [failingStore], cacheStrategy: sharedStrategy });
    const healthyLoader = new Loader({ cache: [healthyStore], cacheStrategy: sharedStrategy });

    const failingReports: AssetCacheError[] = [];
    const healthyReports: AssetCacheError[] = [];

    failingLoader.onCacheError.add(error => failingReports.push(error));
    healthyLoader.onCacheError.add(error => healthyReports.push(error));

    await fetchThrough(failingLoader, 'a.txt');
    await fetchThrough(healthyLoader, 'b.txt');
    await fetchThrough(failingLoader, 'c.txt');

    expect(failingReports.map(error => error.key)).toEqual(['a.txt', 'c.txt']);
    expect(healthyReports).toHaveLength(0);

    failingLoader.destroy();
    healthyLoader.destroy();
  });

  test('a destroyed loader stops receiving reports from a strategy that outlives it', async () => {
    const sharedStrategy = new CacheFirstStrategy();
    const store = makeStore({ save: vi.fn(async () => Promise.reject(new Error('quota exceeded'))) });

    const loader = new Loader({ cache: [store], cacheStrategy: sharedStrategy });
    const survivor = new Loader({ cache: [store], cacheStrategy: sharedStrategy });

    const reported: AssetCacheError[] = [];

    loader.onCacheError.add(error => reported.push(error));

    await fetchThrough(loader, 'a.txt');
    expect(reported).toHaveLength(1);

    loader.destroy();

    // The strategy is still live and still failing; the destroyed loader must
    // neither be notified nor throw when the shared strategy keeps working.
    await expect(fetchThrough(survivor, 'b.txt')).resolves.toBe('payload');
    expect(reported).toHaveLength(1);

    survivor.destroy();
  });

  test('the strategy exposes no per-instance subscription that could outlive a loader', () => {
    const strategy = new CacheFirstStrategy();

    // Structural guard for the decision above: nothing on the strategy holds
    // listeners, so there is no registration for `Loader.destroy()` to undo
    // and no way for one loader to be reachable from another loader's traffic.
    expect('onCacheError' in strategy).toBe(false);
  });
});
