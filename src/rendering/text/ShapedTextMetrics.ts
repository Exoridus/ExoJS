import type { CanvasTextState } from './canvasTextState';
import { applyCanvasTextState } from './canvasTextState';
import { cssFontString } from './canvasTextState';
import type { LineShaper } from './shaping';
import type { FontStyle, FontVariant, GlyphInfo } from './types';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * How many measured lines one instance keeps before it starts over.
 *
 * A shaped measurement is keyed by the whole line, so the key space is the set
 * of strings the application lays out - unbounded in principle. Wrapping and
 * ellipsis probe the same prefixes repeatedly within one pass, which is what
 * the cache exists for; retaining them forever is not.
 */
const CACHE_LIMIT = 512;

const makeMeasureCtx = (): Ctx2D => {
  if (typeof OffscreenCanvas !== 'undefined') {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d');
    if (!ctx) throw new Error('ShapedTextMetrics: could not obtain OffscreenCanvas 2D context.');

    return ctx;
  }

  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('ShapedTextMetrics: could not obtain canvas 2D context.');

  return ctx;
};

/**
 * Logical measurement of contextually shaped lines for one font variant.
 *
 * The counterpart of {@link GlyphMetrics} for text the engine cannot measure
 * one cluster at a time: an Arabic word's letters change width depending on
 * what surrounds them, and a mixed-direction line has an order that only the
 * bidi resolver knows. Both answers come from one `measureText` over the
 * complete line.
 *
 * Measurement only. Nothing here allocates a texture, claims atlas space or
 * uploads anything, which is what keeps {@link Text.measure} a layout
 * operation. The numbers are logical, so they are independent of any raster
 * density and a line breaks in the same place at every `pixelRatio`.
 *
 * One instance per `family` x `fontStyle` x `fontVariant` x `fontWeight` x base
 * direction x letter spacing - see {@link GlyphAtlasPool.getShapedMetrics}.
 * @advanced
 */
export class ShapedTextMetrics implements LineShaper {
  private readonly _family: string;
  private readonly _fontStyle: FontStyle;
  private readonly _fontVariant: FontVariant;
  private readonly _fontWeight: string;
  private readonly _direction: 'ltr' | 'rtl';
  private readonly _letterSpacing: number;

  private readonly _widths = new Map<string, number>();
  private readonly _infos = new Map<string, GlyphInfo>();

  /** Created on first use - a variant that is never measured allocates no canvas. */
  private _ctx: Ctx2D | null = null;

  public constructor(family: string, fontStyle: FontStyle, fontVariant: FontVariant, fontWeight: string, direction: 'ltr' | 'rtl' = 'ltr', letterSpacing = 0) {
    this._family = family;
    this._fontStyle = fontStyle;
    this._fontVariant = fontVariant;
    this._fontWeight = fontWeight;
    this._direction = direction;
    this._letterSpacing = letterSpacing;
  }

  /** The canvas text state this variant measures with, at `size` logical pixels. */
  public textState(size: number): CanvasTextState {
    return {
      font: cssFontString(this._family, this._fontStyle, this._fontVariant, this._fontWeight, size),
      direction: this._direction,
      letterSpacing: this._letterSpacing,
      variantCaps: this._fontVariant,
    };
  }

  public measureLine(line: string, fontSize: number): number {
    const key = `${fontSize}:${line}`;
    const cached = this._widths.get(key);

    if (cached !== undefined) return cached;

    const ctx = (this._ctx ??= makeMeasureCtx());

    applyCanvasTextState(ctx, this.textState(fontSize));

    const width = ctx.measureText(line).width;

    if (this._widths.size >= CACHE_LIMIT) this._widths.clear();

    this._widths.set(key, width);

    return width;
  }

  public shapeLine(line: string, fontSize: number): GlyphInfo {
    const key = `${fontSize}:${line}`;
    const cached = this._infos.get(key);

    if (cached !== undefined) return cached;

    const info: GlyphInfo = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      advance: this.measureLine(line, fontSize),
      ascent: 0,
      page: 0,
      uvLeft: 0,
      uvTop: 0,
      uvRight: 0,
      uvBottom: 0,
    };

    if (this._infos.size >= CACHE_LIMIT) this._infos.clear();

    this._infos.set(key, info);

    return info;
  }

  /**
   * Drop every cached measurement.
   *
   * Called when the variant's {@link FontFace} finishes loading: everything
   * measured before that point came from the fallback face and is wrong.
   */
  public clear(): void {
    this._widths.clear();
    this._infos.clear();
  }
}
