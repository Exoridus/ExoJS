import type { LoadStateValue } from '#core/LoadState';

import type { AssetConstructor } from './AssetConstructor';
import type { AssetLocator, ResourceKey } from './canonicalKey';
import type { LoaderScopeKind } from './LoaderScope';

/**
 * One row of {@link Loader.inspect}'s diagnostic snapshot: everything a
 * developer needs to reason about a single canonical asset without reaching
 * into `Loader`'s private residency bookkeeping - its lifecycle state, how many
 * independent claim scopes hold it, and whether its fetch is queued, in flight,
 * or settled. Every row is plain, frozen data: numbers, strings, booleans, and
 * the asset's constructor token - never a `Set`, a claim symbol, or a live
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
  /** The canonical key this row describes - the same key the claim, in-flight and resource maps use. */
  readonly canonicalKey: ResourceKey;
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
   * A key can have more than one live handle/ref sharing it - multiple
   * `Assets.from()` leaves or `get()` calls joined onto the same source, whose
   * individual outcomes CAN diverge (e.g. one ref's `parse()` throws while a
   * sibling ref's succeeds; `AssetRef._fill` fails only the ref whose `parse`
   * threw). `state` reports the REPRESENTATIVE handle/ref's outcome - the
   * first one registered for this key - not an aggregate across every
   * handle/ref sharing it; a divergent sibling's outcome is not visible here.
   */
  readonly state: 'idle' | 'queued' | 'loading' | 'ready' | 'failed';
  /**
   * The number of distinct claim scopes currently holding this key - the same
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
   * background queue - always in lockstep with `state === 'queued'`, and
   * never `true` on a row whose `state` has already settled to `'ready'` or
   * `'failed'`.
   */
  readonly background: boolean;
}

/** One resident asset, sized, as reported by {@link AssetStats.largest}. */
export interface AssetSizeStats {
  readonly canonicalKey: ResourceKey;
  /** The asset type's id, or the dispatch token's name for a type not installed on this loader. */
  readonly type: string;
  /** Estimated resident bytes; see {@link AssetStats.bytes}. */
  readonly bytes: number;
}

/** Residency totals for one asset type, as reported by {@link AssetStats.byType}. */
export interface AssetTypeStats {
  /** The asset type's id, or the dispatch token's name for a type not installed on this loader. */
  readonly type: string;
  /** Assets of this type whose payload is resident and readable. */
  readonly ready: number;
  /** Assets of this type that are claimed but not settled - idle, queued in the background lane, or fetching. */
  readonly pending: number;
  /** Assets of this type whose last fetch attempt errored. */
  readonly failed: number;
  /** Estimated resident bytes across this type's ready assets; see {@link AssetStats.bytes}. */
  readonly bytes: number;
}

/**
 * Aggregate view of what a loader currently holds, for HUDs and memory
 * dashboards that want counters rather than the per-asset rows
 * {@link Loader.inspect} returns.
 *
 * Counts follow the same five lifecycle states {@link AssetInspection} reports,
 * collapsed to ready / pending / failed.
 */
export interface AssetStats {
  /** Assets whose payload is resident and readable. */
  readonly ready: number;
  /** Assets that are claimed but not settled - idle, queued in the background lane, or fetching. */
  readonly pending: number;
  /** Assets whose last fetch attempt errored. */
  readonly failed: number;
  /**
   * Estimated resident bytes over every ready asset.
   *
   * The loader cannot see inside a type's resource, so payloads are sized by
   * shape: binary buffers and blobs by their length, strings by their UTF-16
   * length, decoded audio by its PCM footprint, and anything carrying pixel
   * dimensions at four bytes per texel. A structured payload (parsed JSON, an
   * XML document, a font face) contributes nothing, and GPU-side copies are not
   * counted at all - read `RenderStats.gpuMemoryBytes` for those. Treat this as
   * a floor on CPU-side asset memory, not an accounting of it.
   */
  readonly bytes: number;
  /** Per type, largest resident footprint first, ties broken by type id. */
  readonly byType: readonly AssetTypeStats[];
  /** The heaviest resident assets, largest first, as many as were asked for. */
  readonly largest: readonly AssetSizeStats[];
}

export const inspectState = (input: {
  stored: boolean;
  handleState: LoadStateValue | undefined;
  queuedInBackground: boolean;
  inFlight: boolean;
}): 'idle' | 'queued' | 'loading' | 'ready' | 'failed' => {
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
};
