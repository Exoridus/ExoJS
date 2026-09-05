import type { ReadonlyRectangle } from '#math/Rectangle';
import type { RectangleLike } from '#math/RectangleLike';

import type { RenderItemVisibility } from './RenderItemVisibility';
import type { SourceScope } from './renderSourceItem';
import type { MembershipBits, VisibilityQueryStats } from './SourceVisibilityIndex';

/**
 * @internal
 *
 * O(N) scan over a scope's items, straight through `RenderNode._inCullRect`.
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
