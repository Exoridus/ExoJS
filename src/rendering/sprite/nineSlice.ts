import { logger } from '#core/logging';
import type { RepeatFit, RepeatMode } from '#rendering/texture/repeat';
import { planRepeat } from '#rendering/texture/repeat';
import type { TextureRegion } from '#rendering/texture/TextureRegion';

const halfTexelInset = 0.5;

/** Source-space or destination-space per-edge insets. @stable */
export interface NineSliceInsets {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Per-section fill mode overrides for a nine-slice sprite. @stable */
export interface NineSliceModes {
  readonly edges?: RepeatMode;
  readonly center?: RepeatMode;
  readonly top?: RepeatMode;
  readonly right?: RepeatMode;
  readonly bottom?: RepeatMode;
  readonly left?: RepeatMode;
  readonly edgeFit?: RepeatFit;
  readonly centerFit?: RepeatFit;
}

/** Constructor options for {@link NineSliceSprite}. @stable */
export interface NineSliceOptions {
  readonly slices: number | Partial<NineSliceInsets>;
  readonly border?: number | Partial<NineSliceInsets>;
  readonly width?: number;
  readonly height?: number;
  readonly modes?: NineSliceModes;
}

/** A single rendered sub-quad produced by the nine-slice geometry builder. @internal */
export interface NineSliceQuad {
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
// Validation helpers (module-private)
// ---------------------------------------------------------------------------

function isFiniteNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateSlices(slices: NineSliceInsets, regionWidth: number, regionHeight: number): void {
  const { left, top, right, bottom } = slices;

  if (!isFiniteNumber(left) || !isFiniteNumber(top) || !isFiniteNumber(right) || !isFiniteNumber(bottom)) {
    throw new Error(`NineSliceSprite: slice values must be finite numbers (got left=${left}, top=${top}, right=${right}, bottom=${bottom}).`);
  }

  if (left < 0 || top < 0 || right < 0 || bottom < 0) {
    throw new Error(`NineSliceSprite: slice values must be non-negative (got left=${left}, top=${top}, right=${right}, bottom=${bottom}).`);
  }

  if (left + right > regionWidth) {
    throw new Error(`NineSliceSprite: slices.left (${left}) + slices.right (${right}) exceeds region width (${regionWidth}).`);
  }

  if (top + bottom > regionHeight) {
    throw new Error(`NineSliceSprite: slices.top (${top}) + slices.bottom (${bottom}) exceeds region height (${regionHeight}).`);
  }
}

export function validateBorder(border: NineSliceInsets): void {
  const { left, top, right, bottom } = border;

  if (!isFiniteNumber(left) || !isFiniteNumber(top) || !isFiniteNumber(right) || !isFiniteNumber(bottom)) {
    throw new Error(`NineSliceSprite: border values must be finite numbers (got left=${left}, top=${top}, right=${right}, bottom=${bottom}).`);
  }

  if (left < 0 || top < 0 || right < 0 || bottom < 0) {
    throw new Error(`NineSliceSprite: border values must be non-negative (got left=${left}, top=${top}, right=${right}, bottom=${bottom}).`);
  }
}

// ---------------------------------------------------------------------------
// Normalization helpers (module-private)
// ---------------------------------------------------------------------------

/** Normalise a uniform number or partial insets object into a full {@link NineSliceInsets}. */
export function normalizeInsets(value: number | Partial<NineSliceInsets>, fallback?: NineSliceInsets): NineSliceInsets {
  if (typeof value === 'number') {
    return Object.freeze({ left: value, top: value, right: value, bottom: value });
  }

  return Object.freeze({
    left: value.left ?? fallback?.left ?? 0,
    top: value.top ?? fallback?.top ?? 0,
    right: value.right ?? fallback?.right ?? 0,
    bottom: value.bottom ?? fallback?.bottom ?? 0,
  });
}

const validRepeatModes = new Set<string>(['stretch', 'repeat', 'mirror-repeat']);
const validRepeatFits = new Set<string>(['clip', 'round']);

function validateModeField(value: unknown, label: string): void {
  if (typeof value !== 'string' || !validRepeatModes.has(value)) {
    throw new Error(`NineSliceSprite: ${label} must be "stretch", "repeat", or "mirror-repeat".`);
  }
}

function validateFitField(value: unknown, label: string): void {
  if (typeof value !== 'string' || !validRepeatFits.has(value)) {
    throw new Error(`NineSliceSprite: ${label} must be "clip" or "round".`);
  }
}

export function normalizeModes(modes: NineSliceModes | undefined): Readonly<NineSliceModes> {
  if (!modes) {
    return _defaultModes;
  }

  const normalized: Record<string, unknown> = {};

  if (modes.edges !== undefined) {
    validateModeField(modes.edges, 'modes.edges');
    normalized.edges = modes.edges;
  }
  if (modes.center !== undefined) {
    validateModeField(modes.center, 'modes.center');
    normalized.center = modes.center;
  }
  if (modes.top !== undefined) {
    validateModeField(modes.top, 'modes.top');
    normalized.top = modes.top;
  }
  if (modes.right !== undefined) {
    validateModeField(modes.right, 'modes.right');
    normalized.right = modes.right;
  }
  if (modes.bottom !== undefined) {
    validateModeField(modes.bottom, 'modes.bottom');
    normalized.bottom = modes.bottom;
  }
  if (modes.left !== undefined) {
    validateModeField(modes.left, 'modes.left');
    normalized.left = modes.left;
  }
  if (modes.edgeFit !== undefined) {
    validateFitField(modes.edgeFit, 'modes.edgeFit');
    normalized.edgeFit = modes.edgeFit;
  }
  if (modes.centerFit !== undefined) {
    validateFitField(modes.centerFit, 'modes.centerFit');
    normalized.centerFit = modes.centerFit;
  }

  return Object.freeze(normalized);
}

const _defaultModes: Readonly<NineSliceModes> = Object.freeze({});

export function equalInsets(a: Readonly<NineSliceInsets>, b: Readonly<NineSliceInsets>): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

export function equalModes(a: Readonly<NineSliceModes>, b: Readonly<NineSliceModes>): boolean {
  return (
    a.edges === b.edges &&
    a.center === b.center &&
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.left === b.left &&
    a.edgeFit === b.edgeFit &&
    a.centerFit === b.centerFit
  );
}

// ---------------------------------------------------------------------------
// Mode resolution helpers (module-private)
// ---------------------------------------------------------------------------

function resolveEdgeMode(modes: Readonly<NineSliceModes> | undefined, side: 'top' | 'right' | 'bottom' | 'left'): RepeatMode {
  return modes?.[side] ?? modes?.edges ?? 'stretch';
}

function resolveCenterMode(modes: Readonly<NineSliceModes> | undefined): RepeatMode {
  return modes?.center ?? 'stretch';
}

function resolveEdgeFit(modes: Readonly<NineSliceModes> | undefined): RepeatFit {
  return modes?.edgeFit ?? 'round';
}

function resolveCenterFit(modes: Readonly<NineSliceModes> | undefined): RepeatFit {
  return modes?.centerFit ?? 'round';
}

// ---------------------------------------------------------------------------
// UV helpers (module-private)
// ---------------------------------------------------------------------------

interface UvSpan {
  readonly u0: number;
  readonly u1: number;
}

interface UvGrid {
  readonly col0: UvSpan;
  readonly col1: UvSpan;
  readonly col2: UvSpan;
  readonly row0: UvSpan;
  readonly row1: UvSpan;
  readonly row2: UvSpan;
}

/**
 * Compute exact per-slice UV boundaries from source pixel positions.
 *
 * Source-slice boundaries correspond to actual pixel coordinates:
 *   left bound  = region.x + slices.left
 *   right bound = region.x + region.width - slices.right
 *   top bound   = region.y + slices.top
 *   bottom bound = region.y + region.height - slices.bottom
 *
 * A half-texel inset is applied at internal boundaries to prevent bilinear
 * filtering from sampling across slice seams. Outer boundaries use the full
 * region UV range when extrusion is present, or a half-texel inset otherwise.
 */
function computeSliceUvGrid(region: TextureRegion, slices: NineSliceInsets): UvGrid {
  const tw = region.texture.width;
  const th = region.texture.height;

  const rx = region.x;
  const ry = region.y;
  const rw = region.width;
  const rh = region.height;

  const ext = region.extrusion;

  // Outer boundary insets: use extrusion if available, otherwise half-texel.
  const outerInsetU = ext.left > 0 || ext.right > 0 ? 0 : halfTexelInset / tw;
  const outerInsetV = ext.top > 0 || ext.bottom > 0 ? 0 : halfTexelInset / th;

  // Inner slice boundary insets: always apply half-texel to prevent
  // bilinear bleed across internal slice seams.
  const innerInsetU = halfTexelInset / tw;
  const innerInsetV = halfTexelInset / th;

  // Exact source pixel boundaries in UV space
  const uLeftBound = (rx + slices.left) / tw;
  const uRightBound = (rx + rw - slices.right) / tw;
  const vTopBound = (ry + slices.top) / th;
  const vBottomBound = (ry + rh - slices.bottom) / th;

  // Outer UV bounds (possibly inset)
  const uOuter0 = region.u0 + outerInsetU;
  const uOuter1 = region.u1 - outerInsetU;
  const vOuter0 = region.v0 + outerInsetV;
  const vOuter1 = region.v1 - outerInsetV;

  // Clamp internal boundaries to prevent UV inversion on narrow cells
  const u1 = clampUv(uLeftBound - innerInsetU, uOuter0, uOuter1);
  const u2 = clampUv(uRightBound + innerInsetU, uOuter0, uOuter1);
  const v1 = clampUv(vTopBound - innerInsetV, vOuter0, vOuter1);
  const v2 = clampUv(vBottomBound + innerInsetV, vOuter0, vOuter1);

  return {
    col0: { u0: uOuter0, u1 },
    col1: { u0: u1, u1: u2 },
    col2: { u0: u2, u1: uOuter1 },
    row0: { u0: vOuter0, u1: v1 },
    row1: { u0: v1, u1: v2 },
    row2: { u0: v2, u1: vOuter1 },
  };
}

function clampUv(value: number, min: number, max: number): number {
  if (!isFiniteNumber(value) || value < min) return min;
  if (value > max) return max;
  return value;
}

// ---------------------------------------------------------------------------
// Compression helpers (module-private)
// ---------------------------------------------------------------------------

interface CompressedBorders {
  readonly bl: number;
  readonly br: number;
  readonly bt: number;
  readonly bb: number;
}

function compressBorders(border: NineSliceInsets, width: number, height: number): CompressedBorders {
  let bl = border.left;
  let br = border.right;
  let bt = border.top;
  let bb = border.bottom;

  if (bl + br > width && bl + br > 0) {
    logger.warn('horizontal borders exceed destination width; proportionally compressing.', { source: 'NineSliceSprite', once: 'nine-slice:h-compress' });
    const k = width / (bl + br);
    bl *= k;
    br *= k;
  }

  if (bt + bb > height && bt + bb > 0) {
    logger.warn('vertical borders exceed destination height; proportionally compressing.', { source: 'NineSliceSprite', once: 'nine-slice:v-compress' });
    const k = height / (bt + bb);
    bt *= k;
    bb *= k;
  }

  return { bl, br, bt, bb };
}

// ---------------------------------------------------------------------------
// Geometry builder
// ---------------------------------------------------------------------------

/**
 * Build the list of quads that collectively render a nine-slice sprite at the
 * requested destination size. Called lazily by {@link NineSliceSprite}.
 * @internal
 */
export function buildNineSliceQuads(
  region: TextureRegion,
  slices: NineSliceInsets,
  border: NineSliceInsets,
  width: number,
  height: number,
  modes: Readonly<NineSliceModes> | undefined,
): NineSliceQuad[] {
  const uvGrid = computeSliceUvGrid(region, slices);
  const compressed = compressBorders(border, width, height);

  const bl = compressed.bl;
  const br = compressed.br;
  const bt = compressed.bt;
  const bb = compressed.bb;

  const centerW = Math.max(0, width - bl - br);
  const centerH = Math.max(0, height - bt - bb);

  const dx0 = 0;
  const dx1 = bl;
  const dx2 = bl + centerW;
  const dx3 = width;

  const dy0 = 0;
  const dy1 = bt;
  const dy2 = bt + centerH;
  const dy3 = height;

  const srcEdgeW = Math.max(0, region.width - slices.left - slices.right);
  const srcEdgeH = Math.max(0, region.height - slices.top - slices.bottom);

  const topScale = slices.top > 0 ? bt / slices.top : 1;
  const bottomScale = slices.bottom > 0 ? bb / slices.bottom : 1;
  const leftScale = slices.left > 0 ? bl / slices.left : 1;
  const rightScale = slices.right > 0 ? br / slices.right : 1;

  const topNativeW = srcEdgeW * topScale;
  const bottomNativeW = srcEdgeW * bottomScale;
  const leftNativeH = srcEdgeH * leftScale;
  const rightNativeH = srcEdgeH * rightScale;
  const centerNativeW = topNativeW;
  const centerNativeH = leftNativeH;

  const topMode = resolveEdgeMode(modes, 'top');
  const bottomMode = resolveEdgeMode(modes, 'bottom');
  const leftMode = resolveEdgeMode(modes, 'left');
  const rightMode = resolveEdgeMode(modes, 'right');
  const centerMode = resolveCenterMode(modes);
  const edgeFit = resolveEdgeFit(modes);
  const centerFit = resolveCenterFit(modes);

  const quads: NineSliceQuad[] = [];

  const { col0, col1, col2, row0, row1, row2 } = uvGrid;

  // Corners
  if (bl > 0 && bt > 0) {
    quads.push({ x0: dx0, y0: dy0, x1: dx1, y1: dy1, u0: col0.u0, v0: row0.u0, u1: col0.u1, v1: row0.u1 });
  }
  if (br > 0 && bt > 0) {
    quads.push({ x0: dx2, y0: dy0, x1: dx3, y1: dy1, u0: col2.u0, v0: row0.u0, u1: col2.u1, v1: row0.u1 });
  }
  if (bl > 0 && bb > 0) {
    quads.push({ x0: dx0, y0: dy2, x1: dx1, y1: dy3, u0: col0.u0, v0: row2.u0, u1: col0.u1, v1: row2.u1 });
  }
  if (br > 0 && bb > 0) {
    quads.push({ x0: dx2, y0: dy2, x1: dx3, y1: dy3, u0: col2.u0, v0: row2.u0, u1: col2.u1, v1: row2.u1 });
  }

  const col1U0 = col1.u0;
  const col1U1 = col1.u1;
  const row1U0 = row1.u0;
  const row1U1 = row1.u1;

  // Top edge
  if (centerW > 0 && bt > 0 && srcEdgeW > 0 && topNativeW > 0) {
    const plan = planRepeat(topNativeW, centerW, topMode, edgeFit);
    for (const seg of plan.segments) {
      const qx0 = dx1 + seg.destinationStart;
      const qx1 = dx1 + seg.destinationStart + seg.destinationLength;
      const qu0 = col1U0 + seg.sourceStart * (col1U1 - col1U0);
      const qu1 = col1U0 + seg.sourceEnd * (col1U1 - col1U0);
      quads.push({ x0: qx0, y0: dy0, x1: qx1, y1: dy1, u0: qu0, v0: row0.u0, u1: qu1, v1: row0.u1 });
    }
  }

  // Bottom edge
  if (centerW > 0 && bb > 0 && srcEdgeW > 0 && bottomNativeW > 0) {
    const plan = planRepeat(bottomNativeW, centerW, bottomMode, edgeFit);
    for (const seg of plan.segments) {
      const qx0 = dx1 + seg.destinationStart;
      const qx1 = dx1 + seg.destinationStart + seg.destinationLength;
      const qu0 = col1U0 + seg.sourceStart * (col1U1 - col1U0);
      const qu1 = col1U0 + seg.sourceEnd * (col1U1 - col1U0);
      quads.push({ x0: qx0, y0: dy2, x1: qx1, y1: dy3, u0: qu0, v0: row2.u0, u1: qu1, v1: row2.u1 });
    }
  }

  // Left edge
  if (bl > 0 && centerH > 0 && srcEdgeH > 0 && leftNativeH > 0) {
    const plan = planRepeat(leftNativeH, centerH, leftMode, edgeFit);
    for (const seg of plan.segments) {
      const qy0 = dy1 + seg.destinationStart;
      const qy1 = dy1 + seg.destinationStart + seg.destinationLength;
      const qv0 = row1U0 + seg.sourceStart * (row1U1 - row1U0);
      const qv1 = row1U0 + seg.sourceEnd * (row1U1 - row1U0);
      quads.push({ x0: dx0, y0: qy0, x1: dx1, y1: qy1, u0: col0.u0, v0: qv0, u1: col0.u1, v1: qv1 });
    }
  }

  // Right edge
  if (br > 0 && centerH > 0 && srcEdgeH > 0 && rightNativeH > 0) {
    const plan = planRepeat(rightNativeH, centerH, rightMode, edgeFit);
    for (const seg of plan.segments) {
      const qy0 = dy1 + seg.destinationStart;
      const qy1 = dy1 + seg.destinationStart + seg.destinationLength;
      const qv0 = row1U0 + seg.sourceStart * (row1U1 - row1U0);
      const qv1 = row1U0 + seg.sourceEnd * (row1U1 - row1U0);
      quads.push({ x0: dx2, y0: qy0, x1: dx3, y1: qy1, u0: col2.u0, v0: qv0, u1: col2.u1, v1: qv1 });
    }
  }

  // Center
  if (centerW > 0 && centerH > 0 && srcEdgeW > 0 && srcEdgeH > 0 && centerNativeW > 0 && centerNativeH > 0) {
    const planX = planRepeat(centerNativeW, centerW, centerMode, centerFit);
    const planY = planRepeat(centerNativeH, centerH, centerMode, centerFit);

    for (const segY of planY.segments) {
      const qy0 = dy1 + segY.destinationStart;
      const qy1 = dy1 + segY.destinationStart + segY.destinationLength;
      const qv0 = row1U0 + segY.sourceStart * (row1U1 - row1U0);
      const qv1 = row1U0 + segY.sourceEnd * (row1U1 - row1U0);

      for (const segX of planX.segments) {
        const qx0 = dx1 + segX.destinationStart;
        const qx1 = dx1 + segX.destinationStart + segX.destinationLength;
        const qu0 = col1U0 + segX.sourceStart * (col1U1 - col1U0);
        const qu1 = col1U0 + segX.sourceEnd * (col1U1 - col1U0);
        quads.push({ x0: qx0, y0: qy0, x1: qx1, y1: qy1, u0: qu0, v0: qv0, u1: qu1, v1: qv1 });
      }
    }
  }

  return quads;
}
