import type { LoadStateValue } from '#core/LoadState';
import { logger } from '#core/logging';
import type { Signal } from '#core/Signal';

import type { Asset } from './Asset';
import type { AssetDecoder } from './AssetDecoder';
import { _readMeta } from './assetMeta';
import { AssetRef } from './AssetRef';
import type { AssetTypeRegistry } from './AssetTypeRegistry';
import type { AssetConstructor } from './FactoryRegistry';
import type { SeamlessAdapter } from './seamless';
import { WeakHandleSet } from './WeakHandleSet';

interface QueueEntry {
  readonly type: AssetConstructor;
  readonly alias: string;
  readonly path: string;
  readonly options?: unknown;
}

/** The `Loader` signals `AssetResidency` dispatches on directly — owned by `Loader` (public API), referenced here for dispatch only. */
export interface AssetResidencySignals {
  readonly onProgress: Signal<[loaded: number, total: number]>;
  readonly onLoaded: Signal<[type: AssetConstructor, alias: string, resource: unknown]>;
  readonly onError: Signal<[type: AssetConstructor, alias: string, error: Error]>;
}

/**
 * One row of {@link Loader.inspect}'s diagnostic snapshot: everything a
 * developer needs to reason about a single claimed `(type, source)` key
 * without reaching into `Loader`'s private residency bookkeeping — its
 * lifecycle state, how many independent claim scopes hold it, and whether its
 * fetch is queued, in flight, or settled. Every row is plain, frozen data:
 * numbers, strings, booleans, and the asset's constructor token — never a
 * `Set`, a claim symbol, or a live handle/ref object, so nothing returned here
 * can be used to mutate residency state.
 */
export interface AssetInspection {
  /** The normalized `(type, source)` residency key this row describes — the same key `Loader`'s internal claim/dedup maps use. */
  readonly key: string;
  /** The asset type constructor this key was claimed under. */
  readonly type: AssetConstructor;
  /** The literal source/path this key was claimed under (an alias, not necessarily a URL). */
  readonly source: string;
  /**
   * Where this key currently sits in the load lifecycle: `'idle'` (claimed
   * but its fetch has not started), `'queued'` (parked in the low-priority
   * background lane), `'loading'` (fetch in flight), `'ready'` (payload
   * resident and readable), or `'failed'` (the last fetch attempt errored).
   * A row reports exactly one of these five, chosen by priority: a `'failed'`
   * or `'ready'` outcome always wins over `'queued'`/`'loading'`, so a row can
   * never claim to be both settled and still pending.
   *
   * A key can have more than one live handle/ref sharing it — multiple
   * `Assets.from()` leaves or `get()` calls joined onto the same source, whose
   * individual outcomes CAN diverge (e.g. one ref's `parse()` throws while a
   * sibling ref's succeeds; `AssetRef._fill` fails only the ref whose `parse`
   * threw). `state` reports the REPRESENTATIVE handle/ref's outcome — the
   * first one registered for this key — not an aggregate across every
   * handle/ref sharing it; a divergent sibling's outcome is not visible here.
   */
  readonly state: 'idle' | 'queued' | 'loading' | 'ready' | 'failed';
  /**
   * The number of distinct claim scopes currently holding this key — the same
   * refcount `Loader.release()` decrements and that reaches zero to evict.
   * This is a scope count, not a count of consumer handles/refs or `get()`
   * calls: several handles sharing one scope, or several `get()` calls for
   * the same source, still report `1` here.
   */
  readonly claims: number;
  /** `true` while a fetch for this key is actively in flight (network request or handler load). */
  readonly inFlight: boolean;
  /**
   * `true` only while this key is genuinely parked in the low-priority
   * background queue — always in lockstep with `state === 'queued'`, and
   * never `true` on a row whose `state` has already settled to `'ready'` or
   * `'failed'`.
   */
  readonly background: boolean;
}

/**
 * Owns claim/refcount tracking, in-flight fetch dedup, the resident-resource
 * store, deferred-handle / value-ref healing (asset-system v2 §7), and the
 * background-loading queue for a `Loader` instance. Extracted from
 * `Loader` (Loader split, Slice 3) — every method here is a direct,
 * behavior-preserving relocation except {@link _getAliasesForIdentity} and
 * {@link _getHandleKey}, two small new read accessors `Loader`'s kept
 * branching methods (`unload`/`release`) need now that the fields they used
 * to read directly live here.
 */
export class AssetResidency {
  private readonly _typeRegistry: AssetTypeRegistry;
  private readonly _decoder: AssetDecoder;
  private readonly _signals: AssetResidencySignals;

  private readonly _resources = new Map<AssetConstructor, Map<string, unknown>>();
  // Reverse lookup: loaded resource object → the (type, source) it was first
  // stored under. Backs Loader.keyFor for scene serialization. A WeakMap so
  // it never retains resources; only object resources participate.
  private readonly _resourceKeys = new WeakMap<object, { type: AssetConstructor; source: string }>();
  private readonly _inFlight = new Map<string, Promise<unknown>>();
  private readonly _preventStoreKeys = new Set<string>();

  // ── Identity / alias tracking for the Asset API ───────────────────────────
  private readonly _aliasKeyToIdentityKey = new Map<string, string>();
  private readonly _identityKeyToAliases = new Map<string, Set<string>>();
  private readonly _inFlightByIdentity = new Map<string, Promise<unknown>>();

  // ── Seamless deferred handles (asset-system v2) ───────────────────────────
  private readonly _deferred = new Map<string, { readonly handles: WeakHandleSet; readonly options: unknown }>();
  private readonly _deferredFinalization = new FinalizationRegistry<string>((key: string): void => {
    const entry = this._deferred.get(key);

    if (entry !== undefined && !entry.handles.prune()) {
      this._deferred.delete(key);
      this._evicted.delete(key);
    }
  });

  // Value-asset refs (asset-system v2 §4.6)
  private readonly _refs = new Map<string, { readonly refs: Set<AssetRef<unknown>>; readonly options: unknown }>();

  // ── Refcount / claims (asset-system v2 §4.7) ──────────────────────────────
  private readonly _claims = new Map<string, { scopes: Set<symbol>; type: AssetConstructor; source: string }>();
  private readonly _evicted = new Set<string>();
  private readonly _handleKeys = new WeakMap<object, string>();
  // Every handle/ref residency has EVER registered under a key — a WeakSet, so
  // it never needs pruning and never retains a dead handle. Unlike `_handleKeys`,
  // this is never deleted from (not even by `_forgetKey`/`unloadAll`'s hard
  // reset), so `Loader.release()`'s "was this ever a real handle" check stays
  // true regardless of unrelated unload/reset ordering that happened since.
  private readonly _everRegisteredHandles = new WeakSet();

  private _concurrency: number;
  private _backgroundQueue: QueueEntry[] = [];
  private _backgroundActive = 0;
  private _backgroundTotal = 0;
  private _backgroundLoaded = 0;
  private _backgroundResolve: (() => void) | null = null;

  public constructor(typeRegistry: AssetTypeRegistry, decoder: AssetDecoder, signals: AssetResidencySignals, concurrency: number) {
    this._typeRegistry = typeRegistry;
    this._decoder = decoder;
    this._signals = signals;
    this._concurrency = concurrency;
  }

