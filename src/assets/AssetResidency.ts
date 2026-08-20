import type { LoadStateValue } from '#core/LoadState';
import { logger } from '#core/logging';
import type { Signal } from '#core/Signal';

import type { AssetDecoder } from './AssetDecoder';
import { _readMeta } from './assetMeta';
import { AssetRef } from './AssetRef';
import type { AssetTypeRegistry } from './AssetTypeRegistry';
import type { AssetLocator, CanonicalAsset, CanonicalAssetKey } from './canonicalKey';
import type { AssetConstructor } from './FactoryRegistry';
import type { LoaderScope, LoaderScopeKind } from './LoaderScope';
import type { SeamlessAdapter } from './seamless';
import { isAbortError, SharedAbort } from './SharedAbort';
import { WeakHandleSet } from './WeakHandleSet';

interface QueueEntry {
  readonly asset: CanonicalAsset;
  readonly options?: unknown;
}

/** The `Loader` services `AssetResidency` needs but does not own. @internal */
export interface AssetResidencyHooks {
  /** Resolves a `(type, source, options)` triple to the one canonical identity every fetch and claim is keyed by. */
  readonly canonicalize: (type: AssetConstructor, source: string, options?: unknown) => CanonicalAsset;
  /** Mints the claim scope that owns whatever sub-assets one asset's own load pulls in. */
  readonly createDependencyScope: (asset: CanonicalAsset) => LoaderScope;
}

/** The `Loader` signals `AssetResidency` dispatches on directly — owned by `Loader` (public API), referenced here for dispatch only. */
export interface AssetResidencySignals {
  readonly onProgress: Signal<[loaded: number, total: number]>;
  readonly onLoaded: Signal<[type: AssetConstructor, alias: string, resource: unknown]>;
  readonly onError: Signal<[type: AssetConstructor, alias: string, error: Error]>;
}

/**
 * One row of {@link Loader.inspect}'s diagnostic snapshot: everything a
 * developer needs to reason about a single canonical asset without reaching
 * into `Loader`'s private residency bookkeeping — its lifecycle state, how many
 * independent claim scopes hold it, and whether its fetch is queued, in flight,
 * or settled. Every row is plain, frozen data: numbers, strings, booleans, and
 * the asset's constructor token — never a `Set`, a claim symbol, or a live
 * handle/ref object, so nothing returned here can be used to mutate residency
 * state.
 */
export interface AssetOwnerInspection {
  /** Stable, unique per loader run. */
  readonly id: number;
  /** The scope's human-readable label, when it was given one. Never an identity. */
  readonly name?: string;
  readonly kind: LoaderScopeKind;
}

export interface AssetInspection {
  /** The canonical key this row describes — the same key the claim, in-flight and resource maps use. */
  readonly canonicalKey: CanonicalAssetKey;
  /** The asset type constructor this key was resolved under. */
  readonly type: AssetConstructor;
  /** The canonicalized source this asset resolves to. */
  readonly locator: AssetLocator;
  /** Every source string seen for this key, sorted. Several spellings can name one canonical asset. */
  readonly aliases: readonly string[];
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
   * refcount a release decrements and that reaches zero to evict.
   * This is a scope count, not a count of consumer handles/refs or `get()`
   * calls: several handles sharing one scope, or several `get()` calls for
   * the same source, still report `1` here.
   */
  readonly claims: number;
  /** The scopes currently holding this key, sorted by id. Empty for a resident-but-unowned asset. */
  readonly owners: readonly AssetOwnerInspection[];
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

/** One resident payload, kept together with the canonical identity it was stored under. */
interface ResidentEntry {
  readonly asset: CanonicalAsset;
  readonly value: unknown;
}

/**
 * Owns claim/refcount tracking, in-flight fetch dedup, the resident-resource
 * store, deferred-handle / value-ref healing, and the background-loading queue
 * for a `Loader` instance.
 *
 * Everything here is keyed by ONE identity: the {@link CanonicalAssetKey}
 * resolved before any fetch starts. Aliases and catalog keys are names that
 * resolve to such a key; they never create a second residency entry.
 */
export class AssetResidency {
  private readonly _typeRegistry: AssetTypeRegistry;
  private readonly _decoder: AssetDecoder;
  private readonly _signals: AssetResidencySignals;
  private readonly _hooks: AssetResidencyHooks;

  private readonly _resources = new Map<CanonicalAssetKey, ResidentEntry>();
  // Reverse lookup: loaded resource object → the (type, source) it was first
  // stored under. Backs Loader.keyFor for scene serialization. A WeakMap so
  // it never retains resources; only object resources participate.
  private readonly _resourceKeys = new WeakMap<object, { type: AssetConstructor; source: string }>();
  private readonly _inFlight = new Map<CanonicalAssetKey, Promise<unknown>>();
  private readonly _preventStoreKeys = new Set<CanonicalAssetKey>();

  // One {@link SharedAbort} per in-flight fetch. Holders are the consumers
  // waiting on it, so aborting is never a property of one consumer's cancel but
  // of the LAST holder leaving.
  private readonly _abort = new Map<CanonicalAssetKey, SharedAbort>();

  // Every source string that has resolved to a given canonical key. Purely
  // diagnostic — an alias never participates in identity or ownership.
  private readonly _aliases = new Map<CanonicalAssetKey, Set<string>>();

  // ── Seamless deferred handles ──────────────────────────────────────────────
  private readonly _deferred = new Map<CanonicalAssetKey, { readonly asset: CanonicalAsset; readonly handles: WeakHandleSet; readonly options: unknown }>();
  private readonly _deferredFinalization = new FinalizationRegistry<CanonicalAssetKey>((key: CanonicalAssetKey): void => {
    const entry = this._deferred.get(key);

    if (entry !== undefined && !entry.handles.prune()) {
      this._deferred.delete(key);
      this._evicted.delete(key);
    }
  });

