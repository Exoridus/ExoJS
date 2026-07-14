import type { Aabb } from '../Aabb';
import type { Collider } from '../Collider';

/**
 * Optional backend capability: an accelerated AABB-overlap query over the
 * world's live colliders. {@link QueryEngine} narrows its otherwise-linear
 * scan through this when the active {@link PhysicsBackend} provides one.
 */
export interface SpatialIndex {
  /**
   * Ensure every live collider in `colliders` is represented in the index
   * (insert new leaves, reinsert moved ones) before a query. The underlying
   * tree is normally kept in sync once per physics step (via the broad
   * phase's own detection pass); a caller that queries before the world's
   * first `step()` — or between steps, after adding/moving colliders — has
   * no such guarantee, so {@link QueryEngine} calls this before every
   * narrowed query. A leaf whose tight AABB stays inside its stored fat AABB
   * costs nothing to re-sync, so calling this redundantly (e.g. right after
   * a step already synced it) is cheap.
   */
  sync(colliders: readonly Collider[]): void;
  /** Colliders whose AABB overlaps `aabb`. Writes into `out` (cleared first) and returns it. */
  queryAabb(aabb: Readonly<Aabb>, out: Collider[]): Collider[];
}