  /** Read-only, detached snapshot for diagnostics and support bundles. @internal */
  public _inspect(): readonly AssetInspection[] {
    const backgroundKeys = new Set(this._backgroundQueue.map(entry => this._typeRegistry._key(entry.type, entry.alias)));
    const rows: AssetInspection[] = [];

    for (const [key, claim] of this._claims) {
      const stored = this._resources.get(claim.type)?.has(claim.source) ?? false;
      const identityKey = this._aliasKeyToIdentityKey.get(key);
      const inFlight = this._inFlight.has(key) || (identityKey !== undefined && this._inFlightByIdentity.has(identityKey));
      // Raw queue membership only — a settled row must never report `background: true`
      // (see below), so this is an INPUT to `state`, not the field's own value.
      const queuedInBackground = backgroundKeys.has(key);
      const handleState = this._inspectHandleState(key, claim.type);
      const state = this._inspectState({ stored, handleState, queuedInBackground, inFlight });

      rows.push(
        Object.freeze({
          key,
          type: claim.type,
          source: claim.source,
          state,
          claims: claim.scopes.size,
          inFlight,
          // Derived from `state`, not from raw queue membership: a producer that
          // stores a payload without draining the background queue first (e.g. a
          // container injecting the same (type, source) directly) must never
          // leave a settled row also reporting `background: true`.
          background: state === 'queued',
        }),
      );
    }

    // A plain codepoint comparison, not `localeCompare`: the sort order is part
    // of a diagnostic snapshot's contract and must not vary by ICU locale/runtime.
    rows.sort((left, right) => {
      if (left.key < right.key) return -1;
      if (left.key > right.key) return 1;
      return 0;
    });
    return Object.freeze(rows);
  }

  /** The load-lifecycle state of whatever handle/ref is registered for `key`, or `undefined` if none is. Backs {@link _inspect}. */
  private _inspectHandleState(key: string, type: AssetConstructor): LoadStateValue | undefined {
    const ref: AssetRef<unknown> | undefined = this._refs.get(key)?.refs.values().next().value;

    if (ref !== undefined) {
      return ref.state;
    }

    const deferred = this._deferred.get(key)?.handles.first();
    const adapter = this._typeRegistry.getSeamlessAdapter(type);

    return deferred !== undefined && adapter !== undefined ? adapter.stateOf(deferred) : undefined;
  }

  /**
   * Resolve one {@link AssetInspection} row's `state`, by priority: a `'failed'`
   * handle/ref always wins over a merely-`stored` payload. This matters for a
   * value key: `_storeResource` stores the raw fetched payload unconditionally,
   * even when the ref's OWN `parse()` step subsequently failed it (e.g. a
   * thenable rejected by the synchronous-parse contract) — so `stored` alone
   * cannot be trusted to mean "readable". A failed/settled outcome then always
   * wins over `'queued'`/`'loading'`, so a row can never claim to be both
   * settled and still pending. Backs {@link _inspect}.
   */
  private _inspectState(input: {
    stored: boolean;
    handleState: LoadStateValue | undefined;
    queuedInBackground: boolean;
    inFlight: boolean;
  }): AssetInspection['state'] {
    const { stored, handleState, queuedInBackground, inFlight } = input;

    if (handleState === 'failed') {
      return 'failed';
    }

    if (stored) {
      return 'ready';
    }

    if (queuedInBackground) {
      return 'queued';
    }

    if (inFlight || handleState === 'loading') {
      return 'loading';
    }

    return handleState === 'ready' ? 'ready' : 'idle';
  }

  // -----------------------------------------------------------------------
  // Claim / release
  // -----------------------------------------------------------------------

  /**
   * Register a claim on a resource key under a claim scope (idempotent per
   * scope). On an evicted key, kick a re-fetch into the existing, already
   * re-armed handle so every dangling consumer heals in place.
   * @internal
   */
  public _claim(key: string, type: AssetConstructor, source: string, claimer: symbol): void {
    let entry = this._claims.get(key);

    if (entry === undefined) {
      entry = { scopes: new Set<symbol>(), type, source };
      this._claims.set(key, entry);
    }

    entry.scopes.add(claimer);

    if (this._evicted.has(key)) {
      this._evicted.delete(key);

      // The handle was re-armed to 'loading' during eviction; just re-drive the fetch.
      if (this._typeRegistry.hasSeamlessAdapter(type)) {
        this._startSeamlessFetch(type, source, this._deferred.get(key)?.options);
      }
    }
  }

  /**
   * Drop a claim scope from a key; when the last scope releases, evict the
   * payload immediately (refcount 0).
   * @internal
   */
  public _release(key: string, claimer: symbol): void {
    const entry = this._claims.get(key);

    if (entry === undefined) {
      return;
    }

    entry.scopes.delete(claimer);

    if (entry.scopes.size === 0) {
      this._claims.delete(key);
      this._evictKey(key, entry.type, entry.source);
    }
  }

  /**
   * Release every claim held under a claim scope (a scene unloading its
   * scene-private assets). Collect the held keys first, then release —
   * {@link _release} mutates `_claims`, so we must not delete during iteration.
   * @internal
   */
  public _releaseScope(claimer: symbol): void {
    const held: string[] = [];

    for (const [key, entry] of this._claims) {
      if (entry.scopes.has(claimer)) {
        held.push(key);
      }
    }

    for (const key of held) {
      this._release(key, claimer);
    }
  }

  /**
   * Free a key's payload while keeping its handle identity: adapter-evict EVERY
   * live consumer handle for the key (drops payload + re-arms each to 'loading'),
   * remove the stored resource, and leave the handles registered in `_deferred`
   * so the next claim heals them all in place. Also drops a not-yet-started
   * background-queue entry. Seamless payloads only this slice — value-ref
   * eviction is an accepted gap (§6 follow-up).
   *
   * Only a payload that has already converged into `_resources` is dropped here.
   * A fetch still in flight (nothing stored yet) is left to the running fetch,
   * which fills then frees on arrival (§4.7) — evicting mid-flight would race it.
   */
  private _evictKey(key: string, type: AssetConstructor, source: string): void {
    const adapter = this._typeRegistry.getSeamlessAdapter(type);
    const stored = this._resources.get(type)?.get(source);

    if (adapter !== undefined && stored !== undefined) {
      const entry = this._deferred.get(key);
      // Re-arm every live consumer handle in place: the representative AND any
      // co-handle adopted from the stored donor (audit A5), so a later claim
      // heals them all — not just the canonical one. The stored donor is itself
      // a member (registered at store time); guard the fallback for the (defensive)
      // case where no entry exists.
      let evictedStored = false;

      if (entry !== undefined) {
        for (const handle of entry.handles) {
          adapter.evict(handle);

          if (handle === stored) {
            evictedStored = true;
          }
        }
      }

      if (!evictedStored) {
        adapter.evict(stored);
      }

      this._resources.get(type)?.delete(source);

      // Keep the handles registered (weakly) so the next claim heals them in
      // place; the entry persists from store time, carrying the original options.
      if (entry === undefined) {
        this._createDeferredEntry(key, stored as object);
      }

      this._evicted.add(key);
      // A load that just settled may leave a resolved-but-not-yet-cleaned
      // in-flight entry (its `.finally` cleanup is a pending microtask). Drop it
      // so the reclaim's re-fetch starts fresh instead of deduping onto that
      // stale resolved promise, which would never re-fill the re-armed handle.
      // The reclaim's fresh entry is protected from this stale `.finally` by the
      // self-entry identity guard in `_trackInFlight`.
      this._inFlight.delete(key);
    }

    const queued = this._backgroundQueue.findIndex(entry => this._typeRegistry._key(entry.type, entry.alias) === key);

    if (queued !== -1) {
      this._backgroundQueue.splice(queued, 1);
    }
  }

