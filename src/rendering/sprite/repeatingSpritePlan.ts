import type { RepeatFit, RepeatMode, RepeatSegment } from '#rendering/texture/repeat';
import { planRepeat } from '#rendering/texture/repeat';
import type { TextureRegion } from '#rendering/texture/TextureRegion';

/** Constructor options for {@link RepeatingSprite}. @stable */
export interface RepeatingSpriteOptions {
  /** Destination width in local units. Defaults to source width. */
  readonly width?: number;
  /** Destination height in local units. Defaults to source height. */
  readonly height?: number;
  /** Horizontal repeat mode. Default: `'repeat'`. */
  readonly modeX?: RepeatMode;
  /** Vertical repeat mode. Default: `'repeat'`. */
  readonly modeY?: RepeatMode;
  /** How the horizontal repeat fits the destination span. Default: `'round'`. */
  readonly fitX?: RepeatFit;
  /** How the vertical repeat fits the destination span. Default: `'round'`. */
  readonly fitY?: RepeatFit;
  /** Horizontal scroll offset in source-pixel units. Default: `0`. */
  readonly offsetX?: number;
  /** Vertical scroll offset in source-pixel units. Default: `0`. */
  readonly offsetY?: number;
}

/** A single rendered sub-quad produced by the repeating-sprite geometry builder. @internal */
export interface RepeatingSpriteQuad {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const validRepeatModes = new Set<string>(['stretch', 'repeat', 'mirror-repeat']);
const validRepeatFits = new Set<string>(['clip', 'round']);

export function validateSizeInput(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(
      `RepeatingSprite: width and height must be finite numbers (got ${width}, ${height}).`,
    );
  }
  if (width < 0) {
    throw new Error(`RepeatingSprite: width must be non-negative (got ${width}).`);
  }
  if (height < 0) {
    throw new Error(`RepeatingSprite: height must be non-negative (got ${height}).`);
  }
}

export function validateMode(mode: unknown, label: string): void {
  if (typeof mode !== 'string' || !validRepeatModes.has(mode)) {
    throw new Error(
      `RepeatingSprite: ${label} must be "stretch", "repeat", or "mirror-repeat" (got ${String(mode)}).`,
    );
  }
}

export function validateFit(fit: unknown, label: string): void {
  if (typeof fit !== 'string' || !validRepeatFits.has(fit)) {
    throw new Error(
      `RepeatingSprite: ${label} must be "clip" or "round" (got ${String(fit)}).`,
    );
  }
}

