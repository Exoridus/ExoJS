import { logger } from '#core/Logger';
import type { BmFontData } from '#rendering/text/BmFont';
import { TextEffectError } from '#rendering/text/TextEffectError';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

/** First serialization version whose text outline and shadow lengths are logical pixels. @internal */
export const textEffectPixelVersion = 4;

/**
 * How a node drew its effects before {@link textEffectPixelVersion}.
 * @internal
 */
export type LegacyTextEffectSource =
  | { readonly kind: 'sdf'; readonly sdfRadius: number; readonly colorGlyphs: boolean }
  | { readonly kind: 'bmFont'; readonly fontData: BmFontData; readonly fontScale: number; readonly msdf: boolean };

/**
 * Rewrite the effect lengths of a style read from a document older than
 * {@link textEffectPixelVersion} into logical pixels, reproducing where the
 * old shader put each edge. Returns a new object; `options` is not touched.
 *
 * The old values were thresholds in the sampled distance field: an outline
 * ended at field value `max(0, 0.5 - outlineWidth)` and a shadow edge ramped
 * over `shadowBlur * 0.1` field units, while a BitmapText shadow offset was
 * counted in atlas texels. A runtime SDF field moved by `1 / sdfRadius` per
 * logical pixel and ended `sdfRadius / 2` pixels outside the glyph, so a
 * saturated outline becomes exactly that visible width. An external MSDF
 * field needs its declared range and zero value; an active effect on a font
 * without them has no pixel meaning and throws {@link TextEffectError}.
 * Effects on colour glyphs never rendered, so they are switched off rather
 * than made visible, and lengths with no pixel meaning reset to `0`.
 * @internal
 */
export const migrateLegacyTextEffects = (options: TextStyleOptions, source: LegacyTextEffectSource, version: number): TextStyleOptions => {
  const outline = options.outlineWidth ?? 0;
  const blur = options.shadowBlur ?? 0;
  const outlineActive = outline > 0;
  const shadowActive = (options.shadowAlpha ?? 0) > 0;
  const migrated: TextStyleOptions = { ...options };

  if (source.kind === 'sdf') {
    setLength(migrated, 'outlineWidth', Math.min(outline, 0.5) * source.sdfRadius);
    setLength(migrated, 'shadowBlur', blur * 0.1 * source.sdfRadius);

    if (source.colorGlyphs) {
      deactivateInertEffects(migrated, outlineActive, shadowActive, 'Text', version);
    }

    return migrated;
  }

  const { fontData, fontScale, msdf } = source;

  scaleOffset(migrated, 'shadowOffsetX', fontScale);
  scaleOffset(migrated, 'shadowOffsetY', fontScale);

  if (!msdf) {
    setLength(migrated, 'outlineWidth', 0);
    setLength(migrated, 'shadowBlur', 0);
    deactivateInertEffects(migrated, outlineActive, shadowActive, 'BitmapText', version);

    return migrated;
  }

  const range = fontData.distanceField?.distanceRange ?? null;
  const zero = fontData.distanceField?.zeroDistanceValue ?? null;

  if (range === null || zero === null || !(range > 0 && Number.isFinite(range)) || !(zero > 0 && zero < 1)) {
    if (outlineActive || shadowActive) {
      throw new TextEffectError(
        {
          reason: range === null || zero === null ? 'unknown-range' : 'invalid-range',
          effect: outlineActive ? 'outline' : 'shadow',
          required: 0,
          available: 0,
        },
        `BitmapText in a version ${version} document`,
      );
    }

    setLength(migrated, 'outlineWidth', 0);
    setLength(migrated, 'shadowBlur', 0);

    return migrated;
  }

  const texelsToPixels = range * fontScale;

  setLength(migrated, 'outlineWidth', outlineActive ? Math.max(0, zero - Math.max(0, 0.5 - outline)) * texelsToPixels : 0);
  setLength(migrated, 'shadowBlur', blur * 0.1 * texelsToPixels);

  return migrated;
};

const setLength = (options: TextStyleOptions, key: 'outlineWidth' | 'shadowBlur', value: number): void => {
  if (options[key] !== undefined) {
    options[key] = value;
  }
};

const scaleOffset = (options: TextStyleOptions, key: 'shadowOffsetX' | 'shadowOffsetY', fontScale: number): void => {
  const value = options[key];

  if (value !== undefined) {
    options[key] = value * fontScale;
  }
};

const deactivateInertEffects = (
  options: TextStyleOptions,
  outlineActive: boolean,
  shadowActive: boolean,
  node: string,
  version: number,
): void => {
  if (!outlineActive && !shadowActive) {
    return;
  }

  if (outlineActive) {
    options.outlineWidth = 0;
  }

  if (shadowActive) {
    options.shadowAlpha = 0;
  }

  if (__DEV__) {
    logger.warn(
      `A version ${version} ${node} with colour glyphs declared an outline or shadow it never drew; ` +
        'the effect is switched off because colour glyphs carry no distance field.',
      { source: 'serialization', once: `text-effect-migration:${node}` },
    );
  }
};
