import type { ReadonlyRectangle } from '#math/Rectangle';
import type { RectangleLike } from '#math/RectangleLike';

import type { SourceScope } from './RenderSourceItem';
import type { MembershipBits, VisibilityQueryStats } from './SourceVisibilityIndex';

/**
 * @internal
 *
 * Decides which of one source scope's persistent items a cull rect admits, by
 * setting their bits in `bits`.
 *
 * The seam exists because the answer is a measurement, not an assumption, and
 * the cut-2 measurement moved it: at a million items the flat scan is not the
 * dominant cost of a camera step (materialising the ~250,000 admitted items is),
 * but once that materialisation is incremental the scan is all that is left, and
 * a full pass over a million items does not fit in the 8ms the target allows. So
 * both live here, the grid is the default, and the scan stays the reference the
 * grid is pinned against.
 *
 * The membership-set shape - rather than cut 1's per-item predicate - is what
 * the delta needs. A predicate answers one item at a time in recorded order,
 * which forces the caller to visit every item; a set lets an index answer "what
 * does this rect contain" and lets the caller diff two answers word-wise.
 */
export interface RenderItemVisibility {
  /** Set a bit in `bits` for every item of `scope` that `rect` admits. */
  select(scope: SourceScope, rect: ReadonlyRectangle, bits: MembershipBits, stats: VisibilityQueryStats): void;
}

/**
 * @internal
 *
 * O(N) scan over a scope's items, straight through `SceneNode._inCullRect`.
 *
 * The reference implementation and the fallback. It reads `cullable` and
 * `cullArea` live from every node on every query, so it is correct under any
 * mutation the source is not keyed on - which is exactly why it is the thing the
 * grid is tested against rather than an implementation detail that was replaced.
 */
export class FlatScanVisibility implements RenderItemVisibility {
  /**
   * Reused rect handed to the cull test, so a scan over a million items
   * allocates nothing. A plain object rather than a `Rectangle`: the test only
   * reads `x`/`y`/`width`/`height`, while a `Rectangle` would route all four
   * writes through its observable vector and size on every item.
   */
  private readonly _bounds: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };

  public select(scope: SourceScope, rect: ReadonlyRectangle, bits: MembershipBits, stats: VisibilityQueryStats): void {
    const items = scope.items;
    const count = items.count;
    const minX = items.minX;
    const minY = items.minY;
    const maxX = items.maxX;
    const maxY = items.maxY;
    const drawables = items.drawables;
    const bounds = this._bounds;

    stats.candidates += count;

    for (let i = 0; i < count; i++) {
      bounds.x = minX[i]!;
      bounds.y = minY[i]!;
      bounds.width = maxX[i]! - bounds.x;
      bounds.height = maxY[i]! - bounds.y;

      // Same rule, same implementation - `_inCullRect` IS this call with
      // `getBounds()` filled in - so `cullable` and a live-mutated `cullArea` are
      // still honoured and no second culling semantics exists to drift.
      if (drawables[i]!._inCullRectUsingBounds(rect, bounds)) {
        bits.set(i);
      }
    }
  }
}

/**
 * @internal
 *
 * Uniform grid over the scope's indexable items, with the two classes a grid
 * cannot hold answered beside it (see {@link SourceVisibilityIndex}).
 *
 * Falls back to the flat scan for a scope whose index never got built, so the
 * seam has no state in which it produces a wrong set rather than a slow one.
 */
export class GridVisibility implements RenderItemVisibility {
  private readonly _fallback = new FlatScanVisibility();

  public select(scope: SourceScope, rect: ReadonlyRectangle, bits: MembershipBits, stats: VisibilityQueryStats): void {
    if (!scope.index.isBuilt) {
      this._fallback.select(scope, rect, bits, stats);

      return;
    }

    scope.index.query(scope.items, rect, bits, stats);
  }
}
