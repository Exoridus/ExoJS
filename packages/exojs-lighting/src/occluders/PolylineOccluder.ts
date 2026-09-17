import type { ReadonlyRectangle } from '@codexo/exojs';

import { type OccluderPlacement, placementMap, readPlacement } from './OccluderPlacement';
import type { OccluderSink, OccluderSource } from './OccluderSource';

/**
 * Fixed outlines placed by an optional node transform.
 *
 * The outlines are stored once in the placement's local space and mapped into
 * the world on every collect, so a moving, rotating or scaling carrier costs
 * the transform and nothing else - the tracing or authoring behind them never
 * runs again.
 * @internal
 */
export class PolylineOccluder implements OccluderSource {
  private readonly _loops: readonly Float32Array[];
  private readonly _closed: boolean;
  private readonly _node: OccluderPlacement | null;
  private readonly _scratch: Float32Array;
  private readonly _placement = placementMap();

  public constructor(loops: readonly Float32Array[], closed: boolean, node: OccluderPlacement | null) {
    this._loops = loops;
    this._closed = closed;
    this._node = node;
    this._scratch = new Float32Array(loops.reduce((longest, loop) => Math.max(longest, loop.length), 0));
  }

  /** The outlines in local space, as flat `[x0, y0, x1, y1, ...]` arrays. */
  public get loops(): readonly Float32Array[] {
    return this._loops;
  }

  public collect(bounds: ReadonlyRectangle, out: OccluderSink): void {
    const map = readPlacement(this._node, this._placement);
    const scratch = this._scratch;

    for (const loop of this._loops) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let index = 0; index < loop.length; index += 2) {
        const localX = loop[index]!;
        const localY = loop[index + 1]!;
        const worldX = map.a * localX + map.b * localY + map.x;
        const worldY = map.c * localX + map.d * localY + map.y;

        scratch[index] = worldX;
        scratch[index + 1] = worldY;
        minX = Math.min(minX, worldX);
        minY = Math.min(minY, worldY);
        maxX = Math.max(maxX, worldX);
        maxY = Math.max(maxY, worldY);
      }

      if (maxX < bounds.left || minX > bounds.right || maxY < bounds.top || minY > bounds.bottom) {
        continue;
      }

      out.addPolyline(scratch.subarray(0, loop.length), this._closed);
    }
  }
}
