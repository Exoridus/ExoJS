// Axis-aligned bounding box used by the broad phase and AABB queries. Stored as
// min/max extents (not centre + half-extent) because the AABB tree broad phase
// and overlap tests read the edges directly.

export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Create a zero-extent AABB at the origin. */
export const createAabb = (): Aabb => ({ minX: 0, minY: 0, maxX: 0, maxY: 0 });

/** `true` when two AABBs overlap (touching edges count as overlapping). */
export const aabbOverlap = (a: Aabb, b: Aabb): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** `true` when `(x, y)` lies inside (or on the edge of) `aabb`. */
export const aabbContainsPoint = (aabb: Aabb, x: number, y: number): boolean =>
  x >= aabb.minX && x <= aabb.maxX && y >= aabb.minY && y <= aabb.maxY;

/** Grow `aabb` outward by `margin` on every side, in place. */
export const expandAabb = (aabb: Aabb, margin: number): Aabb => {
  aabb.minX -= margin;
  aabb.minY -= margin;
  aabb.maxX += margin;
  aabb.maxY += margin;

  return aabb;
};
