import type { PointLike, ReadonlyRectangle } from '@codexo/exojs';

import type { OccluderPlacement } from './OccluderPlacement';
import type { OccluderSink, OccluderSource } from './OccluderSource';
import { PolylineOccluder } from './PolylineOccluder';

/** Tuning for {@link PolygonOccluder}. */
export interface PolygonOccluderOptions {
  /**
   * Whether the last point joins the first. `false` leaves an open polyline,
   * which is what a wall, a fence or a one-sided ledge is. Defaults to `true`.
   */
  readonly closed?: boolean;
  /**
   * Node whose world transform places the outline, making the points local to
   * it. Without one the points are world space.
   *
   * Local means the node's OWN space, scale included. A drawable sized through
   * `width` / `height` carries that size as a scale, so its local space is its
   * texture's pixels and not the size it appears at - points written in the
   * size you see are then multiplied by it a second time, and the outline comes
   * out many times too large. Where the shape you want IS the drawable's,
   * {@link AlphaOccluder} takes it from the drawable itself and this cannot
   * happen.
   */
  readonly node?: OccluderPlacement;
}

/**
 * Shadows from an outline of your own, in world space or local to a node.
 *
 * ```ts
 * lighting.occludeFrom(new PolygonOccluder(trunk, { node: tree }));
 * ```
 *
 * The escape hatch, and the right answer whenever the shadow silhouette is not
 * the drawn one.
 *
 * The points are read once. The node places them, so moving or rotating it
 * moves the shadow with it.
 */
export class PolygonOccluder implements OccluderSource {
  private readonly _polyline: PolylineOccluder;

  public constructor(points: ReadonlyArray<Readonly<PointLike>>, options: PolygonOccluderOptions = {}) {
    const loop = new Float32Array(points.length * 2);

    for (let index = 0; index < points.length; index++) {
      loop[index * 2] = points[index]!.x;
      loop[index * 2 + 1] = points[index]!.y;
    }

    this._polyline = new PolylineOccluder(points.length >= 2 ? [loop] : [], options.closed ?? true, options.node ?? null);
  }

  public collect(bounds: ReadonlyRectangle, out: OccluderSink): void {
    this._polyline.collect(bounds, out);
  }
}
