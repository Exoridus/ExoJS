import type { ReadonlyRectangle } from '#math/Rectangle';
import type { RectangleLike } from '#math/RectangleLike';

import type { PersistentDrawItem } from './RenderSourceItem';

/**
 * @internal
 *
 * Decides which of a render root's persistent items a cull rect admits.
 *
 * The seam exists because the answer is a measurement, not an assumption. A flat
 * scan over the items is O(N) but touches only the item and needs no
 * maintenance; a uniform grid answers in O(overlapped cells + candidates)
 * expected — worst case O(N) — but pays upkeep on every move, and degenerates on
 * large AABBs, a badly chosen cell size, or clustered scenes. Which one wins at
 * a given node count is what the benchmark decides, so neither is written into
 * the caller.
 *
 * The predicate shape suits a scan, which visits items in recorded order anyway.
 * An index answers the opposite question — "what does this rect contain" — and
 * would need a hit-query form plus a sort back into recorded order. That form is
 * deliberately not invented here: it lands with the index itself, once a
 * measurement says the index earns its maintenance.
 */
export interface RenderItemVisibility {
  /**
   * Whether `rect` admits this item.
   *
   * The item's stored world AABB may be trusted: the source is keyed on the
   * subtree's transform revision, so a set of items only reaches a strategy
   * while nothing in it has moved since discovery.
   */
  admits(item: PersistentDrawItem, rect: ReadonlyRectangle): boolean;
}

/**
 * @internal
 *
 * O(N) scan over the items.
 *
 * What makes this cheap enough to be the starting point is not the test itself
 * but what a rejected item no longer costs: no material key, no draw command, no
 * transform row, and no descent into the scene graph to find it. That is the
 * whole difference to the full collect it replaces.
 */
export class FlatScanVisibility implements RenderItemVisibility {
  /**
   * Reused rect handed to the cull test, so a scan over a million items
   * allocates nothing. A plain object rather than a `Rectangle`: the test only
   * reads `x`/`y`/`width`/`height`, while a `Rectangle` would route all four
   * writes through its observable vector and size on every item.
   */
  private readonly _bounds: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };

  public admits(item: PersistentDrawItem, rect: ReadonlyRectangle): boolean {
    const bounds = this._bounds;

    bounds.x = item.minX;
    bounds.y = item.minY;
    bounds.width = item.maxX - item.minX;
    bounds.height = item.maxY - item.minY;

    // Same rule, same implementation — `_inCullRect` IS this call with
    // `getBounds()` filled in — so `cullable` and a live-mutated `cullArea` are
    // still honoured and no second culling semantics exists to drift.
    return item.drawable._inCullRectUsingBounds(rect, bounds);
  }
}
