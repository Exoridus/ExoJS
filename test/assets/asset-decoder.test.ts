import { describe, expect, test, vi } from 'vitest';

import { AssetCache } from '#assets/AssetCache';
import type { AssetConstructor } from '#assets/AssetConstructor';
import { AssetDecoder } from '#assets/AssetDecoder';
import { AssetTypeRegistry } from '#assets/AssetTypeRegistry';
import type { CacheContext } from '#assets/CachePolicy';
import { CacheRoute } from '#assets/CacheRoute';
import { type CanonicalAsset, canonicalizeSource, resourceKey, sourceKey } from '#assets/canonicalKey';
import type { Loader } from '#assets/Loader';
import type { LoaderScope } from '#assets/LoaderScope';

import { createCacheStoreDouble, createRecordingPolicy } from './cache-test-doubles';

class TypeA {}

const fakeLoader = {} as Loader;
const fakeScope = { id: 1, kind: 'dependency' } as unknown as LoaderScope;

/** A cache whose policy resolves to a canned value and records the contexts it saw. */
function createFakeCache(resolveTo: () => unknown = () => 'resolved'): { cache: AssetCache; contexts: Array<CacheContext<unknown>> } {
  const { policy, contexts } = createRecordingPolicy(context => Promise.resolve(resolveTo()) as ReturnType<typeof context.fetch>);

  return { cache: new AssetCache({ policy }), contexts };
}

function createDecoder(overrides: { cache?: AssetCache | null; basePath?: string; ownsCache?: boolean } = {}) {
  const typeRegistry = new AssetTypeRegistry();
  const storeResource = vi.fn((_asset: CanonicalAsset, resource: unknown) => resource);

  const decoder = new AssetDecoder(fakeLoader, typeRegistry, {
    basePath: overrides.basePath ?? '',
    fetchOptions: {},
    cache: overrides.cache === undefined ? createFakeCache().cache : overrides.cache,
    ownsCache: overrides.ownsCache ?? false,
  });

  decoder._bindResourceStore(storeResource);

  const canonical = (type: AssetConstructor, source: string): CanonicalAsset => ({
    key: resourceKey(typeRegistry._typeIdentity(type), canonicalizeSource('', source)),
    sourceKey: sourceKey(canonicalizeSource('', source)),
    locator: canonicalizeSource('', source),
    type,
    source,
  });

  return { decoder, typeRegistry, storeResource, canonical };
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
    const context = decoder._buildHandlerContext(canonical(TypeA, 'hero.png'), fakeScope);

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
    const context = decoder._buildHandlerContext(canonical(TypeA, 'hero.png'), fakeScope);

    await expect(decoder._fetchWithHandler(canonical(TypeA, 'hero.png'), {}, handler, context)).rejects.toThrow(
      /Failed to load "hero.png" from "hero.png": bad payload/,
    );
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_dispatchFetch rejects with a clear error when no bindAsset handler is registered for the type', async () => {
    const { decoder, storeResource, canonical } = createDecoder();

    await expect(decoder._dispatchFetch(canonical(TypeA, 'hero.png'), undefined, undefined, fakeScope)).rejects.toThrow(
      /No asset handler registered for TypeA/,
    );
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_dispatchFetch routes through the bindAsset handler when one is registered, merging options into the config', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();
    const load = vi.fn(async (config: unknown) => ({ config }));

    typeRegistry.bindAsset({ ctor: TypeA }, { load });

    await decoder._dispatchFetch(canonical(TypeA, 'hero.png'), { scale: 2 }, undefined, fakeScope);

    expect(load).toHaveBeenCalledWith({ source: 'hero.png', options: { scale: 2 } }, expect.objectContaining({ resourceKey: expect.any(String) }));
    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), { config: { source: 'hero.png', options: { scale: 2 } } });
  });

  test('_dispatchFetch routes context.fetchText through the bindAsset binding storageName instead of the shared namespace', async () => {
    const { cache, contexts } = createFakeCache(() => 'ns-value');
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder({ cache });

    typeRegistry.bindAsset({ ctor: TypeA, storageName: 'my-type-ns' }, { load: async (_config, ctx) => ctx.fetchText('hero.png') });

    await decoder._dispatchFetch(canonical(TypeA, 'hero.png'), undefined, undefined, fakeScope);

    expect(contexts[0]?.namespace).toBe('my-type-ns');
    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), 'ns-value');
  });

  test('_injectSource uses createFromBytes when the handler provides it, and stores via the callback', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();
    const createFromBytes = vi.fn(async (bytes: ArrayBuffer) => `from-bytes:${bytes.byteLength}`);

    typeRegistry.bindAsset({ ctor: TypeA }, { load: vi.fn(), createFromBytes });

    await decoder._injectSource(canonical(TypeA, 'hero.dat'), new ArrayBuffer(4), fakeScope);

    expect(createFromBytes).toHaveBeenCalled();
    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), 'from-bytes:4');
  });

  test('_injectSource throws when the bound handler has no createFromBytes, and never stores', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();

    typeRegistry.bindAsset({ ctor: TypeA }, { load: vi.fn() });

    await expect(decoder._injectSource(canonical(TypeA, 'hero.dat'), new ArrayBuffer(8), fakeScope)).rejects.toThrow(/cannot be built from container bytes/);
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_injectSource throws when the type has no bound handler at all, and never stores', async () => {
    const { decoder, storeResource, canonical } = createDecoder();

    await expect(decoder._injectSource(canonical(TypeA, 'hero.dat'), new ArrayBuffer(4), fakeScope)).rejects.toThrow(/cannot be built from container bytes/);
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_buildHandlerContext exposes the owning loader and routes fetch* through the application cache', async () => {
    const { cache, contexts } = createFakeCache(() => 'ctx-text-value');
    const { decoder, canonical } = createDecoder({ cache });

    const asset = canonical(TypeA, 'hero.txt');
    const context = decoder._buildHandlerContext(asset, fakeScope);

    expect(context.loader).toBe(fakeLoader);
    expect(context.resourceKey).toBe(asset.key);
    expect(context.sourceKey).toBe(asset.sourceKey);
    expect(context.locator).toBe(asset.locator);

    const value = await context.fetchText('hero.txt');

    expect(value).toBe('ctx-text-value');
    expect(contexts[0]?.namespace).toBe('__ctx_text');
    expect(contexts[0]?.sourceKey).toBe(canonicalizeSource('', 'hero.txt'));
  });

  test('destroy() destroys every store of a cache it owns', () => {
    const storeA = createCacheStoreDouble('a');
    const storeB = createCacheStoreDouble('b');
    const cache = new AssetCache({ routes: [new CacheRoute({ types: ['a'], stores: storeA })], stores: storeB });
    const { decoder } = createDecoder({ cache, ownsCache: true });

    decoder.destroy();

    expect(storeA.destroy).toHaveBeenCalledTimes(1);
    expect(storeB.destroy).toHaveBeenCalledTimes(1);
  });

  test('destroy() leaves a cache it does not own alone', () => {
    const store = createCacheStoreDouble();
    const { decoder } = createDecoder({ cache: new AssetCache({ stores: store }), ownsCache: false });

    decoder.destroy();

    expect(store.destroy).not.toHaveBeenCalled();
  });
});
