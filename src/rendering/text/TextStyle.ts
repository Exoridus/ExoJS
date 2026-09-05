import { Color } from '#core/Color';
import { assert } from '#core/dev';
import { Signal } from '#core/Signal';
import type { GradientStop } from '#rendering/gradient/Gradient';

import { cssFontString } from './canvasTextState';
import type { FontStyle, FontVariant, TextAlignment, TextTransform } from './types';

/**
 * How many stops one text gradient may carry.
 *
 * The ramp is evaluated per fragment from the node's own packed style row, so
 * the stop list has to be a fixed-size part of it rather than a texture of its
 * own. Eight covers the gradients display type actually uses; more of them
 * would cost every text node the space whether it gradients or not.
 */
export const textGradientMaxStops = 8;

/**
 * A multi-stop fill gradient for text.
 *
 * The ramp is a shader-side function of the node's ink box, not a rasterized
 * texture, so it costs no atlas work and follows the text as it re-flows.
 */
export interface TextGradient {
  /**
   * Colour stops, at most {@link textGradientMaxStops} of them. Offsets are
   * clamped to `0..1` and sorted on the way in, so the order they are written
   * in does not matter. At least two are required.
   */
  readonly stops: readonly GradientStop[];
  /**
   * Direction of the ramp in degrees, following the CSS `linear-gradient`
   * convention: `0` runs towards the top, `90` towards the right, and the
   * angle increases clockwise. Defaults to `180` - top to bottom.
   *
   * The ramp spans the ink box corner to corner along that direction, so the
   * first stop lands on the box's leading edge and the last on its trailing
   * one whatever the angle.
   */
  readonly angle?: number;
}

/** A text gradient with every optional field resolved and its stops normalized. */
export interface ResolvedTextGradient {
  readonly stops: readonly GradientStop[];
  readonly angle: number;
}

const byOffset = (left: GradientStop, right: GradientStop): number => left.offset - right.offset;

/**
 * Clone, clamp and order a gradient's stops.
 *
 * Cloned because a `Color` is mutable and a style that aliased the caller's
 * would change colour behind its back; sorted because the shader walks the
 * stops in order and cannot re-order them per fragment.
 */
const _normalizeGradient = (gradient: TextGradient): ResolvedTextGradient => {
  assert(gradient.stops.length >= 2, 'TextStyle gradient requires at least 2 colour stops.');
  assert(gradient.stops.length <= textGradientMaxStops, `TextStyle gradient accepts at most ${textGradientMaxStops} colour stops.`);

  const stops = gradient.stops
    .map(stop => {
      assert(Number.isFinite(stop.offset), 'TextStyle gradient stop offset must be a finite number.');

      return { offset: Math.min(1, Math.max(0, stop.offset)), color: stop.color.clone() };
    })
    .sort(byOffset);

  return { stops, angle: gradient.angle ?? 180 };
};

const _cloneGradient = (gradient: ResolvedTextGradient | null): ResolvedTextGradient | null =>
  gradient === null ? null : { stops: gradient.stops.map(stop => ({ offset: stop.offset, color: stop.color.clone() })), angle: gradient.angle };

/**
 * Describes how costly a style change is to incorporate.
 *
 * Hints accumulate to the heaviest pending change:
 * `tint` < `layout` < `font`
 */
export type StyleChangeHint = 'tint' | 'layout' | 'font';

/**
 * Accumulate two hints to the heavier of the two, so a pending rebuild is
 * never downgraded by a cheaper change arriving after it.
 * @internal
 */
export const mergeHint = (a: StyleChangeHint, b: StyleChangeHint): StyleChangeHint => {
  if (a === 'font' || b === 'font') return 'font';
  if (a === 'layout' || b === 'layout') return 'layout';
  return 'tint';
};

/**
 * Font weight values accepted by CSS / Canvas 2D.
 */
export type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

/**
 * Open interface for compile-time font-family autocomplete via declaration
 * merging. Register loaded font families in your app's `.d.ts`:
 *
 * ```ts
 * declare module 'exojs' {
 *   interface FontRegistry {
 *     'Kenney Future': true;
 *   }
 * }
 * ```
 */
export interface FontRegistry {}

/**
 * A CSS font-family string. When {@link FontRegistry} has entries the type
 * narrows to registered names ∪ arbitrary strings (for unregistered fonts);
 * without registry entries it falls back to plain `string`.
 */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents -- FontRegistry is empty today (keyof → never), but consumers augment it via declaration merging */
