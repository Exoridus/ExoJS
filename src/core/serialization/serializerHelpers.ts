import { Color } from '#core/Color';
import type { LayoutOptions } from '#rendering/text/LayoutOptions';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

import { FONT_WEIGHTS, readBoolean, readEnum, readNumber, TEXT_ALIGNMENTS } from './read';

// ── Options bags ───────────────────────────────────────────────────────────────

/**
 * Return a shallow copy of `options` with every `undefined`-valued key removed,
 * so an optional property is *omitted* rather than set to `undefined`. Lets a
 * deserializer build an options bag from sparse JSON without forcing a default
 * past a constructor's own `?? default` (and stays valid under
 * `exactOptionalPropertyTypes`).
 */
export function compact<T extends object>(options: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) out[key] = value;
  }

  return out as { [K in keyof T]: Exclude<T[K], undefined> };
}

// ── Colour ───────────────────────────────────────────────────────────────────

/** Serialize a colour to `[r, g, b, a]` (r/g/b 0..255, a 0..1). */
export const colorToArray = (color: Color): [number, number, number, number] => [color.r, color.g, color.b, color.a];

/** Deserialize a `[r, g, b, a]` tuple back to a {@link Color}, or `undefined`. */
export const arrayToColor = (value: unknown): Color | undefined =>
  Array.isArray(value) && value.length === 4 ? new Color(Number(value[0]), Number(value[1]), Number(value[2]), Number(value[3])) : undefined;

const colorEquals = (color: Color, r: number, g: number, b: number, a: number): boolean => color.r === r && color.g === g && color.b === b && color.a === a;

// ── TextStyle ────────────────────────────────────────────────────────────────

/** Serialize the plain-data fields of a {@link TextStyle}, omitting defaults. */
export function serializeStyle(style: {
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  fontSize: number;
  fillColor: Color;
  outlineColor: Color;
  outlineWidth: number;
  align: string;
  lineHeight: number;
  leading: number;
  shadowColor: Color;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowAlpha: number;
  shadowBlur: number;
  gradientColors: [Color, Color] | null;
  gradientAxis: string;
}): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};

  if (style.fontFamily !== 'Arial') out.fontFamily = style.fontFamily;
  if (style.fontWeight !== 'normal') out.fontWeight = style.fontWeight;
  if (style.fontStyle !== 'normal') out.fontStyle = style.fontStyle;
  if (style.fontSize !== 20) out.fontSize = style.fontSize;
  if (!colorEquals(style.fillColor, 255, 255, 255, 1)) out.fillColor = colorToArray(style.fillColor);
  if (!colorEquals(style.outlineColor, 0, 0, 0, 1)) out.outlineColor = colorToArray(style.outlineColor);
  if (style.outlineWidth !== 0) out.outlineWidth = style.outlineWidth;
  if (style.align !== 'left') out.align = style.align;
  if (style.lineHeight !== 1.2) out.lineHeight = style.lineHeight;
  if (style.leading !== 0) out.leading = style.leading;
  if (!colorEquals(style.shadowColor, 0, 0, 0, 1)) out.shadowColor = colorToArray(style.shadowColor);
  if (style.shadowOffsetX !== 0) out.shadowOffsetX = style.shadowOffsetX;
  if (style.shadowOffsetY !== 0) out.shadowOffsetY = style.shadowOffsetY;
  if (style.shadowAlpha !== 0) out.shadowAlpha = style.shadowAlpha;
  if (style.shadowBlur !== 0) out.shadowBlur = style.shadowBlur;

  if (style.gradientColors !== null) {
    out.gradientColors = [colorToArray(style.gradientColors[0]), colorToArray(style.gradientColors[1])];
  }

  if (style.gradientAxis !== 'vertical') out.gradientAxis = style.gradientAxis;

  return Object.keys(out).length > 0 ? out : undefined;
}

