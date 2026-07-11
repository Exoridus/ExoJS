import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { createLeaf } from '#resources/assetKindRegistry';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import { WeakHandleSet } from '#resources/WeakHandleSet';

/** Loader with all core asset bindings (mirrors createCoreLoader in the sibling suites). */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

const mockFetchImage = (): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  );
};

/** Typed introspection over the private deferred registry. */
function deferredHandles(loader: Loader, key: string): WeakHandleSet | undefined {
  return (loader as unknown as { _deferred: Map<string, { handles: WeakHandleSet }> })._deferred.get(key)?.handles;
}
function deferredHas(loader: Loader, key: string): boolean {
  return (loader as unknown as { _deferred: Map<string, unknown> })._deferred.has(key);
}
function evictedHas(loader: Loader, key: string): boolean {
  return (loader as unknown as { _evicted: Set<string> })._evicted.has(key);
}
function keyOf(loader: Loader, source: string): string {
  return (loader as unknown as { _key(t: unknown, s: string): string })._key(Texture, source);
}

/** Real major GC + macrotask hops so reclaimed WeakRefs settle. Needs `--expose-gc`. */
const gc = (globalThis as { gc?: () => void }).gc;
async function forceGc(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    gc?.();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('deferred handle bookkeeping (audit A4 / A5)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
    mockFetchImage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  // ── A4: evicted handles are held WEAKLY, not pinned for the loader's lifetime ──

  test('A4: an evicted handle is re-registered WEAKLY (WeakHandleSet), not in a strong Set', async () => {
    const loader = createCoreLoader();
    const key = keyOf(loader, 'x.png');

    const handle = loader.get('x.png');
    await handle.loaded;
    expect(handle.source).not.toBeNull();

    loader.release(handle); // refcount 0 → evict in place, re-arm for heal

    const handles = deferredHandles(loader, key);
    // The finding: before the fix the evicted handle sat in a strong Set for the
    // loader's lifetime. It must now live in a WeakHandleSet so the GC can
    // reclaim it once the game drops its last reference.
    expect(handles).toBeInstanceOf(WeakHandleSet);
    expect(handles?.has(handle)).toBe(true); // still healable while referenced
    expect(handle.source).toBeNull(); // payload actually dropped
  });

  test('A4: identity still heals in place after eviction (weak retention keeps the live handle)', async () => {
    const loader = createCoreLoader();

    const handle = loader.get('x.png');
    await handle.loaded;
    loader.release(handle);
    expect(handle.source).toBeNull();

    const again = loader.get('x.png');
    expect(again).toBe(handle); // SAME object — identity preserved across the heal
    await handle.loaded;
    expect(handle.source).not.toBeNull();
  });

  // GC-dependent proof that the A4 leak is actually closed: once the game drops
  // its last reference to an evicted handle, the deferred entry (and its evicted
  // marker) is reclaimed rather than accumulating forever. Runs only under
  // `--expose-gc`; the structural test above is the deterministic CI guard.
  test.runIf(typeof gc === 'function')('A4: a fully-released evicted handle is pruned from _deferred by the GC', async () => {
    const loader = createCoreLoader();
    const key = keyOf(loader, 'orphan.png');

    let handle: Texture | null = loader.get('orphan.png');
    await handle.loaded;

    loader.release(handle); // evict → re-registered weakly, no live claim
    expect(deferredHas(loader, key)).toBe(true);
    expect(evictedHas(loader, key)).toBe(true);

    // Drop the game's last reference so the evicted handle becomes GC-eligible.
    // eslint-disable-next-line no-useless-assignment -- intentional: releases the GC root under test
    handle = null;

    await forceGc();

    // FinalizationRegistry pruned the emptied entry — no unbounded growth.
    expect(deferredHas(loader, key)).toBe(false);
    expect(evictedHas(loader, key)).toBe(false);
  });

  // ── A5: a co-handle adopted from a stored donor joins the deferred set ──

  test('A5: a co-handle adopted from a stored donor appears in the deferred set', async () => {
    const loader = createCoreLoader();
    const key = keyOf(loader, 'x.png');

    // Donor stored first (loaded elsewhere before the co-handle is adopted).
    const donor = loader.get('x.png');
    await donor.loaded;
    expect(donor.source).not.toBeNull();

    // A distinct leaf for the SAME source (what Assets.from() hands back).
    const coHandle = createLeaf('texture', 'x.png') as Texture;
    expect(coHandle).not.toBe(donor);

    loader._adopt(coHandle, Symbol('adopter'));

    // Filled in place from the stored donor…
    expect(coHandle.loadState).toBe('ready');
    expect(coHandle.source).not.toBeNull();
    // …AND entered into the key's deferred set (the finding: previously it was
    // filled once but never tracked, so a later evict+heal skipped it).
    expect(deferredHandles(loader, key)?.has(coHandle)).toBe(true);
    expect(deferredHandles(loader, key)?.has(donor)).toBe(true);
  });

  test('A5: a co-handle is evicted AND healed alongside the donor across an eviction cycle', async () => {
    const loader = createCoreLoader();
    const key = keyOf(loader, 'x.png');
    const adopter = Symbol('adopter');

    const donor = loader.get('x.png'); // claims under the app-lifetime root scope
    await donor.loaded;

    const coHandle = createLeaf('texture', 'x.png') as Texture;
    loader._adopt(coHandle, adopter); // claims under `adopter`
    expect(coHandle.source).not.toBeNull();

    // Drop BOTH claim scopes → refcount 0 → evict.
    loader.release(donor); // releases the root-scope claim
    loader._release(key, adopter); // releases the adopter-scope claim → eviction

    // The finding: previously only the donor was re-armed; the co-handle kept its
    // stale payload. Both must now drop in place.
    expect(donor.source).toBeNull();
    expect(coHandle.source).toBeNull();
    expect(coHandle.loadState).toBe('loading');

    // Re-claim → one re-fetch heals EVERY live consumer in place.
    const again = loader.get('x.png');
    expect(again).toBe(donor);
    await donor.loaded;

    expect(donor.source).not.toBeNull();
    expect(coHandle.source).not.toBeNull();
    expect(coHandle.loadState).toBe('ready');
  });
});
