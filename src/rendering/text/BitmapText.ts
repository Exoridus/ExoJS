import { assert } from '#core/dev';
import { logger } from '#core/logging';
import type { Texture } from '#rendering/texture/Texture';

import { AbstractText } from './AbstractText';
import type { BmFontData } from './BmFont';
import { type BmFont } from './BmFont';
import type { LayoutOptions } from './LayoutOptions';
import { emptyTextLayout, layoutText } from './TextLayout';
import type { TextStyleOptions } from './TextStyle';
import { TextStyle } from './TextStyle';
import type { GlyphInfo, GlyphProvider, TextLayoutResult, TextLayoutStyle, TextSize } from './types';

export type { BmFontChar, BmFontData } from './BmFont';

// ── BitmapTextOptions ─────────────────────────────────────────────────────────

export interface BitmapTextOptions extends TextStyleOptions {
  /** Scale applied uniformly to all glyph metrics. Defaults to 1. */
  scale?: number;
  /**
   * Set to `true` if the atlas was produced by `msdf-atlas-gen` (MSDF).
   * Selects the `text-msdf` shader which applies the median SDF formula.
   * Defaults to `false` (colour/RGBA atlas).
   */
  msdf?: boolean;
  /** Layout options forwarded to the text layout engine. */
  layout?: LayoutOptions;
}

// ── BmFontAdapter ─────────────────────────────────────────────────────────────

/**
 * Adapts {@link BmFontData} to the {@link GlyphProvider} interface consumed
 * by {@link layoutText}.
 *
 * - `getGlyph()` maps BMFont metrics to {@link GlyphInfo} using bearings that
 *   place each glyph correctly relative to its line's Y origin.
 * - `getKerning()` looks up the BMFont kerning table.
 *
 * @internal
 */
export class BmFontAdapter implements GlyphProvider {
  private readonly _fontData: BmFontData;
  private readonly _textures: readonly Texture[];
  private readonly _scale: number;
  /** Fallback advance for characters not present in the font (≈ ½ line height). */
  private readonly _fallbackAdvance: number;
  /** Identifier used as part of the log dedup key — derived from the first page filename. */
  private readonly _fontId: string;

  public constructor(fontData: BmFontData, textures: readonly Texture[], scale: number) {
    this._fontData = fontData;
    this._textures = textures;
    this._scale = scale;
    this._fallbackAdvance = fontData.lineHeight * scale * 0.5;
    this._fontId = fontData.pages[0] ?? 'unknown';
  }

  public getGlyph(char: string, _fontSize: number): GlyphInfo {
    const cp = char.codePointAt(0) ?? 0;
    const g = this._fontData.chars.get(cp);
    const s = this._scale;
    const lh = this._fontData.lineHeight;
    const base = this._fontData.base;

    if (g === undefined) {
      // Unknown glyph — warn once per font + codepoint, then return an invisible
      // placeholder with a cursor advance so layout still makes progress.
      if (__DEV__) {
        logger.warn(`missing glyph U+${cp.toString(16).toUpperCase().padStart(4, '0')} ('${char}') in "${this._fontId}"`, {
          source: 'BitmapText',
          once: `bitmaptext:${this._fontId}:${cp}`,
        });
      }
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        advance: this._fallbackAdvance,
        ascent: 0,
        page: 0,
        uvLeft: 0,
        uvTop: 0,
        uvRight: 0,
        uvBottom: 0,
      };
    }

    assert(
      g.page < this._textures.length,
      `BitmapText: glyph page index ${g.page} is out of range — font "${this._fontId}" has ${this._textures.length} page(s)`,
    );
    const texW = this._textures[g.page]?.width ?? 1;
    const texH = this._textures[g.page]?.height ?? 1;

    return {
      x: g.x,
      y: g.y,
      width: g.width * s,
      height: g.height * s,
      advance: g.xAdvance * s,
      ascent: 0,
      page: g.page,
      uvLeft: g.x / texW,
      uvTop: g.y / texH,
      uvRight: (g.x + g.width) / texW,
      uvBottom: (g.y + g.height) / texH,
      // xBearing shifts the quad right by the glyph's left bearing so the
      // visual left edge aligns with the cursor.
      xBearing: g.xOffset * s,
      // yBearing places the glyph so its top is at lineY + lineHeight + yOffset - base.
      // This matches the BMFont convention: yOffset is relative to the line top,
      // and adding lineHeight gives one full line of descent before the glyph top.
      yBearing: (g.yOffset - base) * s + lh * s,
    };
  }

  public getKerning(prev: string, next: string, _fontSize: number): number {
    const a = prev.codePointAt(0);
    const b = next.codePointAt(0);
    if (a === undefined || b === undefined) return 0;
    return (this._fontData.kernings.get(`${a},${b}`) ?? 0) * this._scale;
  }
}

// ── BitmapText ────────────────────────────────────────────────────────────────

