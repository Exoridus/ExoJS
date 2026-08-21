/**
 * Structural type for an axis-aligned bounding box given as min/max extents.
 *
 * This is the canonical AABB contract across the engine and its packages -
 * broad phases, spatial trees and AABB queries all read and write these four
 * fields directly rather than a centre/half-extent pair.
 */
export interface AabbLike {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
