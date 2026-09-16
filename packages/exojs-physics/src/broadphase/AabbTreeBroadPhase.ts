import type { AabbLike } from '@codexo/exojs';
import { DynamicAabbTree } from '@codexo/exojs';

import { aabbOverlap } from '../Aabb';
import type { Collider } from '../Collider';
import { pairKey } from '../ContactGraph';
import type { SpatialIndex } from '../query/SpatialIndex';
import { sortInPlace } from '../sort';
import type { BroadPhase, CandidatePair } from './BroadPhase';

/**
 * Fixed fat-AABB margin (world px) applied to every collider's tree leaf.
 * Chosen relative to the engine's typical small-collider scale (test/example
 * shapes commonly span 10-30px): large enough that a few steps of ordinary
 * motion stay inside the margin (skipping the sync phase's remove+reinsert),
 * small enough it doesn't inflate fat AABBs into spurious candidates for
 * densely packed scenes. Fixed per the design's v1 scope (no velocity-based
 * predictive expansion) - revisit if benchmarks want a different value.
 */
const AABB_MARGIN = 4;

const byPairId = (p: CandidatePair, q: CandidatePair): number => p.a.id - q.a.id || p.b.id - q.b.id;

/**
 * Dynamic-AABB-tree broad phase (Box2D-style), wrapping a generic
 * `DynamicAabbTree<Collider>`. Stateful across steps: a collider whose tight
 * AABB stays inside its stored fat AABB costs nothing to re-sync.
 *
 * Three phases per `computePairs` call: (1) sync every live collider (insert
 * new ones, reinsert moved ones, querying only around reinsertions to discover
 * NEW fat-overlap candidates; a collider whose AABB has not been rewritten
 * since its last sync is skipped outright via `Collider._treeDirty`, so a
 * sleeping world pays one flag read per collider); (2) one full pass over the
 * persistent pair set dropping any pair whose fat AABBs no longer overlap -
 * cheap (O(1) per pair) and run every step regardless of movement, exactly
 * mirroring Box2D's own `b2ContactManager::Collide` (see the design's
 * correctness argument for why a single global pass, not a per-moved-leaf
 * rescan, is both correct and the right complexity); (3) emit, keeping only
 * pairs whose *tight* AABBs overlap.
 *
 * Phases 2 and 3 are skipped whole when nothing they read has changed since the
 * last call: the emitted list is a function of the pair set and the tight AABBs
 * alone, and a step that rewrote no collider geometry touched neither.
 *
 * The persistent set is intentionally keyed on *fat* overlap so temporal
 * coherence carries across steps (a leaf that stays inside its fat AABB is
 * never re-discovered). Emitting is filtered to tight-AABB overlap so the
 * candidate set the caller sees is exact - the fat margin never leaks a false
 * positive downstream, and a fat-but-not-tight pair simply stays parked in the
 * set (costing one O(1) re-check per step) until the leaves separate.
 *
 * **Single-owner contract.** A collider's tree membership is tracked through its
 * `Collider._treeProxy` field, which - like `PhysicsBody._islandIndex` /
 * `_sleepTime` - is a single slot on the shared object. Exactly ONE
 * `AabbTreeBroadPhase` instance may track a given collider at a time (in
 * production that is the world's own `_broadPhase`, for the collider's whole
 * lifetime until `removeCollider`). Do NOT stand up a second, throwaway
 * `AabbTreeBroadPhase` over colliders another instance already owns (e.g. for
 * debug visualization): the second instance would clobber the first's
 * `_treeProxy` values and corrupt its tree. Use a plain brute-force scan for
 * such one-off, read-only needs instead.
 */
export class AabbTreeBroadPhase implements BroadPhase, SpatialIndex {
  private readonly _tree = new DynamicAabbTree<Collider>(AABB_MARGIN);
  private readonly _pairs = new Map<number, CandidatePair>();
  private readonly _scratchFatAabb: AabbLike = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  private _syncingCollider: Collider | null = null;
  private _syncingProxy = -1;

  /**
   * Whether anything the emitted candidate list is a function of has changed
   * since it was built: a collider AABB taken into the tree, or a pair added or
   * dropped. While it stays `false` the previous list is still exactly right.
   */
  private _emitStale = true;
  /** The buffer the current candidate list was emitted into, so a caller that swaps or clears its own buffer still gets a rebuild. */
  private _emitTarget: CandidatePair[] | null = null;
  private _emitLength = -1;

  private readonly _onNeighborFound = (payload: Collider, proxy: number): void => {
    if (proxy === this._syncingProxy) {
      return;
    }

    this._addPair(this._syncingCollider!, payload);
  };

  private readonly _dropIfStale = (pair: CandidatePair, key: number): void => {
    if (!this._tree.fatOverlaps(pair.a._treeProxy, pair.b._treeProxy)) {
      this._pairs.delete(key);
      this._emitStale = true;
    }
  };

  private _collectTarget: CandidatePair[] = [];
  private readonly _collectPair = (pair: CandidatePair): void => {
    // Emit only true (tight-AABB) overlaps; the persistent set is fat-keyed for
    // coherence, so a fat-but-not-tight pair is parked here, not a candidate.
    if (aabbOverlap(pair.a.aabb, pair.b.aabb)) {
      this._collectTarget.push(pair);
    }
  };