export type FontFamily = [keyof FontRegistry] extends [never] ? string : keyof FontRegistry | (string & {});
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

/**
 * Construction-time options for a {@link TextStyle}.
 * All properties are optional; defaults match the {@link TextStyle} constructor.
 */
export interface TextStyleOptions {
  /**
   * A pre-constructed {@link FontFace} to use as the font for this node.
   *
   * When passed to {@link Text}, the face is automatically registered
   * with `document.fonts`. Load the face via {@link FontFactory} before
   * constructing the node so glyphs render immediately.
   *
   * Takes precedence over `fontFamily` when both are set.
   *
   * ```ts
   * const face = await loader.load(Asset.type('font', 'roboto.woff2', { family: 'Roboto' }));
   * const label = new Text('Score: 0', { font: face, fontSize: 24 });
   * ```
   */
  font?: FontFace;
  fontFamily?: FontFamily;
  /**
   * CSS font-weight. Defaults to `'normal'` so that single-weight custom fonts
   * render without browser-synthesised bold artefacts. Set explicitly to
   * `'bold'` for display / title text that intentionally requires bold.
   */
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  /** CSS font-variant-caps. Defaults to `'normal'`. */
  fontVariant?: FontVariant;
  fontSize?: number;
  fillColor?: Color;
  outlineColor?: Color;
  /** Outline width in SDF units (0..0.5). 0 disables the outline. */
  outlineWidth?: number;
  align?: TextAlignment;
  /**
   * Case mapping applied before layout. Defaults to `'none'`.
   *
   * The mapping is Unicode-aware and never touches the node's `text`: reading
   * it back gives the string that was assigned, so a transformed label stays
   * editable and a caret still lands where the reader clicked.
   *
   * `'capitalize'` uppercases the first grapheme cluster of each word and
   * leaves the rest of the word alone, matching CSS. Word boundaries and the
   * case mapping both follow `locale` when {@link LayoutOptions.locale} sets
   * one.
   */
  textTransform?: TextTransform;
  lineHeight?: number;
  /** Extra pixel gap between lines, added on top of `lineHeight`. */
  leading?: number;

  // ── Shadow ────────────────────────────────────────────────────────────────
  /** Drop-shadow color. */
  shadowColor?: Color;
  /** Horizontal shadow offset in pixels. */
  shadowOffsetX?: number;
  /** Vertical shadow offset in pixels. */
  shadowOffsetY?: number;
  /** Shadow opacity (0..1). 0 disables the shadow. */
  shadowAlpha?: number;
  /** Shadow blur softness (0..1). Larger values soften the shadow edge. */
  shadowBlur?: number;

  // ── Decorations ───────────────────────────────────────────────────────────
  /** Draw a rule under each line. Defaults to `false`. */
  underline?: boolean;
  /** Draw a rule through each line. Defaults to `false`. */
  strikethrough?: boolean;
  /**
   * Rule colour. `null` (the default) takes the fill, gradient included, so a
   * gradient-filled label gets a gradient-filled rule.
   */
  decorationColor?: Color | null;
  /**
   * Rule thickness in pixels. `0` (the default) derives it from the font size.
   */
  decorationThickness?: number;
  /**
   * Extra downward offset in pixels applied to both rules, on top of the
   * position the font's metrics put them at. Defaults to `0`.
   */
  decorationOffset?: number;

  // ── Gradient ──────────────────────────────────────────────────────────────
  /**
   * Multi-stop fill gradient. When set it overrides `fillColor` for the glyph
   * interior; `null` disables it.
   *
   * The ramp spans the ink extent (`getLocalBounds()`), not the advance box.
   */
  gradient?: TextGradient | null;
}

/**
 * Describes how a {@link Text} node renders its string.
 *
 * Every setter marks the style dirty with a {@link StyleChangeHint} so that
 * the owning node can batch-rebuild efficiently on the next frame:
 * - `'tint'`  - only updates `Mesh.tint`, no atlas work
 * - `'layout'` - rebuilds the glyph mesh, reuses cached atlas glyphs
 * - `'font'`  - atlas lookup + full mesh rebuild
 *
 * Call {@link consumeDirty} at the start of each frame to get the accumulated
 * hint and clear the flag.
 */
export class TextStyle {
  private _dirty = false;
  private _pendingHint: StyleChangeHint = 'tint';

