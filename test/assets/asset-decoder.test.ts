import { describe, expect, test, vi } from 'vitest';

import type { AssetConstructor } from '#assets/AssetConstructor';
import { AssetDecodeError } from '#assets/AssetDecodeError';
import { AssetDecoder } from '#assets/AssetDecoder';
import { AssetTypeRegistry } from '#assets/AssetTypeRegistry';
import { AssetCache } from '#assets/cache/AssetCache';
import type { CacheContext } from '#assets/cache/CachePolicy';
import { CacheRoute } from '#assets/cache/CacheRoute';
import { type CanonicalAsset, canonicalizeSource, resourceKey, sourceKey } from '#assets/canonicalKey';
import type { Loader } from '#assets/Loader';
import type { LoaderScope } from '#assets/LoaderScope';

import { createCacheStoreDouble, createRecordingPolicy } from './cache-test-doubles';
import { testAssetType } from './test-asset-type';

class TypeA {}

const fakeLoader = {} as Loader;
const fakeScope = { id: 1, kind: 'dependency' } as unknown as LoaderScope;

/** A cache whose policy resolves to a canned value and records the contexts it saw. */
const createFakeCache = (resolveTo: () => unknown = () => 'resolved'): { cache: AssetCache; contexts: Array<CacheContext<unknown>> } => {
  const { policy, contexts } = createRecordingPolicy(context => Promise.resolve(resolveTo()) as ReturnType<typeof context.fetch>);

  return { cache: new AssetCache({ policy }), contexts };
};

const createDecoder = (overrides: { cache?: AssetCache | null; basePath?: string; ownsCache?: boolean } = {}) => {
  const typeRegistry = new AssetTypeRegistry();
  const storeResource = vi.fn((_asset: CanonicalAsset, resource: unknown) => resource);

  const decoder = new AssetDecoder(fakeLoader, typeRegistry, {
    basePath: overrides.basePath ?? '',
    fetchOptions: {},
    cache: overrides.cache === undefined ? createFakeCache().cache : overrides.cache,
    connectivity: null,
    ownsCache: overrides.ownsCache ?? false,
  });

  decoder._bindResourceStore(storeResource);

  const canonical = (type: AssetConstructor, source: string): CanonicalAsset => ({
    key: resourceKey('typeA', canonicalizeSource('', source)),
    sourceKey: sourceKey(canonicalizeSource('', source)),
    locator: canonicalizeSource('', source),
    type,
    source,
  });

  return { decoder, typeRegistry, storeResource, canonical };
};

