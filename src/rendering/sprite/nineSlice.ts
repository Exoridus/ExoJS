import type { RepeatFit, RepeatMode } from '#rendering/texture/repeat';
import { planRepeat } from '#rendering/texture/repeat';
import type { TextureRegion } from '#rendering/texture/TextureRegion';

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
  readonly fit?: RepeatFit;
}

/** Constructor options for {@link NineSliceSprite}. @stable */
export interface NineSliceOptions {
  readonly slices: number | Partial<NineSliceInsets>;
  readonly border?: number | Partial<NineSliceInsets>;
  readonly width?: number;
  readonly height?: number;
  readonly modes?: NineSliceModes;
  readonly bleed?: number;
}

/** A single rendered sub-quad produced by the nine-slice geometry builder. @stable */
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

/** Normalise a uniform number or partial insets object into a full {@link NineSliceInsets}. */
export function normalizeInsets(value: number | Partial<NineSliceInsets>, fallback?: NineSliceInsets): NineSliceInsets {
  if (typeof value === 'number') {
    return { left: value, top: value, right: value, bottom: value };
  }

  return {
    left: value.left ?? fallback?.left ?? 0,
    top: value.top ?? fallback?.top ?? 0,
    right: value.right ?? fallback?.right ?? 0,
    bottom: value.bottom ?? fallback?.bottom ?? 0,
  };
}

let _warnedCompression = false;

function resolveEdgeMode(modes: NineSliceModes | undefined, side: 'top' | 'right' | 'bottom' | 'left'): RepeatMode {
  return modes?.[side] ?? modes?.edges ?? 'stretch';
}

function resolveCenterMode(modes: NineSliceModes | undefined): RepeatMode {
  return modes?.center ?? 'stretch';
}

function resolveFit(modes: NineSliceModes | undefined): RepeatFit {
  return modes?.fit ?? 'round';
}

/**
 * Build the list of quads that collectively render a nine-slice sprite at the
 * requested destination size. Called lazily by {@link NineSliceSprite}.
 */