  // -----------------------------------------------------------------------
  // Adopt / seamless / ref resolution
  // -----------------------------------------------------------------------

  /**
   * Adopt an externally-created handle-hybrid leaf (from `Assets.from()`) into
   * residency: register it as the deferred/ref handle under its normalized
   * key, claim it under `claimer`, and drive the fetch. The existing fill site
   * ({@link _storeResource}) transplants the fetched payload into this exact
   * object, so every consumer that already holds the leaf pops in. Idempotent
   * for a handle already adopted under the same key (no duplicate fetch).
   *
   * With `background`, the leaf is still registered + claimed + healed in place,
   * but its fetch is diverted into the low-priority background queue instead of
   * started immediately.
   * @internal
   */
  public _adopt(handle: object, claimer: symbol, background = false): void {
    const meta = _readMeta(handle);

    if (meta === undefined) {
      throw new Error('Loader._adopt: value is not an Assets.from() leaf (no assetMeta).');
    }

    const ctor = this._typeRegistry.resolveTypeName(meta.kind);

    if (ctor === undefined) {
      throw new Error(`Loader._adopt: no constructor registered for type "${meta.kind}".`);
    }

    // A freshly-created catalog leaf is 'idle' until adopted. A failed leaf
    // is a retry request and must be re-armed before the shared fetch restarts.
    const leafState = (handle as { _loadState?: { value: string; begin(): void } })._loadState;
    const retryingFailedLeaf = leafState?.value === 'failed';
    if (leafState?.value === 'idle' || retryingFailedLeaf) leafState.begin();

    const key = this._typeRegistry._key(ctor, meta.src);

    if (handle instanceof AssetRef) {
      // The generic re-arm above only re-enters 'loading' on the shared
      // `_loadState` — it does not clear a value ref's OWN `_value`/`_hasValue`
      // (only `AssetRef._begin()` does). `_fail()` never clears them either, so a
      // ref that was 'ready' before a LATER failure (`_onTrackedFailure` fails
      // every ref of a key regardless of its prior state) carries a stale value
      // behind the `'loading'` gate until this fuller reset runs.
      if (retryingFailedLeaf) handle._begin();

      const existingRef = this._refs.get(key);
      const stored = this._resources.get(ctor)?.get(meta.src);

      if (existingRef === undefined) {
        this._refs.set(key, { refs: new Set([handle]), options: meta.opts });
        this._registerHandle(handle, key);

        // Mirrors _getRef's stored-fast-path: a value already sitting in
        // `_resources` (stored elsewhere before this leaf was adopted) fills
        // this ref immediately instead of leaving it 'loading' forever.
        if (stored !== undefined) {
          handle._fill(stored);
        } else if (background) {
          this._enqueueBackgroundFetch(ctor, meta.src, meta.opts);
        } else {
          this._startRefFetch(ctor, meta.src, meta.opts);
        }
      } else if (!existingRef.refs.has(handle)) {
        // A distinct ref for a key already in flight (or already stored): join
        // the key's ref set so the single fetch fills it too (§7 multi-handle
        // fill). If the value already converged, fill immediately; otherwise a
        // conflicting FETCH option (source-keyed decode can't differ) warns.
        existingRef.refs.add(handle);
        this._registerHandle(handle, key);

        if (stored !== undefined) {
          // A retry re-fills the key's whole ref set (this one included) below.
          if (!retryingFailedLeaf) handle._fill(stored);
        } else {
          this._warnOnFetchOptionConflict(ctor, meta.src, key, existingRef.options, meta.opts);
        }
      }
      // else: the SAME ref re-adopted — Set membership makes this a no-op.

      // Retry of a leaf whose key already has a ref entry. The
      // `existingRef === undefined` branch above already fetched (or filled)
      // for a brand-new entry, and its guard makes it mutually exclusive with
      // this block, so no key is ever fetched twice in one adopt.
      //
      // Like the seamless path below, the retry is decided from the KEY, not
      // from the adopted ref: a brand-new ref is 'idle' (re-armed to 'loading'
      // above), never 'failed', yet joining a key whose earlier load failed is
      // every bit as much a retry request. Without the sibling check such a ref
      // would join the set, find no stored payload, and sit in 'loading'
      // forever — its fetch already settled into failure, so `_storeResource`
      // never runs for the key and nothing else would ever restart it.
      // Reading the siblings after the join above is equivalent to reading them
      // before it: the adopted ref is 'loading' by now either way, so its own
      // failure only ever surfaces through `retryingFailedLeaf`.
      //
      // Gated on `stored === undefined` so this only ever ADDS the missing
      // refetch. A key whose payload is resident takes the re-fill branch below
      // solely on the adopted ref's own retry, unchanged: a ref's `parse()` can
      // reject a payload that fetched fine, and re-running it for every joining
      // ref would turn an unrelated adopt into a silent re-parse of the set.
      if (existingRef !== undefined && (retryingFailedLeaf || (stored === undefined && this._hasFailedRef(existingRef)))) {
        if (stored === undefined) {
          for (const ref of existingRef.refs) if (ref.state === 'failed') ref._begin();
          if (background) this._enqueueBackgroundFetch(ctor, meta.src, existingRef.options);
          else this._startRefFetch(ctor, meta.src, existingRef.options);
        } else {
          // The payload is already resident, so there is nothing to refetch:
          // re-filling IS the retry here. `_resources` and `_refs` legitimately
          // diverge — a ref's own `parse()` can reject a payload that fetched
          // fine — so re-running `parse()` against the stored payload yields an
          // honest re-failure or a success, where handling this case by refetch
          // alone would leave every re-armed ref in 'loading' with no fetch in
          // flight, forever. Mirrors _storeResource's fill loop: an
          // already-'ready' ref is left untouched.
          for (const ref of existingRef.refs) {
            if (ref.state === 'ready') continue;
            if (ref.state === 'failed') ref._begin();
            ref._fill(stored);
          }
        }
      }

      this._claim(key, ctor, meta.src, claimer);

      return;
    }

    const deferredEntry = this._deferred.get(key);
    const stored = this._resources.get(ctor)?.get(meta.src);
    const adapter = this._typeRegistry.getSeamlessAdapter(ctor);

    if (deferredEntry === undefined && stored === undefined) {
      this._createDeferredEntry(key, handle, meta.opts);
      this._claim(key, ctor, meta.src, claimer);

      if (background) {
        this._enqueueBackgroundFetch(ctor, meta.src, meta.opts);
      } else {
        this._startSeamlessFetch(ctor, meta.src, meta.opts);
      }

      return;
    }

    if (stored !== undefined && this._handleKeys.get(handle) !== key) {
      // Already stored for this key (e.g. loaded elsewhere before this leaf was
      // adopted — the core catalog scenario) and this exact handle has not been
      // filled/registered yet: transplant the stored donor into THIS handle in
      // place (per-catalog identity — do NOT swap to the stored object; the
      // caller already holds this leaf) and register it so `release(handle)`
      // can resolve its key.
      //
      // Enter the co-handle into the key's (persistent) deferred set so a LATER
      // evict+heal of this key re-arms and re-fills it too (audit A5). The stored
      // donor was itself registered here at store time, so the entry already
      // exists (its representative stays canonical); the co-handle only ever
      // joins, never displaces it.
      adapter?.fill(handle, stored);

      const entry = deferredEntry ?? this._createDeferredEntry(key, stored as object, meta.opts);

      this._addDeferredHandle(key, entry, handle);
    } else if (deferredEntry !== undefined && stored === undefined && !deferredEntry.handles.has(handle)) {
      // Another handle already holds this key and nothing is stored yet: join
      // the key's handle set so `_storeResource` fills THIS handle too (§7
      // multi-handle fill). The key's fetch may be in flight or may have ended
      // in failure — the retry below covers the latter. A conflicting FETCH
      // option (source-keyed decode can't differ) warns; differing per-handle
      // sampler options are fine (each handle carries its own).
      this._addDeferredHandle(key, deferredEntry, handle);
      this._warnOnFetchOptionConflict(ctor, meta.src, key, deferredEntry.options, meta.opts);
    }
    // else: the SAME handle re-adopted, or already filled — a no-op.

    // Retry of a key that already failed. Being a retry is a property of the
    // KEY, not of the adopted handle: a brand-new leaf is 'idle' (re-armed to
    // 'loading' at the top of this method), never 'failed', yet joining a key
    // whose earlier load failed — a second scene claiming the same catalog does
    // exactly this — is every bit as much a retry request. Nothing else would
    // restart such a key: its fetch already settled into failure, so
    // `_storeResource` never runs for it and the joining handle would sit in
    // 'loading' forever.
    // Reading the SIBLINGS after the join above is equivalent to reading them
    // before it: by this point the adopted handle is 'loading' either way, so
    // its own failure only ever surfaces through `retryingFailedLeaf`.
    //
    // Only reached when the key already has a deferred entry: the
    // `deferredEntry === undefined && stored === undefined` branch above
    // returns after starting its own fetch, so no key is ever fetched twice in
    // one adopt. Two handles joining a failed key in the same tick fetch once
    // too — the first adopt re-arms every failed sibling, so the second finds
    // none.
    //
    // A key whose payload is already stored needs no retry, unlike a value key:
    // `_storeResource` re-arms and fills EVERY non-'ready' handle of the key
    // before storing, and the `stored !== undefined` branch above fills a
    // newly-adopted handle in place from the stored donor. A seamless adapter's
    // `fill()` is a plain in-place transplant with no per-handle `parse()` that
    // could reject a payload the fetch delivered, so handle state and
    // `_resources` cannot diverge the way a ref's can.
    if (stored === undefined && deferredEntry !== undefined && adapter !== undefined && (retryingFailedLeaf || this._hasFailedHandle(deferredEntry, adapter))) {
      for (const candidate of deferredEntry.handles) {
        if (adapter.stateOf(candidate) === 'failed') adapter.begin(candidate);
      }
      if (background) this._enqueueBackgroundFetch(ctor, meta.src, deferredEntry.options);
      else this._startSeamlessFetch(ctor, meta.src, deferredEntry.options);
    }

    this._claim(key, ctor, meta.src, claimer);
  }

