import type { AabbLike } from '@codexo/exojs';
import { DynamicAabbTree } from '@codexo/exojs';

import type { Aabb } from '../Aabb';
import { aabbOverlap } from '../Aabb';
import type { Collider } from '../Collider';
import { pairKey } from '../ContactGraph';
import { sortInPlace } from '../sort';
import type { BroadPhase, CandidatePair } from './BroadPhase';

/**
 * Fixed fat-AABB margin (world px) applied to every collider's tree leaf.
 * Chosen relative to the engine's typical small-collider scale (test/example
 * shapes commonly span 10-30px): large enough that a few steps of ordinary
 * motion stay inside the margin (skipping the sync phase's remove+reinsert),
 * small enough it doesn't inflate fat AABBs into spurious candidates for
 * densely packed scenes. Fixed per the design's v1 scope (no velocity-based
 * predictive expansion) — revisit if benchmarks want a different value.
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
 * NEW fat-overlap candidates); (2) one full pass over the persistent pair set
 * dropping any pair whose fat AABBs no longer overlap — cheap (O(1) per pair)
 * and run every step regardless of movement, exactly mirroring Box2D's own
 * `b2ContactManager::Collide` (see the design's correctness argument for why a
 * single global pass, not a per-moved-leaf rescan, is both correct and the
 * right complexity); (3) emit, keeping only pairs whose *tight* AABBs overlap.
 *
 * The persistent set is intentionally keyed on *fat* overlap so temporal
 * coherence carries across steps (a leaf that stays inside its fat AABB is
 * never re-discovered). Emitting is filtered to tight-AABB overlap so the
 * candidate set the caller sees is exact — the fat margin never leaks a false
 * positive downstream, and a fat-but-not-tight pair simply stays parked in the
 * set (costing one O(1) re-check per step) until the leaves separate.
 */
export class AabbTreeBroadPhase implements BroadPhase {
  private readonly _tree = new DynamicAabbTree<Collider>(AABB_MARGIN);
  private readonly _pairs = new Map<number, CandidatePair>();
  // Colliders this broad phase has inserted into its own tree. `_treeProxy`
  // lives on the shared Collider, so it cannot by itself distinguish "inserted
  // by me" from "inserted by another broad-phase instance over the same
  // collider" — this set does, so a foreign proxy left on a collider never
  // drives an `update`/`remove` against a tree that does not own it.
  private readonly _inserted = new Set<Collider>();
  private readonly _scratchFatAabb: AabbLike = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  private _syncingCollider: Collider | null = null;
  private _syncingProxy = -1;
  private readonly _onNeighborFound = (payload: Collider, proxy: number): void => {
    if (proxy === this._syncingProxy) {
      return;
    }

    this._addPair(this._syncingCollider!, payload);
  };

  private readonly _dropIfStale = (pair: CandidatePair, key: number): void => {
    if (!this._tree.fatOverlaps(pair.a._treeProxy, pair.b._treeProxy)) {
      this._pairs.delete(key);
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

  public computePairs(colliders: readonly Collider[], out: CandidatePair[]): CandidatePair[] {
    for (const collider of colliders) {
      this._sync(collider);
    }

    // eslint-disable-next-line unicorn/no-array-for-each -- allocation-free forEach over the Map (see ContactGraph's resetSeen/_removeIfUnseen for the same idiom); deleting the current entry during forEach is safe.
    this._pairs.forEach(this._dropIfStale);

    out.length = 0;
    this._collectTarget = out;
    // eslint-disable-next-line unicorn/no-array-for-each -- allocation-free forEach over the Map, same idiom as above.
    this._pairs.forEach(this._collectPair);
    sortInPlace(out, byPairId);

    return out;
  }

  /** Colliders whose AABB overlaps `aabb`. Writes into `out` (cleared first) and returns it. */
  public queryAabb(aabb: Readonly<Aabb>, out: Collider[]): Collider[] {
    out.length = 0;
    this._queryTarget = out;
    this._tree.query(aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, this._onQueryHit);

    return out;
  }

  /** Drop `collider`'s leaf and every pair referencing it. Called when a collider is destroyed. */
  public removeCollider(collider: Collider): void {
    if (!this._inserted.has(collider)) {
      return;
    }

    this._tree.remove(collider._treeProxy);
    collider._treeProxy = -1;
    this._inserted.delete(collider);

    for (const [key, pair] of this._pairs) {
      if (pair.a === collider || pair.b === collider) {
        this._pairs.delete(key);
      }
    }
  }

  public destroy(): void {
    for (const collider of this._inserted) {
      collider._treeProxy = -1;
    }

    this._tree.destroy();
    this._pairs.clear();
    this._inserted.clear();
  }

  private _sync(collider: Collider): void {
    const box = collider.aabb;

    if (!this._inserted.has(collider)) {
      collider._treeProxy = this._tree.insert(box.minX, box.minY, box.maxX, box.maxY, collider);
      this._inserted.add(collider);
      this._discoverNeighbors(collider);

      return;
    }

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
    const lo = a.id < b.id ? a : b;
    const hi = a.id < b.id ? b : a;
    const key = pairKey(lo.id, hi.id);

    if (!this._pairs.has(key)) {
      this._pairs.set(key, { a: lo, b: hi });
    }
  }
}
