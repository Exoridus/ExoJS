import { logger } from '#core/logging';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes } from '#rendering/types';
import { createLeaf } from '#resources/assetKindRegistry';
import { _readMeta } from '#resources/assetMeta';
import { type AssetRef } from '#resources/AssetRef';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import type { LoadingQueue } from '#resources/LoadingQueue';
import { Json } from '#resources/tokens';

/** Loader with all core asset bindings (mirrors createCoreLoader in loader-seamless.test.ts / asset-ref.test.ts). */
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

const mockFetchJson = (payload: unknown): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => JSON.stringify(payload),
        arrayBuffer: async () => new ArrayBuffer(0),
      }) as unknown as Response,
  );
};

/**
 * A SINGLE persistent fetch mock that starts failing (404) and switches to
 * succeeding once `succeed()` is called — unlike `mockFetchImage`/`mockFetchJson`
 * (which install a brand-new `vi.fn()` per call), this keeps one mock alive
 * across a failure→retry cycle so the call count can prove "exactly one new
 * fetch per retry, never zero, never two".
 */
function togglableImageFetch(): { readonly fetchMock: ReturnType<typeof vi.fn>; succeed(): void } {
  let ok = false;
  const fetchMock = vi.fn(
    async (): Promise<Response> =>
      ok
        ? ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response)
        : ({ ok: false, status: 404, statusText: 'Not Found' } as Response),
  );

  global.fetch = fetchMock as unknown as typeof fetch;

  return {
    fetchMock,
    succeed(): void {
      ok = true;
    },
  };
}

/** Value-asset (json) twin of {@link togglableImageFetch}. */
function togglableJsonFetch(payload: unknown): { readonly fetchMock: ReturnType<typeof vi.fn>; succeed(): void } {
  let ok = false;
  const fetchMock = vi.fn(
    async (): Promise<Response> =>
      ok
        ? ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => payload,
            text: async () => JSON.stringify(payload),
            arrayBuffer: async () => new ArrayBuffer(0),
          } as unknown as Response)
        : ({ ok: false, status: 404, statusText: 'Not Found' } as Response),
  );

  global.fetch = fetchMock as unknown as typeof fetch;

  return {
    fetchMock,
    succeed(): void {
      ok = true;
    },
  };
}

/** Alias-keyed background-queue probe (mirrors load-background-option.test.ts). */
const isQueued = (loader: Loader, alias: string): boolean =>
  (loader as unknown as { _residency: { _backgroundQueue: Array<{ alias: string }> } })._residency._backgroundQueue.some(e => e.alias === alias);

