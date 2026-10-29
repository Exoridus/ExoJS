import { describe, expect, test, vi } from 'vitest';

import type { AssetConstructor } from '#assets/AssetConstructor';
import { AssetDecodeError } from '#assets/AssetDecodeError';
import { AssetDecoder } from '#assets/AssetDecoder';
import { AssetTypeRegistry } from '#assets/AssetTypeRegistry';
import { AssetVariantSet } from '#assets/AssetVariantSet';
import { AssetCache } from '#assets/cache/AssetCache';
import type { CacheContext } from '#assets/cache/CachePolicy';
import { CacheRoute } from '#assets/cache/CacheRoute';
import { type CanonicalAsset, canonicalizeSource, resourceKey, sourceKey } from '#assets/canonicalKey';
import { Loader } from '#assets/Loader';
import type { LoaderScope } from '#assets/LoaderScope';

import { createCacheStoreDouble, createRecordingPolicy } from './cache-test-doubles';
import { testAssetType } from './test-asset-type';

class TypeA {}

const fakeLoader = { variants: new AssetVariantSet() } as Loader;
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
  test.each(['network', 'cache', 'failure', 'factory', 'manifest', 'manifest failure'] as const)(
    'fallback signal listeners are released after %s acquisition',
    async mode => {
      const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!;
      Object.defineProperty(AbortSignal, 'any', { ...descriptor, value: undefined });
      const application = new AbortController();
      const add = vi.spyOn(application.signal, 'addEventListener');
      const remove = vi.spyOn(application.signal, 'removeEventListener');
      const { decoder, typeRegistry, canonical } = createDecoder({ cache: mode === 'cache' ? createFakeCache().cache : null });
      decoder.fetchOptions = { signal: application.signal };
      typeRegistry.installAll([
        testAssetType<string, string>({
          id: 'typeA',
          token: TypeA,
          create: async (source, context) => {
            expect(context.signal?.aborted).toBe(false);

            if (mode === 'factory') {
              throw new Error('factory failed');
            }

            return source;
          },
        }),
      ]);
      const loader = new Loader({ fetchOptions: { signal: application.signal } });
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        if (mode === 'failure') {
          throw new Error('transport failed');
        }

        return new Response(mode === 'manifest' ? JSON.stringify({ version: 1, packs: {} }) : 'payload');
      });

      try {
        for (let index = 0; index < 3; index++) {
          const load = new AbortController();
          const result = mode.startsWith('manifest')
            ? loader.loadManifest('manifest.json', { signal: load.signal })
            : decoder._dispatchFetch(canonical(TypeA, `asset-${index}`), undefined, load.signal, fakeScope);

          if (mode === 'failure') {
            await expect(result).rejects.toThrow('transport failed');
          } else if (mode === 'factory' || mode === 'manifest failure') {
            await expect(result).rejects.toThrow();
          } else if (mode === 'manifest') {
            await expect(result).resolves.toBeDefined();
          } else {
            await expect(result).resolves.toBe(mode === 'cache' ? 'resolved' : 'payload');
          }

          expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
          expect(load.signal.aborted).toBe(false);
        }

        expect(application.signal.aborted).toBe(false);
      } finally {
        Object.defineProperty(AbortSignal, 'any', descriptor);
        add.mockRestore();
        remove.mockRestore();
        fetch.mockRestore();
        loader.destroy();
      }
    },
  );

  test.each(['application', 'load'] as const)('fallback forwards %s cancellation and releases both listeners', async owner => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!;
    Object.defineProperty(AbortSignal, 'any', { ...descriptor, value: undefined });
    const application = new AbortController();
    const load = new AbortController();
    const applicationRemove = vi.spyOn(application.signal, 'removeEventListener');
    const loadRemove = vi.spyOn(load.signal, 'removeEventListener');
    const { decoder, typeRegistry, canonical } = createDecoder({ cache: null });
    decoder.fetchOptions = { signal: application.signal };
    typeRegistry.installAll([testAssetType<string, string>({ id: 'typeA', token: TypeA, create: async source => source })]);
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason as Error));
        }),
    );

    try {
      const result = decoder._dispatchFetch(canonical(TypeA, 'asset'), undefined, load.signal, fakeScope);
      const reason = new DOMException('cancelled', 'AbortError');
      (owner === 'application' ? application : load).abort(reason);
      await expect(result).rejects.toBe(reason);
      expect(applicationRemove).toHaveBeenCalledTimes(1);
      expect(loadRemove).toHaveBeenCalledTimes(1);
      expect((owner === 'application' ? load : application).signal.aborted).toBe(false);
    } finally {
      Object.defineProperty(AbortSignal, 'any', descriptor);
      applicationRemove.mockRestore();
      loadRemove.mockRestore();
      fetch.mockRestore();
    }
  });

  test('releasing fallback network listeners preserves cancellation during factory creation', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!;
    Object.defineProperty(AbortSignal, 'any', { ...descriptor, value: undefined });
    const application = new AbortController();
    const load = new AbortController();
    const remove = vi.spyOn(application.signal, 'removeEventListener');
    const { decoder, typeRegistry, canonical } = createDecoder({ cache: null });
    decoder.fetchOptions = { signal: application.signal };
    let enter!: () => void;
    const entered = new Promise<void>(resolve => {
      enter = resolve;
    });
    typeRegistry.installAll([
      testAssetType<string, string>({
        id: 'typeA',
        token: TypeA,
        create: async (_source, context) => {
          expect(context.signal).toBe(load.signal);
          expect(context.signal?.aborted).toBe(false);
          enter();

          return new Promise((_resolve, reject) => {
            context.signal?.addEventListener('abort', () => reject(context.signal?.reason as Error));
          });
        },
      }),
    ]);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('payload'));

    try {
      const result = decoder._dispatchFetch(canonical(TypeA, 'asset'), undefined, load.signal, fakeScope);
      await entered;
      expect(remove).toHaveBeenCalledTimes(1);
      const reason = new DOMException('cancelled factory', 'AbortError');
      load.abort(reason);
      await expect(result).rejects.toBe(reason);
    } finally {
      Object.defineProperty(AbortSignal, 'any', descriptor);
      remove.mockRestore();
      fetch.mockRestore();
    }
  });

  test('a cached policy can fetch later with live fallback cancellation', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!;
    Object.defineProperty(AbortSignal, 'any', { ...descriptor, value: undefined });
    const application = new AbortController();
    const load = new AbortController();
    const { cache, contexts } = createFakeCache();
    const { decoder, typeRegistry, canonical } = createDecoder({ cache });
    decoder.fetchOptions = { signal: application.signal };
    typeRegistry.installAll([testAssetType<string, string>({ id: 'typeA', token: TypeA, create: async source => source })]);
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason as Error));
        }),
    );

    try {
      await decoder._dispatchFetch(canonical(TypeA, 'asset'), undefined, load.signal, fakeScope);
      const refresh = contexts[0]!.fetch();
      const reason = new DOMException('cancelled refresh', 'AbortError');
      application.abort(reason);
      await expect(refresh).rejects.toBe(reason);
    } finally {
      Object.defineProperty(AbortSignal, 'any', descriptor);
      fetch.mockRestore();
    }
  });

  test('basePath/fetchOptions round-trip', () => {
    const { decoder } = createDecoder();

    decoder.basePath = 'assets/';
    expect(decoder.basePath).toBe('assets/');

    decoder.fetchOptions = { credentials: 'include' };
    expect(decoder.fetchOptions).toEqual({ credentials: 'include' });
  });

  test('_dispatchFetch stores what the factory built', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();

    typeRegistry.installAll([
      testAssetType<string, string>({ id: 'typeA', token: TypeA, acquires: false, create: async () => 'factory-result' }),
    ]);

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

    await expect(decoder._dispatchFetch(canonical(TypeA, 'hero.png'), undefined, undefined, fakeScope)).rejects.toThrow(
      /No asset type is installed for TypeA/,
    );
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_dispatchFetch hands the request options to the factory', async () => {
    const { decoder, typeRegistry, storeResource, canonical } = createDecoder();
    let seenOptions: unknown;
    let seenSource: unknown;
    let seenFormats: unknown;

    typeRegistry.installAll([
      testAssetType<string, unknown, { scale: number }>({
        id: 'typeA',
        token: TypeA,
        acquires: false,
        create: async (_source, context) => {
          seenOptions = context.options;
          seenSource = context.source;
          seenFormats = context.textureFormats;

          return { ok: true };
        },
      }),
    ]);

    await decoder._dispatchFetch(canonical(TypeA, 'hero.png'), { scale: 2 }, undefined, fakeScope);

    expect(seenOptions).toEqual({ scale: 2 });
    expect(seenSource).toBe('hero.png');
    expect(seenFormats).toBe(fakeLoader.variants.profile.textureFormats);
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

    typeRegistry.installAll([
      testAssetType<string, string>({ id: 'typeA', token: TypeA, acquires: false, create: async () => 'streamed' }),
    ]);

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

    await expect(decoder._injectSource(canonical(TypeA, 'hero.dat'), new ArrayBuffer(8), fakeScope)).rejects.toThrow(
      /cannot be built from container bytes/,
    );
    expect(storeResource).not.toHaveBeenCalled();
  });

  test('_injectSource throws when no type is installed for the token, and never stores', async () => {
    const { decoder, storeResource, canonical } = createDecoder();

    await expect(decoder._injectSource(canonical(TypeA, 'hero.dat'), new ArrayBuffer(4), fakeScope)).rejects.toThrow(
      /No asset type is installed/,
    );
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
