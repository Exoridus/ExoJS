/**
 * Network failures of the built-in cache policies must be diagnosable.
 *
 * A flat `Error` collapses three very different situations into one string:
 * the server answered 404, the request never left the machine (offline, DNS,
 * CORS, TLS), and the load was cancelled. `AssetNetworkError` keeps the URL and
 * the HTTP status structured - `status === null` being the marker that no
 * response arrived - and carries the original rejection as `cause`, while a
 * cancellation stays an untouched `AbortError` because the residency dispatches
 * on that name.
 */

import { AssetCache, type CacheAcquisition } from '#assets/AssetCache';
import { AssetNetworkError } from '#assets/AssetNetworkError';
import { CacheFirstPolicy, NetworkFirstPolicy, NetworkOnlyPolicy } from '#assets/cachePolicies';
import type { CachePolicy } from '#assets/CachePolicy';
import { fetchAsset } from '#assets/fetchAsset';
import { SingleEntryLayout } from '#assets/SingleEntryLayout';

import { createCacheStoreDouble } from './cache-test-doubles';

/**
 * Resolve one acquisition of `url` through `policy`, against a store that never
 * holds the asset - so every policy with a network leg reaches it.
 */
function acquire(policy: CachePolicy, url: string): Promise<string> {
  const cache = new AssetCache({ policy, stores: createCacheStoreDouble() });
  const acquisition: CacheAcquisition<string> = {
    namespace: 'test',
    sourceKey: `url:${url}`,
    layout: SingleEntryLayout.version<string>(1),
    fetch: async () => (await fetchAsset(url, {})).text(),
    report: () => undefined,
  };

  return cache.resolve(acquisition);
}

const policies: ReadonlyArray<readonly [string, () => CachePolicy]> = [
  ['CacheFirstPolicy', () => new CacheFirstPolicy()],
  ['NetworkFirstPolicy', () => new NetworkFirstPolicy()],
  ['NetworkOnlyPolicy', () => new NetworkOnlyPolicy()],
];

describe.each(policies)('%s network failures', (_name, makePolicy) => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('an error status rejects with an AssetNetworkError carrying url and status', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' }) as unknown as Response) as unknown as typeof fetch;

    const error = await acquire(makePolicy(), 'https://example.com/missing.json').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AssetNetworkError);

    const networkError = error as AssetNetworkError;

    expect(networkError.url).toBe('https://example.com/missing.json');
    expect(networkError.status).toBe(404);
    expect(networkError.statusText).toBe('Not Found');
    // The pre-existing wording is kept so message-only logs read the same.
    expect(networkError.message).toBe('Failed to fetch "https://example.com/missing.json" (404 Not Found).');
  });

  test('a transport failure rejects with an AssetNetworkError carrying the original rejection as cause', async () => {
    const transportFailure = new TypeError('Failed to fetch');

    global.fetch = vi.fn(async () => Promise.reject(transportFailure)) as unknown as typeof fetch;

    const error = await acquire(makePolicy(), 'https://example.com/offline.json').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AssetNetworkError);

    const networkError = error as AssetNetworkError;

    expect(networkError.url).toBe('https://example.com/offline.json');
    // No response arrived at all - that is what separates this from a 404.
    expect(networkError.status).toBeNull();
    expect(networkError.statusText).toBeNull();
    expect(networkError.cause).toBe(transportFailure);
    // A message-only log still names the concrete transport failure.
    expect(networkError.message).toBe('Failed to fetch "https://example.com/offline.json". (TypeError: Failed to fetch)');
  });

  test('a cancelled fetch rejects with the untouched AbortError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');

    global.fetch = vi.fn(async () => Promise.reject(abortError)) as unknown as typeof fetch;

    const error = await acquire(makePolicy(), 'https://example.com/cancelled.json').catch((reason: unknown) => reason);

    expect(error).toBe(abortError);
    expect(error).not.toBeInstanceOf(AssetNetworkError);
  });
});