  /** Fires once per dirty cycle when any property changes. */
  public readonly onChange = new Signal();

  private _fontFamily: FontFamily;
  private _fontWeight: FontWeight;
  private _fontStyle: FontStyle;
  private _fontVariant: FontVariant;
  private _fontSize: number;
  private _fillColor: Color;
  private _outlineColor: Color;
  private _outlineWidth: number;
  private _align: TextAlignment;
  private _textTransform: TextTransform;
  private _lineHeight: number;
  private _leading: number;

  // Shadow
  private _shadowColor: Color;
  private _shadowOffsetX: number;
  private _shadowOffsetY: number;
  private _shadowAlpha: number;
  private _shadowBlur: number;

  // Decorations
  private _underline: boolean;
  private _strikethrough: boolean;
  private _decorationColor: Color | null;
  private _decorationThickness: number;
  private _decorationOffset: number;

  // Gradient
  private _gradient: ResolvedTextGradient | null;

  public constructor(options: TextStyleOptions = {}) {
    const explicitFace = typeof FontFace !== 'undefined' && options.font instanceof FontFace ? options.font : null;

    this._fontFamily = explicitFace ? explicitFace.family : (options.fontFamily ?? 'Arial');

    this._fontWeight = options.fontWeight ?? 'normal';
    this._fontStyle = options.fontStyle ?? 'normal';
    this._fontVariant = options.fontVariant ?? 'normal';
    this._fontSize = options.fontSize ?? 20;
    this._fillColor = options.fillColor ? options.fillColor.clone() : Color.white.clone();
    this._outlineColor = options.outlineColor ? options.outlineColor.clone() : Color.black.clone();
    this._outlineWidth = options.outlineWidth ?? 0;
    this._align = options.align ?? 'left';
    this._textTransform = options.textTransform ?? 'none';
    this._lineHeight = options.lineHeight ?? 1.2;
    this._leading = options.leading ?? 0;

    this._shadowColor = options.shadowColor ? options.shadowColor.clone() : Color.black.clone();
    this._shadowOffsetX = options.shadowOffsetX ?? 0;
    this._shadowOffsetY = options.shadowOffsetY ?? 0;
    this._shadowAlpha = options.shadowAlpha ?? 0;
    this._shadowBlur = options.shadowBlur ?? 0;

    this._underline = options.underline ?? false;
    this._strikethrough = options.strikethrough ?? false;
    this._decorationColor = options.decorationColor ? options.decorationColor.clone() : null;
    this._decorationThickness = options.decorationThickness ?? 0;
    this._decorationOffset = options.decorationOffset ?? 0;

    this._gradient = options.gradient ? _normalizeGradient(options.gradient) : null;

    // Mark dirty immediately so the first layout pass is a full rebuild.
    this._dirty = true;
    this._pendingHint = 'font';
  }

  /**
   * Returns the accumulated {@link StyleChangeHint} and clears the dirty flag,
   * or `null` if nothing has changed since the last call.
   *
   * Call this once per frame from the owning node's layout pass.
   */
  public consumeDirty(): StyleChangeHint | null {
    if (!this._dirty) return null;
    const hint = this._pendingHint;
    this._dirty = false;
    this._pendingHint = 'tint';
    return hint;
  }

  private _markDirty(hint: StyleChangeHint): void {
    this._pendingHint = mergeHint(this._pendingHint, hint);
    if (!this._dirty) {
      this._dirty = true;
      this.onChange.dispatch();
    }
  }

  // ── Font properties (hint: 'font') ─────────────────────────────────────

  public get fontFamily(): FontFamily {
    return this._fontFamily;
  }

  public set fontFamily(v: FontFace | FontFamily) {
    const family = typeof FontFace !== 'undefined' && v instanceof FontFace ? v.family : (v as FontFamily);
    if (this._fontFamily === family) return;
    this._fontFamily = family;
    this._markDirty('font');
  }

  public get fontWeight(): FontWeight {
    return this._fontWeight;
  }

  public set fontWeight(v: FontWeight) {
    if (this._fontWeight === v) return;
    this._fontWeight = v;
    this._markDirty('font');
  }

  public get fontStyle(): FontStyle {
    return this._fontStyle;
  }

  public set fontStyle(v: FontStyle) {
    if (this._fontStyle === v) return;
    this._fontStyle = v;
    this._markDirty('font');
  }

  public get fontVariant(): FontVariant {
    return this._fontVariant;
  }

