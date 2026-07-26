import { describe, expect, test, vi } from 'vitest';

import type { AssetFactory } from '#resources/AssetFactory';
import { AssetDecoder } from '#resources/AssetDecoder';
import { AssetTypeRegistry } from '#resources/AssetTypeRegistry';
import type { CacheRequest, CacheStrategy } from '#resources/CacheStrategy';
import type { CacheStore } from '#resources/CacheStore';
import type { Loader } from '#resources/Loader';

class TypeA {}

const fakeLoader = {} as Loader;

function fakeFactory<T>(create: (data: unknown, options?: unknown) => T): AssetFactory<T> {
  return {
    storageName: 'test',
    process: async (r: Response) => r,
    create: async (data: unknown, options?: unknown) => create(data, options),
    destroy: vi.fn(),
  };
}

const createCacheStoreMock = (overrides: Partial<CacheStore> = {}): CacheStore => ({
  load: vi.fn(async (): Promise<unknown | null> => null),
  save: vi.fn(async (): Promise<void> => undefined),
  delete: vi.fn(async (): Promise<boolean> => true),
  clear: vi.fn(async (): Promise<boolean> => true),
  destroy: vi.fn(),
  ...overrides,
});

/** Fake strategy that resolves to a canned value and records the request it received. */
function createFakeStrategy(resolveTo: (request: CacheRequest) => unknown = () => 'resolved'): {
  strategy: CacheStrategy;
  requests: CacheRequest[];
} {
  const requests: CacheRequest[] = [];
  const strategy: CacheStrategy = {
    resolve: vi.fn(async (request: CacheRequest) => {
      requests.push(request);
      return resolveTo(request);
    }),
  };
  return { strategy, requests };
}

function createDecoder(overrides: { cacheStrategy?: CacheStrategy; stores?: CacheStore[]; basePath?: string } = {}) {
  const typeRegistry = new AssetTypeRegistry();
  const stores = overrides.stores ?? [];
  const { strategy } = overrides.cacheStrategy ? { strategy: overrides.cacheStrategy } : createFakeStrategy();
  const storeResource = vi.fn((_type: unknown, _alias: string, resource: unknown) => resource);

  const decoder = new AssetDecoder(fakeLoader, typeRegistry, storeResource, {
    basePath: overrides.basePath ?? '',
    fetchOptions: {},
    stores,
    cacheStrategy: strategy,
  });

  return { decoder, typeRegistry, storeResource, strategy };
}

