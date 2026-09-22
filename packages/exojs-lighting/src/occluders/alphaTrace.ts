import { type ReadonlyRectangle, Rectangle, type RenderTexture, type Texture } from '@codexo/exojs';

import { readAlphaField } from '../readAlphaField';
import type { OccluderPlacement } from './OccluderPlacement';
import { simplifyLoop, traceContours } from './traceContours';

/**
 * A drawable whose own texture, frame and layout box describe where its
 * silhouette belongs. Core's `Sprite` - and therefore `AnimatedSprite` and
 * `Video`, which extend it - satisfies it as it stands, which is what lets one
 * argument stand in for a texture, a region of it and a placement.
 */
export interface AlphaOccluderDrawable extends OccluderPlacement {
  readonly texture: Texture | RenderTexture | null;
  /** The region of the texture this drawable shows, which is what gets traced. */
  readonly textureFrame: ReadonlyRectangle;
  /** The drawable's own local box, which the traced frame is mapped onto. */
  getLocalBounds(): ReadonlyRectangle;
}

/** Tuning for {@link AlphaOccluder}. */
export interface AlphaOccluderOptions {
  /** Alpha at or above which a pixel blocks light, in `0..1`. Defaults to `0.5`. */
  readonly threshold?: number;
  /**
   * How far, in traced pixels, the simplified outline may drift from the
   * traced one. `0` keeps every step of the pixel staircase, which is rarely
   * worth its segment count. Defaults to `2`.
   */
  readonly simplify?: number;
  /**
   * Node whose world transform places the outline. Defaults to the drawable
   * when one was passed. A bare texture with no node sits in world space with
   * its top-left pixel at the origin, which is only useful for a backdrop that
   * never moves.
   */
  readonly node?: OccluderPlacement;
}

/** Where a traced pixel lands in the placement's local space. */
export interface AlphaPlacement {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** A traced pixel is a local unit, at the origin - what a bare texture gets. */
export const identityPlacement: AlphaPlacement = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

/**
 * The tracing half of {@link AlphaOccluder}, over an alpha field that is
 * already in hand.
 *
 * Separate from the pixel read because that half needs a browser canvas and
 * this half is arithmetic: what the outline looks like is decided here, and
 * can be checked without a GPU or a DOM.
 *
 * `placement` maps a traced pixel onto the local space the outline will be
 * transformed from. Loops shorter than three points are dropped.
 * @internal
 */
export const outlinesFromAlphaField = (
  alpha: Float32Array | null,
  width: number,
  height: number,
  threshold: number,
  simplify: number,
  placement: AlphaPlacement = identityPlacement,
): Float32Array[] => {
  if (alpha === null) {
    return [];
  }

  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && alpha[y * width + x]! >= threshold;
  const loops: Float32Array[] = [];

  for (const contour of traceContours(solid, width, height)) {
    const reduced = simplifyLoop(contour, simplify);

    if (reduced.length === 0) {
      continue;
    }

    const loop = new Float32Array(reduced.length);

    for (let index = 0; index < reduced.length; index += 2) {
      loop[index] = reduced[index]! * placement.scaleX + placement.offsetX;
      loop[index + 1] = reduced[index + 1]! * placement.scaleY + placement.offsetY;
    }

    loops.push(loop);
  }

  return loops;
};

/**
 * Trace one frame of a texture into outlines in the drawable's local space, or
 * `null` when the pixels could not be read at all.
 *
 * `null` and an empty result mean different things and the caller has to tell
 * them apart: a texture that is not ready yet is expected to become ready,
 * while a frame that is genuinely transparent has been answered correctly.
 * @internal
 */
export const traceAlphaFrame = (texture: Texture, drawable: AlphaOccluderDrawable | null, options: AlphaOccluderOptions): Float32Array[] | null => {
  const region = tracedRegion(texture, drawable);
  const width = Math.max(1, Math.round(region.width));
  const height = Math.max(1, Math.round(region.height));
  const alpha = readAlphaField(texture, width, height, region);

  if (alpha === null) {
    return null;
  }

  return outlinesFromAlphaField(alpha, width, height, options.threshold ?? 0.5, options.simplify ?? 2, localPlacement(drawable, width, height));
};

/**
 * The part of the texture to trace: a drawable's own frame, so a sprite from an
 * atlas outlines itself rather than the whole page.
 */
const tracedRegion = (texture: Texture, drawable: AlphaOccluderDrawable | null): ReadonlyRectangle => {
  const frame = drawable?.textureFrame;

  if (frame === undefined || frame.width <= 0 || frame.height <= 0) {
    return new Rectangle(0, 0, texture.width, texture.height);
  }

  return frame;
};

/**
 * How a traced pixel maps into the placement's local space.
 *
 * A sprite's local box IS its frame - it carries its size as scale - so the
 * frame maps onto that box and the anchor needs no handling here: the world
 * transform already carries it. A bare texture has no box, so a pixel is a
 * unit.
 */
const localPlacement = (drawable: AlphaOccluderDrawable | null, width: number, height: number): AlphaPlacement => {
  if (drawable === null) {
    return identityPlacement;
  }

  const bounds = drawable.getLocalBounds();

  return {
    scaleX: bounds.width / width,
    scaleY: bounds.height / height,
    offsetX: bounds.left,
    offsetY: bounds.top,
  };
};
