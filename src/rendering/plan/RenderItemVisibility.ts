import type { ReadonlyRectangle } from '#math/Rectangle';

import type { RetainedFragmentDraw } from './RetainedGroupFragment';

/**
 * @internal
 *
 * Decides which of a render root's persistent items a cull rect admits.
 *
 * The seam exists because the answer is a measurement, not an assumption. A flat
 * scan over the items is O(N) but touches only two numbers per item and needs no
 * maintenance; a spatial index answers in O(log n + hits) but pays for its own
 * upkeep on every move. Which one wins at a given node count is what the
 * benchmark decides, so neither is written into the caller.
 *
 * The predicate shape suits a scan, which visits items in recorded order anyway.
 * An index answers the opposite question — "what does this rect contain" — and
 * would need a hit-query form plus a sort back into recorded order. That form is
 * deliberately not invented here: it lands with the index itself, once a
 * measurement says the index earns its maintenance.
 */
export interface RenderItemVisibility {
  /** Whether `rect` admits this recorded draw. */
  admits(draw: RetainedFragmentDraw, rect: ReadonlyRectangle): boolean;
}

/**
 * @internal
 *
 * O(N) scan: tests each recorded draw's world AABB against the rect.
 *
 * What makes this cheap enough to be the starting point is not the test itself
 * but what a rejected item no longer costs: no material key, no draw command, no
 * transform row, and no descent into the scene graph to find it. That is the
 * whole difference to the full collect it replaces.
 */
export class FlatScanVisibility implements RenderItemVisibility {
  public admits(draw: RetainedFragmentDraw, rect: ReadonlyRectangle): boolean {
    // Deliberately the node's own test rather than a comparison against the
    // record's AABB. The two agree while nothing has moved, but only one of them
    // stays correct when they disagree — and duplicating `cullable` / `cullArea`
    // handling here would be a second copy of a rule that has already moved once
    // (`inView` -> `_inCullRect`). A cache hit on `getBounds()` is the cost.
    return draw.drawable._inCullRect(rect);
  }
}