  private _queryTarget: Collider[] = [];
  private readonly _onQueryHit = (payload: Collider): void => {
    this._queryTarget.push(payload);
  };

  private readonly _resetTreeProxy = (payload: Collider): void => {
    payload._treeProxy = -1;
  };

  public computePairs(colliders: readonly Collider[], out: CandidatePair[]): CandidatePair[] {
    this.sync(colliders);

    // The candidate list is a function of the pair set and the tight AABBs
    // alone. A step in which no collider's geometry was rewritten and no pair
    // moved leaves both untouched, so the list already in `out` is the one both
    // passes below would rebuild - and a settled world is every such step.
    if (!this._emitStale && out === this._emitTarget && out.length === this._emitLength) {
      return out;
    }

    this._pairs.forEach(this._dropIfStale);

    out.length = 0;
    this._collectTarget = out;
    this._pairs.forEach(this._collectPair);
    sortInPlace(out, byPairId);

    this._emitStale = false;
    this._emitTarget = out;
    this._emitLength = out.length;

    return out;
  }

  /**
   * Insert every not-yet-tracked collider and reinsert every moved one (the
   * `computePairs` phase-1 loop, extracted so {@link queryAabb} callers can
   * force it independently of a full detection pass - see {@link SpatialIndex.sync}).
   */
  public sync(colliders: readonly Collider[]): void {
    for (const collider of colliders) {
      this._sync(collider);
    }
  }

  /** Colliders whose AABB overlaps `aabb`. Writes into `out` (cleared first) and returns it. */
  public queryAabb(aabb: Readonly<AabbLike>, out: Collider[]): Collider[] {
    out.length = 0;
    this._queryTarget = out;
    this._tree.query(aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, this._onQueryHit);

    return out;
  }

  /** Colliders whose AABB the ray could cross within `maxDistance`, via the tree's own ray-cast prune. */
  public rayCast(originX: number, originY: number, dirX: number, dirY: number, maxDistance: number, callback: (collider: Collider) => void): void {
    this._tree.rayCast(originX, originY, dirX, dirY, maxDistance, callback);
  }

  /** Drop `collider`'s leaf and every pair referencing it. Called when a collider is destroyed. */
  public removeCollider(collider: Collider): void {
    if (collider._treeProxy === -1) {
      return;
    }

    this._emitStale = true;
    this._tree.remove(collider._treeProxy);
    collider._treeProxy = -1;

    for (const [key, pair] of this._pairs) {
      if (pair.a === collider || pair.b === collider) {
        this._pairs.delete(key);
      }
    }
  }

  public destroy(): void {
    // Reset `_treeProxy` on every still-tracked collider before tearing down the
    // tree: the single-owner contract only guarantees at most one owner AT A
    // TIME, so a collider handed to a later `AabbTreeBroadPhase` (sequential
    // reuse, not concurrent dual-ownership) must not carry a stale non-`-1`
    // proxy from this instance forward. `query` with infinite bounds visits
    // every leaf currently in the tree, allocation-free.
    this._tree.query(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, this._resetTreeProxy);
    this._tree.destroy();
    this._pairs.clear();
    this._emitStale = true;
    this._emitTarget = null;
  }

  private _sync(collider: Collider): void {
    const box = collider.aabb;

    if (collider._treeProxy === -1) {
      collider._treeDirty = false;
      this._emitStale = true;
      collider._treeProxy = this._tree.insert(box.minX, box.minY, box.maxX, box.maxY, collider);
      this._discoverNeighbors(collider);

      return;
    }

    // The leaf already holds this box, so `update` would do nothing but repeat
    // the containment test. A settled world is almost entirely this case.
    if (!collider._treeDirty) {
      return;
    }

    collider._treeDirty = false;
    this._emitStale = true;

    const moved = this._tree.update(collider._treeProxy, box.minX, box.minY, box.maxX, box.maxY);

    if (moved) {
      this._discoverNeighbors(collider);
    }
  }

  private _discoverNeighbors(collider: Collider): void {
    const proxy = collider._treeProxy;
    const fat = this._tree.fatAabbOf(proxy, this._scratchFatAabb);

    this._syncingCollider = collider;
    this._syncingProxy = proxy;
    this._tree.query(fat.minX, fat.minY, fat.maxX, fat.maxY, this._onNeighborFound);
  }

  private _addPair(a: Collider, b: Collider): void {
    // Two colliders of the same body are a compound shape, not a collision.
    // Rejecting the pair here rather than downstream also keeps it out of the
    // persistent set, so a compound body costs nothing per step - which matters
    // once convex decomposition attaches many edge-sharing colliders to one body.
    if (a.body === b.body) {
      return;
    }

    const lo = a.id < b.id ? a : b;
    const hi = a.id < b.id ? b : a;
    const key = pairKey(lo.id, hi.id);

    if (!this._pairs.has(key)) {
      this._pairs.set(key, { a: lo, b: hi });
      this._emitStale = true;
    }
  }
}