describe('AssetDecoder', () => {
  test('basePath/fetchOptions round-trip', () => {
    const { decoder } = createDecoder();

    decoder.basePath = 'assets/';
    expect(decoder.basePath).toBe('assets/');

    decoder.fetchOptions = { credentials: 'include' };
    expect(decoder.fetchOptions).toEqual({ credentials: 'include' });
  });

  test('_dispatchFetch stores what the factory built', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();

    typeRegistry.installAll([testAssetType<string, string>({ id: 'typeA', token: TypeA, acquires: false, create: async () => 'factory-result' })]);

    const result = await decoder._dispatchFetch(canonical(TypeA, 'hero.png'), undefined, undefined, fakeScope);

    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), 'factory-result');
    expect(result).toBe('factory-result');
  });

  test('_dispatchFetch wraps a factory rejection with the url and never stores', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();

    typeRegistry.installAll([
      testAssetType<string, string>({
        id: 'typeA',
        token: TypeA,
        acquires: false,
        create: async () => {
          throw new Error('bad payload');
        },
      }),
    ]);

    await expect(decoder._dispatchFetch(canonical(TypeA, 'hero.png'), undefined, undefined, fakeScope)).rejects.toThrow(
      /Failed to load "hero.png" from "hero.png": bad payload/,
    );
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_dispatchFetch keeps a decode failure its own type while adding the "which asset" envelope', async () => {
    const { decoder, typeRegistry, canonical } = createDecoder();

    typeRegistry.installAll([
      testAssetType<string, string>({
        id: 'typeA',
        token: TypeA,
        acquires: false,
        create: async () => {
          throw new AssetDecodeError({ message: 'not a PNG', assetType: 'typeA' });
        },
      }),
    ]);

    const promise = decoder._dispatchFetch(canonical(TypeA, 'hero.png'), undefined, undefined, fakeScope);

    await expect(promise).rejects.toBeInstanceOf(AssetDecodeError);
    await expect(promise).rejects.toThrow(/Failed to load "hero.png" from "hero.png": not a PNG/);
    await expect(promise).rejects.toMatchObject({ assetType: 'typeA' });
  });

  test('_dispatchFetch rejects with a clear error when no type is installed for the token', async () => {
    const { decoder, storeResource, canonical } = createDecoder();

    await expect(decoder._dispatchFetch(canonical(TypeA, 'hero.png'), undefined, undefined, fakeScope)).rejects.toThrow(/No asset type is installed for TypeA/);
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_dispatchFetch hands the request options to the factory', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();
    let seenOptions: unknown;
    let seenSource: unknown;

    typeRegistry.installAll([
      testAssetType<string, unknown, { scale: number }>({
        id: 'typeA',
        token: TypeA,
        acquires: false,
        create: async (_source, context) => {
          seenOptions = context.options;
          seenSource = context.source;

          return { ok: true };
        },
      }),
    ]);

    await decoder._dispatchFetch(canonical(TypeA, 'hero.png'), { scale: 2 }, undefined, fakeScope);

    expect(seenOptions).toEqual({ scale: 2 });
    expect(seenSource).toBe('hero.png');
    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), { ok: true });
  });

  test('_dispatchFetch acquires under the type own namespace and the request source key', async () => {
    const { cache, contexts } = createFakeCache(() => 'ns-value');
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder({ cache });

    typeRegistry.installAll([testAssetType<string, string>({ id: 'typeA', token: TypeA, create: async source => source })]);

    await decoder._dispatchFetch(canonical(TypeA, 'hero.png'), undefined, undefined, fakeScope);

    expect(contexts[0]?.namespace).toBe('typeA');
    expect(contexts[0]?.sourceKey).toBe(canonicalizeSource('', 'hero.png'));
    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), 'ns-value');
  });

  test('a type that supplies its own source never reaches the cache at all', async () => {
    const { cache, contexts } = createFakeCache(() => 'never-used');
    const { decoder, typeRegistry, canonical } = createDecoder({ cache });

    typeRegistry.installAll([testAssetType<string, string>({ id: 'typeA', token: TypeA, acquires: false, create: async () => 'streamed' })]);

    await decoder._dispatchFetch(canonical(TypeA, 'hero.png'), undefined, undefined, fakeScope);

    expect(contexts).toHaveLength(0);
  });

  test('_injectSource reads container bytes through the codec and stores the result', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();

    typeRegistry.installAll([testAssetType<string, string>({ id: 'typeA', token: TypeA, create: async source => `from-bytes:${source}` })]);

    await decoder._injectSource(canonical(TypeA, 'hero.dat'), new TextEncoder().encode('hi').buffer, fakeScope);

    expect(storeResource).toHaveBeenCalledWith(expect.objectContaining({ type: TypeA }), 'from-bytes:hi');
  });

  test('_injectSource throws when the codec cannot read bytes, and never stores', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();

    typeRegistry.installAll([
      testAssetType<string, string>({
        id: 'typeA',
        token: TypeA,
        codec: { fromResponse: response => response.text(), decode: stored => Promise.resolve(stored as string) },
        create: async source => source,
      }),
    ]);

    await expect(decoder._injectSource(canonical(TypeA, 'hero.dat'), new ArrayBuffer(8), fakeScope)).rejects.toThrow(/cannot be built from container bytes/);
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_injectSource throws when no type is installed for the token, and never stores', async () => {
    const { decoder, storeResource, canonical } = createDecoder();

    await expect(decoder._injectSource(canonical(TypeA, 'hero.dat'), new ArrayBuffer(4), fakeScope)).rejects.toThrow(/No asset type is installed/);
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_acquireContainer reads a container under its own namespace', async () => {
    const { cache, contexts } = createFakeCache(() => new ArrayBuffer(2));
    const { decoder } = createDecoder({ cache });

    await decoder._acquireContainer('pack.exoa');

    expect(contexts[0]?.namespace).toBe('exoa');
    expect(contexts[0]?.sourceKey).toBe(canonicalizeSource('', 'pack.exoa'));
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