  /**
   * Seamless single-source resolution: an already-stored asset, an existing
   * deferred handle (retried in place when `'failed'`), or a fresh
   * placeholder whose fetch starts now.
   * @internal
   */
  public _getSeamless(type: AssetConstructor, adapter: SeamlessAdapter<unknown>, source: string, options?: unknown): unknown {
    const stored = this._resources.get(type)?.get(source);

    if (stored !== undefined) {
      return stored;
    }

    const key = this._typeRegistry._key(type, source);
    const entry = this._deferred.get(key);

    if (entry !== undefined) {
      this._warnOnFetchOptionConflict(type, source, key, entry.options, options);

      const representative = entry.handles.first();

      if (representative !== undefined) {
        if (adapter.stateOf(representative) === 'failed') {
          adapter.begin(representative);
          this._startSeamlessFetch(type, source, entry.options);
        } else {
          this._boostFromQueue(type, source);
        }

        return representative;
      }
    }

    const handle = adapter.createPlaceholder(options);

    this._createDeferredEntry(key, handle as object, options);
    this._startSeamlessFetch(type, source, options);

    return handle;
  }

  /**
   * Start (or on retry, restart) the fetch backing a deferred handle or value
   * ref. Failure handling lives centrally in {@link _onTrackedFailure}; the
   * catch here only silences the void'd rejection.
   */
  private _startSeamlessFetch(type: AssetConstructor, source: string, options: unknown): void {
    void this._loadSingle(type, source, options).catch(() => {
      /* Failure handled centrally in _onTrackedFailure. */
    });
  }

  /** Value-asset twin of {@link _getSeamless}: stable ref, options first-wins, retry-on-failed. @internal */
  public _getRef(type: AssetConstructor, source: string, options?: unknown): AssetRef<unknown> {
    const key = this._typeRegistry._key(type, source);
    const entry = this._refs.get(key);

    if (entry !== undefined) {
      this._warnOnFetchOptionConflict(type, source, key, entry.options, options);

      const representative = this._representative(entry.refs);

      if (representative !== undefined) {
        if (representative.loadState === 'failed') {
          representative._begin();
          this._startRefFetch(type, source, entry.options);
        } else {
          this._boostFromQueue(type, source);
        }

        return representative;
      }
    }

    const ref = new AssetRef<unknown>();

    this._refs.set(key, { refs: new Set([ref]), options });
    this._registerHandle(ref, key);

    const stored = this._resources.get(type)?.get(source);

    if (stored !== undefined) {
      ref._fill(stored);

      return ref;
    }

    this._startRefFetch(type, source, options);

    return ref;
  }

  /** Start (or restart) the fetch backing a value ref; the fill happens in {@link _storeResource}. */
  private _startRefFetch(type: AssetConstructor, source: string, options: unknown): void {
    void this._loadSingle(type, source, options).catch(() => {
      /* Failure handled centrally in _onTrackedFailure. */
    });
  }

  // -----------------------------------------------------------------------
  // Deferred / ref handle bookkeeping
  // -----------------------------------------------------------------------

  /**
   * Wire the reverse `handle → key` lookup and mark `handle` as a real,
   * residency-issued handle/ref for the lifetime of the object — the latter
   * (`_everRegisteredHandles`) is never cleared, unlike `_handleKeys`, which
   * {@link _forgetKey} (via {@link unloadAll}/{@link _unloadOne}) deletes for a
   * settled key. The single choke point for every site that used to call
   * `_handleKeys.set(...)` directly.
   */
  private _registerHandle(handle: object, key: string): void {
    this._handleKeys.set(handle, key);
    this._everRegisteredHandles.add(handle);
  }

  /**
   * Register a fresh deferred entry for `key` holding `handle` weakly, wire the
   * reverse `handle → key` lookup, and arm GC pruning. Returns the entry so the
   * caller can add further co-handles.
   */
  private _createDeferredEntry(key: string, handle: object, options?: unknown): { readonly handles: WeakHandleSet; readonly options: unknown } {
    const entry = { handles: new WeakHandleSet(handle), options };

    this._deferred.set(key, entry);
    this._registerHandle(handle, key);
    this._deferredFinalization.register(handle, key);

    return entry;
  }

