import type { BmFontData } from './BmFont';

/** A text effect that needs a distance field. */
export type TextEffect = 'outline' | 'shadow';

/**
 * Why a text node cannot draw a requested outline or shadow.
 *
 * - `'no-distance-field'`: color glyphs (`Text` with `colorGlyphs`) or a plain
 *   bitmap font (`BitmapText` without `msdf`) render RGBA glyphs and have no
 *   distance to measure an effect against.
 * - `'unknown-range'`: an MSDF font that does not declare its distance range,
 *   zero value and glyph padding.
 * - `'invalid-range'`: an MSDF font whose declared range, zero value or padding
 *   cannot encode any outward distance.
 * - `'insufficient-effect-capacity'`: the effect is larger than the distance
 *   field and the glyph quads reach.
 */
export type TextEffectFailureReason = 'no-distance-field' | 'unknown-range' | 'invalid-range' | 'insufficient-effect-capacity';

/** One rejected outline or shadow request. */
export interface TextEffectIssue {
  readonly reason: TextEffectFailureReason;
  readonly effect: TextEffect;
  /**
   * Logical pixels the request needs in the node's local space, including the
   * antialiasing reserve. `0` unless the reason is `'insufficient-effect-capacity'`.
   */
  readonly required: number;
  /** Logical pixels the node can supply. `0` when it has no usable distance field. */
  readonly available: number;
}

/**
 * Logical pixels of every effect budget kept free for the antialiased edge.
 *
 * The edge fades over half a device pixel on each side, which is at most one
 * logical pixel while a logical pixel covers at least half a device pixel on
 * screen. Under stronger minification the outer fade narrows instead of
 * running into the end of the field.
 */
export const textEffectAntialiasReserve = 1;

/**
 * What a node's glyph source can encode, in the node's local logical pixels.
 * Not part of the public entry point; declared here because protected text
 * node members name it.
 */
export interface TextEffectCapability {
  /** `null` when outlines and shadows can be drawn within {@link outward}. */
  readonly reason: TextEffectFailureReason | null;
  /** Distance outside the glyph edge that both the field and the glyph quad cover. */
  readonly outward: number;
  /** Distance inside the glyph edge the field encodes before it saturates. */
  readonly inward: number;
  /** Change of the sampled field value per local logical pixel; `0` when unknown. */
  readonly fieldScale: number;
  /** Sampled field value on the glyph edge. */
  readonly zero: number;
}

const unsupported = (reason: TextEffectFailureReason, zero = 0.5): TextEffectCapability => ({
  reason,
  outward: 0,
  inward: 0,
  fieldScale: 0,
  zero,
});

/** RGBA glyphs: fill and tint only. @internal */
export const colorGlyphEffectCapability: TextEffectCapability = unsupported('no-distance-field');

/**
 * The runtime SDF atlas: the field and the tile padding both end `sdfRadius`
 * logical pixels outside the glyph, and the field reaches as deep inside.
 * @internal
 */
export const sdfEffectCapability = (sdfRadius: number): TextEffectCapability => ({
  reason: null,
  outward: sdfRadius,
  inward: sdfRadius,
  fieldScale: 1 / (2 * sdfRadius),
  zero: 0.5,
});

// R8 has 255 intervals across [-reach, +reach]. Keep the quantization step
// at or below one logical pixel (at most half a pixel of rounding error).
export const textMaxAutoReach = 255 / 2;
export const autoTextEffectCapability = sdfEffectCapability(textMaxAutoReach);
const textReachTiers: readonly number[] = [4, 8, 16, 32, 64, textMaxAutoReach];

/**
 * Logical pixels of outward reach, antialiasing reserve included, needed to
 * draw the given effects; `0` when none is requested. NaN needs infinite reach
 * so it is rejected rather than ignored.
 * @internal
 */
export const requiredTextEffectReach = (
  outlineWidth: number,
  shadowAlpha: number,
  shadowOffsetX: number,
  shadowOffsetY: number,
  shadowBlur: number,
): number => {
  let required = 0;

  if (outlineWidth > 0) {
    required = outlineWidth + textEffectAntialiasReserve;
  }

  if (shadowAlpha > 0) {
    required = Math.max(required, Math.max(Math.abs(shadowOffsetX), Math.abs(shadowOffsetY)) + shadowBlur + textEffectAntialiasReserve);
  }

  return Number.isNaN(required) ? Number.POSITIVE_INFINITY : required;
};