  // Value-asset refs
  private readonly _refs = new Map<CanonicalAssetKey, { readonly asset: CanonicalAsset; readonly refs: Set<AssetRef<unknown>>; readonly options: unknown }>();

  // ── Refcount / claims ───────────────────────────────────────────────────────
  private readonly _claims = new Map<CanonicalAssetKey, { scopes: Set<LoaderScope>; asset: CanonicalAsset }>();
  // The scope that owns whatever sub-assets a key's own load pulled in. Owned by
  // the PARENT KEY, never by whichever consumer happened to start the fetch: a
  // deduped load serves many consumers, and the first one to release must not
  // take a dependency the others still need with it.
  private readonly _dependencyScopes = new Map<CanonicalAssetKey, LoaderScope>();
  private readonly _evicted = new Set<CanonicalAssetKey>();
  private readonly _handleKeys = new WeakMap<object, CanonicalAssetKey>();
  // Every handle/ref residency has EVER registered under a key — a WeakSet, so
  // it never needs pruning and never retains a dead handle. Unlike `_handleKeys`,
  // this is never deleted from (not even by `_forgetKey`/`unloadAll`'s hard
  // reset), so a release's "was this ever a real handle" check stays
  // true regardless of unrelated unload/reset ordering that happened since.
  private readonly _everRegisteredHandles = new WeakSet();

  private _concurrency: number;
  private _backgroundQueue: QueueEntry[] = [];
  private _backgroundActive = 0;
  private _backgroundTotal = 0;
  private _backgroundLoaded = 0;
  private _backgroundResolve: (() => void) | null = null;

  public constructor(typeRegistry: AssetTypeRegistry, decoder: AssetDecoder, signals: AssetResidencySignals, concurrency: number, hooks: AssetResidencyHooks) {
    this._typeRegistry = typeRegistry;
    this._decoder = decoder;
    this._signals = signals;
    this._concurrency = concurrency;
    this._hooks = hooks;
  }

  /**
   * Read-only, detached snapshot for diagnostics and support bundles.
   *
   * Walks the whole residency, not just the claim map: a payload that is
   * resident without an owner is exactly the kind of leak a snapshot has to
   * show, so it must not be the one thing a snapshot cannot see.
   * @internal
   */
  public _inspect(): readonly AssetInspection[] {
    const backgroundKeys = new Set(this._backgroundQueue.map(entry => entry.asset.key));
    const assets = new Map<CanonicalAssetKey, CanonicalAsset>();

    for (const [key, entry] of this._resources) assets.set(key, entry.asset);
    for (const [key, entry] of this._claims) assets.set(key, entry.asset);
    for (const [key, entry] of this._deferred) assets.set(key, entry.asset);
    for (const [key, entry] of this._refs) assets.set(key, entry.asset);
    for (const entry of this._backgroundQueue) assets.set(entry.asset.key, entry.asset);

    const rows: AssetInspection[] = [];

    for (const [key, asset] of assets) {
      const stored = this._resources.has(key);
      const inFlight = this._inFlight.has(key);
      const claimed = this._claims.has(key);

      // A key that is neither resident, owned, fetching nor queued costs nothing
      // but a remembered handle identity kept for healing. Reporting those would
      // bury the rows that matter — including the one case this walk exists for,
      // a payload resident with no owner left.
      if (!stored && !inFlight && !claimed && !backgroundKeys.has(key)) {
        continue;
      }

      // Raw queue membership only — a settled row must never report `background: true`
      // (see below), so this is an INPUT to `state`, not the field's own value.
      const queuedInBackground = backgroundKeys.has(key);
      const handleState = this._inspectHandleState(key, asset.type);
      const state = this._inspectState({ stored, handleState, queuedInBackground, inFlight });
      const scopes = [...(this._claims.get(key)?.scopes ?? [])].sort((left, right) => left.id - right.id);

      rows.push(
        Object.freeze({
          canonicalKey: key,
          type: asset.type,
          locator: asset.locator,
          aliases: Object.freeze([...(this._aliases.get(key) ?? [asset.source])].sort()),
          state,
          claims: scopes.length,
          owners: Object.freeze(scopes.map(scope => Object.freeze({ id: scope.id, ...(scope.name !== undefined && { name: scope.name }), kind: scope.kind }))),
          inFlight,
          // Derived from `state`, not from raw queue membership: a producer that
          // stores a payload without draining the background queue first must
          // never leave a settled row also reporting `background: true`.
          background: state === 'queued',
        }),
      );
    }

    // A plain codepoint comparison, not `localeCompare`: the sort order is part
    // of a diagnostic snapshot's contract and must not vary by ICU locale/runtime.
    rows.sort((left, right) => {
      if (left.canonicalKey < right.canonicalKey) return -1;
      if (left.canonicalKey > right.canonicalKey) return 1;
      return 0;
    });
    return Object.freeze(rows);
  }

