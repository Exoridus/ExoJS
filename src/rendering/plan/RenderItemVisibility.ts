import type { ReadonlyRectangle } from '#math/Rectangle';

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
  /** Whether `rect` admits this item. */
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
  public admits(item: PersistentDrawItem, rect: ReadonlyRectangle): boolean {
    // Deliberately the node's own test rather than a comparison against the
    // item's stored AABB. The two agree while nothing has moved, but only one of
    // them stays correct when they disagree — and duplicating `cullable` /
    // `cullArea` handling here would be a second copy of a rule that has already
    // moved once (`inView` -> `_inCullRect`). A cache hit on `getBounds()` is the
    // cost, and reading live is also what keeps this correct across an ancestor
    // move, which the stored AABBs do not survive.
    //
    // An index cannot afford this call per item; the shared-helper and
    // mutable-`cullArea` questions that raises belong to the index, not here.
    return item.drawable._inCullRect(rect);
  }
}