export function validateOffset(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `RepeatingSprite: ${label} must be a finite number (got ${value}).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Shader-path tiling helpers
// ---------------------------------------------------------------------------

/**
 * Compute the UV tiling scale for the standalone shader path.
 *
 * Returns how many times the source repeats across the destination span.
 * - `stretch`: always 1.0
 * - `repeat`/`mirror-repeat` + `round`: nearest integer count (≥ 1)
 * - `repeat`/`mirror-repeat` + `clip`: exact fraction `destLen / srcLen`
 * @internal
 */
export function computeShaderTiling(
  srcLen: number,
  destLen: number,
  mode: RepeatMode,
  fit: RepeatFit,
): number {
  if (mode === 'stretch' || srcLen <= 0 || destLen <= 0) {
    return 1;
  }
  if (fit === 'round') {
    return Math.max(1, Math.round(destLen / srcLen));
  }
  return destLen / srcLen;
}

// ---------------------------------------------------------------------------
// Geometry-path quad builder
// ---------------------------------------------------------------------------

const halfTexelInset = 0.5;

/**
 * Build the geometry quads for the atlas-region repeat path.
 *
 * Runs {@link planRepeat} independently on both X and Y axes with optional
 * phase offsets, then generates the Cartesian-product quad list.  Each quad
 * carries UV coordinates clamped inside the region's UV bounds, with
 * extrusion-aware outer insets.
 * @internal
 */
export function buildRepeatingSpriteQuads(
  region: TextureRegion,
  width: number,
  height: number,
  modeX: RepeatMode,
  modeY: RepeatMode,
  fitX: RepeatFit,
  fitY: RepeatFit,
  offsetX: number,
  offsetY: number,
): RepeatingSpriteQuad[] {
  if (width === 0 || height === 0 || region.width <= 0 || region.height <= 0) {
    return [];
  }

  const tw = region.texture.width;
  const th = region.texture.height;
  const ext = region.extrusion;

  const outerInsetU = (ext.left > 0 || ext.right > 0) ? 0 : halfTexelInset / tw;
  const outerInsetV = (ext.top > 0 || ext.bottom > 0) ? 0 : halfTexelInset / th;

  const uMin = region.u0 + outerInsetU;
  const uMax = region.u1 - outerInsetU;
  const vMin = region.v0 + outerInsetV;
  const vMax = region.v1 - outerInsetV;

  const srcW = region.width;
  const srcH = region.height;
  const uRange = uMax - uMin;
  const vRange = vMax - vMin;

  const segsX = buildAxisSegmentsWithOffset(srcW, width, modeX, fitX, offsetX);
  const segsY = buildAxisSegmentsWithOffset(srcH, height, modeY, fitY, offsetY);

  const quads: RepeatingSpriteQuad[] = [];

  for (const sy of segsY) {
    const qy0 = sy.destinationStart;
    const qy1 = sy.destinationStart + sy.destinationLength;
    const qv0 = vMin + sy.sourceStart * vRange;
    const qv1 = vMin + sy.sourceEnd * vRange;

    for (const sx of segsX) {
      const qx0 = sx.destinationStart;
      const qx1 = sx.destinationStart + sx.destinationLength;
      const qu0 = uMin + sx.sourceStart * uRange;
      const qu1 = uMin + sx.sourceEnd * uRange;

      quads.push({ x0: qx0, y0: qy0, x1: qx1, y1: qy1, u0: qu0, v0: qv0, u1: qu1, v1: qv1 });
    }
  }

  return quads;
}

/**
 * Build repeat segments for one axis with an optional phase offset.
 *
 * The offset shifts the starting phase of the repeat in source-pixel units.
 * For `stretch` mode the offset is silently ignored.
 *
 * Implementation: generates a plan for `(destLen + phase)`, shifts all
 * segment destinations back by `phase`, and clips to `[0, destLen]`.  This
 * is correct for `clip` fit; for `round` fit the extended-span count may
 * differ slightly from the zero-offset count — atlas scrolling is
 * discouraged by design.
 * @internal
 */
function buildAxisSegmentsWithOffset(
  srcLen: number,
  destLen: number,
  mode: RepeatMode,
  fit: RepeatFit,
  offset: number,
): RepeatSegment[] {
  if (destLen === 0 || srcLen <= 0) {
    return [];
  }

  if (mode === 'stretch') {
    return [...planRepeat(srcLen, destLen, mode, fit).segments];
  }

  const phase = ((offset % srcLen) + srcLen) % srcLen;

  if (phase === 0) {
    return [...planRepeat(srcLen, destLen, mode, fit).segments];
  }

  const extendedPlan = planRepeat(srcLen, destLen + phase, mode, fit);
  const result: RepeatSegment[] = [];

  for (const seg of extendedPlan.segments) {
    const dStart = seg.destinationStart - phase;
    const dEnd = dStart + seg.destinationLength;

    if (dEnd <= 0 || dStart >= destLen) {
      continue;
    }

    const clippedStart = Math.max(0, dStart);
    const clippedEnd = Math.min(destLen, dEnd);
    const clippedLen = clippedEnd - clippedStart;

    if (clippedLen <= 0) {
      continue;
    }

    const t0 = (clippedStart - dStart) / seg.destinationLength;
    const t1 = (clippedEnd - dStart) / seg.destinationLength;
    const srcRange = seg.sourceEnd - seg.sourceStart;

    result.push({
      destinationStart: clippedStart,
      destinationLength: clippedLen,
      sourceStart: seg.sourceStart + t0 * srcRange,
      sourceEnd: seg.sourceStart + t1 * srcRange,
      mirrored: seg.mirrored,
    });
  }

  return result;
}
