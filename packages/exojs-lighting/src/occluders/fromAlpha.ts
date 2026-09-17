import type { PointLike, Texture } from '@codexo/exojs';

import { readAlphaField } from '../readAlphaField';
import type { OccluderPlacement } from './OccluderPlacement';
import type { OccluderSource } from './OccluderSource';
import { PolylineOccluder } from './PolylineOccluder';
import { simplifyLoop, traceContours } from './traceContours';

/** Tuning for {@link Occluders.fromAlpha}. */
export interface AlphaOccluderOptions {
  /** Alpha at or above which a pixel blocks light, in `0..1`. Defaults to `0.5`. */
  readonly threshold?: number;
  /**
   * How far, in texture pixels, the simplified outline may drift from the
   * traced one. `0` keeps every step of the pixel staircase, which is rarely
   * worth its segment count. Defaults to `2`.
   */
  readonly simplify?: number;
  /**
   * Node whose world transform places the outline. Without one the outline
   * sits in world space with the texture's top-left pixel at the origin, which
   * is only useful for a backdrop that never moves.
   */
  readonly node?: OccluderPlacement;
  /**
   * Where the node's origin sits in the texture, in `0..1` - the same anchor
   * the drawable uses. Defaults to `(0, 0)`, the top-left corner.
   */
  readonly anchor?: Readonly<PointLike>;
}

/**
 * The tracing half of {@link Occluders.fromAlpha}, over an alpha field that is
 * already in hand.
 *
 * Separate from the pixel read because that half needs a browser canvas and
 * this half is arithmetic: what the outline looks like is decided here, and
 * can be checked without a GPU or a DOM.
 *
 * Coordinates are in texture pixels, offset so that `(anchorX, anchorY)` in
 * `0..1` lands on the origin. Loops shorter than three points are dropped.
 * @internal
 */
export const outlinesFromAlphaField = (
  alpha: Float32Array | null,
  width: number,
  height: number,
  threshold: number,
  simplify: number,
  anchorX: number,
  anchorY: number,
): Float32Array[] => {
  if (alpha === null) {
    return [];
  }

  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && alpha[y * width + x]! >= threshold;
  const offsetX = anchorX * width;
  const offsetY = anchorY * height;
  const loops: Float32Array[] = [];

  for (const contour of traceContours(solid, width, height)) {
    const reduced = simplifyLoop(contour, simplify);

    if (reduced.length === 0) {
      continue;
    }

    const loop = new Float32Array(reduced.length);

    for (let index = 0; index < reduced.length; index += 2) {
      loop[index] = reduced[index]! - offsetX;
      loop[index + 1] = reduced[index + 1]! - offsetY;
    }

    loops.push(loop);
  }

  return loops;
};

/** @internal - see {@link Occluders.fromAlpha}. */
export const fromAlpha = (texture: Texture, options: AlphaOccluderOptions = {}): OccluderSource => {
  const width = Math.max(1, texture.width);
  const height = Math.max(1, texture.height);
  const loops = outlinesFromAlphaField(
    readAlphaField(texture, width, height),
    width,
    height,
    options.threshold ?? 0.5,
    options.simplify ?? 2,
    options.anchor?.x ?? 0,
    options.anchor?.y ?? 0,
  );

  return new PolylineOccluder(loops, true, options.node ?? null);
};