  /**
   * Add `handle` to an existing deferred entry's weak handle set (idempotent for
   * an already-tracked handle), wire the reverse lookup, and arm GC pruning.
   * @internal
   */
  public _addDeferredHandle(key: string, entry: { readonly handles: WeakHandleSet }, handle: object): void {
    this._registerHandle(handle, key);

    if (entry.handles.has(handle)) {
      return;
    }

    entry.handles.add(handle);
    this._deferredFinalization.register(handle, key);
  }

  /**
   * Does any live handle registered for a seamless key sit in `'failed'`? Then
   * the key's last attempt ended in failure, and an adoption joining it is a
   * retry — whatever state the adopted handle itself was in. Restarting is
   * harmless in the one case where a fetch IS already running past a `'failed'`
   * straggler ({@link _getSeamless} re-arms only the representative):
   * {@link _loadSingle} dedupes on the key's in-flight entry, and the straggler
   * needed the re-arm regardless.
   */
  private _hasFailedHandle(entry: { readonly handles: WeakHandleSet }, adapter: SeamlessAdapter<unknown>): boolean {
    for (const handle of entry.handles) {
      if (adapter.stateOf(handle) === 'failed') {
        return true;
      }
    }

    return false;
  }

  /**
   * Value-ref twin of {@link _hasFailedHandle}: does any ref registered for a
   * value key sit in `'failed'`? Then the key's last attempt ended in failure
   * and an adoption joining it is a retry, whatever state the adopted ref
   * itself was in.
   */
  private _hasFailedRef(entry: { readonly refs: ReadonlySet<AssetRef<unknown>> }): boolean {
    for (const ref of entry.refs) {
      if (ref.state === 'failed') {
        return true;
      }
    }

    return false;
  }

  /**
   * Warn once per key when a second handle/ref for the same source carries an
   * incompatible FETCH option (e.g. a different `mimeType`): the decode is
   * source-keyed, so only the first call's fetch options take effect and the
   * later one is silently dropped. Per-handle sampler / pre-size options never
   * conflict — each handle carries its own — so they are stripped before the
   * comparison and never warn. A `undefined` second option is a plain reuse.
   */
  private _warnOnFetchOptionConflict(type: AssetConstructor, source: string, key: string, existingOptions: unknown, newOptions: unknown): void {
    if (newOptions === undefined || this._fetchOptionsEquivalent(existingOptions, newOptions)) {
      return;
    }

    logger.warn(`get(${this._typeRegistry._describeType(type)}, "${source}"): conflicting options ignored — the first call's options win.`, {
      source: 'Loader',
      once: `loader:seamless-options:${key}`,
    });
  }

  /** Structural equality of the FETCH-relevant option subset (per-handle sampler / pre-size keys stripped). */
  private _fetchOptionsEquivalent(left: unknown, right: unknown): boolean {
    return this._areOptionsEquivalent(this._stripPerHandleOptions(left), this._stripPerHandleOptions(right));
  }

  /** Drop the per-handle option keys (`samplerOptions`, `width`, `height`) that never gate the shared decode. */
  private _stripPerHandleOptions(options: unknown): unknown {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      return options;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(options as Record<string, unknown>)) {
      if (key === 'samplerOptions' || key === 'width' || key === 'height') {
        continue;
      }

      result[key] = value;
    }