describe('Loader._adopt', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('fills an externally-created placeholder Texture in place after fetch (identity preserved)', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    // Built with NO loader at all — mirrors what Assets.from() hands back.
    const leaf = createLeaf('texture', 'ship.png') as Texture;

    expect(leaf.loadState).toBe('idle');
    expect(leaf.width).toBe(0);

    loader._adopt(leaf, Symbol('claimer'));

    await expect(leaf.loaded).resolves.toBe(leaf); // heals in place — SAME object
    expect(leaf.loadState).toBe('ready');
    expect(leaf).toBeInstanceOf(Texture);
    expect(leaf.width).toBe(4);

    // The loader's own get() for the same source resolves to the adopted handle.
    expect(loader.get('ship.png')).toBe(leaf);
  });

  test('adopting the same handle twice does not restart the fetch (idempotent)', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const leaf = createLeaf('texture', 'ship.png') as Texture;
    const claimer = Symbol('claimer');
    const warnSpy = vi.spyOn(logger, 'warn');

    loader._adopt(leaf, claimer);
    loader._adopt(leaf, claimer);

    await expect(leaf.loaded).resolves.toBe(leaf);
    expect(leaf.loadState).toBe('ready');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Idempotent re-adopt of the SAME handle must stay a silent no-op.
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('duplicate source, two distinct handles adopted while in flight: BOTH heal from ONE fetch, no warn (§7 multi-handle fill)', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnSpy = vi.spyOn(logger, 'warn');

    const a = createLeaf('texture', 'x.png') as Texture;
    const b = createLeaf('texture', 'x.png') as Texture;

    loader._adopt(a, Symbol('claimer-a'));
    loader._adopt(b, Symbol('claimer-b')); // second distinct handle, first still in flight

    await Promise.all([a.loaded, b.loaded]);

    expect(a.loadState).toBe('ready');
    expect(b.loadState).toBe('ready');
    expect(a).not.toBe(b); // distinct objects, both filled in place
    expect(a.width).toBe(4);
    expect(b.width).toBe(4);
    expect(global.fetch).toHaveBeenCalledTimes(1); // ONE decode shared across both handles
    // Same (default) sampler on both → the former §7 hang-warn must NOT fire.
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('duplicate source, two handles with DIFFERENT samplerOptions: one fetch, independent per-handle samplers (Q2)', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    const a = createLeaf('texture', 'x.png', { samplerOptions: { scaleMode: ScaleModes.Nearest } }) as Texture;
    const b = createLeaf('texture', 'x.png', { samplerOptions: { scaleMode: ScaleModes.Linear } }) as Texture;

    expect(a.scaleMode).toBe(ScaleModes.Nearest); // applied at createPlaceholder
    expect(b.scaleMode).toBe(ScaleModes.Linear);

    loader._adopt(a, Symbol('claimer-a'));
    loader._adopt(b, Symbol('claimer-b'));

    await Promise.all([a.loaded, b.loaded]);

    expect(a.loadState).toBe('ready');
    expect(b.loadState).toBe('ready');
    expect(a.width).toBe(4); // shared decode reached both
    expect(b.width).toBe(4);
    // fill transplanted ONLY the decoded source — each handle kept its OWN sampler.
    expect(a.scaleMode).toBe(ScaleModes.Nearest);
    expect(b.scaleMode).toBe(ScaleModes.Linear);
    expect(a.scaleMode).not.toBe(b.scaleMode);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('duplicate source in flight: a failing fetch fails BOTH co-handles', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' }) as unknown as Response);
    const loader = createCoreLoader();

    const a = createLeaf('texture', 'x.png') as Texture;
    const b = createLeaf('texture', 'x.png') as Texture;

    loader._adopt(a, Symbol('claimer-a'));
    loader._adopt(b, Symbol('claimer-b'));

    await expect(a.loaded).rejects.toThrow();
    await expect(b.loaded).rejects.toThrow();
    expect(a.loadState).toBe('failed');
    expect(b.loadState).toBe('failed');
  });

  test('duplicate source, two value refs (json) adopted while in flight: BOTH fill from ONE fetch', async () => {
    mockFetchJson({ hp: 5 });
    const loader = createCoreLoader();

    const a = createLeaf('json', 'cfg.json') as AssetRef<unknown>;
    const b = createLeaf('json', 'cfg.json') as AssetRef<unknown>;

    loader._adopt(a, Symbol('claimer-a'));
    loader._adopt(b, Symbol('claimer-b'));

    await Promise.all([a.loaded, b.loaded]);

    expect(a.value).toEqual({ hp: 5 });
    expect(b.value).toEqual({ hp: 5 });
    expect(a).not.toBe(b);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('duplicate source in flight with a genuinely conflicting FETCH option (mimeType) warns once; sampler differences do not', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnSpy = vi.spyOn(logger, 'warn');

    const a = createLeaf('texture', 'x.png', { mimeType: 'image/png' }) as Texture;
    const b = createLeaf('texture', 'x.png', { mimeType: 'image/webp' }) as Texture;

    loader._adopt(a, Symbol('claimer-a'));
    loader._adopt(b, Symbol('claimer-b'));

    await Promise.all([a.loaded, b.loaded]);

    // Different mimeType for one source cannot share a decode → the first call wins, second warns.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('first call');

    warnSpy.mockRestore();
  });

  test('resource already stored elsewhere before adopt: fills the adopted handle in place, preserves per-catalog identity, and release() finds its claim', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    // "Loaded elsewhere earlier" — the core catalog scenario: some other
    // consumer already claimed and fully loaded this source under its own
    // scope, well before this leaf is ever adopted.
    const stored = loader.get('x.png');
    await stored.loaded;
    expect(stored.loadState).toBe('ready');
    expect(stored.width).toBe(4);

    // Built with NO loader at all — mirrors what Assets.from() hands back —
    // and is a DISTINCT object from the already-stored resource.
    const leaf = createLeaf('texture', 'x.png') as Texture;
    expect(leaf.loadState).toBe('idle');
    expect(leaf).not.toBe(stored);

    const claimer = Symbol('adopter');
    loader._adopt(leaf, claimer);

    // Bug: previously only _claim() ran for the already-stored branch, so the
    // adopted leaf never healed and stayed 'loading' forever.
    expect(leaf.loadState).toBe('ready');
    await expect(leaf.loaded).resolves.toBe(leaf);
    expect(leaf.width).toBe(4);
    expect(leaf).not.toBe(stored); // filled in place, not swapped — identity preserved

    // Bug: _handleKeys was never registered for this branch, so release(handle)
    // silently couldn't resolve the key and the claim leaked. release(handle)
    // always targets the app-lifetime root claimer (same scope loader.get()
    // claimed under above), so it must now actually drop that scope.
    const key = loader['_typeRegistry']['_key'](Texture, 'x.png');
    expect(loader['_residency']['_claims'].get(key)?.scopes.has(loader['_rootClaimer'])).toBe(true);

    loader.release(leaf);

    expect(loader['_residency']['_claims'].get(key)?.scopes.has(loader['_rootClaimer'])).toBe(false);
    expect(stored.loadState).toBe('ready'); // adopter's own claim still holds it alive
    expect(stored.width).toBe(4);

    // Releasing the adopter's own claim too drops the last scope → eviction.
    loader._release(key, claimer);
    expect(stored.loadState).toBe('loading');
    expect(stored.width).toBe(0);
  });

  test('fills an externally-created value leaf (AssetRef) in place after fetch', async () => {
    mockFetchJson({ hp: 3 });
    const loader = createCoreLoader();

    const leaf = createLeaf('json', 'cfg.json') as AssetRef<unknown>;

    expect(leaf.loadState).toBe('idle');
    expect(() => leaf.value).toThrow("'idle'");

    loader._adopt(leaf, Symbol('claimer'));

    await expect(leaf.loaded).resolves.toEqual({ hp: 3 });
    expect(leaf.loadState).toBe('ready');
    expect(leaf.value).toEqual({ hp: 3 });
  });

  test('value already stored elsewhere before adopt: fills the adopted AssetRef in place and release() finds its claim', async () => {
    mockFetchJson({ hp: 3 });
    const loader = createCoreLoader();

    // "Loaded elsewhere earlier" — the core catalog scenario: a bulk load()
    // (not get()) already resolved this value under its own scope, well
    // before this leaf is ever adopted, and — crucially — WITHOUT ever
    // creating an AssetRef for the key (load() never touches `_refs`), so
    // this exercises the exact stored-raw-value fast path `_getRef` uses.
    await loader.load('cfg.json');

    const leaf = createLeaf('json', 'cfg.json') as AssetRef<unknown>;
    expect(leaf.loadState).toBe('idle');

    const claimer = Symbol('adopter');
    loader._adopt(leaf, claimer);

    // Bug: previously only _claim() ran, so the adopted ref never filled and
    // .value stayed stuck throwing "'loading'" forever.
    expect(leaf.loadState).toBe('ready');
    await expect(leaf.loaded).resolves.toEqual({ hp: 3 });
    expect(leaf.value).toEqual({ hp: 3 });

    // Bug: release(handle) couldn't resolve the key for this branch either.
    const key = loader['_typeRegistry']['_key'](Json, 'cfg.json');
    expect(loader['_residency']['_claims'].get(key)?.scopes.has(loader['_rootClaimer'])).toBe(true);

    loader.release(leaf);

    expect(loader['_residency']['_claims'].get(key)?.scopes.has(loader['_rootClaimer'])).toBe(false);
  });

  test('throws for a value with no assetMeta stamp', () => {
    const loader = createCoreLoader();

    expect(() => loader._adopt({}, Symbol('claimer'))).toThrow('no assetMeta');
  });
});

