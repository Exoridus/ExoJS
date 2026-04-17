import { Loader } from 'resources/Loader';
import { Json, TextAsset } from 'resources/tokens';
import type { AssetFactory } from 'resources/AssetFactory';
import type { CacheStore } from 'resources/CacheStore';

class MockTextFactory implements AssetFactory<string> {
    public readonly storageName = 'text';
    public readonly process = jest.fn(async (_response: Response): Promise<string> => 'fresh-source');
    public readonly create = jest.fn(async (source: string): Promise<string> => `resource:${source}`);

    public destroy(): void {}
}

class DummyAsset {
    constructor(public readonly value: string) {}
}

class DummyFactory implements AssetFactory<DummyAsset> {
    public readonly storageName = 'dummy';
    public readonly process = jest.fn(async (response: Response): Promise<string> => 'raw');
    public readonly create = jest.fn(async (source: string): Promise<DummyAsset> => new DummyAsset(source));

    public destroy(): void {}
}

class InstanceFactory<T> implements AssetFactory<T> {
    public readonly storageName = 'instance';
    public readonly process = jest.fn(async (_response: Response): Promise<string> => 'raw');
    public readonly create: (source: string) => Promise<T>;

    public constructor(resource: T) {
        this.create = jest.fn(async (_source: string): Promise<T> => resource);
    }

    public destroy(): void {}
}

interface Deferred<T> {
    readonly promise: Promise<T>;
    resolve(value: T | PromiseLike<T>): void;
    reject(reason: unknown): void;
}

const createDeferred = <T>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
};

const createCacheStoreMock = (overrides: Partial<CacheStore> = {}): CacheStore => ({
    load: jest.fn(async (): Promise<unknown | null> => null),
    save: jest.fn(async (): Promise<void> => undefined),
    delete: jest.fn(async (): Promise<boolean> => true),
    clear: jest.fn(async (): Promise<boolean> => true),
    destroy: jest.fn(),
    ...overrides,
});