/** Rebuild {@link TextStyleOptions} from serialized style data, or `undefined`. */
export function deserializeStyleOptions(data: unknown): TextStyleOptions | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  const source = data as Record<string, unknown>;
  const options: TextStyleOptions = {};

  if (typeof source.fontFamily === 'string') options.fontFamily = source.fontFamily;

  const fontWeight = readEnum(source, 'fontWeight', FONT_WEIGHTS);
  if (fontWeight !== undefined) options.fontWeight = fontWeight;

  if (source.fontStyle === 'italic' || source.fontStyle === 'normal') options.fontStyle = source.fontStyle;
  if (typeof source.fontSize === 'number') options.fontSize = source.fontSize;

  const fillColor = arrayToColor(source.fillColor);
  if (fillColor !== undefined) options.fillColor = fillColor;

  const outlineColor = arrayToColor(source.outlineColor);
  if (outlineColor !== undefined) options.outlineColor = outlineColor;

  if (typeof source.outlineWidth === 'number') options.outlineWidth = source.outlineWidth;

  const align = readEnum(source, 'align', TEXT_ALIGNMENTS);
  if (align !== undefined) options.align = align;

  if (typeof source.lineHeight === 'number') options.lineHeight = source.lineHeight;
  if (typeof source.leading === 'number') options.leading = source.leading;

  const shadowColor = arrayToColor(source.shadowColor);
  if (shadowColor !== undefined) options.shadowColor = shadowColor;

  if (typeof source.shadowOffsetX === 'number') options.shadowOffsetX = source.shadowOffsetX;
  if (typeof source.shadowOffsetY === 'number') options.shadowOffsetY = source.shadowOffsetY;
  if (typeof source.shadowAlpha === 'number') options.shadowAlpha = source.shadowAlpha;
  if (typeof source.shadowBlur === 'number') options.shadowBlur = source.shadowBlur;

  if (Array.isArray(source.gradientColors) && source.gradientColors.length === 2) {
    const top = arrayToColor(source.gradientColors[0]);
    const bottom = arrayToColor(source.gradientColors[1]);

    if (top !== undefined && bottom !== undefined) {
      options.gradientColors = [top, bottom];
    }
  }

  if (source.gradientAxis === 'horizontal' || source.gradientAxis === 'vertical') {
    options.gradientAxis = source.gradientAxis;
  }

  return options;
}

// ── LayoutOptions ─────────────────────────────────────────────────────────────

const OVERFLOWS = ['visible', 'clip', 'ellipsis'] as const satisfies ReadonlyArray<NonNullable<LayoutOptions['overflow']>>;
const DIRECTIONS = ['ltr', 'rtl'] as const satisfies ReadonlyArray<NonNullable<LayoutOptions['direction']>>;
const WHITE_SPACES = ['normal', 'pre', 'pre-line'] as const satisfies ReadonlyArray<NonNullable<LayoutOptions['whiteSpace']>>;

/**
 * Rebuild {@link LayoutOptions} from a serialized layout object, dropping
 * unknown or mistyped fields. Returns `undefined` when nothing valid remains,
 * so a corrupt `layout` value degrades to the node's constructor defaults.
 */
export function readLayoutOptions(value: unknown): LayoutOptions | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const out: LayoutOptions = {};

  const maxWidth = readNumber(source, 'maxWidth');
  if (maxWidth !== undefined) out.maxWidth = maxWidth;

  const maxHeight = readNumber(source, 'maxHeight');
  if (maxHeight !== undefined) out.maxHeight = maxHeight;

  const overflow = readEnum(source, 'overflow', OVERFLOWS);
  if (overflow !== undefined) out.overflow = overflow;

  const letterSpacing = readNumber(source, 'letterSpacing');
  if (letterSpacing !== undefined) out.letterSpacing = letterSpacing;

  const direction = readEnum(source, 'direction', DIRECTIONS);
  if (direction !== undefined) out.direction = direction;

  const breakWords = readBoolean(source, 'breakWords');
  if (breakWords !== undefined) out.breakWords = breakWords;

  const whiteSpace = readEnum(source, 'whiteSpace', WHITE_SPACES);
  if (whiteSpace !== undefined) out.whiteSpace = whiteSpace;

  return Object.keys(out).length > 0 ? out : undefined;
}
