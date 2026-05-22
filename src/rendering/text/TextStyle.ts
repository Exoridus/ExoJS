import { Color } from '@/core/Color';
import { Signal } from '@/core/Signal';

import type { TextAlignment } from './types';

export type GradientAxis = 'vertical' | 'horizontal';

/**
 * Describes how costly a style change is to incorporate.
 *
 * Hints accumulate to the heaviest pending change:
 * `tint` < `layout` < `font`
 */
export type StyleChangeHint = 'tint' | 'layout' | 'font';

function mergeHint(a: StyleChangeHint, b: StyleChangeHint): StyleChangeHint {
  if (a === 'font' || b === 'font') return 'font';
  if (a === 'layout' || b === 'layout') return 'layout';
  return 'tint';
}

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
 *     'AndyBold': true;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FontRegistry {}

/**
 * A CSS font-family string. When {@link FontRegistry} has entries the type
 * narrows to registered names ∪ arbitrary strings (for unregistered fonts);
 * without registry entries it falls back to plain `string`.
 */
export type FontFamily =
  keyof FontRegistry extends never
    ? string
    : keyof FontRegistry | (string & {});

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
   * const face = await loader.load(FontFactory, 'roboto.woff2', { family: 'Roboto' });
   * const label = new Text('Score: 0', { font: face, fontSize: 24 });
   * ```
   */
  font?: FontFace;
  fontFamily?: FontFamily;
  fontWeight?: FontWeight;
  fontStyle?: 'normal' | 'italic';
  fontSize?: number;
  fillColor?: Color;
  outlineColor?: Color;
  /** Outline width in SDF units (0..0.5). 0 disables the outline. */
  outlineWidth?: number;
  align?: TextAlignment;
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

  // ── Gradient ──────────────────────────────────────────────────────────────
  /**
   * Two-stop fill gradient `[top, bottom]`. When set, overrides `fillColor`
   * for the glyph interior. `null` disables the gradient.
   */
  gradientColors?: [Color, Color] | null;
  /** Gradient orientation. Defaults to `'vertical'`. */
  gradientAxis?: GradientAxis;
}

/**
 * Describes how a {@link Text} node renders its string.
 *
 * Every setter marks the style dirty with a {@link StyleChangeHint} so that
 * the owning node can batch-rebuild efficiently on the next frame:
 * - `'tint'`  — only updates `Mesh.tint`, no atlas work
 * - `'layout'` — rebuilds the glyph mesh, reuses cached atlas glyphs
 * - `'font'`  — atlas lookup + full mesh rebuild
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
  private _fontStyle: 'normal' | 'italic';
  private _fontSize: number;
  private _fillColor: Color;
  private _outlineColor: Color;
  private _outlineWidth: number;
  private _align: TextAlignment;
  private _lineHeight: number;
  private _leading: number;

  // Shadow
  private _shadowColor: Color;
  private _shadowOffsetX: number;
  private _shadowOffsetY: number;
  private _shadowAlpha: number;
  private _shadowBlur: number;

  // Gradient
  private _gradientColors: [Color, Color] | null;
  private _gradientAxis: GradientAxis;

  public constructor(options: TextStyleOptions = {}) {
    const explicitFace =
      typeof FontFace !== 'undefined' && options.font instanceof FontFace
        ? options.font
        : null;

    this._fontFamily = explicitFace
      ? explicitFace.family
      : (options.fontFamily ?? 'Arial');

    this._fontWeight = options.fontWeight ?? 'bold';
    this._fontStyle = options.fontStyle ?? 'normal';
    this._fontSize = options.fontSize ?? 20;
    this._fillColor = options.fillColor ? options.fillColor.clone() : Color.white.clone();
    this._outlineColor = options.outlineColor ? options.outlineColor.clone() : Color.black.clone();
    this._outlineWidth = options.outlineWidth ?? 0;
    this._align = options.align ?? 'left';
    this._lineHeight = options.lineHeight ?? 1.2;
    this._leading = options.leading ?? 0;

    this._shadowColor = options.shadowColor ? options.shadowColor.clone() : Color.black.clone();
    this._shadowOffsetX = options.shadowOffsetX ?? 0;
    this._shadowOffsetY = options.shadowOffsetY ?? 0;
    this._shadowAlpha = options.shadowAlpha ?? 0;
    this._shadowBlur = options.shadowBlur ?? 0;

    this._gradientColors = options.gradientColors
      ? [options.gradientColors[0].clone(), options.gradientColors[1].clone()]
      : null;
    this._gradientAxis = options.gradientAxis ?? 'vertical';

    // Mark dirty immediately so the first update() triggers a full rebuild.
    this._dirty = true;
    this._pendingHint = 'font';
  }

  /**
   * Returns the accumulated {@link StyleChangeHint} and clears the dirty flag,
   * or `null` if nothing has changed since the last call.
   *
   * Call this once per frame from the owning node's `update()` method.
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

  public get fontStyle(): 'normal' | 'italic' {
    return this._fontStyle;
  }

  public set fontStyle(v: 'normal' | 'italic') {
    if (this._fontStyle === v) return;
    this._fontStyle = v;
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

  /** Outline color — used by BitmapText/SDF rendering as a shader uniform. */
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

  // ── Gradient properties (hint: 'tint') ──────────────────────────────────

  /**
   * Two-stop fill gradient `[top, bottom]`. When set, overrides `fillColor`
   * for the glyph interior. Assign `null` to disable.
   */
  public get gradientColors(): [Color, Color] | null {
    return this._gradientColors;
  }

  public set gradientColors(v: [Color, Color] | null) {
    this._gradientColors = v ? [v[0].clone(), v[1].clone()] : null;
    this._markDirty('tint');
  }

  public get gradientAxis(): GradientAxis {
    return this._gradientAxis;
  }

  public set gradientAxis(v: GradientAxis) {
    if (this._gradientAxis === v) return;
    this._gradientAxis = v;
    this._markDirty('tint');
  }

  // ── Derived properties ──────────────────────────────────────────────────

  /**
   * CSS font string used as `CanvasRenderingContext2D.font` during glyph
   * rasterization. Includes `fontStyle` so italic fonts render correctly.
   */
  public get font(): string {
    const style = this._fontStyle !== 'normal' ? `${this._fontStyle} ` : '';
    return `${style}${this._fontWeight} ${this._fontSize}px ${this._fontFamily}`;
  }

  // ── Clone / copy ────────────────────────────────────────────────────────

  /** Copy all properties from `style` into this instance and return `this`. */
  public copy(style: TextStyle): this {
    if (style !== this) {
      this._fontFamily = style._fontFamily;
      this._fontWeight = style._fontWeight;
      this._fontStyle = style._fontStyle;
      this._fontSize = style._fontSize;
      this._fillColor = style._fillColor.clone();
      this._outlineColor = style._outlineColor.clone();
      this._outlineWidth = style._outlineWidth;
      this._align = style._align;
      this._lineHeight = style._lineHeight;
      this._leading = style._leading;
      this._shadowColor = style._shadowColor.clone();
      this._shadowOffsetX = style._shadowOffsetX;
      this._shadowOffsetY = style._shadowOffsetY;
      this._shadowAlpha = style._shadowAlpha;
      this._shadowBlur = style._shadowBlur;
      this._gradientColors = style._gradientColors
        ? [style._gradientColors[0].clone(), style._gradientColors[1].clone()]
        : null;
      this._gradientAxis = style._gradientAxis;
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
    s._fontSize = this._fontSize;
    s._fillColor = this._fillColor.clone();
    s._outlineColor = this._outlineColor.clone();
    s._outlineWidth = this._outlineWidth;
    s._align = this._align;
    s._lineHeight = this._lineHeight;
    s._leading = this._leading;
    s._shadowColor = this._shadowColor.clone();
    s._shadowOffsetX = this._shadowOffsetX;
    s._shadowOffsetY = this._shadowOffsetY;
    s._shadowAlpha = this._shadowAlpha;
    s._shadowBlur = this._shadowBlur;
    s._gradientColors = this._gradientColors
      ? [this._gradientColors[0].clone(), this._gradientColors[1].clone()]
      : null;
    s._gradientAxis = this._gradientAxis;
    s._dirty = true;
    s._pendingHint = 'font';
    return s;
  }
}
