import type { GlyphInfo, GlyphProvider } from './types';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Build the CSS `font` shorthand for one font variant at one size.
 *
 * Shared by {@link GlyphMetrics} and {@link GlyphAtlas} so a measurement and the
 * rasterization it describes can never disagree about the font they mean.
 */
export const cssFontString = (family: string, fontStyle: 'normal' | 'italic', fontWeight: string, size: number): string => {
  const style = fontStyle !== 'normal' ? `${fontStyle} ` : '';

  return `${style}${fontWeight} ${size}px ${family}`;
};

const makeMeasureCtx = (): Ctx2D => {
  if (typeof OffscreenCanvas !== 'undefined') {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d');
    if (!ctx) throw new Error('GlyphMetrics: could not obtain OffscreenCanvas 2D context.');

    return ctx;
  }

  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('GlyphMetrics: could not obtain canvas 2D context.');

  return ctx;
};

/**
 * The LOGICAL typographic metrics of one font variant - advances and kerning,
 * in logical pixels, at the logical font size.
 *
 * This is the half of a glyph that layout consumes, and it is deliberately kept
 * out of {@link GlyphAtlas}: an atlas is a RASTER resource whose identity
 * includes a pixel density, while an advance is a property of the typeface and
 * the font size alone. Splitting them is what makes the two invariants of
 * HiDPI text hold by construction rather than by luck:
 *
 * - the same string lays out identically at every `pixelRatio`, because the
 *   numbers layout reads never went near a raster grid;
 * - {@link Text.measure} answers without rasterizing anything, so a measurement
 *   cannot allocate an atlas, cannot claim atlas space, and cannot depend on
 *   which {@link Application} happens to exist.
 *
 * One instance per `family` × `fontStyle` × `fontWeight`, shared by every atlas
 * of that variant regardless of mode, SDF radius or pixel ratio - see
 * {@link GlyphAtlasPool.getMetrics}.
 *
 * Satisfies {@link GlyphProvider} so it can drive a measurement-only layout
 * pass. The {@link GlyphInfo} it hands out carries a real `advance` and zero
 * geometry: there is no tile, no page and no UV rectangle behind it, and a
 * caller that needs those wants an atlas instead.
 * @advanced
 */
export class GlyphMetrics implements GlyphProvider {
  private readonly _family: string;
  private readonly _fontStyle: 'normal' | 'italic';
  private readonly _fontWeight: string;

  private readonly _infos = new Map<string, GlyphInfo>();
  private readonly _kerning = new Map<string, number>();

  /** Created on first use - a font variant that is never measured allocates no canvas. */
  private _ctx: Ctx2D | null = null;

  public constructor(family: string, fontStyle: 'normal' | 'italic', fontWeight: string) {
    this._family = family;
    this._fontStyle = fontStyle;
    this._fontWeight = fontWeight;
  }

  /** The CSS `font` shorthand for this variant at `size` logical pixels. */
  public cssFont(size: number): string {
    return cssFontString(this._family, this._fontStyle, this._fontWeight, size);
  }

  /** Horizontal advance of `char` at `fontSize` logical pixels. */
  public advance(char: string, fontSize: number): number {
    return this.getGlyph(char, fontSize).advance;
  }

  public getGlyph(char: string, fontSize: number): GlyphInfo {
    const key = `${char}:${fontSize}`;
    const cached = this._infos.get(key);
    if (cached !== undefined) return cached;

    const info: GlyphInfo = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      advance: this._measure(char, fontSize).width,
      ascent: 0,
      page: 0,
      uvLeft: 0,
      uvTop: 0,
      uvRight: 0,
      uvBottom: 0,
    };

    this._infos.set(key, info);

    return info;
  }

  public getKerning(prev: string, next: string, fontSize: number): number {
    const key = `${prev}${next}:${fontSize}`;
    const cached = this._kerning.get(key);
    if (cached !== undefined) return cached;

    const pair = this._measure(prev + next, fontSize).width;
    const a = this._measure(prev, fontSize).width;
    const b = this._measure(next, fontSize).width;
    const kerning = pair - a - b;

    this._kerning.set(key, kerning);

    return kerning;
  }

  /**
   * Drop every cached measurement.
   *
   * Called when the variant's {@link FontFace} finishes loading: everything
   * measured before that point came from the fallback face and is wrong.
   */
  public clear(): void {
    this._infos.clear();
    this._kerning.clear();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _measure(text: string, fontSize: number): TextMetrics {
    const ctx = (this._ctx ??= makeMeasureCtx());

    ctx.font = this.cssFont(fontSize);
    ctx.textBaseline = 'alphabetic';

    return ctx.measureText(text);
  }
}