  public set fontVariant(v: FontVariant) {
    if (this._fontVariant === v) return;
    this._fontVariant = v;
    this._markDirty('font');
  }

  // ── Layout properties (hint: 'layout') ─────────────────────────────────

  public get fontSize(): number {
    return this._fontSize;
  }

  public set fontSize(v: number) {
    if (this._fontSize === v) return;
    this._fontSize = v;
    this._markDirty('layout');
  }

  public get align(): TextAlignment {
    return this._align;
  }

  public set align(v: TextAlignment) {
    if (this._align === v) return;
    this._align = v;
    this._markDirty('layout');
  }

  /**
   * Case mapping applied before layout. Changing it re-flows the text; the
   * node's `text` is untouched.
   */
  public get textTransform(): TextTransform {
    return this._textTransform;
  }

  public set textTransform(v: TextTransform) {
    if (this._textTransform === v) return;
    this._textTransform = v;
    this._markDirty('layout');
  }

  public get lineHeight(): number {
    return this._lineHeight;
  }

  public set lineHeight(v: number) {
    if (this._lineHeight === v) return;
    this._lineHeight = v;
    this._markDirty('layout');
  }

  /** Extra pixel gap between lines, added on top of `lineHeight`. */
  public get leading(): number {
    return this._leading;
  }

  public set leading(v: number) {
    if (this._leading === v) return;
    this._leading = v;
    this._markDirty('layout');
  }

  // ── Tint properties (hint: 'tint') ─────────────────────────────────────

  /**
   * Runtime fill color applied as `Mesh.tint`. Glyphs are always rasterized
   * white; this color multiplies them at draw time without touching the atlas.
   */
  public get fillColor(): Color {
    return this._fillColor;
  }

  public set fillColor(v: Color) {
    this._fillColor = v.clone();
    this._markDirty('tint');
  }

  /** Outline color - used by BitmapText/SDF rendering as a shader uniform. */
  public get outlineColor(): Color {
    return this._outlineColor;
  }

  public set outlineColor(v: Color) {
    this._outlineColor = v.clone();
    this._markDirty('tint');
  }

  /** Outline width in SDF units (0..0.5). `0` disables the outline. */
  public get outlineWidth(): number {
    return this._outlineWidth;
  }

  public set outlineWidth(v: number) {
    if (this._outlineWidth === v) return;
    this._outlineWidth = v;
    this._markDirty('tint');
  }

  // ── Shadow properties (hint: 'tint') ────────────────────────────────────

  public get shadowColor(): Color {
    return this._shadowColor;
  }

  public set shadowColor(v: Color) {
    this._shadowColor = v.clone();
    this._markDirty('tint');
  }

  public get shadowOffsetX(): number {
    return this._shadowOffsetX;
  }

  public set shadowOffsetX(v: number) {
    if (this._shadowOffsetX === v) return;
    this._shadowOffsetX = v;
    this._markDirty('tint');
  }

  public get shadowOffsetY(): number {
    return this._shadowOffsetY;
  }

  public set shadowOffsetY(v: number) {
    if (this._shadowOffsetY === v) return;
    this._shadowOffsetY = v;
    this._markDirty('tint');
  }

  /** Shadow opacity (0..1). `0` disables the shadow. */
  public get shadowAlpha(): number {
    return this._shadowAlpha;
  }

  public set shadowAlpha(v: number) {
    if (this._shadowAlpha === v) return;
    this._shadowAlpha = v;
    this._markDirty('tint');
  }

  public get shadowBlur(): number {
    return this._shadowBlur;
  }

  public set shadowBlur(v: number) {
    if (this._shadowBlur === v) return;
    this._shadowBlur = v;
    this._markDirty('tint');
  }

  // ── Decoration properties ───────────────────────────────────────────────

  /** Rule under each line. Rebuilds the geometry: a rule is a quad of its own. */
  public get underline(): boolean {
    return this._underline;
  }

  public set underline(v: boolean) {
    if (this._underline === v) return;
    this._underline = v;
    this._markDirty('layout');
  }

  /** Rule through each line. */
  public get strikethrough(): boolean {
    return this._strikethrough;
  }

  public set strikethrough(v: boolean) {
    if (this._strikethrough === v) return;
    this._strikethrough = v;
    this._markDirty('layout');
  }

  /** Rule colour, or `null` to follow the fill. */
  public get decorationColor(): Color | null {
    return this._decorationColor;
  }