/**
 * The tier an automatic node should use: `current` or, when the requested
 * effects need more, the first larger tier that covers them (the largest tier
 * when nothing does - the capability check reports that case).
 * @internal
 */
export const textReachTierFor = (current: number, required: number): number => {
  for (const tier of textReachTiers) {
    if (tier >= current && tier >= required) {
      return tier;
    }
  }

  return Math.max(current, textMaxAutoReach);
};

const isUnitInterior = (value: number): boolean => Number.isFinite(value) && value > 0 && value < 1;

/**
 * An external BMFont atlas drawn at `fontScale` local pixels per atlas texel.
 *
 * Only declared metadata counts: the outward reach is the smaller of what the
 * encoded range covers outside the edge and the authored glyph padding, so an
 * effect can neither run past the field nor past its own glyph rectangle.
 * @internal
 */
export const bmFontEffectCapability = (fontData: BmFontData, fontScale: number, msdf: boolean): TextEffectCapability => {
  if (!msdf) {
    return colorGlyphEffectCapability;
  }

  const field = fontData.distanceField;
  const declaredZero = field?.zeroDistanceValue ?? null;
  const fillZero = declaredZero !== null && Number.isFinite(declaredZero) && declaredZero >= 0 && declaredZero <= 1 ? declaredZero : 0.5;
  const padding = fontData.padding;

  if (field?.distanceRange == null || declaredZero === null || padding === undefined) {
    return unsupported('unknown-range', fillZero);
  }

  const range = field.distanceRange;
  const minPadding = Math.min(padding.top, padding.right, padding.bottom, padding.left);

  if (!(Number.isFinite(range) && range > 0) || !isUnitInterior(declaredZero) || !(Number.isFinite(minPadding) && minPadding >= 0)) {
    return unsupported('invalid-range', fillZero);
  }

  return {
    reason: null,
    outward: Math.min(declaredZero * range, minPadding) * fontScale,
    inward: (1 - declaredZero) * range * fontScale,
    fieldScale: 1 / (range * fontScale),
    zero: declaredZero,
  };
};

const issue = (reason: TextEffectFailureReason, effect: TextEffect, required = 0, available = 0): TextEffectIssue => ({
  reason,
  effect,
  required,
  available,
});

/**
 * The first effect `capability` cannot draw, or `null`.
 *
 * An outline is requested by `outlineWidth > 0`, a shadow by
 * `shadowAlpha > 0`; offsets and blur of an invisible shadow are not checked.
 * A shadow needs its offset on each axis plus its blur inside the outward
 * reach, which also keeps every sample it takes out of neighbouring glyphs,
 * and its blur inside the inward reach so the shadow core still saturates.
 * @internal
 */
export const checkTextEffectValues = (
  capability: TextEffectCapability,
  outlineWidth: number,
  shadowAlpha: number,
  shadowOffsetX: number,
  shadowOffsetY: number,
  shadowBlur: number,
): TextEffectIssue | null => {
  const wantsOutline = outlineWidth > 0;
  const wantsShadow = shadowAlpha > 0;

  if (!wantsOutline && !wantsShadow) {
    return null;
  }

  if (capability.reason !== null) {
    return issue(capability.reason, wantsOutline ? 'outline' : 'shadow');
  }

  const available = capability.outward;

  if (wantsOutline) {
    const required = outlineWidth + textEffectAntialiasReserve;

    // Negated so NaN is rejected rather than slipping through every comparison.
    if (!(required <= available)) {
      return issue('insufficient-effect-capacity', 'outline', required, available);
    }
  }

  if (wantsShadow) {
    const required = Math.max(Math.abs(shadowOffsetX), Math.abs(shadowOffsetY)) + shadowBlur + textEffectAntialiasReserve;

    if (!(required <= available)) {
      return issue('insufficient-effect-capacity', 'shadow', required, available);
    }

    if (!(shadowBlur <= capability.inward)) {
      return issue('insufficient-effect-capacity', 'shadow', shadowBlur, capability.inward);
    }
  }

  return null;
};