describe('Loader._adopt — retrying a failed catalog leaf (hardening)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  // ── seamless (Texture) ────────────────────────────────────────────────────

  test('re-adopting a failed seamless leaf retries and heals the SAME handle: failed → loading → ready (foreground)', async () => {
    const { fetchMock, succeed } = togglableImageFetch();
    const loader = createCoreLoader();
    const leaf = createLeaf('texture', 'flaky.png') as Texture;
    const claimer = Symbol('claimer');

    loader._adopt(leaf, claimer);
    await expect(leaf.loaded).rejects.toThrow();
    expect(leaf.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    succeed();
    loader._adopt(leaf, claimer); // re-adopt the SAME failed leaf

    expect(leaf.loadState).toBe('loading'); // re-armed synchronously — a valid retry request

    await expect(leaf.loaded).resolves.toBe(leaf);
    expect(leaf.loadState).toBe('ready');
    expect(leaf.width).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(2); // exactly ONE retry fetch — no duplicate
  });

  test('re-adopting one of several failed co-handles heals ALL of them from ONE retry fetch (seamless)', async () => {
    const { fetchMock, succeed } = togglableImageFetch();
    const loader = createCoreLoader();

    const a = createLeaf('texture', 'x.png') as Texture;
    const b = createLeaf('texture', 'x.png') as Texture;

    loader._adopt(a, Symbol('claimer-a'));
    loader._adopt(b, Symbol('claimer-b'));

    await expect(a.loaded).rejects.toThrow();
    await expect(b.loaded).rejects.toThrow();
    expect(a.loadState).toBe('failed');
    expect(b.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1); // the ONE shared fetch failed both

    succeed();
    loader._adopt(a, Symbol('claimer-a')); // re-adopt only `a`

    // The co-handle `b` — never touched directly — heals too.
    expect(a.loadState).toBe('loading');
    expect(b.loadState).toBe('loading');

    await expect(a.loaded).resolves.toBe(a);
    await expect(b.loaded).resolves.toBe(b);
    expect(a.loadState).toBe('ready');
    expect(b.loadState).toBe('ready');
    expect(a).not.toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(2); // exactly ONE retry fetch heals both — no duplicate
  });

  test('adopting a BRAND-NEW leaf for a key whose earlier load FAILED retries the key instead of stranding the new leaf', async () => {
    const { fetchMock, succeed } = togglableImageFetch();
    const loader = createCoreLoader();

    const first = createLeaf('texture', 'scene-handoff.png') as Texture;

    loader._adopt(first, Symbol('scene-a'));
    await expect(first.loaded).rejects.toThrow();
    expect(first.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A second scene claiming the same catalog hands over a leaf that was never
    // adopted before: 'idle', never 'failed'. What failed is the KEY, and
    // nothing else will ever restart it — no fetch is in flight and
    // `_storeResource` never runs for it — so the joining leaf must drive the
    // retry off its FAILED SIBLING, not off its own prior state.
    succeed();

    const fresh = createLeaf('texture', 'scene-handoff.png') as Texture;

    loader._adopt(fresh, Symbol('scene-b'));

    expect(fresh.loadState).toBe('loading');
    expect(fetchMock).toHaveBeenCalledTimes(2); // re-armed AND refetched — never 'loading' with nothing in flight
    expect(loader.inspect().find(r => r.source === 'scene-handoff.png')).toMatchObject({ state: 'loading', inFlight: true });

    // A THIRD brand-new leaf joining in the SAME tick must not fetch again: the
    // adopt above already re-armed every sibling, so no handle reads 'failed'.
    const alsoFresh = createLeaf('texture', 'scene-handoff.png') as Texture;

    loader._adopt(alsoFresh, Symbol('scene-c'));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await expect(fresh.loaded).resolves.toBe(fresh);
    expect(fresh.loadState).toBe('ready');
    expect(alsoFresh.loadState).toBe('ready');
    expect(first.loadState).toBe('ready'); // the originally-failed leaf heals in place too
    expect(fetchMock).toHaveBeenCalledTimes(2); // exactly ONE retry fetch served all three
    expect(loader.inspect().find(r => r.source === 'scene-handoff.png')).toMatchObject({ state: 'ready', inFlight: false });
  });

  test('a BRAND-NEW leaf adopted onto a still-broken failed key fails honestly again instead of hanging in loading', async () => {
    const { fetchMock } = togglableImageFetch();
    const loader = createCoreLoader();

    const first = createLeaf('texture', 'still-down.png') as Texture;

    loader._adopt(first, Symbol('scene-a'));
    await expect(first.loaded).rejects.toThrow();

    const fresh = createLeaf('texture', 'still-down.png') as Texture;

    loader._adopt(fresh, Symbol('scene-b')); // source is still down

    await expect(fresh.loaded).rejects.toThrow();
    expect(fresh.loadState).toBe('failed'); // an honest re-failure, not a silent hang
    expect(first.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loader.inspect().find(r => r.source === 'still-down.png')).toMatchObject({ state: 'failed', inFlight: false });
  });

  test('re-adopting a failed seamless leaf with { background: true } queues the retry instead of fetching immediately', async () => {
    const { fetchMock, succeed } = togglableImageFetch();
    const loader = createCoreLoader();
    const leaf = createLeaf('texture', 'flaky-bg.png') as Texture;
    const claimer = Symbol('claimer');

    loader._adopt(leaf, claimer);
    await expect(leaf.loaded).rejects.toThrow();
    expect(leaf.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    succeed();
    loader.setConcurrency(0); // park the queue so the divert is observable
    loader._adopt(leaf, claimer, true); // background retry

    expect(leaf.loadState).toBe('loading'); // re-armed even though the fetch hasn't started yet
    expect(isQueued(loader, 'flaky-bg.png')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // NOT fetched yet — queued, not immediate

    loader.setConcurrency(6);
    await loader.awaitBackground();

    expect(leaf.loadState).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('re-adopting an already-ready leaf is untouched — retryingFailedLeaf must not misfire on a settled success', async () => {
    const { fetchMock, succeed } = togglableImageFetch();
    const loader = createCoreLoader();
    const leaf = createLeaf('texture', 'ship2.png') as Texture;
    const claimer = Symbol('claimer');

    succeed(); // this leaf's fetch succeeds on the very first attempt

    loader._adopt(leaf, claimer);
    await expect(leaf.loaded).resolves.toBe(leaf);
    expect(leaf.loadState).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    loader._adopt(leaf, claimer); // re-adopt the SAME already-ready leaf

    expect(leaf.loadState).toBe('ready'); // untouched — never re-armed
    expect(fetchMock).toHaveBeenCalledTimes(1); // no duplicate fetch
  });

  test('retrying a failed leaf under a NEW claimer adds that claim without disturbing the original scope', async () => {
    const { succeed } = togglableImageFetch();
    const loader = createCoreLoader();
    const leaf = createLeaf('texture', 'owned.png') as Texture;
    const original = Symbol('original');
    const retryClaimer = Symbol('retry');

    loader._adopt(leaf, original);
    await expect(leaf.loaded).rejects.toThrow();

    const key = loader['_typeRegistry']['_key'](Texture, 'owned.png');
    const claims = (): Set<symbol> | undefined => loader['_residency']['_claims'].get(key)?.scopes;

    expect(claims()?.has(original)).toBe(true);

    succeed();
    loader._adopt(leaf, retryClaimer); // a DIFFERENT scope retries the SAME failed leaf

    expect(claims()?.has(original)).toBe(true); // original claim preserved
    expect(claims()?.has(retryClaimer)).toBe(true); // new claim added, not swapped in

    await expect(leaf.loaded).resolves.toBe(leaf);

    // Releasing only the retry scope must NOT evict — the original scope still holds it.
    loader._release(key, retryClaimer);
    expect(leaf.loadState).toBe('ready');
    expect(loader['_residency']['_claims'].has(key)).toBe(true);

    // Releasing the last remaining scope evicts.
    loader._release(key, original);
    expect(loader['_residency']['_claims'].has(key)).toBe(false);
  });

  test('a second failure after a retry fails every co-handle again and the leaf stays retryable', async () => {
    const { fetchMock, succeed } = togglableImageFetch();
    const loader = createCoreLoader();

    const a = createLeaf('texture', 'flip-flop.png') as Texture;
    const b = createLeaf('texture', 'flip-flop.png') as Texture;

    loader._adopt(a, Symbol('a1'));
    loader._adopt(b, Symbol('b1'));

    await expect(a.loaded).rejects.toThrow();
    expect(a.loadState).toBe('failed');
    expect(b.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Retry — but the source is STILL down.
    loader._adopt(a, Symbol('a2'));
    expect(a.loadState).toBe('loading');
    expect(b.loadState).toBe('loading');

    await expect(a.loaded).rejects.toThrow();
    expect(a.loadState).toBe('failed'); // second failure
    expect(b.loadState).toBe('failed'); // co-handle updated too, not orphaned
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Still retryable — the source recovers on the NEXT attempt.
    succeed();
    loader._adopt(a, Symbol('a3'));

    await expect(a.loaded).resolves.toBe(a);
    expect(a.loadState).toBe('ready');
    expect(b.loadState).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // ── value/ref (AssetRef via json) ────────────────────────────────────────

  test('re-adopting a failed value ref retries and heals the SAME ref: failed → loading → ready (foreground)', async () => {
    const { fetchMock, succeed } = togglableJsonFetch({ hp: 5 });
    const loader = createCoreLoader();
    const leaf = createLeaf('json', 'flaky.json') as AssetRef<unknown>;
    const claimer = Symbol('claimer');

    loader._adopt(leaf, claimer);
    await expect(leaf.loaded).rejects.toThrow();
    expect(leaf.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    succeed();
    loader._adopt(leaf, claimer); // re-adopt the SAME failed ref

    expect(leaf.loadState).toBe('loading');

    await expect(leaf.loaded).resolves.toEqual({ hp: 5 });
    expect(leaf.loadState).toBe('ready');
    expect(leaf.value).toEqual({ hp: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // exactly ONE retry fetch — no duplicate
  });

  test('re-adopting one of several failed co-refs heals ALL of them from ONE retry fetch (value/ref)', async () => {
    const { fetchMock, succeed } = togglableJsonFetch({ hp: 9 });
    const loader = createCoreLoader();

    const a = createLeaf('json', 'cfg.json') as AssetRef<unknown>;
    const b = createLeaf('json', 'cfg.json') as AssetRef<unknown>;

    loader._adopt(a, Symbol('claimer-a'));
    loader._adopt(b, Symbol('claimer-b'));

    await expect(a.loaded).rejects.toThrow();
    await expect(b.loaded).rejects.toThrow();
    expect(a.loadState).toBe('failed');
    expect(b.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    succeed();
    loader._adopt(a, Symbol('claimer-a')); // re-adopt only `a`

    expect(a.loadState).toBe('loading');
    expect(b.loadState).toBe('loading'); // co-ref healed too

    await expect(a.loaded).resolves.toEqual({ hp: 9 });
    await expect(b.loaded).resolves.toEqual({ hp: 9 });
    expect(a.loadState).toBe('ready');
    expect(b.loadState).toBe('ready');
    expect(a).not.toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('re-adopting a failed value ref with { background: true } queues the retry instead of fetching immediately', async () => {
    const { fetchMock, succeed } = togglableJsonFetch({ ready: true });
    const loader = createCoreLoader();
    const leaf = createLeaf('json', 'flaky-bg.json') as AssetRef<unknown>;
    const claimer = Symbol('claimer');

    loader._adopt(leaf, claimer);
    await expect(leaf.loaded).rejects.toThrow();
    expect(leaf.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    succeed();
    loader.setConcurrency(0);
    loader._adopt(leaf, claimer, true); // background retry

    expect(leaf.loadState).toBe('loading');
    expect(isQueued(loader, 'flaky-bg.json')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still queued, not fetched

    loader.setConcurrency(6);
    await loader.awaitBackground();

    expect(leaf.loadState).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a second failure after a retry fails every co-ref again and the ref stays retryable', async () => {
    const { fetchMock, succeed } = togglableJsonFetch({ hp: 1 });
    const loader = createCoreLoader();

    const a = createLeaf('json', 'flip-flop.json') as AssetRef<unknown>;
    const b = createLeaf('json', 'flip-flop.json') as AssetRef<unknown>;

    loader._adopt(a, Symbol('a1'));
    loader._adopt(b, Symbol('b1'));

    await expect(a.loaded).rejects.toThrow();
    expect(a.loadState).toBe('failed');
    expect(b.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    loader._adopt(a, Symbol('a2')); // retry — still down
    expect(a.loadState).toBe('loading');
    expect(b.loadState).toBe('loading');

    await expect(a.loaded).rejects.toThrow();
    expect(a.loadState).toBe('failed');
    expect(b.loadState).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    succeed();
    loader._adopt(a, Symbol('a3'));

    await expect(a.loaded).resolves.toEqual({ hp: 1 });
    expect(a.loadState).toBe('ready');
    expect(b.loadState).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('re-adopting an already-ready ref is untouched — retryingFailedLeaf must not misfire on a settled success (value/ref)', async () => {
    const { fetchMock, succeed } = togglableJsonFetch({ hp: 2 });
    const loader = createCoreLoader();
    const leaf = createLeaf('json', 'ready.json') as AssetRef<unknown>;
    const claimer = Symbol('claimer');

    succeed(); // this ref's fetch succeeds on the very first attempt

    loader._adopt(leaf, claimer);
    await expect(leaf.loaded).resolves.toEqual({ hp: 2 });
    expect(leaf.loadState).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    loader._adopt(leaf, claimer); // re-adopt the SAME already-ready ref

    expect(leaf.loadState).toBe('ready'); // untouched — never re-armed
    expect(leaf.value).toEqual({ hp: 2 }); // value still intact, not cleared
    expect(fetchMock).toHaveBeenCalledTimes(1); // no duplicate fetch
  });

  test('retrying a failed ref under a NEW claimer adds that claim without disturbing the original scope (value/ref)', async () => {
    const { succeed } = togglableJsonFetch({ hp: 3 });
    const loader = createCoreLoader();
    const leaf = createLeaf('json', 'owned.json') as AssetRef<unknown>;
    const original = Symbol('original');
    const retryClaimer = Symbol('retry');

    loader._adopt(leaf, original);
    await expect(leaf.loaded).rejects.toThrow();

    const key = loader['_typeRegistry']['_key'](Json, 'owned.json');
    const claims = (): Set<symbol> | undefined => loader['_residency']['_claims'].get(key)?.scopes;

    expect(claims()?.has(original)).toBe(true);

    succeed();
    loader._adopt(leaf, retryClaimer); // a DIFFERENT scope retries the SAME failed ref

    expect(claims()?.has(original)).toBe(true); // original claim preserved
    expect(claims()?.has(retryClaimer)).toBe(true); // new claim added, not swapped in

    await expect(leaf.loaded).resolves.toEqual({ hp: 3 });

    // Releasing only the retry scope must NOT evict — the original scope still holds it.
    loader._release(key, retryClaimer);
    expect(leaf.loadState).toBe('ready');
    expect(loader['_residency']['_claims'].has(key)).toBe(true);

    // Releasing the last remaining scope evicts.
    loader._release(key, original);
    expect(loader['_residency']['_claims'].has(key)).toBe(false);
  });

  // Minor #2 (review follow-up): the generic re-arm at the top of `_adopt` only
  // re-enters 'loading' on the shared `_loadState` — it does not clear a value
  // ref's OWN `_value`/`_hasValue` (only `AssetRef._begin()` does). `_fail()`
  // never clears them either, so a ref that was 'ready' before a LATER failure
  // (`_onTrackedFailure` fails every ref of a key regardless of its prior state)
  // must have its stale internal value actually cleared on retry — not merely
  // hidden behind the `state !== 'ready'` guard on `.value`.
  test('a ref that was ready, then failed, has its stale value actually cleared on retry (not just gated by state)', async () => {
    const { fetchMock, succeed } = togglableJsonFetch({ hp: 42 });
    const loader = createCoreLoader();
    const leaf = createLeaf('json', 'stale.json') as AssetRef<unknown>;
    const claimer = Symbol('claimer');

    succeed();
    loader._adopt(leaf, claimer);
    await expect(leaf.loaded).resolves.toEqual({ hp: 42 });
    expect(leaf.value).toEqual({ hp: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A LATER failure on this already-'ready' ref (mirrors `_onTrackedFailure`,
    // which fails every ref of a key regardless of its current state), paired
    // with invalidating the stored value directly — value-ref eviction has no
    // public path yet ("an accepted gap", per AssetResidency._evictKey's own
    // comment), so this reaches into internals to set up the precondition
    // rather than exercising a real eviction API that does not exist.
    leaf._fail(new Error('later failure'));
    (loader as unknown as { _residency: { _resources: Map<unknown, Map<string, unknown>> } })._residency._resources.get(Json)?.delete('stale.json');

    expect(leaf.loadState).toBe('failed');
    expect(() => leaf.value).toThrow("'failed'"); // gated by state, as expected

    // `_fail()` alone does NOT clear the stale value — confirms the precondition
    // this test is guarding against actually holds before the retry runs.
    const internalsBeforeRetry = leaf as unknown as { _value: unknown; _hasValue: boolean };

    expect(internalsBeforeRetry._hasValue).toBe(true);
    expect(internalsBeforeRetry._value).toEqual({ hp: 42 });

    loader._adopt(leaf, claimer); // retry

    expect(leaf.loadState).toBe('loading');
    expect(() => leaf.value).toThrow("'loading'"); // still gated by state either way…

    // …but the INTERNAL value must actually be cleared too, not merely hidden
    // behind the state guard: re-arming through the generic `LoadState.begin()`
    // alone (bypassing `AssetRef._begin()`) would leave the stale `{hp:42}`
    // sitting in `_value`/`_hasValue` behind that gate.
    const internals = leaf as unknown as { _value: unknown; _hasValue: boolean };

    expect(internals._hasValue).toBe(false);
    expect(internals._value).toBeUndefined();

    await expect(leaf.loaded).resolves.toEqual({ hp: 42 });
    expect(leaf.value).toEqual({ hp: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Loader.get / load — Assets catalog adoption (end-to-end)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('get(catalog) adopts every leaf, returns the SAME leaf objects, and they heal after fetch', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const catalog = new Assets({
      ship: { type: 'texture', source: 'ship.png' },
      logo: { type: 'texture', source: 'logo.png' },
    });

    const got = loader.get(catalog);

    // Per-catalog identity: the returned map holds the catalog's own leaves.
    expect(got.ship).toBe(catalog.ship);
    expect(got.logo).toBe(catalog.logo);
    expect(catalog.ship.loadState).toBe('loading');

    await Promise.all([catalog.ship.loaded, catalog.logo.loaded]);

    expect(catalog.ship.loadState).toBe('ready');
    expect(catalog.ship.width).toBe(4);
    // The loader's own get() for the same source resolves to the adopted leaf.
    expect(loader.get('ship.png')).toBe(catalog.ship);
  });

  test('load(catalog) resolves to a map of loaded values, forwards onProgress, and heals the SAME leaves as get', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const catalog = new Assets({
      ship: { type: 'texture', source: 'ship.png' },
      logo: { type: 'texture', source: 'logo.png' },
    });

    const progress: number[] = [];
    const queue = loader.load(catalog);
    queue.onProgress.add(p => progress.push(p.loaded));

    const result = await queue;

    // A resource leaf's `.loaded` resolves to the handle itself → the resolved
    // map holds the catalog's own leaves, which have healed in place.
    expect(result.ship).toBe(catalog.ship);
    expect(result.logo).toBe(catalog.logo);
    expect(catalog.ship.loadState).toBe('ready');
    expect(progress.at(-1)).toBe(2);
  });

  test('load(catalog) resolves a value leaf to its raw parsed value while healing its ref in place', async () => {
    mockFetchJson({ hp: 7 });
    const loader = createCoreLoader();
    const catalog = new Assets({ config: { type: 'json', source: 'cfg.json' } });

    const result = await loader.load(catalog);

    expect(result.config).toEqual({ hp: 7 }); // raw value in the resolved map
    expect(catalog.config.value).toEqual({ hp: 7 }); // the ref healed in place
  });

  // M1: `load(leaf)` had a single generic overload (`<T extends object>(leaf: T):
  // LoadingQueue<T>`) that types a value leaf's result as the AssetRef itself,
  // while at runtime `AssetRef.loaded` resolves to the raw parsed value (see the
  // `_createAdoptedQueue` "value leaf" case above `LoadingQueue<T>` is right for a
  // resource leaf, but wrong for `AssetRef<T>`). A discriminating `load<T>(leaf:
  // AssetRef<T>): LoadingQueue<T>` overload must be declared first so it wins.
  test('type-level: load(AssetRef leaf) resolves LoadingQueue<T>, not LoadingQueue<AssetRef<T>>', () => {
    const loader = createCoreLoader();
    const catalog = new Assets({ config: { type: 'json', source: 'cfg.json' } });
    const textureCatalog = new Assets({ ship: { type: 'texture', source: 'ship.png' } });

    // Each assertion is wrapped in an uncalled arrow so only the overload
    // resolution is checked — invoking `load()` for real here would fire an
    // unmocked fetch.
    //
    // catalog.config: AssetRef<unknown> — load() must resolve to the raw value
    // type (`unknown`), never to `LoadingQueue<AssetRef<unknown>>`.
    expectTypeOf(() => loader.load(catalog.config)).returns.toEqualTypeOf<LoadingQueue<unknown>>();

    // A resource leaf (Texture) is unaffected: it still resolves to itself.
    expectTypeOf(() => loader.load(textureCatalog.ship)).returns.toEqualTypeOf<LoadingQueue<Texture>>();
  });

  test('two catalogs with the same source get DISTINCT leaf objects that both heal from ONE fetch (source-keyed dedup)', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const a = new Assets({ ship: { type: 'texture', source: 'ship.png' } });
    const b = new Assets({ ship: { type: 'texture', source: 'ship.png' } });

    expect(a.ship).not.toBe(b.ship); // per-catalog identity

    loader.get(a);
    await a.ship.loaded;
    expect(a.ship.loadState).toBe('ready');

    // Adopting b's leaf fills it in place from the already-stored payload.
    loader.get(b);
    await b.ship.loaded;

    expect(b.ship.loadState).toBe('ready');
    expect(b.ship.width).toBe(4);
    expect(b.ship).not.toBe(a.ship); // still distinct objects
    expect(global.fetch).toHaveBeenCalledTimes(1); // one network fetch for the shared source
  });

  // §7 fix: a single catalog with two fields pointing at the same source
  // produces two DIFFERENT leaves for the same key. The first leaf registers
  // and starts the fetch; the second distinct leaf is added to the key's
  // in-flight handle set, so ONE decode heals BOTH leaves in place — no hang,
  // no warn (same sampler).
  test('duplicate source within one catalog: both leaves heal from ONE fetch (no hang, no warn)', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const warnSpy = vi.spyOn(logger, 'warn');
    const catalog = new Assets({
      a: { type: 'texture', source: 'x.png' },
      b: { type: 'texture', source: 'x.png' },
    });

    loader.get(catalog);

    await Promise.all([catalog.a.loaded, catalog.b.loaded]);

    expect(catalog.a.loadState).toBe('ready');
    expect(catalog.b.loadState).toBe('ready');
    expect(catalog.a).not.toBe(catalog.b);
    expect(catalog.a.width).toBe(4);
    expect(catalog.b.width).toBe(4);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // The runtime contract the loader's single-leaf TYPE overloads mirror: a leaf
  // is exactly an object carrying the `_assetMeta` stamp. A catalog property is
  // stamped (it comes from `createLeaf`); a bare-path `get(path)` handle is NOT
  // — that branch resolves through the source-keyed dedup instead. This is why
  // `LeafForPath` (the `get(path)` result) stays unbranded while the catalog
  // twin is branded: branding both would let `load(loader.get('x.png'))`
  // compile into the record fallback.
  test('catalog leaves carry the meta stamp; a bare-path get() handle does not', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const catalog = new Assets({ ship: 'ship.png' });

    const catalogLeaf = loader.get(catalog).ship;
    const barePathHandle = loader.get('other.png');

    expect(_readMeta(catalogLeaf)).toEqual({ kind: 'texture', src: 'ship.png', opts: undefined });
    expect(_readMeta(barePathHandle)).toBeUndefined();

    await Promise.all([catalog.ship.loaded, (barePathHandle as Texture).loaded]);
  });
});
