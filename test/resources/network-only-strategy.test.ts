import type { CacheStore } from '#resources/CacheStore';
import type { CacheRequest } from '#resources/CacheStrategy';
import { NetworkOnlyStrategy } from '#resources/NetworkOnlyStrategy';

function makeStore(): CacheStore {
  return {
    load: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('NetworkOnlyStrategy', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('fetches from the network and builds the resource via factory.process/create, ignoring stores', async () => {
    const response = { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
    const fetchSpy = vi.fn(async () => response);
    global.fetch = fetchSpy as unknown as typeof fetch;

    const factory = {
      storageName: 'test',
      process: vi.fn(async () => 'processed'),
      create: vi.fn(async () => 'created'),
      destroy: vi.fn(),
    };

    const store = makeStore();
    const stores: readonly CacheStore[] = [store];

    const request: CacheRequest = {
      storageName: 'test',
      key: 'alias',
      url: 'https://example.com/a.json',
      requestOptions: {},
      factory,
      options: { foo: 'bar' },
    };

    const strategy = new NetworkOnlyStrategy();
    const result = await strategy.resolve(request, stores);

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/a.json', {});
    expect(factory.process).toHaveBeenCalledWith(response);
    expect(factory.create).toHaveBeenCalledWith('processed', { foo: 'bar' });
    expect(result).toBe('created');

    // Stores are accepted but never touched.
    expect(store.load).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  test('throws a descriptive error when the response is not ok', async () => {
    const response = { ok: false, status: 404, statusText: 'Not Found' } as unknown as Response;
    global.fetch = vi.fn(async () => response) as unknown as typeof fetch;

    const factory = {
      storageName: 'test',
      process: vi.fn(),
      create: vi.fn(),
      destroy: vi.fn(),
    };

    const request: CacheRequest = {
      storageName: 'test',
      key: 'alias',
      url: 'https://example.com/missing.json',
      requestOptions: {},
      factory,
    };

    const strategy = new NetworkOnlyStrategy();

    await expect(strategy.resolve(request, [])).rejects.toThrow('Failed to fetch "https://example.com/missing.json" (404 Not Found).');
    expect(factory.process).not.toHaveBeenCalled();
    expect(factory.create).not.toHaveBeenCalled();
  });
});