describe('AssetDecoder', () => {
  test('basePath/fetchOptions round-trip', () => {
    const { decoder } = createDecoder();

    decoder.basePath = 'assets/';
    expect(decoder.basePath).toBe('assets/');

    decoder.fetchOptions = { credentials: 'include' };
    expect(decoder.fetchOptions).toEqual({ credentials: 'include' });
  });

  test('_fetch resolves through the cache strategy with the base-path-prefixed URL and stores via the callback', async () => {
    const { strategy, requests } = createFakeStrategy(() => 'decoded-value');
    const { decoder, typeRegistry, storeResource } = createDecoder({ cacheStrategy: strategy, basePath: 'assets/' });

    typeRegistry.register(TypeA, fakeFactory(() => new TypeA()));

    const result = await decoder._fetch(TypeA, 'hero', 'hero.png');

    expect(requests[0]?.url).toBe('assets/hero.png');
    expect(requests[0]?.key).toBe('hero.png');
    expect(storeResource).toHaveBeenCalledWith(TypeA, 'hero', 'decoded-value');
    expect(result).toBe('decoded-value');
  });

  test('_fetch wraps a rejected cache-strategy resolve in a "Failed to load" error and never stores', async () => {
    const { strategy } = createFakeStrategy();
    (strategy.resolve as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'));
    const { decoder, typeRegistry, storeResource } = createDecoder({ cacheStrategy: strategy });

    typeRegistry.register(TypeA, fakeFactory(() => new TypeA()));

    await expect(decoder._fetch(TypeA, 'hero', 'hero.png')).rejects.toThrow(/Failed to load "hero" from "hero.png": network down/);
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_fetchWithHandler invokes the handler with the built context and stores the result', async () => {
    const { decoder, storeResource } = createDecoder();
    const handler = vi.fn(async () => 'handler-result');
    const context = decoder._buildHandlerContext('id:1:hero.png');

    const result = await decoder._fetchWithHandler(TypeA, 'hero', 'hero.png', { source: 'hero.png' }, handler, context);

    expect(handler).toHaveBeenCalledWith({ source: 'hero.png' }, context);
    expect(storeResource).toHaveBeenCalledWith(TypeA, 'hero', 'handler-result');
    expect(result).toBe('handler-result');
  });

  test('_fetchWithHandler wraps a handler rejection and never stores', async () => {
    const { decoder, storeResource } = createDecoder();
    const handler = vi.fn(async () => {
      throw new Error('bad payload');
    });
    const context = decoder._buildHandlerContext('id:1:hero.png');

    await expect(decoder._fetchWithHandler(TypeA, 'hero', 'hero.png', {}, handler, context)).rejects.toThrow(
      /Failed to load "hero" from "hero.png": bad payload/,
    );
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_dispatchFetch routes through _fetch when no bindAsset handler is registered', async () => {
    const { strategy, requests } = createFakeStrategy(() => 'plain-fetch-value');
    const { decoder, typeRegistry, storeResource } = createDecoder({ cacheStrategy: strategy });

    typeRegistry.register(TypeA, fakeFactory(() => new TypeA()));

    await decoder._dispatchFetch(TypeA, 'hero', 'hero.png');

    expect(requests).toHaveLength(1);
    expect(storeResource).toHaveBeenCalledWith(TypeA, 'hero', 'plain-fetch-value');
  });

  test('_dispatchFetch routes through the bindAsset handler when one is registered, merging options into the config', async () => {
    const { decoder, typeRegistry, storeResource } = createDecoder();
    const load = vi.fn(async (config: unknown) => ({ config }));

    typeRegistry.bindAsset({ type: TypeA }, { load });

    await decoder._dispatchFetch(TypeA, 'hero', 'hero.png', { scale: 2 });

    expect(load).toHaveBeenCalledTimes(1);
    const [configArg, contextArg] = load.mock.calls[0] as [unknown, unknown];

    // Config should have source and include scale (either merged at top level or in options)
    expect(configArg).toMatchObject({ source: 'hero.png' });
    expect(contextArg).toMatchObject({ identityKey: expect.any(String) });
    expect(storeResource).toHaveBeenCalledWith(TypeA, 'hero', expect.any(Object));
  });

  test('_injectSource uses createFromBytes when the handler provides it, and stores via the callback', async () => {
    const { decoder, typeRegistry, storeResource } = createDecoder();
    const createFromBytes = vi.fn(async (bytes: ArrayBuffer) => `from-bytes:${bytes.byteLength}`);

    typeRegistry.bindAsset({ type: TypeA }, { load: vi.fn(), createFromBytes });

    await decoder._injectSource(TypeA, 'hero', new ArrayBuffer(4));

    expect(createFromBytes).toHaveBeenCalled();
    expect(storeResource).toHaveBeenCalledWith(TypeA, 'hero', 'from-bytes:4');
  });

  test('_injectSource falls back to a register()-based factory when no createFromBytes handler exists', async () => {
    const { decoder, typeRegistry, storeResource } = createDecoder();

    typeRegistry.register(TypeA, fakeFactory((bytes: unknown) => `from-factory:${(bytes as ArrayBuffer).byteLength}`));

    await decoder._injectSource(TypeA, 'hero', new ArrayBuffer(8));

    expect(storeResource).toHaveBeenCalledWith(TypeA, 'hero', 'from-factory:8');
  });

  test('_injectSource throws when the type has neither createFromBytes nor a factory, and never stores', async () => {
    const { decoder, storeResource } = createDecoder();

    await expect(decoder._injectSource(TypeA, 'hero', new ArrayBuffer(4))).rejects.toThrow(/cannot be built from container bytes/);
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_buildHandlerContext exposes the owning loader and routes fetch* through _contextFetch', async () => {
    const { strategy, requests } = createFakeStrategy(() => 'ctx-text-value');
    const { decoder } = createDecoder({ cacheStrategy: strategy });

    const context = decoder._buildHandlerContext('id:1:hero.txt');

    expect(context.loader).toBe(fakeLoader);
    expect(context.identityKey).toBe('id:1:hero.txt');

    const value = await context.fetchText('hero.txt');

    expect(value).toBe('ctx-text-value');
    expect(requests[0]?.storageName).toBe('__ctx_text');
    expect(requests[0]?.key).toBe('hero.txt');
  });

  test('destroy() destroys every configured cache store', () => {
    const storeA = createCacheStoreMock();
    const storeB = createCacheStoreMock();
    const { decoder } = createDecoder({ stores: [storeA, storeB] });

    decoder.destroy();

    expect(storeA.destroy).toHaveBeenCalledTimes(1);
    expect(storeB.destroy).toHaveBeenCalledTimes(1);
  });
});