  /** The load-lifecycle state of whatever handle/ref is registered for `key`, or `undefined` if none is. Backs {@link _inspect}. */
  private _inspectHandleState(key: CanonicalAssetKey, type: AssetConstructor): LoadStateValue | undefined {
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

  /** Record that `source` resolved to `key`, for diagnostics only. */
  private _recordAlias(asset: CanonicalAsset): void {
    let aliases = this._aliases.get(asset.key);

    if (aliases === undefined) {
      aliases = new Set<string>();
      this._aliases.set(asset.key, aliases);
    }

    aliases.add(asset.source);
  }

  /**
   * Register a claim on a canonical asset under a claim scope (idempotent per
   * scope). On an evicted key, kick a re-fetch into the existing, already
   * re-armed handle so every dangling consumer heals in place.
   * @internal
   */
  public _claim(asset: CanonicalAsset, claimer: LoaderScope): void {
    let entry = this._claims.get(asset.key);

    if (entry === undefined) {
      entry = { scopes: new Set<LoaderScope>(), asset };
      this._claims.set(asset.key, entry);
    }

    this._recordAlias(asset);
    entry.scopes.add(claimer);

    if (this._evicted.has(asset.key)) {
      this._evicted.delete(asset.key);

      // The handle/ref was re-armed to 'loading' during eviction; just re-drive
      // the fetch. A value key with no ref left (evicted after a bare `load()`)
      // still refetches: nothing but this would restore its resident payload.
      if (this._typeRegistry.hasSeamlessAdapter(asset.type)) {
        this._startFetch(asset, this._deferred.get(asset.key)?.options);
      } else {
        this._startFetch(asset, this._refs.get(asset.key)?.options);
      }
    }
  }

  /**
   * Drop a claim scope from a key; when the last scope releases, evict the
   * payload immediately (refcount 0).
   * @internal
   */
  public _release(key: CanonicalAssetKey, claimer: LoaderScope): void {
    const entry = this._claims.get(key);

    if (entry === undefined) {
      return;
    }

    entry.scopes.delete(claimer);

    if (entry.scopes.size === 0) {
      this._claims.delete(key);
      this._evictKey(entry.asset);
    }
  }

  /**
   * Release every claim held under a claim scope (a scene unloading its
   * scene-private assets). Collect the held keys first, then release —
   * {@link _release} mutates `_claims`, so we must not delete during iteration.
   * @internal
   */
  public _releaseScope(claimer: LoaderScope): void {
    const held: CanonicalAssetKey[] = [];

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
   * background-queue entry. A value key (no seamless adapter for the type) takes
   * the twin path in {@link _evictValueKey} instead.
   *
   * Only a payload that has already converged into `_resources` is dropped here.
   * A fetch still in flight (nothing stored yet) has nothing to evict — it is
   * CANCELLED instead: reaching refcount 0 means no claim scope is waiting for
   * its result any more, which is exactly the condition the key's
   * {@link SharedAbort} arms on. The value path is gated identically.
   */
  private _evictKey(asset: CanonicalAsset): void {
    const { key, type } = asset;
    const adapter = this._typeRegistry.getSeamlessAdapter(type);
    const stored = this._resources.get(key)?.value;

    if (adapter !== undefined && stored !== undefined) {
      const entry = this._deferred.get(key);
      // Re-arm every live consumer handle in place: the representative AND any
      // co-handle adopted from the stored donor, so a later claim
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

      this._resources.delete(key);

      // Keep the handles registered (weakly) so the next claim heals them in
      // place; the entry persists from store time, carrying the original options.
      if (entry === undefined) {
        this._createDeferredEntry(asset, stored as object);
      }

      this._evicted.add(key);
      this._releaseDependencies(key);
      // A load that just settled may leave a resolved-but-not-yet-cleaned
      // in-flight entry (its `.finally` cleanup is a pending microtask). Drop it
      // so the reclaim's re-fetch starts fresh instead of deduping onto that
      // stale resolved promise, which would never re-fill the re-armed handle.
      // The reclaim's fresh entry is protected from this stale `.finally` by the
      // self-entry identity guard in `_trackInFlight`.
      this._inFlight.delete(key);
    }
    // A value payload may legitimately BE `null`/`undefined` (a JSON `null`, a
    // nullish payload from a `bindAsset`-bound custom type), so this asks the
    // resource map where the seamless branch above can read the value itself —
    // for a seamless type the stored resource is always the handle object.
    else if (adapter === undefined && this._resources.has(key)) {
      this._evictValueKey(asset, stored);
    }
    // Nothing resident: whatever fetch is running for this key (if any) has no
    // claimer left waiting on it. Cancel it, and mark the key evicted so a later
    // claim re-drives the fetch into the handles this abort leaves behind.
    else if (this._abortInFlight(key)) {
      this._evicted.add(key);
      this._releaseDependencies(key);
    }

    const queued = this._backgroundQueue.findIndex(entry => entry.asset.key === key);

    if (queued !== -1) {
      this._backgroundQueue.splice(queued, 1);
    }
  }

  /**
   * Value twin of the seamless eviction in {@link _evictKey}: hand the stored
   * payload to the bound handler's per-resource `dispose` (a factory-backed
   * handler forwards it to `AssetFactory.dispose`), drop it from the resource
   * map, and re-arm every live ref for the key in place — `AssetRef._begin()`
   * is exactly what `adapter.evict(handle)` is for a seamless handle: payload
   * dropped, state back to `'loading'`, identity kept, so the next claim heals
   * every consumer that already holds the ref.
   *
   * Re-arming is not cosmetic bookkeeping. A ref left holding its `_value`
   * would keep handing out the payload this method just disposed, and would pin
   * it for as long as any consumer holds the ref — the eviction would free
   * nothing at all.
   *
   * `dispose` is optional on the handler: most value types (parsed JSON, text,
   * a compiled `WebAssembly.Module`) own nothing the garbage collector cannot
   * reclaim once the last reference drops, so the delete below IS the whole
   * teardown for them.
   */
  private _evictValueKey(asset: CanonicalAsset, stored: unknown): void {
    this._typeRegistry.getHandler(asset.type)?.dispose?.(stored);
    this._resources.delete(asset.key);

    const entry = this._refs.get(asset.key);

    if (entry !== undefined) {
      for (const ref of entry.refs) {
        ref._begin();
      }
    }

    this._evicted.add(asset.key);
    this._releaseDependencies(asset.key);
    // Drop a resolved-but-not-yet-cleaned in-flight entry so the reclaim's
    // re-fetch starts fresh instead of deduping onto it — see the seamless
    // branch above for the full reasoning; it applies verbatim here.
    this._inFlight.delete(asset.key);
  }

  // -----------------------------------------------------------------------
  // Adopt / seamless / ref resolution
  // -----------------------------------------------------------------------

  /**
   * Adopt an externally-created handle-hybrid leaf (from `Assets.from()`) into
   * residency: register it as the deferred/ref handle under its canonical key,
   * claim it under `claimer`, and drive the fetch. The existing fill site
   * ({@link _storeResource}) transplants the fetched payload into this exact
   * object, so every consumer that already holds the leaf pops in. Idempotent
   * for a handle already adopted under the same key (no duplicate fetch).
   *
   * With `background`, the leaf is still registered + claimed + healed in place,
   * but its fetch is diverted into the low-priority background queue instead of
   * started immediately.
   * @internal
   */
  public _adopt(handle: object, claimer: LoaderScope, background = false): void {
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

    const asset = this._hooks.canonicalize(ctor, meta.src, meta.opts);
    const key = asset.key;

    if (handle instanceof AssetRef) {
      // The generic re-arm above only re-enters 'loading' on the shared
      // `_loadState` — it does not clear a value ref's OWN `_value`/`_hasValue`
      // (only `AssetRef._begin()` does). `_fail()` never clears them either, so a
      // ref that was 'ready' before a LATER failure (`_onTrackedFailure` fails
      // every ref of a key regardless of its prior state) carries a stale value
      // behind the `'loading'` gate until this fuller reset runs.
      if (retryingFailedLeaf) handle._begin();

      const existingRef = this._refs.get(key);
      const stored = this._resources.get(key)?.value;

      if (existingRef === undefined) {
        this._refs.set(key, { asset, refs: new Set([handle]), options: meta.opts });
        this._registerHandle(handle, key);

        // Mirrors _getRef's stored-fast-path: a value already sitting in the
        // resource map (stored elsewhere before this leaf was adopted) fills
        // this ref immediately instead of leaving it 'loading' forever.
        if (stored !== undefined) {
          handle._fill(stored);
        } else if (background) {
          this._enqueueBackgroundFetch(asset, meta.opts);
        } else {
          this._startFetch(asset, meta.opts);
        }
      } else if (!existingRef.refs.has(handle)) {
        // A distinct ref for a key already in flight (or already stored): join
        // the key's ref set so the single fetch fills it too (multi-handle
        // fill). If the value already converged, fill immediately.
        existingRef.refs.add(handle);
        this._registerHandle(handle, key);

        // A retry re-fills the key's whole ref set (this one included) below.
        if (stored !== undefined && !retryingFailedLeaf) {
          handle._fill(stored);
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
          if (background) this._enqueueBackgroundFetch(asset, existingRef.options);
          else this._startFetch(asset, existingRef.options);
        } else {
          // The payload is already resident, so there is nothing to refetch:
          // re-filling IS the retry here. The resource map and `_refs`
          // legitimately diverge — a ref's own `parse()` can reject a payload
          // that fetched fine — so re-running `parse()` against the stored
          // payload yields an honest re-failure or a success, where handling
          // this case by refetch alone would leave every re-armed ref in
          // 'loading' with no fetch in flight, forever. Mirrors
          // _storeResource's fill loop: an already-'ready' ref is left untouched.
          for (const ref of existingRef.refs) {
            if (ref.state === 'ready') continue;
            if (ref.state === 'failed') ref._begin();
            ref._fill(stored);
          }
        }
      }

      this._claim(asset, claimer);

      return;
    }

    const deferredEntry = this._deferred.get(key);
    const stored = this._resources.get(key)?.value;
    const adapter = this._typeRegistry.getSeamlessAdapter(ctor);

    if (deferredEntry === undefined && stored === undefined) {
      this._createDeferredEntry(asset, handle, meta.opts);
      this._claim(asset, claimer);

      if (background) {
        this._enqueueBackgroundFetch(asset, meta.opts);
      } else {
        this._startFetch(asset, meta.opts);
      }

      return;
    }

    if (stored !== undefined && this._handleKeys.get(handle) !== key) {
      // Already stored for this key (e.g. loaded elsewhere before this leaf was
      // adopted — the core catalog scenario) and this exact handle has not been
      // filled/registered yet: transplant the stored donor into THIS handle in
      // place (per-catalog identity — do NOT swap to the stored object; the
      // caller already holds this leaf) and register it so a release can
      // resolve its key.
      //
      // Enter the co-handle into the key's (persistent) deferred set so a LATER
      // evict+heal of this key re-arms and re-fills it too. The stored
      // donor was itself registered here at store time, so the entry already
      // exists (its representative stays canonical); the co-handle only ever
      // joins, never displaces it.
      adapter?.fill(handle, stored);

      const entry = deferredEntry ?? this._createDeferredEntry(asset, stored as object, meta.opts);

      this._addDeferredHandle(key, entry, handle);
    } else if (deferredEntry !== undefined && stored === undefined && !deferredEntry.handles.has(handle)) {
      // Another handle already holds this key and nothing is stored yet: join
      // the key's handle set so `_storeResource` fills THIS handle too
      // (multi-handle fill). The key's fetch may be in flight or may have ended
      // in failure — the retry below covers the latter.
      this._addDeferredHandle(key, deferredEntry, handle);
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
    // could reject a payload the fetch delivered, so handle state and the
    // resource map cannot diverge the way a ref's can.
    if (stored === undefined && deferredEntry !== undefined && adapter !== undefined && (retryingFailedLeaf || this._hasFailedHandle(deferredEntry, adapter))) {
      for (const candidate of deferredEntry.handles) {
        if (adapter.stateOf(candidate) === 'failed') adapter.begin(candidate);
      }
      if (background) this._enqueueBackgroundFetch(asset, deferredEntry.options);
      else this._startFetch(asset, deferredEntry.options);
    }

    this._claim(asset, claimer);
  }

  /**
   * Seamless single-source resolution: an already-stored asset, an existing
   * deferred handle (retried in place when `'failed'`), or a fresh
   * placeholder whose fetch starts now.
   * @internal
   */
  public _getSeamless(asset: CanonicalAsset, adapter: SeamlessAdapter<unknown>, options?: unknown): unknown {
    const stored = this._resources.get(asset.key)?.value;

    if (stored !== undefined) {
      return stored;
    }

    const entry = this._deferred.get(asset.key);

    if (entry !== undefined) {
      const representative = entry.handles.first();

      if (representative !== undefined) {
        if (adapter.stateOf(representative) === 'failed') {
          adapter.begin(representative);
          this._startFetch(asset, entry.options);
        } else {
          this._boostFromQueue(asset.key);
        }

        return representative;
      }
    }

    const handle = adapter.createPlaceholder(options);

    this._createDeferredEntry(asset, handle as object, options);
    this._startFetch(asset, options);

    return handle;
  }

  /**
   * Start (or on retry, restart) the fetch backing a deferred handle or value
   * ref. Failure handling lives centrally in {@link _onTrackedFailure}; the
   * catch here only silences the void'd rejection.
   */
  private _startFetch(asset: CanonicalAsset, options: unknown): void {
    void this._loadSingle(asset, options).catch(() => {
      /* Failure handled centrally in _onTrackedFailure. */
    });
  }

  /** Value-asset twin of {@link _getSeamless}: stable ref, retry-on-failed. @internal */
  public _getRef(asset: CanonicalAsset, options?: unknown): AssetRef<unknown> {
    const entry = this._refs.get(asset.key);

    if (entry !== undefined) {
      const representative = this._representative(entry.refs);

      if (representative !== undefined) {
        if (representative.loadState === 'failed') {
          representative._begin();
          this._startFetch(asset, entry.options);
        } else {
          this._boostFromQueue(asset.key);
        }

        return representative;
      }
    }

    const ref = new AssetRef<unknown>();

    this._refs.set(asset.key, { asset, refs: new Set([ref]), options });
    this._registerHandle(ref, asset.key);

    const stored = this._resources.get(asset.key)?.value;

    if (stored !== undefined) {
      ref._fill(stored);

      return ref;
    }

    this._startFetch(asset, options);

    return ref;
  }

  // -----------------------------------------------------------------------
  // Deferred / ref handle bookkeeping
  // -----------------------------------------------------------------------

  /**
   * Wire the reverse `handle → key` lookup and mark `handle` as a real,
   * residency-issued handle/ref for the lifetime of the object — the latter
   * (`_everRegisteredHandles`) is never cleared, unlike `_handleKeys`, which
   * {@link _forgetKey} (via {@link unloadAll}) deletes for a settled key. The
   * single choke point for every site that used to call `_handleKeys.set(...)`
   * directly.
   */
  private _registerHandle(handle: object, key: CanonicalAssetKey): void {
    this._handleKeys.set(handle, key);
    this._everRegisteredHandles.add(handle);
  }

  /**
   * Register a fresh deferred entry for `key` holding `handle` weakly, wire the
   * reverse `handle → key` lookup, and arm GC pruning. Returns the entry so the
   * caller can add further co-handles.
   */
  private _createDeferredEntry(
    asset: CanonicalAsset,
    handle: object,
    options?: unknown,
  ): { readonly asset: CanonicalAsset; readonly handles: WeakHandleSet; readonly options: unknown } {
    const entry = { asset, handles: new WeakHandleSet(handle), options };

    this._deferred.set(asset.key, entry);
    this._registerHandle(handle, asset.key);
    this._deferredFinalization.register(handle, asset.key);

    return entry;
  }

  /**
   * Add `handle` to an existing deferred entry's weak handle set (idempotent for
   * an already-tracked handle), wire the reverse lookup, and arm GC pruning.
   * @internal
   */
  public _addDeferredHandle(key: CanonicalAssetKey, entry: { readonly handles: WeakHandleSet }, handle: object): void {
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

  // -----------------------------------------------------------------------
  // In-flight tracking / fetch dispatch
  // -----------------------------------------------------------------------

  /**
   * The single fetch entry point. Every caller has already resolved the one
   * canonical identity, so an in-flight request is shared no matter which verb
   * (`get`, `load`, a catalog adopt, or the background queue) asked for it.
   * @internal
   */
  public async _loadSingle(asset: CanonicalAsset, options?: unknown): Promise<unknown> {
    this._recordAlias(asset);

    const resident = this._resources.get(asset.key);

    if (resident !== undefined) {
      return resident.value;
    }

    const inFlight = this._inFlight.get(asset.key);

    if (inFlight !== undefined) {
      return inFlight;
    }

    this._boostFromQueue(asset.key);

    const boosted = this._inFlight.get(asset.key);

    if (boosted !== undefined) {
      return boosted;
    }

    return this._dispatchTracked(asset, options);
  }

  /**
   * Dispatch a fetch and place it under in-flight tracking.
   *
   * `_dispatchFetch` can fail *synchronously* — it copies the caller's fetch
   * options into the handler config, so an option object with a throwing getter
   * fails before any promise exists. Every real 404 or decode error fails
   * asynchronously instead, which is why this path stayed unnoticed.
   *
   * Turning that throw into a rejection keeps every failure on the single path
   * {@link _onTrackedFailure} observes. Letting it escape strands deferred
   * handles and value refs in `'loading'` with no later `get()` able to heal
   * them, and from the background queue it is worse still: the throw escapes
   * before the caller attaches its `.finally()`, so the concurrency slot is
   * never released and the queue wedges.
   */
  private _dispatchTracked(asset: CanonicalAsset, options: unknown): Promise<unknown> {
    const abort = new SharedAbort(asset.key);

    this._abort.set(asset.key, abort);

    let fetch: Promise<unknown>;

    try {
      fetch = this._decoder._dispatchFetch(asset, options, abort.signal, this._dependencyScopeFor(asset));
    } catch (error: unknown) {
      fetch = Promise.reject(this._normalizeError(error));
    }

    return this._trackInFlight(asset, fetch, abort);
  }

  /**
   * The scope a key's sub-asset loads claim under. One per key, reused across
   * retries so a second attempt does not strand the first attempt's claims, and
   * destroyed with the key itself.
   * @internal
   */
  public _dependencyScopeFor(asset: CanonicalAsset): LoaderScope {
    let scope = this._dependencyScopes.get(asset.key);

    if (scope === undefined) {
      scope = this._hooks.createDependencyScope(asset);
      this._dependencyScopes.set(asset.key, scope);
    }

    return scope;
  }

  /** Drop a key's dependency claims. Sub-assets other owners still hold stay resident. */
  private _releaseDependencies(key: CanonicalAssetKey): void {
    const scope = this._dependencyScopes.get(key);

    if (scope === undefined) {
      return;
    }

    this._dependencyScopes.delete(key);
    this._releaseScope(scope);
  }

  /**
   * Drop `key`'s interest in whatever fetch is running for it. Returns whether
   * it was actually aborted — a fetch another holder still needs stays running.
   */
  private _abortInFlight(key: CanonicalAssetKey): boolean {
    if (this._abort.get(key)?.release(key) !== true) {
      return false;
    }

    this._abort.delete(key);

    return true;
  }

  private _trackInFlight(asset: CanonicalAsset, promise: Promise<unknown>, abort?: SharedAbort): Promise<unknown> {
    const key = asset.key;
    const trackedPromise = promise.finally(() => {
      // Clear only our OWN entry: a superseding load (e.g. a reclaim re-fetch
      // after an eviction dropped and re-added this key) may already own the
      // slot. Deleting it unconditionally would un-dedup a concurrent load and
      // let a second fetch overwrite the healed handle with its raw donor.
      if (this._inFlight.get(key) === trackedPromise) {
        this._inFlight.delete(key);
      }

      this._preventStoreKeys.delete(key);

      // Disarm cancellation in the same tick the fetch settles: a release
      // arriving afterwards must not abort a request whose result already
      // landed. Same self-entry identity guard as the in-flight slot above.
      abort?.settle();

      if (abort !== undefined && this._abort.get(key) === abort) {
        this._abort.delete(key);
      }
    });

    // Non-swallowing observer: fails deferred handles / value refs (fresh
    // error each attempt) and dispatches onError exactly once for the failed
    // fetch, regardless of which verb (get/load/background) started it.
    trackedPromise.catch((error: unknown) => this._onTrackedFailure(asset, error));
    this._inFlight.set(key, trackedPromise);

    return trackedPromise;
  }

  /**
   * Central failure sink for a tracked fetch.
   *
   * A CANCELLED fetch takes the same handle bookkeeping but none of the
   * reporting: every handle/ref still has to settle — leaving them `'loading'`
   * would strand `.loaded` and the load queues awaiting it forever — while
   * `onError` and the missing-source diagnostic stay silent, because nothing
   * failed. A cancel only ever happens once the key's last claim is gone, so
   * there is no consumer left to surprise with someone else's cancellation, and
   * the `'failed'` state it leaves behind is the same retry request a later
   * `get()`/`_adopt`/claim already knows how to heal.
   */
  private _onTrackedFailure(asset: CanonicalAsset, error: unknown): void {
    const err = this._normalizeError(error);
    const cancelled = isAbortError(error);
    const deferredEntry = this._deferred.get(asset.key);

    if (deferredEntry !== undefined) {
      const adapter = this._typeRegistry.getSeamlessAdapter(asset.type);

      for (const handle of deferredEntry.handles) {
        adapter?.fail(handle, err);
      }

      if (!cancelled) {
        this._warnMissingSource(asset, err);
      }
    } else {
      const refEntry = this._refs.get(asset.key);

      if (refEntry !== undefined) {
        for (const ref of refEntry.refs) {
          ref._fail(err);
        }

        if (!cancelled) {
          this._warnMissingSource(asset, err);
        }
      }
    }

    if (!cancelled) {
      // The asset never materialized, so nothing owns whatever its handler
      // managed to pull in before failing. A cancel is left alone: the key's own
      // eviction path already released them.
      this._releaseDependencies(asset.key);
      this._signals.onError.dispatch(asset.type, asset.source, err);
    }
  }

  /**
   * Dev-only diagnostic for the seamless silent-404 trap: a `get('x.png')` /
   * adopted-catalog / `Assets.from(...)` leaf whose fetch ends in a 404 or
   * network error only ever surfaces a `'failed'` placeholder. Warns ONCE per
   * source. Stripped in production.
   */
  private _warnMissingSource(asset: CanonicalAsset, error: Error): void {
    logger.warn(
      `Asset "${asset.source}" failed to load: ${error.message} ` +
        `Seamless get()/Assets.from() fetch the literal path and heal a placeholder in place, so a typo or an ` +
        `un-preloaded alias 404s without throwing. Check the path and the loader basePath, and preload it via Assets.from() / load().`,
      { source: 'Loader', once: `loader:missing-source:${asset.key}` },
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
   * Store a resolved resource under its canonical key: fills every deferred
   * handle / value-ref waiting on the key (multi-handle fill), respects
   * "free on arrival" for a key unloaded mid-fetch, and registers the
   * canonical reverse (resource → key) lookup. Called from `AssetDecoder`
   * via the `storeResource` callback `Loader`'s constructor wires to this
   * method.
   * @internal
   */
  public _storeResource(asset: CanonicalAsset, resource: unknown): unknown {
    const key = asset.key;

    this._recordAlias(asset);

    if (this._preventStoreKeys.delete(key)) {
      // The asset was unloaded while its fetch was in flight. A deferred handle
      // waiting on this key must not stay 'loading' forever: fail it so
      // `.loaded` rejects. The entry stays (like any failed fetch) so a later
      // get() retries and heals the SAME handle in place.
      const preventedEntry = this._deferred.get(key);
      const unloadError = new Error(`Asset "${asset.source}" was unloaded while its fetch was in flight.`);

      if (preventedEntry !== undefined) {
        const adapter = this._typeRegistry.getSeamlessAdapter(asset.type);

        for (const handle of preventedEntry.handles) {
          adapter?.fail(handle, unloadError);
        }
      }

      const preventedRef = this._refs.get(key);

      if (preventedRef !== undefined) {
        for (const ref of preventedRef.refs) {
          if (ref.loadState === 'loading') {
            ref._fail(new Error(`Asset "${asset.source}" was unloaded while its fetch was in flight.`));
          }
        }
      }

      return resource;
    }

    // Seamless intercept: a deferred handle registered for this key absorbs the
    // fetched payload in place and becomes the stored resource, so every
    // consumer — get() before or after load(), and load()'s own promise — sees
    // exactly ONE instance per canonical asset.
    const deferredEntry = this._deferred.get(key);
    let filledDeferredHandle = false;

    if (deferredEntry !== undefined) {
      const adapter = this._typeRegistry.getSeamlessAdapter(asset.type);
      let representative: object | undefined;

      // Fill EVERY in-flight handle for the key from the single decoded donor
      // (multi-handle fill). The first handle is the representative — it
      // becomes the canonical resource entry, mirroring the old single-handle
      // contract (which object is canonical for eviction).
      for (const handle of deferredEntry.handles) {
        representative ??= handle;

        if (handle === resource || adapter === undefined) {
          continue;
        }

        // A non-get producer (load(), container, background) may store into a
        // key whose handle is 'failed' (e.g. an earlier get() 404'd). fill() →
        // settle() must run from a re-armed state so `.loaded` re-materializes a
        // resolved promise; without begin() the handle would read 'ready' while
        // its cached `.loaded` stayed permanently rejected. Skip a handle
        // already 'ready' (filled by an earlier producer) — filling twice is a
        // no-op at best.
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
      // registry so a co-handle adopt joins it and a refcount-0
      // eviction re-arms every consumer. The representative stays canonical.
      if (representative !== undefined && representative !== resource) {
        resource = representative;
        filledDeferredHandle = true;
      }
    }

    // Value-asset refs fill from whatever producer stores the value; the raw
    // value stays the stored resource (load() keeps resolving it). Fill every
    // in-flight ref for the key (multi-handle fill).
    const refEntry = this._refs.get(key);

    if (refEntry !== undefined) {
      for (const ref of refEntry.refs) {
        if (ref.loadState !== 'ready') {
          ref._fill(resource);
        }
      }
    }

    this._resources.set(key, { asset, value: resource });

    // Record the canonical reverse key (first source wins) for object resources.
    if (typeof resource === 'object' && resource !== null && !this._resourceKeys.has(resource)) {
      this._resourceKeys.set(resource, { type: asset.type, source: asset.source });
    }

    // Register the stored seamless resource as its key's representative so a
    // later eviction re-arms it and a co-handle adopt joins the same
    // set. A resource that already came from a deferred handle is a member
    // already; a plain `load()` donor (no prior get()) is added here. Held
    // weakly, so a fully-released source does not pin its evicted payload.
    if (typeof resource === 'object' && resource !== null && this._typeRegistry.hasSeamlessAdapter(asset.type) && this._deferred.get(key) === undefined) {
      this._createDeferredEntry(asset, resource);
    }

    this._signals.onLoaded.dispatch(asset.type, asset.source, resource);

    // Free-on-arrival: a deferred handle whose every claimer released
    // during the in-flight fetch has now converged into the resource map at
    // refcount 0. `.loaded` was already settled by the fill above, so an
    // awaiter holding that promise still resolves (the asset WAS complete);
    // evicting here drops the payload in place (re-arming `.loaded` to
    // 'loading') so it does not linger unclaimed. Gated on an actual deferred
    // fill: a never-claimed container store (no `_deferred` entry) must
    // persist, not be freed on arrival.
    if (filledDeferredHandle && !this._claims.has(key)) {
      this._evictKey(asset);
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
  public _enqueueBackgroundFetch(asset: CanonicalAsset, options: unknown): void {
    if (this._resources.has(asset.key)) return;
    if (this._inFlight.has(asset.key)) return;
    if (this._isQueuedInBackground(asset.key)) return;

    if (this._backgroundQueue.length === 0 && this._backgroundActive === 0) {
      this._backgroundLoaded = 0;
      this._backgroundTotal = 0;
    }

    this._backgroundQueue.push({ asset, options });
    this._backgroundTotal++;
    this._drainBackground();
  }

  private _drainBackground(): void {
    while (this._backgroundActive < this._concurrency && this._backgroundQueue.length > 0) {
      const entry = this._backgroundQueue.shift();
      if (!entry) {
        continue;
      }

      if (this._resources.has(entry.asset.key) || this._inFlight.has(entry.asset.key)) {
        this._backgroundLoaded++;
        this._onBackgroundItemDone();
        continue;
      }

      this._startBackgroundEntry(entry);
    }
  }

  private _boostFromQueue(key: CanonicalAssetKey): void {
    const index = this._backgroundQueue.findIndex(entry => entry.asset.key === key);

    if (index === -1) return;

    const [entry] = this._backgroundQueue.splice(index, 1);
    if (entry === undefined) return;

    this._startBackgroundEntry(entry);
  }

  private _isQueuedInBackground(key: CanonicalAssetKey): boolean {
    return this._backgroundQueue.some(entry => entry.asset.key === key);
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

    this._dispatchTracked(entry.asset, entry.options)
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

  /** Hard-remove one canonical asset from the resident store and forget its claim bookkeeping. @internal */
  public _unloadOne(asset: CanonicalAsset): void {
    const key = asset.key;

    // Snapshot BEFORE the delete: a key whose resource is already stored has a
    // SETTLED fetch — any lingering `_inFlight` entry for it is stale (its
    // `.finally` cleanup microtask has not yet run), not a live fetch. This is
    // the signal that separates a genuine in-flight unload (fail-in-place, keep
    // the handle) from a settled one (forget it, drop the stale entry).
    const hadResource = this._resources.has(key);

    this._resources.delete(key);

    // A genuine in-flight fetch (not yet stored) is prevented from writing its
    // result once it arrives, so a deferred handle fails in place instead of
    // silently resurrecting the asset.
    const liveFetch = !hadResource && this._inFlight.has(key);

    if (liveFetch) {
      this._preventStoreKeys.add(key);
    }

    this._forgetKey(key, liveFetch);
  }

  /**
   * Hard, claim-forgetting reset of the resident store. If `type` is provided,
   * only that type's assets are cleared; otherwise all types are flushed.
   * Does not cancel in-flight fetches — but forgets each key's claim/handle
   * bookkeeping so repeated load→reset cycles cannot accumulate stale entries.
   *
   * Deliberately NOT public on {@link Loader}: it discards every scope's claim,
   * so a caller could free assets another scope still owns. Scope-aware release
   * goes through `LoaderScope.release` / `_releaseScope` instead.
   * @internal
   */
  public unloadAll(type?: AssetConstructor): void {
    if (type) {
      // Route every resident asset — and any claim-tracked key of this type
      // that never reached the resource map (in-flight / deferred-only) —
      // through _unloadOne so the claim/handle maps are cleared, not just the
      // resource map.
      const assets = new Map<CanonicalAssetKey, CanonicalAsset>();

      for (const [key, entry] of this._resources) {
        if (entry.asset.type === type) assets.set(key, entry.asset);
      }

      for (const [key, entry] of this._claims) {
        if (entry.asset.type === type) assets.set(key, entry.asset);
      }

      for (const asset of assets.values()) {
        this._unloadOne(asset);
      }

      return;
    }

    // Global reset. Snapshot the keys with a stored resource first: their
    // in-flight entries (if any) are stale (resolved-but-uncleaned), so they can
    // be dropped, while a not-yet-stored key with a live `_inFlight` entry is a
    // genuine fetch that must be preserved (its handle fills or fails in place) —
    // honoring "does not cancel in-flight fetches".
    const settledKeys = new Set<CanonicalAssetKey>(this._resources.keys());

    this._resources.clear();

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
    this._aliases.clear();
    this._dependencyScopes.clear();
  }

  /**
   * Drop a key's claim/handle bookkeeping for the hard `unloadAll` verb — a
   * global removal, unlike scope-aware {@link _release}: it forgets the claim
   * entirely (across every scope) so a stale claim can no longer hold
   * refcount > 0 and keep a key from ever evicting.
   *
   * A key with a genuine `liveFetch` keeps its deferred handle / value-ref so
   * the prevented store can fail it (and a later `get()` heals the SAME
   * handle) — only a SETTLED key's handles are forgotten here.
   */
  private _forgetKey(key: CanonicalAssetKey, liveFetch: boolean): void {
    this._claims.delete(key);
    this._evicted.delete(key);
    this._releaseDependencies(key);

    if (liveFetch) {
      return;
    }

    this._inFlight.delete(key);
    this._preventStoreKeys.delete(key);
    this._aliases.delete(key);

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
   * Non-throwing in-memory lookup: the resource stored under `key`, or `null`
   * if none is held. Backs `Loader._peekResource` (scene deserialization).
   * Coalesces a legitimately-stored `null`/`undefined` to `null`; use
   * {@link _hasStored} when the distinction matters.
   * @internal
   */
  public _peekResource(key: CanonicalAssetKey): unknown {
    return this._resources.get(key)?.value ?? null;
  }

  /**
   * True if a resource is stored under `key`, regardless of what the value is
   * (including a legitimately-stored `null`/`undefined` from a `bindAsset`-bound
   * custom type). Unlike {@link _peekResource}, this distinguishes "no entry"
   * from "entry present with a nullish value". @internal
   */
  public _hasStored(key: CanonicalAssetKey): boolean {
    return this._resources.has(key);
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
   * The canonical key a deferred handle / value-ref is registered under, or
   * `undefined`. Backs releasing a handle. @internal
   */
  public _getHandleKey(handle: object): CanonicalAssetKey | undefined {
    return this._handleKeys.get(handle);
  }

  /**
   * Whether `handle` was ever registered as a live deferred handle / value-ref
   * by this residency — regardless of whether its key has since been forgotten
   * by {@link _forgetKey} (which deletes from `_handleKeys` but never from this
   * WeakSet). Backs a release's fail-loud check: a handle `get()` once handed
   * out must stay a releasable no-op even after an unrelated internal hard
   * reset, so the throw only fires for an object residency never saw at all.
   * @internal
   */
  public _wasEverRegisteredHandle(handle: object): boolean {
    return this._everRegisteredHandles.has(handle);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Clears all resident-resource, in-flight, claim, and background-queue state,
   * cancelling every fetch still running. Called from `Loader.destroy()` — the
   * loader is going away, so no holder can possibly still want a result, and a
   * download left running would only compete for bandwidth with whatever
   * replaces it.
   */
  public destroy(): void {
    for (const abort of this._abort.values()) {
      abort.abort();
    }

    this._abort.clear();
    this._resources.clear();
    this._inFlight.clear();
    this._preventStoreKeys.clear();
    this._aliases.clear();
    this._deferred.clear();
    this._refs.clear();
    this._claims.clear();
    this._evicted.clear();
    this._dependencyScopes.clear();

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
