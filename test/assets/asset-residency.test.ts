import { describe, expect, test, vi } from 'vitest';

import type { AssetConstructor } from '#assets/AssetConstructor';
import { AssetDecoder } from '#assets/AssetDecoder';
import type { AssetResidencySignals } from '#assets/AssetResidency';
import { AssetResidency } from '#assets/AssetResidency';
import { AssetTypeRegistry } from '#assets/AssetTypeRegistry';
import type { CacheRequest, CacheStrategy } from '#assets/CacheStrategy';
import { type CanonicalAsset, canonicalizeSource, resourceKey, sourceKey } from '#assets/canonicalKey';
import type { Loader } from '#assets/Loader';
import { LoaderScope } from '#assets/LoaderScope';
import type { SeamlessAdapter } from '#assets/seamless';

class TypeA {}

const fakeLoader = {} as Loader;

/** Binds TypeA to a bindAsset handler whose load() routes through context.fetchText - the
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

  const canonical = (type: AssetConstructor, source: string, options?: unknown): CanonicalAsset => ({
    key: resourceKey(typeRegistry._typeIdentity(type), canonicalizeSource('', source), typeRegistry._identityDiscriminator(type, source, options)),
    sourceKey: sourceKey(canonicalizeSource('', source), typeRegistry._sourceDiscriminator(type, source, options)),
    locator: canonicalizeSource('', source),
    type,
    source,
  });

  const residency = new AssetResidency(
    typeRegistry,
    decoder,
    { onProgress, onLoaded, onError } as unknown as AssetResidencySignals,
    overrides.concurrency ?? 6,
    {
      canonicalize: canonical,
      createDependencyScope: asset => new LoaderScope(fakeLoader, 'dependency', asset.source),
    },
  );

  decoder._bindResourceStore((asset, resource) => residency._storeResource(asset, resource));

  return { residency, typeRegistry, decoder, strategy, onProgress, onLoaded, onError, canonical };
}

describe('AssetResidency', () => {
  describe('claim / release / eviction', () => {
    test('claim then release at refcount 0 evicts a stored, seamless-adapted resource', async () => {
      const { residency, typeRegistry, canonical } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const scope = new LoaderScope(fakeLoader, 'scope', 'scope');
      const handle = residency._getSeamless(canonical(TypeA, 'a.png'), adapter);
      residency._claim(canonical(TypeA, 'a.png'), scope);

      residency._storeResource(canonical(TypeA, 'a.png'), handle);
      expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBe(handle);

      residency._release(canonical(TypeA, 'a.png').key, scope);

      expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBeNull();
      expect(adapter.evict).toHaveBeenCalledWith(handle);
    });

    test('claim on an evicted key re-drives the fetch and heals the same handle', async () => {
      const { strategy, requests } = (() => {
        const seen: CacheRequest[] = [];
        return { strategy: createFakeStrategy(r => (seen.push(r), 'decoded')), requests: seen };
      })();
      const { residency, typeRegistry, canonical } = createResidency({ cacheStrategy: strategy });
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);
      bindTypeA(typeRegistry);

      const scope = new LoaderScope(fakeLoader, 'scope', 'scope');
      const key = canonical(TypeA, 'a.png').key;
      const handle = residency._getSeamless(canonical(TypeA, 'a.png'), adapter);
      residency._claim(canonical(TypeA, 'a.png'), scope);
      residency._storeResource(canonical(TypeA, 'a.png'), handle);
      residency._release(key, scope);

      expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBeNull();

      // The first `_getSeamless(...)` call above already started (and completed) a
      // fetch, so `requests` is already non-empty by this point - snapshot the count
      // right before the re-claim so the assertion below can only pass if the
      // re-claim itself drove a NEW fetch, not just the original one.
      const requestsBeforeReclaim = requests.length;

      residency._claim(canonical(TypeA, 'a.png'), scope);
      await new Promise(r => setTimeout(r, 0));

      expect(requests.length).toBeGreaterThan(requestsBeforeReclaim);
      // The SAME handle heals in place: eviction re-armed it to 'loading' (not
      // 'failed'), so the re-fetch's arrival goes straight to fill(), and the
      // healed handle becomes the resident resource again.
      expect(adapter.fill).toHaveBeenCalledWith(handle, 'decoded');
      expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBe(handle);
    });

    test('claim then release at refcount 0 disposes and frees a stored value asset', () => {
      const { residency, typeRegistry, canonical } = createResidency();
      const dispose = vi.fn();
      typeRegistry.bindAsset({ ctor: TypeA }, { load: async (request, ctx) => ctx.fetchText(request.source), dispose });

      const scope = new LoaderScope(fakeLoader, 'scope', 'scope');
      const key = canonical(TypeA, 'a.json').key;
      const ref = residency._getRef(canonical(TypeA, 'a.json'));
      residency._claim(canonical(TypeA, 'a.json'), scope);

      const resource = { hp: 3 };
      residency._storeResource(canonical(TypeA, 'a.json'), resource);

      expect(residency._peekResource(canonical(TypeA, 'a.json').key)).toBe(resource);
      expect(ref.state).toBe('ready');

      residency._release(key, scope);

      // The bound handler's per-resource teardown ran on the exact payload...
      expect(dispose).toHaveBeenCalledWith(resource);
      // ...the payload left the resident store...
      expect(residency._peekResource(canonical(TypeA, 'a.json').key)).toBeNull();
      // ...and the ref was re-armed in place, so it neither hands out nor pins
      // the value that was just disposed.
      expect(ref.state).toBe('loading');
      expect(() => ref.value).toThrow("'loading'");
    });

    test('a value asset whose handler implements no dispose is still freed at refcount 0', () => {
      const { residency, typeRegistry, canonical } = createResidency();
      typeRegistry.bindAsset({ ctor: TypeA }, { load: async (request, ctx) => ctx.fetchText(request.source) });

      const scope = new LoaderScope(fakeLoader, 'scope', 'scope');
      const key = canonical(TypeA, 'a.json').key;
      residency._claim(canonical(TypeA, 'a.json'), scope);
      residency._storeResource(canonical(TypeA, 'a.json'), { hp: 3 });

      expect(() => residency._release(key, scope)).not.toThrow();
      expect(residency._peekResource(canonical(TypeA, 'a.json').key)).toBeNull();
    });

    test('claim on an evicted value key re-drives the fetch and heals the same ref', async () => {
      const { residency, typeRegistry, canonical } = createResidency({ cacheStrategy: createFakeStrategy(() => 'decoded') });
      typeRegistry.bindAsset({ ctor: TypeA }, { load: async (request, ctx) => ctx.fetchText(request.source) });

      const scope = new LoaderScope(fakeLoader, 'scope', 'scope');
      const key = canonical(TypeA, 'a.json').key;
      const ref = residency._getRef(canonical(TypeA, 'a.json'));
      residency._claim(canonical(TypeA, 'a.json'), scope);

      await new Promise(r => setTimeout(r, 0));
      expect(ref.state).toBe('ready');

      residency._release(key, scope);
      expect(residency._peekResource(canonical(TypeA, 'a.json').key)).toBeNull();

      residency._claim(canonical(TypeA, 'a.json'), scope);
      await new Promise(r => setTimeout(r, 0));

      // Same ref identity, healed in place from a fresh fetch.
      expect(residency._getRef(canonical(TypeA, 'a.json'))).toBe(ref);
      expect(ref.state).toBe('ready');
      expect(ref.value).toBe('decoded');
      expect(residency._peekResource(canonical(TypeA, 'a.json').key)).toBe('decoded');
    });

    test('releaseScope releases every key held under that scope', () => {
      const { residency, typeRegistry, canonical } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const scope = new LoaderScope(fakeLoader, 'scope', 'scope');
      const keyA = canonical(TypeA, 'a.png').key;
      const keyB = canonical(TypeA, 'b.png').key;

      residency._claim(canonical(TypeA, 'a.png'), scope);
      residency._claim(canonical(TypeA, 'b.png'), scope);
      residency._storeResource(canonical(TypeA, 'a.png'), {});
      residency._storeResource(canonical(TypeA, 'b.png'), {});

      residency._releaseScope(scope);

      expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBeNull();
      expect(residency._peekResource(canonical(TypeA, 'b.png').key)).toBeNull();
    });
  });

  describe('_storeResource — multi-handle fill and free-on-arrival', () => {
    test('fills every deferred handle registered for the key from one decode (multi-handle fill)', () => {
      const { residency, typeRegistry, onLoaded, canonical } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const key = canonical(TypeA, 'a.png').key;
      const handleA = residency._getSeamless(canonical(TypeA, 'a.png'), adapter);
      const handleB = {};
      const deferred = (residency as unknown as { _deferred: Map<string, { handles: { add(h: object): void } }> })._deferred.get(key)!;
      residency._addDeferredHandle(key, deferred, handleB);

      const donor = { decoded: true };
      const stored = residency._storeResource(canonical(TypeA, 'a.png'), donor);

      expect(stored).toBe(handleA);
      expect(adapter.fill).toHaveBeenCalledWith(handleB, donor);
      // The signals boundary - onLoaded dispatches with the REPRESENTATIVE handle
      // (handleA), the same value _storeResource returned above, not the raw donor.
      expect(onLoaded.dispatch).toHaveBeenCalledWith(TypeA, 'a.png', handleA);
    });

    test('free-on-arrival: a key whose last claim released mid-fetch evicts immediately once the fetch lands', () => {
      const { residency, typeRegistry, canonical } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const scope = new LoaderScope(fakeLoader, 'scope', 'scope');
      const key = canonical(TypeA, 'a.png').key;
      residency._getSeamless(canonical(TypeA, 'a.png'), adapter);
      residency._claim(canonical(TypeA, 'a.png'), scope);
      residency._release(key, scope); // releases while "in flight" (nothing stored yet)

      residency._storeResource(canonical(TypeA, 'a.png'), {});

      // The fill settled .loaded (asset WAS complete), but since no claim exists, it's evicted on arrival.
      expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBeNull();
    });

    test('a key unloaded mid-fetch (_preventStoreKeys) fails its deferred handles instead of storing', () => {
      const { residency, typeRegistry, canonical } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const handle = residency._getSeamless(canonical(TypeA, 'a.png'), adapter);
      residency._unloadOne(canonical(TypeA, 'a.png')); // marks in-flight prevent-store, since nothing is stored yet but a deferred entry exists

      residency._storeResource(canonical(TypeA, 'a.png'), {});

      expect(adapter.fail).toHaveBeenCalledWith(handle, expect.any(Error));
      expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBeNull();
    });

    test('a rejected fetch dispatches onError with the failing type/alias/error (signals boundary)', async () => {
      const strategy = createFakeStrategy();
      (strategy.resolve as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'));
      const { residency, typeRegistry, onError, canonical } = createResidency({ cacheStrategy: strategy });
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);
      bindTypeA(typeRegistry);

      residency._getSeamless(canonical(TypeA, 'fail.png'), adapter);
      await new Promise(r => setTimeout(r, 0));

      expect(onError.dispatch).toHaveBeenCalledWith(TypeA, 'fail.png', expect.any(Error));
    });
  });

  describe('background queue', () => {
    test('enqueueBackgroundFetch defers the fetch until drained by awaitBackground', async () => {
      const requests: CacheRequest[] = [];
      const strategy = createFakeStrategy(r => (requests.push(r), 'bg-value'));
      const { residency, typeRegistry, onProgress, canonical } = createResidency({ cacheStrategy: strategy });
      bindTypeA(typeRegistry);

      residency._enqueueBackgroundFetch(canonical(TypeA, 'bg.png'), undefined);
      await residency.awaitBackground();

      expect(requests).toHaveLength(1);
      expect(residency._peekResource(canonical(TypeA, 'bg.png').key)).toBe('bg-value');
      // The signals boundary - onProgress dispatches the (loaded, total) counts as
      // the single queued entry completes.
      expect(onProgress.dispatch).toHaveBeenCalledWith(1, 1);
    });

    test('a direct claim on a queued key boosts it out of the background queue immediately', async () => {
      const requests: CacheRequest[] = [];
      const strategy = createFakeStrategy(r => (requests.push(r), 'boosted-value'));
      const { residency, typeRegistry, canonical } = createResidency({ cacheStrategy: strategy, concurrency: 0 });
      bindTypeA(typeRegistry);

      residency._enqueueBackgroundFetch(canonical(TypeA, 'boost.png'), undefined);
      expect(requests).toHaveLength(0); // concurrency 0: nothing started yet

      await residency._loadSingle(canonical(TypeA, 'boost.png'));

      expect(requests).toHaveLength(1);
    });

    test('setConcurrency changes how many entries drain concurrently', async () => {
      const requests: CacheRequest[] = [];
      const strategy = createFakeStrategy(r => (requests.push(r), 'value'));
      const { residency, typeRegistry, canonical } = createResidency({ cacheStrategy: strategy, concurrency: 0 });
      bindTypeA(typeRegistry);

      residency._enqueueBackgroundFetch(canonical(TypeA, 'a.png'), undefined);
      residency._enqueueBackgroundFetch(canonical(TypeA, 'b.png'), undefined);
      expect(requests).toHaveLength(0); // concurrency 0: nothing can drain yet

      residency.setConcurrency(2);
      await residency.awaitBackground();

      expect(requests).toHaveLength(2);
    });
  });

  describe('unload / unloadAll', () => {
    test('_unloadOne removes a stored resource and forgets its claim bookkeeping', () => {
      const { residency, typeRegistry, canonical } = createResidency();
      residency._storeResource(canonical(TypeA, 'a.png'), 'value');
      residency._claim(canonical(TypeA, 'a.png'), new LoaderScope(fakeLoader, 'scope'));

      residency._unloadOne(canonical(TypeA, 'a.png'));

      expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBeNull();
    });

    test('unloadAll(type) clears only that type', () => {
      const { residency, canonical } = createResidency();
      class TypeB {}
      residency._storeResource(canonical(TypeA, 'a.png'), 'a');
      residency._storeResource(canonical(TypeB, 'b.png'), 'b');

      residency.unloadAll(TypeA);

      expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBeNull();
      expect(residency._peekResource(canonical(TypeB, 'b.png').key)).toBe('b');
    });

    test('unloadAll() with no argument clears everything', () => {
      const { residency, canonical } = createResidency();
      residency._storeResource(canonical(TypeA, 'a.png'), 'a');

      residency.unloadAll();

      expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBeNull();
    });
  });

  describe('read accessors', () => {
    test('_keyFor returns the (type, source) an object resource was first stored under', () => {
      const { residency, canonical } = createResidency();
      const value = {};
      residency._storeResource(canonical(TypeA, 'a.png'), value);

      expect(residency._keyFor(value)).toEqual({ type: TypeA, source: 'a.png' });
      expect(residency._keyFor({})).toBeNull();
    });

    test('two spellings of one source share a single canonical key, fetch and resident entry', async () => {
      const strategy = createFakeStrategy(() => 'v');
      const { residency, typeRegistry, canonical } = createResidency({ cacheStrategy: strategy });
      bindTypeA(typeRegistry);

      const [direct, viaDotSegments] = await Promise.all([
        residency._loadSingle(canonical(TypeA, 'a.png')),
        residency._loadSingle(canonical(TypeA, './sub/../a.png')),
      ]);

      expect(direct).toBe('v');
      expect(viaDotSegments).toBe('v');
      expect(strategy.resolve).toHaveBeenCalledTimes(1);
      expect(canonical(TypeA, './sub/../a.png').key).toBe(canonical(TypeA, 'a.png').key);
    });

    test('_loadSingle rejects with a clear error when no bindAsset handler is registered for the type', async () => {
      const { residency, canonical } = createResidency();

      await expect(residency._loadSingle(canonical(TypeA, 'a.png'))).rejects.toThrow(/No asset handler registered for TypeA/);
    });

    test('_loadSingle routes context.fetchText through the bindAsset binding storageName instead of the shared namespace', async () => {
      const requests: CacheRequest[] = [];
      const strategy = createFakeStrategy(r => (requests.push(r), 'ns-value'));
      const { residency, typeRegistry, canonical } = createResidency({ cacheStrategy: strategy });

      typeRegistry.bindAsset({ ctor: TypeA, storageName: 'my-type-ns' }, { load: async (request, ctx) => ctx.fetchText(request.source) });

      const result = await residency._loadSingle(canonical(TypeA, 'a.png'));

      expect(requests[0]?.storageName).toBe('my-type-ns');
      expect(result).toBe('ns-value');
    });

    test('_getHandleKey resolves a deferred handle back to its resource key', () => {
      const { residency, typeRegistry, canonical } = createResidency();
      const adapter = createFakeSeamlessAdapter();
      typeRegistry.registerSeamlessAdapter(TypeA, adapter);

      const handle = residency._getSeamless(canonical(TypeA, 'a.png'), adapter) as object;

      expect(residency._getHandleKey(handle)).toBe(canonical(TypeA, 'a.png').key);
      expect(residency._getHandleKey({})).toBeUndefined();
    });
  });

  test('destroy() clears resident resources, in-flight tracking, claims, and the background queue', async () => {
    const { residency, typeRegistry, canonical } = createResidency({ concurrency: 0 });
    residency._storeResource(canonical(TypeA, 'a.png'), 'value');
    residency._claim(canonical(TypeA, 'a.png'), new LoaderScope(fakeLoader, 'scope'));
    residency._enqueueBackgroundFetch(canonical(TypeA, 'queued.png'), undefined);

    residency.destroy();

    expect(residency._peekResource(canonical(TypeA, 'a.png').key)).toBeNull();
  });
});
