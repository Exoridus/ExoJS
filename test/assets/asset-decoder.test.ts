import { describe, expect, test, vi } from 'vitest';

import { AssetDecoder } from '#assets/AssetDecoder';
import { AssetTypeRegistry } from '#assets/AssetTypeRegistry';
import { type CanonicalAsset, canonicalAssetKey, canonicalizeSource } from '#assets/canonicalKey';
import type { AssetConstructor } from '#assets/FactoryRegistry';
import type { CacheStore } from '#assets/CacheStore';
import type { CacheRequest, CacheStrategy } from '#assets/CacheStrategy';
import type { Loader } from '#assets/Loader';

class TypeA {}

const fakeLoader = {} as Loader;

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
  const storeResource = vi.fn((_asset: CanonicalAsset, resource: unknown) => resource);

  const decoder = new AssetDecoder(fakeLoader, typeRegistry, {
    basePath: overrides.basePath ?? '',
    fetchOptions: {},
    stores,
    cacheStrategy: strategy,
  });

  decoder._bindResourceStore(storeResource);

  const canonical = (type: AssetConstructor, source: string): CanonicalAsset => ({
    key: canonicalAssetKey(typeRegistry._getTypeId(type), canonicalizeSource('', source)),
    locator: canonicalizeSource('', source),
    type,
    source,
  });

  return { decoder, typeRegistry, storeResource, strategy, canonical };
}

describe('AssetDecoder', () => {
  test('basePath/fetchOptions round-trip', () => {
    const { decoder, canonical } = createDecoder();

    decoder.basePath = 'assets/';
    expect(decoder.basePath).toBe('assets/');

    decoder.fetchOptions = { credentials: 'include' };
    expect(decoder.fetchOptions).toEqual({ credentials: 'include' });
  });

  test('_fetchWithHandler invokes the handler with the built context and stores the result', async () => {
    const { decoder, storeResource, canonical } = createDecoder();
    const handler = vi.fn(async () => 'handler-result');
    const context = decoder._buildHandlerContext('id:1:hero.png');

    const result = await decoder._fetchWithHandler(canonical(TypeA, 'hero.png'), { source: 'hero.png' }, handler, context);

    expect(handler).toHaveBeenCalledWith({ source: 'hero.png' }, context);
    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), 'handler-result');
    expect(result).toBe('handler-result');
  });

  test('_fetchWithHandler wraps a handler rejection and never stores', async () => {
    const { decoder, storeResource, canonical } = createDecoder();
    const handler = vi.fn(async () => {
      throw new Error('bad payload');
    });
    const context = decoder._buildHandlerContext('id:1:hero.png');

    await expect(decoder._fetchWithHandler(canonical(TypeA, 'hero.png'), {}, handler, context)).rejects.toThrow(
      /Failed to load "hero.png" from "hero.png": bad payload/,
    );
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_dispatchFetch rejects with a clear error when no bindAsset handler is registered for the type', async () => {
    const { decoder, storeResource, canonical } = createDecoder();

    await expect(decoder._dispatchFetch(canonical(TypeA, 'hero.png'))).rejects.toThrow(/No asset handler registered for TypeA/);
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_dispatchFetch routes through the bindAsset handler when one is registered, merging options into the config', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();
    const load = vi.fn(async (config: unknown) => ({ config }));

    typeRegistry.bindAsset({ ctor: TypeA }, { load });

    await decoder._dispatchFetch(canonical(TypeA, 'hero.png'), { scale: 2 });

    expect(load).toHaveBeenCalledWith({ source: 'hero.png', options: { scale: 2 } }, expect.objectContaining({ identityKey: expect.any(String) }));
    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), { config: { source: 'hero.png', options: { scale: 2 } } });
  });

  test('_dispatchFetch routes context.fetchText through the bindAsset binding storageName instead of the shared namespace', async () => {
    const { strategy, requests } = createFakeStrategy(() => 'ns-value');
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder({ cacheStrategy: strategy });

    typeRegistry.bindAsset({ ctor: TypeA, storageName: 'my-type-ns' }, { load: async (_config, ctx) => ctx.fetchText('hero.png') });

    await decoder._dispatchFetch(canonical(TypeA, 'hero.png'));

    expect(requests[0]?.storageName).toBe('my-type-ns');
    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), 'ns-value');
  });

  test('_injectSource uses createFromBytes when the handler provides it, and stores via the callback', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();
    const createFromBytes = vi.fn(async (bytes: ArrayBuffer) => `from-bytes:${bytes.byteLength}`);

    typeRegistry.bindAsset({ ctor: TypeA }, { load: vi.fn(), createFromBytes });

    await decoder._injectSource(canonical(TypeA, 'hero.dat'), new ArrayBuffer(4));

    expect(createFromBytes).toHaveBeenCalled();
    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), 'from-bytes:4');
  });

  test('_injectSource throws when the bound handler has no createFromBytes, and never stores', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();

    typeRegistry.bindAsset({ ctor: TypeA }, { load: vi.fn() });

    await expect(decoder._injectSource(canonical(TypeA, 'hero.dat'), new ArrayBuffer(8))).rejects.toThrow(/cannot be built from container bytes/);
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_injectSource throws when the type has no bound handler at all, and never stores', async () => {
    const { decoder, storeResource, canonical } = createDecoder();

    await expect(decoder._injectSource(canonical(TypeA, 'hero.dat'), new ArrayBuffer(4))).rejects.toThrow(/cannot be built from container bytes/);
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_buildHandlerContext exposes the owning loader and routes fetch* through _contextFetch', async () => {
    const { strategy, requests } = createFakeStrategy(() => 'ctx-text-value');
    const { decoder, canonical } = createDecoder({ cacheStrategy: strategy });

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
    const { decoder, canonical } = createDecoder({ stores: [storeA, storeB] });

    decoder.destroy();

    expect(storeA.destroy).toHaveBeenCalledTimes(1);
    expect(storeB.destroy).toHaveBeenCalledTimes(1);
  });
});