describe('Loader', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    const mockFetch = (body: string = ''): void => {
        global.fetch = jest.fn(async (): Promise<Response> => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => body,
            json: async () => ({}),
            arrayBuffer: async () => new ArrayBuffer(0),
        } as unknown as Response));
    };

    const mockFetch404 = (): void => {
        global.fetch = jest.fn(async (): Promise<Response> => ({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        } as Response));
    };

    test('load(Type, path) returns a single resource', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch();

        const result = await loader.load(TextAsset, 'demo.txt');

        expect(result).toBe('resource:fresh-source');
    });

    test('load(Type, [paths]) returns an array of resources', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch();

        const results = await loader.load(TextAsset, ['a.txt', 'b.txt']);

        expect(results).toHaveLength(2);
        expect(results[0]).toBe('resource:fresh-source');
        expect(results[1]).toBe('resource:fresh-source');
    });

    test('load(Type, { alias: path }) returns a record', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch();

        const result = await loader.load(TextAsset, { greeting: 'hello.txt', farewell: 'bye.txt' });

        expect(result.greeting).toBe('resource:fresh-source');
        expect(result.farewell).toBe('resource:fresh-source');
    });

    test('load() deduplicates concurrent requests for the same alias', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch();

        const [a, b] = await Promise.all([
            loader.load(TextAsset, 'same.txt'),
            loader.load(TextAsset, 'same.txt'),
        ]);

        expect(a).toBe(b);
        expect(factory.process).toHaveBeenCalledTimes(1);
    });

    test('throws on non-ok HTTP response', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch404();

        await expect(loader.load(TextAsset, 'missing.txt')).rejects.toThrow('404 Not Found');
    });

    test('load() continues independently per item (fail-tolerant via Promise.allSettled pattern)', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch();

        factory.create.mockImplementationOnce(async () => 'ok');
        factory.create.mockImplementationOnce(async () => { throw new Error('broken'); });

        const good = loader.load(TextAsset, 'good.txt');
        const bad = loader.load(TextAsset, 'bad.txt');

        await expect(good).resolves.toBe('ok');
        await expect(bad).rejects.toThrow('broken');
    });

    test('get() retrieves loaded resource, peek() returns null for missing', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch();

        expect(loader.peek(TextAsset, 'demo.txt')).toBeNull();
        expect(loader.has(TextAsset, 'demo.txt')).toBe(false);

        await loader.load(TextAsset, 'demo.txt');

        expect(loader.has(TextAsset, 'demo.txt')).toBe(true);
        expect(loader.get(TextAsset, 'demo.txt')).toBe('resource:fresh-source');
    });

    test('get() throws for missing resource', () => {
        const loader = new Loader({ resourcePath: '/' });

        expect(() => loader.get(TextAsset, 'nope')).toThrow('Missing resource');
    });

    test('add() registers aliases, load() resolves them', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch();

        loader.add(TextAsset, { greeting: 'hello.txt' });
        const result = await loader.load(TextAsset, 'greeting');

        expect(result).toBe('resource:fresh-source');
        expect(global.fetch).toHaveBeenCalledWith('/hello.txt', expect.anything());
    });

    test('unload() removes a resource, unloadAll() clears type', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch();

        await loader.load(TextAsset, { a: 'a.txt', b: 'b.txt' });

        expect(loader.has(TextAsset, 'a')).toBe(true);
        loader.unload(TextAsset, 'a');
        expect(loader.has(TextAsset, 'a')).toBe(false);
        expect(loader.has(TextAsset, 'b')).toBe(true);

        loader.unloadAll(TextAsset);
        expect(loader.has(TextAsset, 'b')).toBe(false);
    });

    test('custom factory via register() with user-defined class', async () => {
        const factory = new DummyFactory();
        const loader = new Loader({ resourcePath: '/' });

        loader.register(DummyAsset, factory);
        mockFetch();

        const result = await loader.load(DummyAsset, 'thing.dat');

        expect(result).toBeInstanceOf(DummyAsset);
        expect(result.value).toBe('raw');
    });

    test('reads from cache hit and skips network fetch', async () => {
        const factory = new MockTextFactory();
        const cacheStore = createCacheStoreMock({
            load: jest.fn(async (): Promise<string> => 'cached-source'),
        });
        const loader = new Loader({ resourcePath: '/', cache: cacheStore });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        global.fetch = jest.fn(async (): Promise<Response> => {
            throw new Error('Unexpected network fetch on cache hit.');
        });

        const result = await loader.load(TextAsset, 'cached.txt');

        expect(result).toBe('resource:cached-source');
        expect(cacheStore.load).toHaveBeenCalledWith('text', 'cached.txt');
        expect(cacheStore.save).not.toHaveBeenCalled();
        expect(cacheStore.delete).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('falls back to network and persists source when cache misses', async () => {
        const factory = new MockTextFactory();
        const cacheStore = createCacheStoreMock();
        const loader = new Loader({ resourcePath: '/', cache: cacheStore });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch();

        const result = await loader.load(TextAsset, 'miss.txt');

        expect(result).toBe('resource:fresh-source');
        expect(cacheStore.load).toHaveBeenCalledWith('text', 'miss.txt');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(cacheStore.save).toHaveBeenCalledWith('text', 'miss.txt', 'fresh-source');
    });

    test('deletes corrupt cached source and retries via network', async () => {
        const factory = new MockTextFactory();
        const cacheStore = createCacheStoreMock({
            load: jest.fn(async (): Promise<string> => 'corrupt-source'),
        });
        const loader = new Loader({ resourcePath: '/', cache: cacheStore });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        mockFetch();
        factory.create.mockImplementationOnce(async (): Promise<string> => {
            throw new Error('corrupt-cache');
        });

        const result = await loader.load(TextAsset, 'corrupt.txt');

        expect(result).toBe('resource:fresh-source');
        expect(cacheStore.delete).toHaveBeenCalledWith('text', 'corrupt.txt');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(factory.create).toHaveBeenCalledTimes(2);
    });

    test('load(Json, path) returns unknown by default', async () => {
        const loader = new Loader({ resourcePath: '/' });

        global.fetch = jest.fn(async (): Promise<Response> => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => 42,
        } as unknown as Response));

        const result = await loader.load(Json, 'data.json');

        expect(result).toBe(42);
    });

    test('backgroundLoad() + load() priority boost', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/', concurrency: 1 });

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);

        let fetchCount = 0;
        global.fetch = jest.fn(async (): Promise<Response> => {
            fetchCount++;
            return { ok: true, status: 200, statusText: 'OK' } as Response;
        });

        loader.add(TextAsset, { a: 'a.txt', b: 'b.txt', c: 'c.txt' });
        loader.backgroundLoad();

        // Priority boost: load 'c' should resolve even though it was last in queue
        const cResult = await loader.load(TextAsset, 'c');

        expect(cResult).toBe('resource:fresh-source');
    });

    test('background load dispatches onLoaded exactly once per successful resource', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });
        const onLoaded = jest.fn();

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        loader.onLoaded.add(onLoaded);
        loader.add(TextAsset, { queued: 'queued.txt' });
        mockFetch();

        await loader.loadAll();

        expect(onLoaded).toHaveBeenCalledTimes(1);
        expect(onLoaded).toHaveBeenCalledWith(TextAsset, 'queued', 'resource:fresh-source');
    });

    test('boosted background items keep loadAll pending and report full progress', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/', concurrency: 1 });
        const firstFetch = createDeferred<Response>();
        const boostedFetch = createDeferred<Response>();
        const progress: Array<[number, number]> = [];

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);
        loader.add(TextAsset, { first: 'first.txt', boosted: 'boosted.txt' });
        loader.onProgress.add((loaded, total) => {
            progress.push([loaded, total]);
        });

        global.fetch = jest.fn((input: RequestInfo | URL): Promise<Response> => {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;

            if (url.endsWith('/first.txt')) {
                return firstFetch.promise;
            }

            if (url.endsWith('/boosted.txt')) {
                return boostedFetch.promise;
            }

            throw new Error(`Unexpected fetch url: ${url}`);
        });

        const loadAllPromise = loader.loadAll();
        let loadAllResolved = false;

        loadAllPromise.then(() => {
            loadAllResolved = true;
        });

        const boostedPromise = loader.load(TextAsset, 'boosted');

        firstFetch.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
        } as Response);

        await loader.load(TextAsset, 'first');
        await Promise.resolve();

        expect(loadAllResolved).toBe(false);

        boostedFetch.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
        } as Response);

        await expect(boostedPromise).resolves.toBe('resource:fresh-source');
        await expect(loadAllPromise).resolves.toBeUndefined();

        expect(progress).toContainEqual([1, 2]);
        expect(progress[progress.length - 1]).toEqual([2, 2]);
    });

    test('does not reinsert a resource when unload() is called during in-flight fetch', async () => {
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/' });
        const deferredFetch = createDeferred<Response>();

        loader.register(TextAsset, factory as AssetFactory<TextAsset>);

        global.fetch = jest.fn((_input: RequestInfo | URL): Promise<Response> => deferredFetch.promise);

        const loadPromise = loader.load(TextAsset, 'inflight.txt');

        loader.unload(TextAsset, 'inflight.txt');

        deferredFetch.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
        } as Response);

        await expect(loadPromise).resolves.toBe('resource:fresh-source');
        expect(loader.has(TextAsset, 'inflight.txt')).toBe(false);
        expect(loader.peek(TextAsset, 'inflight.txt')).toBeNull();
    });

    test('uses per-type internal keys instead of constructor names', async () => {
        class FirstType {}
        class SecondType {}

        Object.defineProperty(FirstType, 'name', { value: 'MinifiedType' });
        Object.defineProperty(SecondType, 'name', { value: 'MinifiedType' });

        const firstFactory = new InstanceFactory(new FirstType());
        const secondFactory = new InstanceFactory(new SecondType());
        const loader = new Loader({ resourcePath: '/' });

        loader.register(FirstType, firstFactory as AssetFactory<FirstType>);
        loader.register(SecondType, secondFactory as AssetFactory<SecondType>);

        mockFetch();

        const [first, second] = await Promise.all([
            loader.load(FirstType, 'shared.asset'),
            loader.load(SecondType, 'shared.asset'),
        ]);

        expect(first).toBeInstanceOf(FirstType);
        expect(second).toBeInstanceOf(SecondType);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
});