/**
 * Text node that renders from an offline-generated atlas — either a BMFont
 * (AngelCode .fnt + .png) or an MSDF atlas (msdf-atlas-gen + .json).
 *
 * The atlas is pre-built so there is no runtime Canvas 2D rasterisation.
 * All layout features (alignment, word-wrap, justify, leading, breakWords,
 * whiteSpace, letterSpacing) and kerning pairs from the descriptor are fully
 * supported. Outline effects are handled as shader uniforms — no extra draw
 * calls, no atlas rebuilds.
 *
 * ## Usage
 *
 * ```ts
 * const font  = await loader.load(Asset.type('bmFont', 'fonts/ui.fnt')); // BmFont, no setup needed
 * const label = new BitmapText('Score: 0', font, { msdf: true });
 * scene.addChild(label);
 *
 * label.text         = 'Score: 42';  // cheap — marks the geometry stale
 * label.style.align  = 'center';     // cheap — same pending pass
 * ```
 *
 * Mutating any number of properties in the same frame is cheap; the geometry
 * is rebuilt at most once, on demand.
 * @stable
 */
export class BitmapText extends AbstractText {
  private _font: BmFont;
  private _fontScale: number;
  private _msdf: boolean;
  private _adapter: BmFontAdapter;

  public constructor(text: string, font: BmFont, options: BitmapTextOptions = {}) {
    super(text, new TextStyle(options), options.layout ?? {});
    this._font = font;
    this._fontScale = options.scale ?? 1;
    this._msdf = options.msdf ?? false;
    this._adapter = new BmFontAdapter(font.fontData, font.textures, this._fontScale);
  }

  /**
   * Advance extent `text` would occupy in `font` under `options`, without
   * constructing a node. Takes the same arguments as the constructor and gives
   * the same answer as the resulting node's `textBounds` — it runs the
   * identical layout pass against an adapter built the same way, so the two
   * cannot drift.
   *
   * Unlike {@link Text.measure} this costs nothing beyond the layout itself:
   * a BMFont atlas is pre-built, so there is no glyph to rasterize.
   * @stable
   */
  public static measure(text: string, font: BmFont, options: BitmapTextOptions = {}): TextSize {
    if (text.length === 0) return { width: 0, height: 0 };

    const scale = options.scale ?? 1;
    const style = new TextStyle(options);
    const adapter = new BmFontAdapter(font.fontData, font.textures, scale);

    return layoutText(text, BitmapText._layoutStyle(font, scale, style), options.layout ?? {}, adapter).advance;
  }

  /**
   * The BMFont descriptor rendered as a {@link TextLayoutStyle}.
   *
   * Setting `fontSize` to `lineHeight * scale` makes the layout engine's
   * computed line height equal the font's native one multiplied by
   * `style.lineHeight`. Shared with {@link measure} so a measurement cannot
   * derive it differently from a node.
   */
  private static _layoutStyle(font: BmFont, scale: number, style: TextStyle): TextLayoutStyle {
    return {
      fontSize: font.fontData.lineHeight * scale,
      lineHeight: style.lineHeight,
      leading: style.leading,
      align: style.align,
    };
  }

  // ── Style ─────────────────────────────────────────────────────────────────

  /** Visual style — `align`, `leading`, `fillColor`, `outlineColor` etc. */
  public get style(): TextStyle {
    return this._style;
  }

  public set style(v: TextStyle | TextStyleOptions) {
    this._replaceStyle(v instanceof TextStyle ? v : new TextStyle(v));
  }

  /** Scale factor applied to all glyph metrics from the font descriptor. */
  public get fontScale(): number {
    return this._fontScale;
  }

  public set fontScale(v: number) {
    if (this._fontScale === v) return;
    this._fontScale = v;
    this._adapter = new BmFontAdapter(this._font.fontData, this._font.textures, v);
    this._markDirty('font');
  }

  // ── Read-only state ───────────────────────────────────────────────────────

  /** `true` when the atlas was produced by `msdf-atlas-gen`. */
  public get msdf(): boolean {
    return this._msdf;
  }

  /** The {@link BmFont} this text renders from. Replace via {@link setFont}. */
  public get font(): BmFont {
    return this._font;
  }

  /** The page textures this node draws from. */
  public get textures(): readonly Texture[] {
    return this._font.textures;
  }

  // ── Font replacement ──────────────────────────────────────────────────────

  /** Replace the font and mark the geometry stale. */
  public setFont(font: BmFont): void {
    this._font = font;
    this._adapter = new BmFontAdapter(font.fontData, font.textures, this._fontScale);
    this._markDirty('font');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  protected override _runLayout(): TextLayoutResult {
    if (this._text.length === 0) return emptyTextLayout();

    return layoutText(this._text, BitmapText._layoutStyle(this._font, this._fontScale, this._style), this._layout, this._adapter);
  }
}
