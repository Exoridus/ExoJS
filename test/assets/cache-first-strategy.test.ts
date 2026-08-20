import { AssetCacheError } from '#assets/AssetCacheError';
import { CacheFirstStrategy } from '#assets/CacheFirstStrategy';
import type { CacheStore } from '#assets/CacheStore';
import type { CacheRequest } from '#assets/CacheStrategy';

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

  test('a quota-exceeded (or otherwise failing) store.save does not fail the load', async () => {
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

  describe('cache-write diagnostics', () => {
    test('a degraded store.save is reported to the request sink instead of vanishing', async () => {
      const saveError = Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
      const store = makeStore({ save: vi.fn(async () => Promise.reject(saveError)) });
      const response = { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
      global.fetch = vi.fn(async () => response) as unknown as typeof fetch;

      const factory = {
        storageName: 'test',
        process: vi.fn(async () => 'processed'),
        create: vi.fn(async (source: unknown) => `resource:${String(source)}`),
        destroy: vi.fn(),
      };

      const strategy = new CacheFirstStrategy();
      const reported: AssetCacheError[] = [];
      const reportCacheError = (error: AssetCacheError): void => void reported.push(error);

      await expect(strategy.resolve(makeRequest({ factory, reportCacheError }), [store])).resolves.toBe('resource:processed');

      expect(reported).toHaveLength(1);
      expect(reported[0]).toBeInstanceOf(AssetCacheError);
      expect(reported[0]!.operation).toBe('save');
      expect(reported[0]!.store).toBe('test');
      expect(reported[0]!.key).toBe('alias');
      expect(reported[0]!.cause).toBe(saveError);
    });

    test('an already-typed AssetCacheError from a store is forwarded unchanged', async () => {
      const saveError = new AssetCacheError({ operation: 'save', store: 'test', key: 'alias', message: 'store said no' });
      const store = makeStore({ save: vi.fn(async () => Promise.reject(saveError)) });
      const response = { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
      global.fetch = vi.fn(async () => response) as unknown as typeof fetch;

      const factory = {
        storageName: 'test',
        process: vi.fn(async () => 'processed'),
        create: vi.fn(async () => 'resource'),
        destroy: vi.fn(),
      };

      const strategy = new CacheFirstStrategy();
      const reported: AssetCacheError[] = [];
      const reportCacheError = (error: AssetCacheError): void => void reported.push(error);

      await strategy.resolve(makeRequest({ factory, reportCacheError }), [store]);

      expect(reported[0]).toBe(saveError);
    });

    test('every store is still attempted after one of them fails to save', async () => {
      const failing = makeStore({ save: vi.fn(async () => Promise.reject(new Error('quota exceeded'))) });
      const healthy = makeStore();
      const response = { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
      global.fetch = vi.fn(async () => response) as unknown as typeof fetch;

      const factory = {
        storageName: 'test',
        process: vi.fn(async () => 'processed'),
        create: vi.fn(async () => 'resource'),
        destroy: vi.fn(),
      };

      const strategy = new CacheFirstStrategy();
      const reported: AssetCacheError[] = [];
      const reportCacheError = (error: AssetCacheError): void => void reported.push(error);

      await strategy.resolve(makeRequest({ factory, reportCacheError }), [failing, healthy]);

      expect(healthy.save).toHaveBeenCalledWith('test', 'alias', 'processed');
      expect(reported).toHaveLength(1);
    });

    test('discarding a corrupt entry is reported even when the eviction succeeds', async () => {
      const corruptError = new Error('corrupt-cache');
      const store = makeStore({ load: vi.fn(async () => 'corrupt-source') });
      const response = { ok: true, status: 200, statusText: 'OK' } as unknown as Response;
      global.fetch = vi.fn(async () => response) as unknown as typeof fetch;

      const factory = {
        storageName: 'test',
        process: vi.fn(async () => 'fresh-source'),
        create: vi
          .fn()
          .mockImplementationOnce(async () => {
            throw corruptError;
          })
          .mockImplementationOnce(async (source: unknown) => `resource:${String(source)}`),
        destroy: vi.fn(),
      };

      const strategy = new CacheFirstStrategy();
      const reported: AssetCacheError[] = [];
      const reportCacheError = (error: AssetCacheError): void => void reported.push(error);

      await expect(strategy.resolve(makeRequest({ factory, reportCacheError }), [store])).resolves.toBe('resource:fresh-source');

      // A store that reliably serves corrupt entries and deletes them cleanly
      // was previously invisible - the discard is the evidence of corruption.
      expect(store.delete).toHaveBeenCalledWith('test', 'alias');
      expect(reported).toHaveLength(1);
      expect(reported[0]!.operation).toBe('load');
      expect(reported[0]!.store).toBe('test');
      expect(reported[0]!.key).toBe('alias');
      expect(reported[0]!.cause).toBe(corruptError);
    });

    test('a failing eviction of a corrupt entry is reported and still falls through to the network', async () => {
      const deleteError = new Error('delete failed');
      const store = makeStore({
        load: vi.fn(async () => 'corrupt-source'),
        delete: vi.fn(async () => Promise.reject(deleteError)),
      });
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
      const reported: AssetCacheError[] = [];
      const reportCacheError = (error: AssetCacheError): void => void reported.push(error);

      await expect(strategy.resolve(makeRequest({ factory, reportCacheError }), [store])).resolves.toBe('resource:fresh-source');

      expect(reported.map(error => error.operation)).toContain('delete');
      expect(reported.find(error => error.operation === 'delete')!.cause).toBe(deleteError);
    });

    test('a request without a diagnostic sink still degrades instead of throwing', async () => {
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

      // `reportCacheError` is optional - omitting it must not turn a degraded
      // cache write into a failed load.
      await expect(strategy.resolve(makeRequest({ factory }), [store])).resolves.toBe('resource:processed');
    });

    test('a failing store.load is reported and the next store is still consulted', async () => {
      const loadError = new Error('read failed');
      const failing = makeStore({ load: vi.fn(async () => Promise.reject(loadError)) });
      const hitting = makeStore({ load: vi.fn(async () => 'cached-source') });
      global.fetch = vi.fn() as unknown as typeof fetch;

      const factory = {
        storageName: 'test',
        process: vi.fn(),
        create: vi.fn(async (source: unknown) => `resource:${String(source)}`),
        destroy: vi.fn(),
      };

      const strategy = new CacheFirstStrategy();
      const reported: AssetCacheError[] = [];
      const reportCacheError = (error: AssetCacheError): void => void reported.push(error);

      await expect(strategy.resolve(makeRequest({ factory, reportCacheError }), [failing, hitting])).resolves.toBe('resource:cached-source');

      expect(reported).toHaveLength(1);
      expect(reported[0]!.operation).toBe('load');
      expect(reported[0]!.cause).toBe(loadError);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
