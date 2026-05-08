import type { PointLike } from '@/math/PointLike';

/**
 * Structural type for any object that describes a polygon via a world-space
 * offset `(x, y)` and an array of local-space {@link PointLike} vertices.
 */
export interface PolygonLike {
  x: number;
  y: number;
  points: PointLike[];
}