    return result;
  }

  private _areOptionsEquivalent(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) {
      return true;
    }

    if (typeof left !== typeof right) {
      return false;
    }

    if (left === null || right === null) {
      return false;
    }

    if (typeof left !== 'object' || typeof right !== 'object') {
      return false;
    }

    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
      }

      for (let i = 0; i < left.length; i++) {
        if (!this._areOptionsEquivalent(left[i], right[i])) {
          return false;
        }
      }

      return true;
    }

    const leftPrototype = Object.getPrototypeOf(left);
    const rightPrototype = Object.getPrototypeOf(right);

    if (leftPrototype !== rightPrototype) {
      return false;
    }

    // Same-prototype instances compare structurally by their own enumerable
    // keys — deeply-equal options of any shared class, not just plain objects,
    // count as equivalent. Built-ins whose state is NOT
    // carried in enumerable own keys need explicit handling: Dates compare by
    // timestamp; other exotic containers stay reference-only (Object.is above)
    // so two distinct-but-similar instances never count as equivalent.
    if (left instanceof Date) {
      return left.getTime() === (right as Date).getTime();
    }

    if (left instanceof Map || left instanceof Set || left instanceof RegExp || left instanceof ArrayBuffer || ArrayBuffer.isView(left)) {
      return false;
    }

    const leftObject = left as Record<string, unknown>;
    const rightObject = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftObject);
    const rightKeys = Object.keys(rightObject);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (const key of leftKeys) {
      if (!Object.hasOwn(rightObject, key)) {
        return false;
      }

      if (!this._areOptionsEquivalent(leftObject[key], rightObject[key])) {
        return false;
      }
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // In-flight tracking / fetch dispatch
  // -----------------------------------------------------------------------

  /** @internal */
  public async _loadSingle(type: AssetConstructor, alias: string, options?: unknown, explicitPath?: string): Promise<unknown> {
    if (this._hasStored(type, alias)) {
      const typeMap = this._resources.get(type);
      if (typeMap?.has(alias) === true) {
        return typeMap.get(alias);
      }
    }

    const key = this._typeRegistry._key(type, alias);

    if (this._inFlight.has(key)) {
      return this._inFlight.get(key);
    }

    this._boostFromQueue(type, alias);

    if (this._inFlight.has(key)) {
      return this._inFlight.get(key);
    }

    const path = explicitPath ?? alias;

    return this._trackInFlight(type, alias, this._decoder._dispatchFetch(type, alias, path, options));
  }

  /**
   * Loads a single asset from an `Asset<T>` reference using identity-based
   * in-flight deduplication.
   *
   * Multiple aliases that point to the same source share a single network
   * fetch. Each alias is stored independently in the resource store, so every
   * alias resolves to the same payload.
   * @internal
   */
  public async _loadSingleAsset(type: AssetConstructor, alias: string, asset: Asset<unknown>): Promise<unknown> {
    if (this._hasStored(type, alias)) {
      return this._resources.get(type)?.get(alias);
    }

    const source = asset.source;
    const rawConfig = asset._config as Record<string, unknown>;
    const { type: _type, source: _src, ...extraOnly } = rawConfig;

    const handlerEntry = this._typeRegistry.getHandler(type);
    const identityKey = this._typeRegistry._resolveAssetIdentityKey(type, asset);
    const aliasKey = this._typeRegistry._key(type, alias);

    this._aliasKeyToIdentityKey.set(aliasKey, identityKey);
    let aliasSet = this._identityKeyToAliases.get(identityKey);
    if (!aliasSet) {
      aliasSet = new Set<string>();
      this._identityKeyToAliases.set(identityKey, aliasSet);
    }
    aliasSet.add(alias);

    const existing = this._inFlightByIdentity.get(identityKey);
    if (existing) {
      return existing.then(resource => this._storeResource(type, alias, resource));
    }

    let fetchPromise: Promise<unknown>;
    if (handlerEntry) {
      const fullConfig = { source, ...extraOnly };
      const context = this._decoder._buildHandlerContext(identityKey, handlerEntry.storageName);
      fetchPromise = this._decoder._fetchWithHandler(type, alias, source, fullConfig, handlerEntry.load, context);
    } else {
      fetchPromise = Promise.reject(this._typeRegistry._missingHandlerError(type));
    }

    const tracked: Promise<unknown> = fetchPromise
      .finally(() => {
        this._inFlightByIdentity.delete(identityKey);
      })
      .then(
        v => v,
        error => {
          const failedAliases = this._identityKeyToAliases.get(identityKey);
          if (failedAliases) {
            for (const fa of failedAliases) {
              const faKey = this._typeRegistry._key(type, fa);
              this._aliasKeyToIdentityKey.delete(faKey);
              this._preventStoreKeys.delete(faKey);
              this._onTrackedFailure(type, fa, faKey, error);
            }
            this._identityKeyToAliases.delete(identityKey);
          } else {
            this._onTrackedFailure(type, alias, aliasKey, error);
          }
          throw error;
        },
      );

    this._inFlightByIdentity.set(identityKey, tracked);
    return tracked;
  }

  private _trackInFlight(type: AssetConstructor, alias: string, promise: Promise<unknown>): Promise<unknown> {
    const key = this._typeRegistry._key(type, alias);
    const trackedPromise = promise.finally(() => {
      // Clear only our OWN entry: a superseding load (e.g. a reclaim re-fetch
      // after an eviction dropped and re-added this key) may already own the
      // slot. Deleting it unconditionally would un-dedup a concurrent load and
      // let a second fetch overwrite the healed handle with its raw donor.
      if (this._inFlight.get(key) === trackedPromise) {
        this._inFlight.delete(key);
      }

      this._preventStoreKeys.delete(key);
    });

    // Non-swallowing observer: fails deferred handles / value refs (fresh
    // error each attempt) and dispatches onError exactly once for the failed
    // fetch, regardless of which verb (get/load/background) started it.
    trackedPromise.catch((error: unknown) => this._onTrackedFailure(type, alias, key, error));
    this._inFlight.set(key, trackedPromise);

    return trackedPromise;
  }

  private _onTrackedFailure(type: AssetConstructor, alias: string, key: string, error: unknown): void {
    const err = this._normalizeError(error);
    const deferredEntry = this._deferred.get(key);

    if (deferredEntry !== undefined) {
      const adapter = this._typeRegistry.getSeamlessAdapter(type);

      for (const handle of deferredEntry.handles) {
        adapter?.fail(handle, err);
      }

      this._warnMissingSource(alias, key, err);
    } else {
      const refEntry = this._refs.get(key);

      if (refEntry !== undefined) {
        for (const ref of refEntry.refs) {
          ref._fail(err);
        }

        this._warnMissingSource(alias, key, err);
      }
    }

    this._signals.onError.dispatch(type, alias, err);
  }

  /**
   * Dev-only diagnostic for the seamless silent-404 trap: a `get('x.png')` /
   * adopted-catalog / `Assets.from(...)` leaf whose fetch ends in a 404 or
   * network error only ever surfaces a `'failed'` placeholder. Warns ONCE per
   * source. Stripped in production.
   */
  private _warnMissingSource(source: string, key: string, error: Error): void {
    logger.warn(
      `Asset "${source}" failed to load: ${error.message} ` +
        `Seamless get()/Assets.from() fetch the literal path and heal a placeholder in place, so a typo or an ` +
        `un-preloaded alias 404s without throwing. Check the path and the loader basePath, and preload it via Assets.from() / load().`,
      { source: 'Loader', once: `loader:missing-source:${key}` },
    );
  }

  /** The representative (first-inserted) member of a ref set, or `undefined` if empty. */
  private _representative<T>(members: ReadonlySet<T> | undefined): T | undefined {
    return members === undefined ? undefined : members.values().next().value;
  }

  private _normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  // -----------------------------------------------------------------------
  // Store
  // -----------------------------------------------------------------------

  /**
   * Store a resolved resource under `(type, alias)`: fills every deferred
   * handle / value-ref waiting on the key (multi-handle fill), respects
   * "free on arrival" for a key unloaded mid-fetch, and registers the
   * canonical reverse (resource → key) lookup. Called from `AssetDecoder`
   * (Slice 2) via the `storeResource` callback `Loader`'s constructor wires
   * to this method, and internally from {@link _loadSingleAsset}'s
   * already-in-flight-by-identity branch.
   * @internal
   */
  public _storeResource(type: AssetConstructor, alias: string, resource: unknown): unknown {
    const key = this._typeRegistry._key(type, alias);

    if (this._preventStoreKeys.delete(key)) {
      // The asset was unloaded while its fetch was in flight. A deferred handle
      // waiting on this key must not stay 'loading' forever: fail it so
      // `.loaded` rejects. The entry stays (like any failed fetch) so a later
      // get() retries and heals the SAME handle in place.
      const preventedEntry = this._deferred.get(key);

      if (preventedEntry !== undefined) {
        const adapter = this._typeRegistry.getSeamlessAdapter(type);
        const unloadError = new Error(`Asset "${alias}" was unloaded while its fetch was in flight.`);

        for (const handle of preventedEntry.handles) {
          adapter?.fail(handle, unloadError);
        }
      }

      const preventedRef = this._refs.get(key);

      if (preventedRef !== undefined) {
        for (const ref of preventedRef.refs) {
          if (ref.loadState === 'loading') {
            ref._fail(new Error(`Asset "${alias}" was unloaded while its fetch was in flight.`));
          }
        }
      }

      return resource;
    }

    // Seamless intercept: a deferred handle registered for this (type, source)
    // absorbs the fetched payload in place and becomes the stored resource, so
    // every consumer — get() before or after load(), and load()'s own promise —
    // sees exactly ONE instance per source.
    const deferredEntry = this._deferred.get(key);
    let filledDeferredHandle = false;

    if (deferredEntry !== undefined) {
      const adapter = this._typeRegistry.getSeamlessAdapter(type);
      let representative: object | undefined;

      // Fill EVERY in-flight handle for the key from the single decoded donor
      // (§7 multi-handle fill). The first handle is the representative — it
      // becomes the canonical `_resources` entry, mirroring the old
      // single-handle contract (which object is canonical for eviction).
      for (const handle of deferredEntry.handles) {
        representative ??= handle;

        if (handle === resource || adapter === undefined) {
          continue;
        }

        // A non-get producer (load(), bundle, background) may store into a key
        // whose handle is 'failed' (e.g. an earlier get() 404'd). fill() → settle()
        // must run from a re-armed state so `.loaded` re-materializes a resolved
        // promise; without begin() the handle would read 'ready' while its cached
        // `.loaded` stayed permanently rejected. Skip a handle already 'ready'
        // (filled by an earlier producer) — filling twice is a no-op at best.
        const state = adapter.stateOf(handle);

        if (state === 'ready') {
          continue;
        }

        if (state === 'failed') {
          adapter.begin(handle);
        }

        adapter.fill(handle, resource);
      }

      // The entry is NOT dropped here: it persists as the key's live-handle
      // registry so a co-handle adopt (audit A5) joins it and a refcount-0
      // eviction re-arms every consumer. The representative stays canonical.
      if (representative !== undefined && representative !== resource) {
        resource = representative;
        filledDeferredHandle = true;
      }
    }

    // Value-asset refs fill from whatever producer stores the value; the raw
    // value stays the stored resource (load() keeps resolving it). Fill every
    // in-flight ref for the key (§7 multi-handle fill).
    const refEntry = this._refs.get(key);

    if (refEntry !== undefined) {
      for (const ref of refEntry.refs) {
        if (ref.loadState !== 'ready') {
          ref._fill(resource);
        }
      }
    }

    let typeResources = this._resources.get(type);
    if (!typeResources) {
      typeResources = new Map();
      this._resources.set(type, typeResources);
    }

    typeResources.set(alias, resource);

    // Record the canonical reverse key (first alias wins) for object resources.
    if (typeof resource === 'object' && resource !== null && !this._resourceKeys.has(resource)) {
      this._resourceKeys.set(resource, { type, source: alias });
    }

    // Register the stored seamless resource as its key's representative so a
    // later eviction re-arms it and a co-handle adopt (audit A5) joins the same
    // set. A resource that already came from a deferred handle is a member
    // already; a plain `load()` donor (no prior get()) is added here. Held
    // weakly, so a fully-released source does not pin its evicted payload (A4).
    if (typeof resource === 'object' && resource !== null && this._typeRegistry.hasSeamlessAdapter(type) && this._deferred.get(key) === undefined) {
      this._createDeferredEntry(key, resource);
    }

    this._signals.onLoaded.dispatch(type, alias, resource);

    // §4.7 free-on-arrival: a deferred handle whose every claimer released
    // during the in-flight fetch has now converged into `_resources` at
    // refcount 0. `.loaded` was already settled by the fill above, so an
    // awaiter holding that promise still resolves (the asset WAS complete);
    // evicting here drops the payload in place (re-arming `.loaded` to
    // 'loading') so it does not linger unclaimed. Gated on an actual deferred
    // fill: a never-claimed bundle/container store (no `_deferred` entry) must
    // persist, not be freed on arrival.
    if (filledDeferredHandle && !this._claims.has(key)) {
      this._evictKey(key, type, alias);
    }

    return resource;
  }

  // -----------------------------------------------------------------------
  // Background queue
  // -----------------------------------------------------------------------

  /**
   * Divert an adopted leaf's fetch into the low-priority background queue.
   * The leaf is already registered in `_deferred`/`_refs` and claimed, so the
   * fetch — whenever the queue drains it, or a `get()` boosts it — fills that
   * same handle in place via {@link _storeResource}.
   * @internal
   */
  public _enqueueBackgroundFetch(type: AssetConstructor, source: string, options: unknown): void {
    if (this._hasStored(type, source)) return;
    if (this._inFlight.has(this._typeRegistry._key(type, source))) return;
    if (this._isQueuedInBackground(type, source)) return;

    if (this._backgroundQueue.length === 0 && this._backgroundActive === 0) {
      this._backgroundLoaded = 0;
      this._backgroundTotal = 0;
    }

    this._backgroundQueue.push({ type, alias: source, path: source, options });
    this._backgroundTotal++;
    this._drainBackground();
  }

  private _drainBackground(): void {
    while (this._backgroundActive < this._concurrency && this._backgroundQueue.length > 0) {
      const entry = this._backgroundQueue.shift();
      if (!entry) {
        continue;
      }
      const key = this._typeRegistry._key(entry.type, entry.alias);

      if (this._hasStored(entry.type, entry.alias) || this._inFlight.has(key)) {
        this._backgroundLoaded++;
        this._onBackgroundItemDone();
        continue;
      }

      this._startBackgroundEntry(entry);
    }
  }

  private _boostFromQueue(type: AssetConstructor, alias: string): void {
    const index = this._backgroundQueue.findIndex(e => e.type === type && e.alias === alias);

    if (index === -1) return;

    const [entry] = this._backgroundQueue.splice(index, 1);
    if (entry === undefined) return;

    this._startBackgroundEntry(entry);
  }

  private _isQueuedInBackground(type: AssetConstructor, alias: string): boolean {
    return this._backgroundQueue.some(entry => entry.type === type && entry.alias === alias);
  }

  private _onBackgroundItemDone(): void {
    this._signals.onProgress.dispatch(this._backgroundLoaded, this._backgroundTotal);

    if (this._backgroundResolve && this._backgroundQueue.length === 0 && this._backgroundActive === 0) {
      const resolve = this._backgroundResolve;

      this._backgroundResolve = null;
      resolve();
    }
  }

  private _startBackgroundEntry(entry: QueueEntry): void {
    this._backgroundActive++;

    this._trackInFlight(entry.type, entry.alias, this._decoder._dispatchFetch(entry.type, entry.alias, entry.path, entry.options))
      .catch(() => {
        /* Failure handled centrally in _onTrackedFailure. */
      })
      .finally(() => {
        this._backgroundActive--;
        this._backgroundLoaded++;
        this._onBackgroundItemDone();
        this._drainBackground();
      });
  }

  /**
   * Resolves when the low-priority background queue has fully drained. Kicks
   * the queue first, so a concurrency change that left pending entries
   * unstarted still makes progress.
   */
  public awaitBackground(): Promise<void> {
    return new Promise<void>(resolve => {
      this._drainBackground();

      if (this._backgroundQueue.length === 0 && this._backgroundActive === 0) {
        resolve();

        return;
      }

      this._backgroundResolve = resolve;
    });
  }

  /** Sets the maximum number of simultaneous background-queue fetches. */
  public setConcurrency(n: number): void {
    this._concurrency = n;
  }

  // -----------------------------------------------------------------------
  // Unload
  // -----------------------------------------------------------------------

  /** @internal */
  public _unloadOne(type: AssetConstructor, alias: string): void {
    const ctor = type;
    const aliasKey = this._typeRegistry._key(ctor, alias);

    // Snapshot BEFORE the delete: a key whose resource is already stored has a
    // SETTLED fetch — any lingering `_inFlight` entry for it is stale (its
    // `.finally` cleanup microtask has not yet run), not a live fetch. This is
    // the signal that separates a genuine in-flight unload (fail-in-place, keep
    // the handle) from a settled one (forget it, drop the stale entry).
    const hadResource = this._resources.get(ctor)?.has(alias) ?? false;

    this._resources.get(ctor)?.delete(alias);

    // A genuine in-flight fetch (not yet stored) is prevented from writing its
    // result once it arrives, so a deferred handle fails in place instead of
    // silently resurrecting the asset.
    const identityKey = this._aliasKeyToIdentityKey.get(aliasKey);
    const liveFetch = !hadResource && (this._inFlight.has(aliasKey) || (identityKey !== undefined && this._inFlightByIdentity.has(identityKey)));
    if (liveFetch) {
      this._preventStoreKeys.add(aliasKey);
    }

    // Clean up alias ↔ identity tracking
    if (identityKey !== undefined) {
      this._aliasKeyToIdentityKey.delete(aliasKey);
      const aliasSet = this._identityKeyToAliases.get(identityKey);
      if (aliasSet) {
        aliasSet.delete(alias);
        if (aliasSet.size === 0) {
          this._identityKeyToAliases.delete(identityKey);
        }
      }
    }

    this._forgetKey(aliasKey, liveFetch);
  }

  /**
   * Hard, claim-forgetting reset of the resident store. If `type` is provided,
   * only that type's assets are cleared; otherwise all types are flushed.
   * Does not cancel in-flight fetches — but forgets each key's claim/handle
   * bookkeeping so repeated load→reset cycles cannot accumulate stale entries.
   *
   * Deliberately NOT public on {@link Loader}: it discards every scope's claim,
   * so a caller could free assets another scope still owns. Scope-aware release
   * goes through `Loader.release` / `_releaseScope` instead.
   * @internal
   */
  public unloadAll(type?: AssetConstructor): void {
    if (type) {
      // Route every stored alias — and any claim-tracked key of this type that
      // never reached _resources (in-flight / deferred-only) — through
      // _unloadOne so the claim/handle maps are cleared, not just _resources.
      const aliases = new Set<string>(this._resources.get(type)?.keys());

      for (const [, entry] of this._claims) {
        if (entry.type === type) aliases.add(entry.source);
      }

      for (const alias of aliases) {
        this._unloadOne(type, alias);
      }

      return;
    }

    // Global reset. Snapshot the keys with a stored resource first: their
    // in-flight entries (if any) are stale (resolved-but-uncleaned), so they can
    // be dropped, while a not-yet-stored key with a live `_inFlight` entry is a
    // genuine fetch that must be preserved (its handle fills or fails in place) —
    // honoring "does not cancel in-flight fetches".
    const settledKeys = new Set<string>();
    for (const [ctor, typeMap] of this._resources) {
      for (const alias of typeMap.keys()) settledKeys.add(this._typeRegistry._key(ctor, alias));
    }

    for (const typeMap of this._resources.values()) {
      typeMap.clear();
    }

    for (const [key, entry] of this._deferred) {
      if (this._inFlight.has(key) && !settledKeys.has(key)) {
        this._preventStoreKeys.add(key); // genuine in-flight: fail/heal in place on arrival
        continue;
      }

      for (const handle of entry.handles) this._handleKeys.delete(handle);
      this._deferred.delete(key);
      this._inFlight.delete(key);
    }

    for (const [key, entry] of this._refs) {
      if (this._inFlight.has(key) && !settledKeys.has(key)) {
        this._preventStoreKeys.add(key);
        continue;
      }

      for (const ref of entry.refs) this._handleKeys.delete(ref);
      this._refs.delete(key);
      this._inFlight.delete(key);
    }

    for (const key of settledKeys) {
      this._inFlight.delete(key);
    }

    this._claims.clear();
    this._evicted.clear();
    this._aliasKeyToIdentityKey.clear();
    this._identityKeyToAliases.clear();
  }

  /**
   * Drop a key's claim/handle bookkeeping for the legacy `unload`/`unloadAll`
   * verbs — a HARD, global removal, unlike scope-aware {@link _release}: it
   * forgets the claim entirely (across every scope) so a stale claim can no
   * longer hold refcount > 0 and keep a key from ever evicting.
   *
   * A key with a genuine `liveFetch` keeps its deferred handle / value-ref so
   * the prevented store can fail it (and a later `get()` heals the SAME
   * handle) — only a SETTLED key's handles are forgotten here.
   */
  private _forgetKey(key: string, liveFetch: boolean): void {
    this._claims.delete(key);
    this._evicted.delete(key);

    if (liveFetch) {
      return;
    }

    this._inFlight.delete(key);
    this._preventStoreKeys.delete(key);

    const deferred = this._deferred.get(key);
    if (deferred !== undefined) {
      for (const handle of deferred.handles) this._handleKeys.delete(handle);
      this._deferred.delete(key);
    }

    const refEntry = this._refs.get(key);
    if (refEntry !== undefined) {
      for (const ref of refEntry.refs) this._handleKeys.delete(ref);
      this._refs.delete(key);
    }
  }

  // -----------------------------------------------------------------------
  // Read accessors
  // -----------------------------------------------------------------------

  /**
   * Non-throwing in-memory lookup: the resource stored under `(type, source)`,
   * or `null` if none is held. Backs `Loader._peekResource` (scene
   * deserialization). Coalesces a legitimately-stored `null`/`undefined` to
   * `null`; use {@link _hasStored} when the distinction matters.
   * @internal
   */
  public _peekResource(type: AssetConstructor, source: string): unknown {
    return this._resources.get(type)?.get(source) ?? null;
  }

  /**
   * True if a resource is stored under `(type, source)`, regardless of what
   * the value is (including a legitimately-stored `null`/`undefined` from a
   * `bindAsset`-bound custom type). Unlike {@link _peekResource}, this
   * distinguishes "no entry" from "entry present with a nullish value" — the
   * presence check the load fast paths need. @internal
   */
  public _hasStored(type: AssetConstructor, source: string): boolean {
    return this._resources.get(type)?.has(source) ?? false;
  }

  /**
   * Reverse lookup: given a loaded resource object, the asset type and source
   * key it was first loaded under, or `null`. Backs `Loader.keyFor`.
   * @internal
   */
  public _keyFor(resource: object): { readonly type: AssetConstructor; readonly source: string } | null {
    return this._resourceKeys.get(resource) ?? null;
  }

  /**
   * The set of aliases registered under an identity key, or `undefined`.
   * Backs `Loader.unload`'s `Asset<T>` branch, which used to read
   * `_identityKeyToAliases` directly before that field moved here.
   * @internal
   */
  public _getAliasesForIdentity(identityKey: string): Set<string> | undefined {
    return this._identityKeyToAliases.get(identityKey);
  }

  /**
   * The resource key a deferred handle / value-ref is registered under, or
   * `undefined`. Backs `Loader.release(handle)`, which used to read
   * `_handleKeys` directly before that field moved here.
   * @internal
   */
  public _getHandleKey(handle: object): string | undefined {
    return this._handleKeys.get(handle);
  }

  /**
   * Whether `handle` was ever registered as a live deferred handle / value-ref
   * by this residency — regardless of whether its key has since been forgotten
   * by {@link _forgetKey} (which deletes from `_handleKeys` but never from this
   * WeakSet). Backs `Loader.release(handle)`'s fail-loud check: a handle
   * `get()` once handed out must stay a releasable no-op even after an
   * unrelated internal hard reset, so the throw only fires for an object
   * residency never saw at all. @internal
   */
  public _wasEverRegisteredHandle(handle: object): boolean {
    return this._everRegisteredHandles.has(handle);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Clears all resident-resource, in-flight, claim, and background-queue state. Called from `Loader.destroy()`. */
  public destroy(): void {
    this._resources.clear();
    this._inFlight.clear();
    this._preventStoreKeys.clear();
    this._inFlightByIdentity.clear();
    this._aliasKeyToIdentityKey.clear();
    this._identityKeyToAliases.clear();
    this._deferred.clear();
    this._refs.clear();
    // Not part of the original Loader.destroy() — clearing claim/eviction bookkeeping
    // too is more correct for a full teardown; added during the Loader-split extraction.
    this._claims.clear();
    this._evicted.clear();

    this._backgroundQueue.length = 0;
    this._backgroundActive = 0;
    this._backgroundLoaded = 0;
    this._backgroundTotal = 0;

    // A pending awaitBackground() caller must not hang forever past destroy().
    if (this._backgroundResolve) {
      const resolve = this._backgroundResolve;

      this._backgroundResolve = null;
      resolve();
    }
  }
}
