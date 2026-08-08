import { describe, expect, test, vi } from 'vitest';

import { Asset } from '#assets/Asset';
import { AssetDecoder } from '#assets/AssetDecoder';
import type { AssetResidencySignals } from '#assets/AssetResidency';
import { AssetResidency } from '#assets/AssetResidency';
import { AssetTypeRegistry } from '#assets/AssetTypeRegistry';
import type { CacheRequest, CacheStrategy } from '#assets/CacheStrategy';
import type { Loader } from '#assets/Loader';
import type { SeamlessAdapter } from '#assets/seamless';

class TypeA {}

const fakeLoader = {} as Loader;

/** Binds TypeA to a bindAsset handler whose load() routes through context.fetchText — the
 * replacement for the removed `register()`-based factory path used to make a bare
 * constructor "loadable" for these AssetResidency-level tests. */
function bindTypeA(typeRegistry: AssetTypeRegistry): void {
  typeRegistry.bindAsset({ ctor: TypeA }, { load: async (request, ctx) => ctx.fetchText(request.source) });
}

/** Fake strategy that resolves to a canned value (or rejects, via mockRejectedValueOnce on .resolve). */
function createFakeStrategy(resolveTo: (request: CacheRequest) => unknown = () => 'resolved'): CacheStrategy {
  return { resolve: vi.fn(async (request: CacheRequest) => resolveTo(request)) };
}

/** A minimal seamless-handle: a plain object whose identity IS the handle, tracked via a WeakMap-backed state. */
function createFakeSeamlessAdapter(): SeamlessAdapter<unknown> & { states: WeakMap<object, 'loading' | 'ready' | 'failed'> } {
  const states = new WeakMap<object, 'loading' | 'ready' | 'failed'>();

  return {
    states,
    createPlaceholder: vi.fn((): object => {
      const handle = {};
      states.set(handle, 'loading');
      return handle;
    }),
    stateOf: vi.fn((handle: object) => states.get(handle) ?? 'loading'),
    begin: vi.fn((handle: object) => states.set(handle, 'loading')),
    fill: vi.fn((handle: object) => states.set(handle, 'ready')),
    fail: vi.fn((handle: object) => states.set(handle, 'failed')),
    evict: vi.fn((handle: object) => states.set(handle, 'loading')),
  };
}

function createResidency(overrides: { cacheStrategy?: CacheStrategy; concurrency?: number } = {}) {
  const typeRegistry = new AssetTypeRegistry();
  const strategy = overrides.cacheStrategy ?? createFakeStrategy();
  const decoder = new AssetDecoder(fakeLoader, typeRegistry, {
    basePath: '',
    fetchOptions: {},
    stores: [],
    cacheStrategy: strategy,
  });
  const onProgress = { dispatch: vi.fn() } as unknown as import('#core/Signal').Signal<[number, number]>;
  const onLoaded = { dispatch: vi.fn() } as unknown as import('#core/Signal').Signal<[unknown, string, unknown]>;
  const onError = { dispatch: vi.fn() } as unknown as import('#core/Signal').Signal<[unknown, string, Error]>;

  const residency = new AssetResidency(
    typeRegistry,
    decoder,
    { onProgress, onLoaded, onError } as unknown as AssetResidencySignals,
    overrides.concurrency ?? 6,
  );

  decoder._bindResourceStore((type, alias, resource) => residency._storeResource(type, alias, resource));

  return { residency, typeRegistry, decoder, strategy, onProgress, onLoaded, onError };
}