  public set decorationColor(v: Color | null) {
    this._decorationColor = v ? v.clone() : null;
    this._markDirty('tint');
  }

  /** Rule thickness in pixels; `0` derives it from the font size. */
  public get decorationThickness(): number {
    return this._decorationThickness;
  }

  public set decorationThickness(v: number) {
    if (this._decorationThickness === v) return;
    this._decorationThickness = v;
    this._markDirty('layout');
  }

  /** Extra downward offset in pixels applied to both rules. */
  public get decorationOffset(): number {
    return this._decorationOffset;
  }

  public set decorationOffset(v: number) {
    if (this._decorationOffset === v) return;
    this._decorationOffset = v;
    this._markDirty('layout');
  }

  // ── Gradient properties (hint: 'tint') ──────────────────────────────────

  /**
   * Multi-stop fill gradient, or `null` when the glyph interior takes
   * `fillColor`.
   *
   * Read back normalized: stops cloned, offsets clamped to `0..1` and sorted,
   * `angle` resolved. Assigning re-normalizes, so the object handed in is
   * never aliased and mutating it afterwards changes nothing.
   */
  public get gradient(): ResolvedTextGradient | null {
    return this._gradient;
  }

  public set gradient(v: TextGradient | null) {
    this._gradient = v ? _normalizeGradient(v) : null;
    this._markDirty('tint');
  }

  // ── Derived properties ──────────────────────────────────────────────────

  /**
   * CSS `font` shorthand used as `CanvasRenderingContext2D.font` during glyph
   * rasterization.
   */
  public get font(): string {
    return cssFontString(this._fontFamily, this._fontStyle, this._fontVariant, this._fontWeight, this._fontSize);
  }

  // ── Clone / copy ────────────────────────────────────────────────────────

  /** Copy all properties from `style` into this instance and return `this`. */
  public copy(style: TextStyle): this {
    if (style !== this) {
      this._fontFamily = style._fontFamily;
      this._fontWeight = style._fontWeight;
      this._fontStyle = style._fontStyle;
      this._fontVariant = style._fontVariant;
      this._fontSize = style._fontSize;
      this._fillColor = style._fillColor.clone();
      this._outlineColor = style._outlineColor.clone();
      this._outlineWidth = style._outlineWidth;
      this._align = style._align;
      this._textTransform = style._textTransform;
      this._lineHeight = style._lineHeight;
      this._leading = style._leading;
      this._shadowColor = style._shadowColor.clone();
      this._shadowOffsetX = style._shadowOffsetX;
      this._shadowOffsetY = style._shadowOffsetY;
      this._shadowAlpha = style._shadowAlpha;
      this._shadowBlur = style._shadowBlur;
      this._underline = style._underline;
      this._strikethrough = style._strikethrough;
      this._decorationColor = style._decorationColor ? style._decorationColor.clone() : null;
      this._decorationThickness = style._decorationThickness;
      this._decorationOffset = style._decorationOffset;
      this._gradient = _cloneGradient(style._gradient);
      this._markDirty('font');
    }
    return this;
  }

  /** Return a new {@link TextStyle} with all properties copied from this one. */
  public clone(): TextStyle {
    const s = new TextStyle();
    s._fontFamily = this._fontFamily;
    s._fontWeight = this._fontWeight;
    s._fontStyle = this._fontStyle;
    s._fontVariant = this._fontVariant;
    s._fontSize = this._fontSize;
    s._fillColor = this._fillColor.clone();
    s._outlineColor = this._outlineColor.clone();
    s._outlineWidth = this._outlineWidth;
    s._align = this._align;
    s._textTransform = this._textTransform;
    s._lineHeight = this._lineHeight;
    s._leading = this._leading;
    s._shadowColor = this._shadowColor.clone();
    s._shadowOffsetX = this._shadowOffsetX;
    s._shadowOffsetY = this._shadowOffsetY;
    s._shadowAlpha = this._shadowAlpha;
    s._shadowBlur = this._shadowBlur;
    s._underline = this._underline;
    s._strikethrough = this._strikethrough;
    s._decorationColor = this._decorationColor ? this._decorationColor.clone() : null;
    s._decorationThickness = this._decorationThickness;
    s._decorationOffset = this._decorationOffset;
    s._gradient = _cloneGradient(this._gradient);
    s._dirty = true;
    s._pendingHint = 'font';
    return s;
  }
}