export function buildNineSliceQuads(
  region: TextureRegion,
  slices: NineSliceInsets,
  border: NineSliceInsets,
  width: number,
  height: number,
  modes: NineSliceModes | undefined,
  bleed: number,
): NineSliceQuad[] {
  const texture = region.texture;
  const bleedU = bleed / texture.width;
  const bleedV = bleed / texture.height;
  const safeU0 = region.u0 + bleedU;
  const safeV0 = region.v0 + bleedV;
  const safeU1 = region.u1 - bleedU;
  const safeV1 = region.v1 - bleedV;

  const uSpan = safeU1 - safeU0;
  const vSpan = safeV1 - safeV0;

  const su0 = safeU0;
  const su1 = safeU0 + (slices.left / region.width) * uSpan;
  const su2 = safeU1 - (slices.right / region.width) * uSpan;
  const su3 = safeU1;

  const sv0 = safeV0;
  const sv1 = safeV0 + (slices.top / region.height) * vSpan;
  const sv2 = safeV1 - (slices.bottom / region.height) * vSpan;
  const sv3 = safeV1;

  // Small-target border compression
  let bl = border.left;
  let br = border.right;

  if (bl + br > width && bl + br > 0) {
    if (__DEV__ && !_warnedCompression) {
      // eslint-disable-next-line no-console -- dev-only diagnostic for border compression
      console.warn('NineSliceSprite: horizontal borders exceed destination width; compressing.');
      _warnedCompression = true;
    }

    const k = width / (bl + br);
    bl *= k;
    br *= k;
  }

  let bt = border.top;
  let bb = border.bottom;

  if (bt + bb > height && bt + bb > 0) {
    if (__DEV__ && !_warnedCompression) {
      // eslint-disable-next-line no-console -- dev-only diagnostic for border compression
      console.warn('NineSliceSprite: vertical borders exceed destination height; compressing.');
      _warnedCompression = true;
    }

    const k = height / (bt + bb);
    bt *= k;
    bb *= k;
  }

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
  const fit = resolveFit(modes);

  const quads: NineSliceQuad[] = [];

  // Corners
  if (bl > 0 && bt > 0) {
    quads.push({ x0: dx0, y0: dy0, x1: dx1, y1: dy1, u0: su0, v0: sv0, u1: su1, v1: sv1 });
  }

  if (br > 0 && bt > 0) {
    quads.push({ x0: dx2, y0: dy0, x1: dx3, y1: dy1, u0: su2, v0: sv0, u1: su3, v1: sv1 });
  }

  if (bl > 0 && bb > 0) {
    quads.push({ x0: dx0, y0: dy2, x1: dx1, y1: dy3, u0: su0, v0: sv2, u1: su1, v1: sv3 });
  }

  if (br > 0 && bb > 0) {
    quads.push({ x0: dx2, y0: dy2, x1: dx3, y1: dy3, u0: su2, v0: sv2, u1: su3, v1: sv3 });
  }

  // Top edge
  if (centerW > 0 && bt > 0 && srcEdgeW > 0 && topNativeW > 0) {
    const plan = planRepeat(topNativeW, centerW, topMode, fit);

    for (const seg of plan.segments) {
      const qx0 = dx1 + seg.destinationStart;
      const qx1 = dx1 + seg.destinationStart + seg.destinationLength;
      const qu0 = su1 + seg.sourceStart * (su2 - su1);
      const qu1 = su1 + seg.sourceEnd * (su2 - su1);
      quads.push({ x0: qx0, y0: dy0, x1: qx1, y1: dy1, u0: qu0, v0: sv0, u1: qu1, v1: sv1 });
    }
  }

  // Bottom edge
  if (centerW > 0 && bb > 0 && srcEdgeW > 0 && bottomNativeW > 0) {
    const plan = planRepeat(bottomNativeW, centerW, bottomMode, fit);

    for (const seg of plan.segments) {
      const qx0 = dx1 + seg.destinationStart;
      const qx1 = dx1 + seg.destinationStart + seg.destinationLength;
      const qu0 = su1 + seg.sourceStart * (su2 - su1);
      const qu1 = su1 + seg.sourceEnd * (su2 - su1);
      quads.push({ x0: qx0, y0: dy2, x1: qx1, y1: dy3, u0: qu0, v0: sv2, u1: qu1, v1: sv3 });
    }
  }

  // Left edge
  if (bl > 0 && centerH > 0 && srcEdgeH > 0 && leftNativeH > 0) {
    const plan = planRepeat(leftNativeH, centerH, leftMode, fit);

    for (const seg of plan.segments) {
      const qy0 = dy1 + seg.destinationStart;
      const qy1 = dy1 + seg.destinationStart + seg.destinationLength;
      const qv0 = sv1 + seg.sourceStart * (sv2 - sv1);
      const qv1 = sv1 + seg.sourceEnd * (sv2 - sv1);
      quads.push({ x0: dx0, y0: qy0, x1: dx1, y1: qy1, u0: su0, v0: qv0, u1: su1, v1: qv1 });
    }
  }

  // Right edge
  if (br > 0 && centerH > 0 && srcEdgeH > 0 && rightNativeH > 0) {
    const plan = planRepeat(rightNativeH, centerH, rightMode, fit);

    for (const seg of plan.segments) {
      const qy0 = dy1 + seg.destinationStart;
      const qy1 = dy1 + seg.destinationStart + seg.destinationLength;
      const qv0 = sv1 + seg.sourceStart * (sv2 - sv1);
      const qv1 = sv1 + seg.sourceEnd * (sv2 - sv1);
      quads.push({ x0: dx2, y0: qy0, x1: dx3, y1: qy1, u0: su2, v0: qv0, u1: su3, v1: qv1 });
    }
  }

  // Center
  if (centerW > 0 && centerH > 0 && srcEdgeW > 0 && srcEdgeH > 0 && centerNativeW > 0 && centerNativeH > 0) {
    const planX = planRepeat(centerNativeW, centerW, centerMode, fit);
    const planY = planRepeat(centerNativeH, centerH, centerMode, fit);

    for (const segY of planY.segments) {
      const qy0 = dy1 + segY.destinationStart;
      const qy1 = dy1 + segY.destinationStart + segY.destinationLength;
      const qv0 = sv1 + segY.sourceStart * (sv2 - sv1);
      const qv1 = sv1 + segY.sourceEnd * (sv2 - sv1);

      for (const segX of planX.segments) {
        const qx0 = dx1 + segX.destinationStart;
        const qx1 = dx1 + segX.destinationStart + segX.destinationLength;
        const qu0 = su1 + segX.sourceStart * (su2 - su1);
        const qu1 = su1 + segX.sourceEnd * (su2 - su1);
        quads.push({ x0: qx0, y0: qy0, x1: qx1, y1: qy1, u0: qu0, v0: qv0, u1: qu1, v1: qv1 });
      }
    }
  }

  return quads;
}