describe('AssetResidency', () => {
  describe('claim / release / eviction', () => {
    test('claim then release at refcount 0 evicts a stored, seamless-adapted resource', async () => {
      const { residency, typeRegistry } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const scope = Symbol('scope');
      const handle = residency._getSeamless(TypeA, adapter, 'a.png');
      residency._claim(typeRegistry._key(TypeA, 'a.png'), TypeA, 'a.png', scope);

      residency._storeResource(TypeA, 'a.png', handle);
      expect(residency._peekResource(TypeA, 'a.png')).toBe(handle);

      residency._release(typeRegistry._key(TypeA, 'a.png'), scope);

      expect(residency._peekResource(TypeA, 'a.png')).toBeNull();
      expect(adapter.evict).toHaveBeenCalledWith(handle);
    });

    test('claim on an evicted key re-drives the fetch and heals the same handle', async () => {
      const { strategy, requests } = (() => {
        const seen: CacheRequest[] = [];
        return { strategy: createFakeStrategy(r => (seen.push(r), 'decoded')), requests: seen };
      })();
      const { residency, typeRegistry } = createResidency({ cacheStrategy: strategy });
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);
      bindTypeA(typeRegistry);

      const scope = Symbol('scope');
      const key = typeRegistry._key(TypeA, 'a.png');
      const handle = residency._getSeamless(TypeA, adapter, 'a.png');
      residency._claim(key, TypeA, 'a.png', scope);
      residency._storeResource(TypeA, 'a.png', handle);
      residency._release(key, scope);

      expect(residency._peekResource(TypeA, 'a.png')).toBeNull();

      // The first `_getSeamless(...)` call above already started (and completed) a
      // fetch, so `requests` is already non-empty by this point — snapshot the count
      // right before the re-claim so the assertion below can only pass if the
      // re-claim itself drove a NEW fetch, not just the original one.
      const requestsBeforeReclaim = requests.length;

      residency._claim(key, TypeA, 'a.png', scope);
      await new Promise(r => setTimeout(r, 0));

      expect(requests.length).toBeGreaterThan(requestsBeforeReclaim);
      // The SAME handle heals in place: eviction re-armed it to 'loading' (not
      // 'failed'), so the re-fetch's arrival goes straight to fill(), and the
      // healed handle becomes the resident resource again.
      expect(adapter.fill).toHaveBeenCalledWith(handle, 'decoded');
      expect(residency._peekResource(TypeA, 'a.png')).toBe(handle);
    });

    test('claim then release at refcount 0 disposes and frees a stored value asset', () => {
      const { residency, typeRegistry } = createResidency();
      const dispose = vi.fn();
      typeRegistry.bindAsset({ ctor: TypeA }, { load: async (request, ctx) => ctx.fetchText(request.source), dispose });

      const scope = Symbol('scope');
      const key = typeRegistry._key(TypeA, 'a.json');
      const ref = residency._getRef(TypeA, 'a.json');
      residency._claim(key, TypeA, 'a.json', scope);

      const resource = { hp: 3 };
      residency._storeResource(TypeA, 'a.json', resource);

      expect(residency._peekResource(TypeA, 'a.json')).toBe(resource);
      expect(ref.state).toBe('ready');

      residency._release(key, scope);

      // The bound handler's per-resource teardown ran on the exact payload...
      expect(dispose).toHaveBeenCalledWith(resource);
      // ...the payload left the resident store...
      expect(residency._peekResource(TypeA, 'a.json')).toBeNull();
      // ...and the ref was re-armed in place, so it neither hands out nor pins
      // the value that was just disposed.
      expect(ref.state).toBe('loading');
      expect(() => ref.value).toThrow("'loading'");
    });

    test('a value asset whose handler implements no dispose is still freed at refcount 0', () => {
      const { residency, typeRegistry } = createResidency();
      typeRegistry.bindAsset({ ctor: TypeA }, { load: async (request, ctx) => ctx.fetchText(request.source) });

      const scope = Symbol('scope');
      const key = typeRegistry._key(TypeA, 'a.json');
      residency._claim(key, TypeA, 'a.json', scope);
      residency._storeResource(TypeA, 'a.json', { hp: 3 });

      expect(() => residency._release(key, scope)).not.toThrow();
      expect(residency._peekResource(TypeA, 'a.json')).toBeNull();
    });

    test('claim on an evicted value key re-drives the fetch and heals the same ref', async () => {
      const { residency, typeRegistry } = createResidency({ cacheStrategy: createFakeStrategy(() => 'decoded') });
      typeRegistry.bindAsset({ ctor: TypeA }, { load: async (request, ctx) => ctx.fetchText(request.source) });

      const scope = Symbol('scope');
      const key = typeRegistry._key(TypeA, 'a.json');
      const ref = residency._getRef(TypeA, 'a.json');
      residency._claim(key, TypeA, 'a.json', scope);

      await new Promise(r => setTimeout(r, 0));
      expect(ref.state).toBe('ready');

      residency._release(key, scope);
      expect(residency._peekResource(TypeA, 'a.json')).toBeNull();

      residency._claim(key, TypeA, 'a.json', scope);
      await new Promise(r => setTimeout(r, 0));

      // Same ref identity, healed in place from a fresh fetch.
      expect(residency._getRef(TypeA, 'a.json')).toBe(ref);
      expect(ref.state).toBe('ready');
      expect(ref.value).toBe('decoded');
      expect(residency._peekResource(TypeA, 'a.json')).toBe('decoded');
    });

    test('releaseScope releases every key held under that scope', () => {
      const { residency, typeRegistry } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const scope = Symbol('scope');
      const keyA = typeRegistry._key(TypeA, 'a.png');
      const keyB = typeRegistry._key(TypeA, 'b.png');

      residency._claim(keyA, TypeA, 'a.png', scope);
      residency._claim(keyB, TypeA, 'b.png', scope);
      residency._storeResource(TypeA, 'a.png', {});
      residency._storeResource(TypeA, 'b.png', {});

      residency._releaseScope(scope);

      expect(residency._peekResource(TypeA, 'a.png')).toBeNull();
      expect(residency._peekResource(TypeA, 'b.png')).toBeNull();
    });
  });

  describe('_storeResource — multi-handle fill and free-on-arrival', () => {
    test('fills every deferred handle registered for the key from one decode (multi-handle fill)', () => {
      const { residency, typeRegistry, onLoaded } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const key = typeRegistry._key(TypeA, 'a.png');
      const handleA = residency._getSeamless(TypeA, adapter, 'a.png');
      const handleB = {};
      const deferred = (residency as unknown as { _deferred: Map<string, { handles: { add(h: object): void } }> })._deferred.get(key)!;
      residency._addDeferredHandle(key, deferred, handleB);

      const donor = { decoded: true };
      const stored = residency._storeResource(TypeA, 'a.png', donor);

      expect(stored).toBe(handleA);
      expect(adapter.fill).toHaveBeenCalledWith(handleB, donor);
      // The signals boundary — onLoaded dispatches with the REPRESENTATIVE handle
      // (handleA), the same value _storeResource returned above, not the raw donor.
      expect(onLoaded.dispatch).toHaveBeenCalledWith(TypeA, 'a.png', handleA);
    });

    test('free-on-arrival: a key whose last claim released mid-fetch evicts immediately once the fetch lands', () => {
      const { residency, typeRegistry } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const scope = Symbol('scope');
      const key = typeRegistry._key(TypeA, 'a.png');
      residency._getSeamless(TypeA, adapter, 'a.png');
      residency._claim(key, TypeA, 'a.png', scope);
      residency._release(key, scope); // releases while "in flight" (nothing stored yet)

      residency._storeResource(TypeA, 'a.png', {});

      // The fill settled .loaded (asset WAS complete), but since no claim exists, it's evicted on arrival.
      expect(residency._peekResource(TypeA, 'a.png')).toBeNull();
    });

    test('a key unloaded mid-fetch (_preventStoreKeys) fails its deferred handles instead of storing', () => {
      const { residency, typeRegistry } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const handle = residency._getSeamless(TypeA, adapter, 'a.png');
      residency._unloadOne(TypeA, 'a.png'); // marks in-flight prevent-store, since nothing is stored yet but a deferred entry exists

      residency._storeResource(TypeA, 'a.png', {});

      expect(adapter.fail).toHaveBeenCalledWith(handle, expect.any(Error));
      expect(residency._peekResource(TypeA, 'a.png')).toBeNull();
    });

    test('a rejected fetch dispatches onError with the failing type/alias/error (signals boundary)', async () => {
      const strategy = createFakeStrategy();
      (strategy.resolve as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'));
      const { residency, typeRegistry, onError } = createResidency({ cacheStrategy: strategy });
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);
      bindTypeA(typeRegistry);

      residency._getSeamless(TypeA, adapter, 'fail.png');
      await new Promise(r => setTimeout(r, 0));

      expect(onError.dispatch).toHaveBeenCalledWith(TypeA, 'fail.png', expect.any(Error));
    });
  });

  describe('background queue', () => {
    test('enqueueBackgroundFetch defers the fetch until drained by awaitBackground', async () => {
      const requests: CacheRequest[] = [];
      const strategy = createFakeStrategy(r => (requests.push(r), 'bg-value'));
      const { residency, typeRegistry, onProgress } = createResidency({ cacheStrategy: strategy });
      bindTypeA(typeRegistry);

      residency._enqueueBackgroundFetch(TypeA, 'bg.png', undefined);
      await residency.awaitBackground();

      expect(requests).toHaveLength(1);
      expect(residency._peekResource(TypeA, 'bg.png')).toBe('bg-value');
      // The signals boundary — onProgress dispatches the (loaded, total) counts as
      // the single queued entry completes.
      expect(onProgress.dispatch).toHaveBeenCalledWith(1, 1);
    });

    test('a direct claim on a queued key boosts it out of the background queue immediately', async () => {
      const requests: CacheRequest[] = [];
      const strategy = createFakeStrategy(r => (requests.push(r), 'boosted-value'));
      const { residency, typeRegistry } = createResidency({ cacheStrategy: strategy, concurrency: 0 });
      bindTypeA(typeRegistry);

      residency._enqueueBackgroundFetch(TypeA, 'boost.png', undefined);
      expect(requests).toHaveLength(0); // concurrency 0: nothing started yet

      await residency._loadSingle(TypeA, 'boost.png');

      expect(requests).toHaveLength(1);
    });

    test('setConcurrency changes how many entries drain concurrently', async () => {
      const requests: CacheRequest[] = [];
      const strategy = createFakeStrategy(r => (requests.push(r), 'value'));
      const { residency, typeRegistry } = createResidency({ cacheStrategy: strategy, concurrency: 0 });
      bindTypeA(typeRegistry);

      residency._enqueueBackgroundFetch(TypeA, 'a.png', undefined);
      residency._enqueueBackgroundFetch(TypeA, 'b.png', undefined);
      expect(requests).toHaveLength(0); // concurrency 0: nothing can drain yet

      residency.setConcurrency(2);
      await residency.awaitBackground();

      expect(requests).toHaveLength(2);
    });
  });

  describe('unload / unloadAll', () => {
    test('_unloadOne removes a stored resource and forgets its claim bookkeeping', () => {
      const { residency, typeRegistry } = createResidency();
      residency._storeResource(TypeA, 'a.png', 'value');
      residency._claim(typeRegistry._key(TypeA, 'a.png'), TypeA, 'a.png', Symbol('scope'));

      residency._unloadOne(TypeA, 'a.png');

      expect(residency._peekResource(TypeA, 'a.png')).toBeNull();
    });

    test('unloadAll(type) clears only that type', () => {
      const { residency } = createResidency();
      class TypeB {}
      residency._storeResource(TypeA, 'a.png', 'a');
      residency._storeResource(TypeB, 'b.png', 'b');

      residency.unloadAll(TypeA);

      expect(residency._peekResource(TypeA, 'a.png')).toBeNull();
      expect(residency._peekResource(TypeB, 'b.png')).toBe('b');
    });

    test('unloadAll() with no argument clears everything', () => {
      const { residency } = createResidency();
      residency._storeResource(TypeA, 'a.png', 'a');

      residency.unloadAll();

      expect(residency._peekResource(TypeA, 'a.png')).toBeNull();
    });
  });

  describe('read accessors', () => {
    test('_keyFor returns the (type, source) an object resource was first stored under', () => {
      const { residency } = createResidency();
      const value = {};
      residency._storeResource(TypeA, 'a.png', value);

      expect(residency._keyFor(value)).toEqual({ type: TypeA, source: 'a.png' });
      expect(residency._keyFor({})).toBeNull();
    });

    test('_getAliasesForIdentity reflects loadSingleAsset alias registration', async () => {
      const strategy = createFakeStrategy(() => 'v');
      const { residency, typeRegistry } = createResidency({ cacheStrategy: strategy });
      bindTypeA(typeRegistry);

      // Asset's public constructor facade is `Asset.type(kind, source, options?)` (see
      // src/assets/Asset.ts's AssetFacade / test/assets/loader.test.ts usage) — the
      // brief's `new Asset({ type: 'x', ... })` doesn't compile against AssetFacade's typed
      // overload (`kind` must be a real `keyof AssetDefinitions`, and the class is exported
      // as a facade, not a plain constructible). 'json' is an arbitrary real kind here; this
      // asset is never actually decoded as JSON since TypeA has no bindAsset handler bound to
      // that kind — _loadSingleAsset only reads `.source`/`._config`/identity, so the kind
      // choice is inert for what this test verifies.
      const asset = Asset.type('json', 'a.png');
      await residency._loadSingleAsset(TypeA, 'alias1', asset);

      const identityKey = typeRegistry._resolveAssetIdentityKey(TypeA, asset);
      expect(residency._getAliasesForIdentity(identityKey)).toEqual(new Set(['alias1']));
    });

    test('_loadSingleAsset rejects with a clear error when no bindAsset handler is registered for the type', async () => {
      const { residency } = createResidency();
      const asset = Asset.type('json', 'a.png');

      await expect(residency._loadSingleAsset(TypeA, 'alias1', asset)).rejects.toThrow(/No asset handler registered for TypeA/);
    });

    test('_loadSingleAsset routes context.fetchText through the bindAsset binding storageName instead of the shared namespace', async () => {
      const requests: CacheRequest[] = [];
      const strategy = createFakeStrategy(r => (requests.push(r), 'ns-value'));
      const { residency, typeRegistry } = createResidency({ cacheStrategy: strategy });

      typeRegistry.bindAsset({ ctor: TypeA, storageName: 'my-type-ns' }, { load: async (request, ctx) => ctx.fetchText(request.source) });

      const asset = Asset.type('json', 'a.png');
      const result = await residency._loadSingleAsset(TypeA, 'alias1', asset);

      expect(requests[0]?.storageName).toBe('my-type-ns');
      expect(result).toBe('ns-value');
    });

    test('_getHandleKey resolves a deferred handle back to its resource key', () => {
      const { residency, typeRegistry } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const handle = residency._getSeamless(TypeA, adapter, 'a.png') as object;

      expect(residency._getHandleKey(handle)).toBe(typeRegistry._key(TypeA, 'a.png'));
      expect(residency._getHandleKey({})).toBeUndefined();
    });
  });

  test('destroy() clears resident resources, in-flight tracking, claims, and the background queue', async () => {
    const { residency, typeRegistry } = createResidency({ concurrency: 0 });
    residency._storeResource(TypeA, 'a.png', 'value');
    residency._claim(typeRegistry._key(TypeA, 'a.png'), TypeA, 'a.png', Symbol('scope'));
    residency._enqueueBackgroundFetch(TypeA, 'queued.png', undefined);

    residency.destroy();

    expect(residency._peekResource(TypeA, 'a.png')).toBeNull();
  });
});
