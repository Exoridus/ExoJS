/**
 * Network failures of the built-in cache strategies must be diagnosable.
 *
 * A flat `Error` collapses three very different situations into one string:
 * the server answered 404, the request never left the machine (offline, DNS,
 * CORS, TLS), and the load was cancelled. `AssetNetworkError` keeps the URL and
 * the HTTP status structured — `status === null` being the marker that no
 * response arrived — and carries the original rejection as `cause`, while a
 * cancellation stays an untouched `AbortError` because the residency dispatches
 * on that name.
 */

import { AssetNetworkError } from '#assets/AssetNetworkError';
import { CacheFirstStrategy } from '#assets/CacheFirstStrategy';
import type { CacheStore } from '#assets/CacheStore';
import type { CacheRequest, CacheStrategy } from '#assets/CacheStrategy';
import { NetworkOnlyStrategy } from '#assets/NetworkOnlyStrategy';

const makeRequest = (url: string): CacheRequest => ({
  storageName: 'test',
  key: 'alias',
  url,
  requestOptions: {},
  factory: {
    process: vi.fn(async () => 'processed'),
    create: vi.fn(async () => 'created'),
  },
});

/** No store ever holds the asset, so `CacheFirstStrategy` always reaches the network. */
const missingStore = (): CacheStore => ({
  load: vi.fn(async (): Promise<unknown | null> => null),
  save: vi.fn(async (): Promise<void> => undefined),
  delete: vi.fn(async (): Promise<boolean> => true),
  clear: vi.fn(async (): Promise<boolean> => true),
  destroy: vi.fn(),
});

const strategies: ReadonlyArray<readonly [string, () => CacheStrategy, () => readonly CacheStore[]]> = [
  ['CacheFirstStrategy', () => new CacheFirstStrategy(), () => [missingStore()]],
  ['NetworkOnlyStrategy', () => new NetworkOnlyStrategy(), () => []],
];

describe.each(strategies)('%s network failures', (_name, makeStrategy, makeStores) => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('an error status rejects with an AssetNetworkError carrying url and status', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' }) as unknown as Response) as unknown as typeof fetch;

    const error = await makeStrategy()
      .resolve(makeRequest('https://example.com/missing.json'), makeStores())
      .catch((reason: unknown) => reason);

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

    const error = await makeStrategy()
      .resolve(makeRequest('https://example.com/offline.json'), makeStores())
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AssetNetworkError);

    const networkError = error as AssetNetworkError;

    expect(networkError.url).toBe('https://example.com/offline.json');
    // No response arrived at all — that is what separates this from a 404.
    expect(networkError.status).toBeNull();
    expect(networkError.statusText).toBeNull();
    expect(networkError.cause).toBe(transportFailure);
    // A message-only log still names the concrete transport failure.
    expect(networkError.message).toBe('Failed to fetch "https://example.com/offline.json". (TypeError: Failed to fetch)');
  });

  test('a cancelled fetch rejects with the untouched AbortError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');

    global.fetch = vi.fn(async () => Promise.reject(abortError)) as unknown as typeof fetch;

    const error = await makeStrategy()
      .resolve(makeRequest('https://example.com/cancelled.json'), makeStores())
      .catch((reason: unknown) => reason);

    expect(error).toBe(abortError);
    expect(error).not.toBeInstanceOf(AssetNetworkError);
  });
});
