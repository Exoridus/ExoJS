import type { ReadonlyRectangle } from '@codexo/exojs';

/**
 * Where an {@link OccluderSource} writes the geometry that blocks light.
 *
 * A sink takes line segments in world space and nothing else. An occluder has
 * no thickness, no interior and no material: what a shadow needs to know about
 * a wall is where its edges are.
 */
export interface OccluderSink {
  /** Append one segment from `(x1, y1)` to `(x2, y2)`, in world space. */
  addSegment(x1: number, y1: number, x2: number, y2: number): void;
  /**
   * Append a polyline given as `[x0, y0, x1, y1, ...]` in world space. With
   * `closed`, the last point is joined back to the first, which is how a
   * polygon outline is written.
   *
   * Fewer than two points contribute nothing.
   */
  addPolyline(points: ArrayLike<number>, closed: boolean): void;
}

/**
 * Something that can say which edges block light in a region.
 *
 * Occluders are registered sources rather than a flag on a drawable. A flag
 * would put lighting vocabulary on a class with no lighting concern, and it
 * would tie the shadow silhouette to the sprite's shape - which is wrong often
 * enough that a tree wants the shadow of its trunk, not of its alpha channel.
 *
 * Implement this to feed shadows from anything: a navmesh, a server message, a
 * procedural generator. The stock sources in {@link Occluders} are ordinary
 * implementations of the same interface, with no privilege over yours.
 *
 * ```ts
 * lighting.occludeFrom({
 *   collect(bounds, out) {
 *     out.addSegment(bounds.left, 0, bounds.right, 0);
 *   },
 * });
 * ```
 */
export interface OccluderSource {
  /**
   * Append the segments overlapping `bounds` to `out`.
   *
   * Called once per frame with the region the visible lights actually reach,
   * so a source that can narrow its search by region should. Reporting more
   * than `bounds` covers is allowed and only costs work; reporting less than
   * it covers leaks light.
   *
   * `bounds` is valid for the duration of the call and is reused afterwards.
   */
  collect(bounds: ReadonlyRectangle, out: OccluderSink): void;
}
