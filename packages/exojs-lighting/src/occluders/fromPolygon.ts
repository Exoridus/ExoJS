import type { PointLike } from '@codexo/exojs';

import type { OccluderPlacement } from './OccluderPlacement';
import type { OccluderSource } from './OccluderSource';
import { PolylineOccluder } from './PolylineOccluder';

/** Tuning for {@link Occluders.fromPolygon}. */
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
   * `Occluders.fromAlpha(drawable)` takes it from the drawable itself and this
   * cannot happen.
   */
  readonly node?: OccluderPlacement;
}

/** @internal - see {@link Occluders.fromPolygon}. */
export const fromPolygon = (points: ReadonlyArray<Readonly<PointLike>>, options: PolygonOccluderOptions = {}): OccluderSource => {
  const loop = new Float32Array(points.length * 2);

  for (let index = 0; index < points.length; index++) {
    loop[index * 2] = points[index]!.x;
    loop[index * 2 + 1] = points[index]!.y;
  }

  return new PolylineOccluder(points.length >= 2 ? [loop] : [], options.closed ?? true, options.node ?? null);
};
