// Axis-aligned bounding box helpers for the broad phase and AABB queries. The
// box itself is core's structural `AabbLike` (min/max extents, not centre +
// half-extent) - the broad-phase tree and the overlap tests read the edges
// directly, and sharing one contract keeps colliders, spatial trees and query
// bounds interchangeable across package boundaries.

import type { AabbLike } from '@codexo/exojs';

/** Create a zero-extent AABB at the origin. */
export const createAabb = (): AabbLike => ({ minX: 0, minY: 0, maxX: 0, maxY: 0 });

/** `true` when two AABBs overlap (touching edges count as overlapping). */
export const aabbOverlap = (a: AabbLike, b: AabbLike): boolean => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** `true` when `(x, y)` lies inside (or on the edge of) `aabb`. */
export const aabbContainsPoint = (aabb: AabbLike, x: number, y: number): boolean => x >= aabb.minX && x <= aabb.maxX && y >= aabb.minY && y <= aabb.maxY;

/** Grow `aabb` outward by `margin` on every side, in place. */
export const expandAabb = (aabb: AabbLike, margin: number): AabbLike => {
  aabb.minX -= margin;
  aabb.minY -= margin;
  aabb.maxX += margin;
  aabb.maxY += margin;

  return aabb;
};
