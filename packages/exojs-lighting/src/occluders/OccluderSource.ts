import type { ReadonlyRectangle, RenderNode } from '@codexo/exojs';

/**
 * A scene node offered whole, for a field that can rasterise a silhouette
 * instead of tracing one. What blocks light is the node's own subtree as it
 * draws, thresholded on alpha.
 */
export type OccluderDrawable = RenderNode;

/**
 * Where an {@link OccluderSource} writes what blocks light.
 *
 * The main channel is line segments in world space: an occluder has no
 * thickness, no interior and no material, and what a shadow needs to know
 * about a wall is where its edges are. A source whose silhouette is really a
 * picture may offer the drawable itself instead - see {@link addDrawable}.
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
  /**
   * Offer a drawable whose silhouette is its own alpha, and report whether the
   * field took it.
   *
   * `false` means this field turns occluders into geometry and the source must
   * describe the same shape as segments instead - which is the answer wherever
   * shadows are built on the CPU, so a source that can only do one of the two
   * still works everywhere.
   *
   * Where it is taken, the drawable is rasterised at its own place in the
   * world each frame. That is what makes an animation, a video or a render
   * target cast a correct shadow without a trace, a cache or a warning, and it
   * is why the offer comes first and the geometry second.
   */
  addDrawable(drawable: OccluderDrawable): boolean;
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
