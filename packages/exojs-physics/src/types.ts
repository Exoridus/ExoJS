// Shared value types for the physics package. Kept dependency-light so the
// shapes, colliders and world modules can all reference them without cycles.

/** A read-only two-component point/vector. `Vector` from core satisfies this. */
export interface VectorLike {
  readonly x: number;
  readonly y: number;
}

/**
 * Simulation role of a {@link PhysicsBody}.
 *
 * - `dynamic` — fully simulated (finite mass); moved by the solver once
 *   dynamics ship, and by `setTransform` meanwhile.
 * - `static` — never moves; infinite mass. Ground, walls, level geometry.
 * - `kinematic` — moved only by `setTransform` (game-driven); infinite mass,
 *   unaffected by contacts. Platforms, doors.
 */
export type BodyType = 'dynamic' | 'static' | 'kinematic';

/**
 * Per-collider collision filter. A pair is considered for collision only when
 * each collider's {@link mask} includes the other's {@link category}. A
 * non-zero {@link group} overrides category/mask: identical positive groups
 * always collide, identical negative groups never do.
 */
export interface CollisionFilter {
  /** Category bits this collider belongs to. Default `0x0001`. */
  category: number;
  /** Categories this collider collides with. Default `0xffff`. */
  mask: number;
  /** Signed override group; `0` defers to category/mask. Default `0`. */
  group: number;
}

/** The default collider filter: category 1, collides with everything, no group. */
export const defaultFilter: Readonly<CollisionFilter> = Object.freeze({
  category: 0x0001,
  mask: 0xffff,
  group: 0,
});

/** Normalise a partial filter against {@link defaultFilter}. */
export const resolveFilter = (filter?: Partial<CollisionFilter>): CollisionFilter => ({
  category: filter?.category ?? defaultFilter.category,
  mask: filter?.mask ?? defaultFilter.mask,
  group: filter?.group ?? defaultFilter.group,
});

/**
 * Decide whether two filters permit a collision/overlap. Implements the
 * standard category/mask rule with the signed-group override (Box2D/Matter
 * semantics).
 */
export const shouldCollide = (a: CollisionFilter, b: CollisionFilter): boolean => {
  if (a.group !== 0 && a.group === b.group) {
    return a.group > 0;
  }

  return (a.mask & b.category) !== 0 && (b.mask & a.category) !== 0;
};
