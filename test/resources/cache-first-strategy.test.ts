import { CacheFirstStrategy } from '#resources/CacheFirstStrategy';
import type { CacheStore } from '#resources/CacheStore';
import type { CacheRequest } from '#resources/CacheStrategy';

function makeStore(overrides: Partial<CacheStore> = {}): CacheStore {
  return {
    load: vi.fn(async (): Promise<unknown | null> => null),
    save: vi.fn(async (): Promise<void> => undefined),
    delete: vi.fn(async (): Promise<boolean> => true),
    clear: vi.fn(async (): Promise<boolean> => true),
    destroy: vi.fn(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<CacheRequest> & { factory: CacheRequest['factory'] }): CacheRequest {
  return {
    storageName: 'test',
    key: 'alias',
    url: 'https://example.com/a.json',
    requestOptions: {},
    ...overrides,
  };
}

describe('CacheFirstStrategy', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('a cache hit skips the network and resolves via factory.create on the cached value', async () => {
    const store = makeStore({ load: vi.fn(async () => 'cached-source') });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const factory = {
      storageName: 'test',
      process: vi.fn(),
      create: vi.fn(async (source: unknown) => `resource:${String(source)}`),
      destroy: vi.fn(),
    };

    const strategy = new CacheFirstStrategy();
    const result = await strategy.resolve(makeRequest({ factory }), [store]);

    expect(result).toBe('resource:cached-source');
    expect(factory.create).toHaveBeenCalledWith('cached-source', undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a corrupt cached entry (factory.create throws) is deleted and the strategy falls through to the network', async () => {
    const store = makeStore({ load: vi.fn(async () => 'corrupt-source') });
    const response = { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
    global.fetch = vi.fn(async () => response) as unknown as typeof fetch;

    const factory = {
      storageName: 'test',
      process: vi.fn(async () => 'fresh-source'),
      create: vi
        .fn()
        .mockImplementationOnce(async () => {
          throw new Error('corrupt-cache');
        })
        .mockImplementationOnce(async (source: unknown) => `resource:${String(source)}`),
      destroy: vi.fn(),
    };

    const strategy = new CacheFirstStrategy();
    const result = await strategy.resolve(makeRequest({ factory }), [store]);

    expect(result).toBe('resource:fresh-source');
    expect(store.delete).toHaveBeenCalledWith('test', 'alias');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(factory.create).toHaveBeenCalledTimes(2);
    expect(store.save).toHaveBeenCalledWith('test', 'alias', 'fresh-source');
  });

  test('a cache miss fetches from the network, builds the resource, and persists the processed source to every store', async () => {
    const storeA = makeStore();
    const storeB = makeStore();
    const response = { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
    global.fetch = vi.fn(async () => response) as unknown as typeof fetch;

    const factory = {
      storageName: 'test',
      process: vi.fn(async () => 'processed'),
      create: vi.fn(async (source: unknown, options?: unknown) => ({ source, options })),
      destroy: vi.fn(),
    };

    const strategy = new CacheFirstStrategy();
    const result = await strategy.resolve(makeRequest({ factory, options: { scale: 2 } }), [storeA, storeB]);

    expect(factory.process).toHaveBeenCalledWith(response);
    expect(factory.create).toHaveBeenCalledWith('processed', { scale: 2 });
    expect(result).toEqual({ source: 'processed', options: { scale: 2 } });
    expect(storeA.save).toHaveBeenCalledWith('test', 'alias', 'processed');
    expect(storeB.save).toHaveBeenCalledWith('test', 'alias', 'processed');
  });

  test('throws a descriptive error when the network response is not ok', async () => {
    const response = { ok: false, status: 404, statusText: 'Not Found' } as unknown as Response;
    global.fetch = vi.fn(async () => response) as unknown as typeof fetch;

    const factory = { storageName: 'test', process: vi.fn(), create: vi.fn(), destroy: vi.fn() };
    const strategy = new CacheFirstStrategy();

    await expect(strategy.resolve(makeRequest({ factory, url: 'https://example.com/missing.json' }), [])).rejects.toThrow(
      'Failed to fetch "https://example.com/missing.json" (404 Not Found).',
    );
    expect(factory.process).not.toHaveBeenCalled();
    expect(factory.create).not.toHaveBeenCalled();
  });

  test('a quota-exceeded (or otherwise failing) store.save is swallowed silently', async () => {
    const store = makeStore({ save: vi.fn(async () => Promise.reject(new Error('quota exceeded'))) });
    const response = { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
    global.fetch = vi.fn(async () => response) as unknown as typeof fetch;

    const factory = {
      storageName: 'test',
      process: vi.fn(async () => 'processed'),
      create: vi.fn(async (source: unknown) => `resource:${String(source)}`),
      destroy: vi.fn(),
    };

    const strategy = new CacheFirstStrategy();

    await expect(strategy.resolve(makeRequest({ factory }), [store])).resolves.toBe('resource:processed');
  });
});
