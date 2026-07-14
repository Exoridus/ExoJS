import { assert } from '#core/dev';
import { logger } from '#core/logging';
import type { Texture } from '#rendering/texture/Texture';

import { AbstractText } from './AbstractText';
import type { BmFontData } from './BmFont';
import { type BmFont } from './BmFont';
import type { LayoutOptions } from './LayoutOptions';
import { buildTextPageQuads, layoutText } from './TextLayout';
import type { TextStyleOptions } from './TextStyle';
import { TextStyle } from './TextStyle';
import type { GlyphInfo, GlyphProvider, TextLayoutStyle, TextPageQuads, TextSize } from './types';

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
 * const font  = await loader.load('fonts/ui.fnt');   // BmFont, no setup needed
 * const label = new BitmapText('Score: 0', font, { msdf: true });
 * scene.addChild(label);
 *
 * label.text         = 'Score: 42';  // instant geometry rebuild
 * label.style.align  = 'center';     // immediate rebuild
 * ```
 * @stable
 */
export class BitmapText extends AbstractText {
  private _font: BmFont;
  private _fontScale: number;
  private _msdf: boolean;
  private _style: TextStyle;
  private _layout: LayoutOptions;

  /** Per-page quad geometry consumed by the text renderer. */
  private _pageQuads: TextPageQuads[] = [];
  private _textBounds: TextSize = { width: 0, height: 0 };
  private _adapter: BmFontAdapter;

  public constructor(text: string, font: BmFont, options: BitmapTextOptions = {}) {
    super(text);
    this._font = font;
    this._fontScale = options.scale ?? 1;
    this._msdf = options.msdf ?? false;
    this._style = new TextStyle(options);
    this._layout = options.layout ?? {};
    this._adapter = new BmFontAdapter(font.fontData, font.textures, this._fontScale);
    this._rebuild();
  }

  // ── Text ──────────────────────────────────────────────────────────────────

  public override get text(): string {
    return this._text;
  }

  public override set text(v: string) {
    if (this._text === v) return;
    this._text = v;
    this._rebuild();
  }

  // ── Style & layout ────────────────────────────────────────────────────────

  /** Visual style — `align`, `leading`, `fillColor`, `outlineColor` etc. */
  public get style(): TextStyle {
    return this._style;
  }

  public set style(v: TextStyle | TextStyleOptions) {
    this._style = v instanceof TextStyle ? v : new TextStyle(v);
    this._rebuild();
  }

  /** Flow-control options — `maxWidth`, `letterSpacing`, `whiteSpace` etc. */
  public get layout(): LayoutOptions {
    return this._layout;
  }

  public set layout(v: LayoutOptions) {
    this._layout = v;
    this._rebuild();
  }

  /** Scale factor applied to all glyph metrics from the font descriptor. */
  public get fontScale(): number {
    return this._fontScale;
  }

  public set fontScale(v: number) {
    if (this._fontScale === v) return;
    this._fontScale = v;
    this._adapter = new BmFontAdapter(this._font.fontData, this._font.textures, v);
    this._rebuild();
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

  /** Per-page quad data consumed by the text renderer. */
  public get pageQuads(): readonly TextPageQuads[] {
    return this._pageQuads;
  }

  public override get textBounds(): TextSize {
    return this._textBounds;
  }

  /** The page textures this node draws from. */
  public get textures(): readonly Texture[] {
    return this._font.textures;
  }

  // ── Font replacement ──────────────────────────────────────────────────────

  /** Replace the font and rebuild the geometry. */
  public setFont(font: BmFont): void {
    this._font = font;
    this._adapter = new BmFontAdapter(font.fontData, font.textures, this._fontScale);
    this._rebuild();
  }

  public override destroy(): void {
    this._pageQuads = [];
    super.destroy();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _rebuild(): void {
    this._pageQuads = [];
    this._textBounds = { width: 0, height: 0 };
    if (this._text.length === 0) {
      // Empty transition: reset the extent and route through the content-dirty
      // contract like the non-empty path below, so a BitmapText going empty
      // does not leave a stale local bounds / un-dirtied revision behind for
      // culling, hit-testing, or an instruction-set cache of prior geometry.
      this.getLocalBounds().set(0, 0, 0, 0);
      this._invalidateBoundsCascade();
      return;
    }

    // Derive a TextLayoutStyle from the BMFont descriptor + scale.
    // Setting fontSize = fontData.lineHeight * scale makes computedLineHeight
    // equal to the BMFont's native line height multiplied by style.lineHeight.
    const layoutStyle: TextLayoutStyle = {
      fontSize: this._font.fontData.lineHeight * this._fontScale,
      lineHeight: this._style.lineHeight,
      leading: this._style.leading,
      align: this._style.align,
    };

    const placements = layoutText(this._text, layoutStyle, this._layout, this._adapter);

    let maxX = 0,
      maxY = 0;
    for (const p of placements) {
      const px = p.x + p.width;
      const py = p.y + p.height;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    this._textBounds = { width: maxX, height: maxY };
    this.getLocalBounds().set(0, 0, maxX, maxY);
    this._invalidateBoundsCascade();

    this._pageQuads = buildTextPageQuads(placements);
  }
}
