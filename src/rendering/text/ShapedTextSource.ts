import { applyCanvasTextState } from './canvasTextState';
import type { AtlasMode } from './GlyphAtlas';
import { AtlasPage, claimSolidTexel, SDF_RADIUS } from './GlyphAtlas';
import { GlyphSdf } from './GlyphSdf';
import type { ShapedTextMetrics } from './ShapedTextMetrics';
import type { LineShaper } from './shaping';
import type { FontStyle, FontVariant, GlyphInfo, SolidTexel } from './types';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const makeMeasureCtx = (): Ctx2D => {
  if (typeof OffscreenCanvas !== 'undefined') {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d');
    if (!ctx) throw new Error('ShapedTextSource: could not obtain OffscreenCanvas 2D context.');

    return ctx;
  }

  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('ShapedTextSource: could not obtain canvas 2D context.');

  return ctx;
};

/** Padding around a rasterized line in colour mode, matching the glyph atlas. */
const linePadding = 2;

/**
 * Default page extent in atlas texels. Lines are wide and short, so a square
 * page would be mostly empty; a page grows past these when a single line does
 * not fit one.
 */
const defaultPageWidth = 1024;
const defaultPageHeight = 256;

/** Construction options for {@link ShapedTextSource}. */
export interface ShapedTextSourceOptions {
  family: string;
  fontStyle: FontStyle;
  fontVariant: FontVariant;
  fontWeight: string;
  /** Logical measurement for this variant, so raster and layout cannot disagree about a width. */
  metrics: ShapedTextMetrics;
  mode?: AtlasMode;
  sdfRadius?: number;
  pixelRatio?: number;
  direction?: 'ltr' | 'rtl';
  letterSpacing?: number;
}

/**
 * Raster source for contextually shaped text, owned by a single text node.
 *
 * Each laid-out line is handed to the browser's text engine whole - which is
 * what resolves bidi order, contextual forms and cross-cluster shaping - and
 * the result is packed into pages this instance owns. The pages carry the same
 * contracts as a {@link GlyphAtlas}: an R8 distance field with linear sampling
 * in `'sdf'` mode, an RGBA canvas in `'color'` mode, rasterized at the node's
 * resolved pixel ratio with every derived number divided back into logical
 * pixels.
 *
 * Ownership is deliberately node-local rather than pooled. A shared glyph is
 * reused by every label in the application; a shaped line is a whole string,
 * and a process-wide cache of strings has no natural bound. Lines whose raster
 * key is unchanged survive a re-layout untouched; when one falls out of use the
 * pages are repacked on the next pass, so the resource cannot accumulate stale
 * rasters.
 *
 * The owner must call {@link destroy} - these are node-owned GPU resources, not
 * pooled ones.
 * @advanced
 */
export class ShapedTextSource implements LineShaper {
  private readonly _family: string;
  private readonly _fontStyle: FontStyle;
  private readonly _fontVariant: FontVariant;
  private readonly _fontWeight: string;
  private readonly _metrics: ShapedTextMetrics;
  private readonly _mode: AtlasMode;
  private readonly _sdfRadius: number;
  private readonly _pixelRatio: number;
  private readonly _rasterSdfRadius: number;
  private readonly _direction: 'ltr' | 'rtl';
  private readonly _letterSpacing: number;

  private _pages: AtlasPage[] = [];
  private readonly _cache = new Map<string, { info: GlyphInfo; generation: number }>();
  private readonly _sdfInstances = new Map<number, GlyphSdf>();

  private _generation = 0;
  private _repackPending = false;

  /** Solid block for decoration quads, claimed on first use and dropped by a repack. */
  private _solidTexel: SolidTexel | null = null;

  /** Scratch context for colour-mode line metrics, created on first use. */
  private _measureCtx: Ctx2D | null = null;

  public constructor(options: ShapedTextSourceOptions) {
    this._family = options.family;
    this._fontStyle = options.fontStyle;
    this._fontVariant = options.fontVariant;
    this._fontWeight = options.fontWeight;
    this._metrics = options.metrics;
    this._mode = options.mode ?? 'sdf';
    this._sdfRadius = options.sdfRadius ?? SDF_RADIUS;
    this._pixelRatio = options.pixelRatio ?? 1;
    this._direction = options.direction ?? 'ltr';
    this._letterSpacing = options.letterSpacing ?? 0;
    // The distance field has to grow with the raster grid or its reach would
    // shrink to `sdfRadius / pixelRatio` logical pixels, silently shortening
    // every outline and shadow as the density rises.
    this._rasterSdfRadius = Math.max(1, Math.round(this._sdfRadius * this._pixelRatio));
  }

  /** The pages the current layout's lines were rasterized into. */
  public get pages(): readonly AtlasPage[] {
    return this._pages;
  }

  /** How many distinct lines this source currently holds a raster for. */
  public get lineCount(): number {
    return this._cache.size;
  }

  /**
   * Open a layout pass. Lines requested before the matching {@link endLayout}
   * are the ones the node still displays; everything else is released.
   */
  public beginLayout(): void {
    if (this._repackPending) this._repack();

    this._generation++;
  }

  /** Close a layout pass, marking the pages for repacking if any line fell out of use. */
  public endLayout(): void {
    for (const entry of this._cache.values()) {
      if (entry.generation !== this._generation) {
        this._repackPending = true;

        return;
      }
    }
  }

  public measureLine(line: string, fontSize: number): number {
    return this._metrics.measureLine(line, fontSize);
  }

  /**
   * A solid texel on this source's own pages.
   *
   * It cannot come from the shared glyph atlas: a browser-shaped node's quads
   * address the pages this source owns, so an atlas UV would point into a
   * different texture entirely.
   */
  public getSolidTexel(): SolidTexel {
    return (this._solidTexel ??= claimSolidTexel((w, h) => this._allocateSlot(w, h, 'solid', 0)));
  }

  public shapeLine(line: string, fontSize: number): GlyphInfo {
    const key = `${fontSize}:${line}`;
    const cached = this._cache.get(key);

    if (cached !== undefined) {
      cached.generation = this._generation;

      return cached.info;
    }

    const info = this._mode === 'sdf' ? this._rasterizeSdf(line, fontSize) : this._rasterizeCanvas(line, fontSize);

    this._cache.set(key, { info, generation: this._generation });

    return info;
  }

  /** Release every page this source owns. */
  public destroy(): void {
    for (const page of this._pages) {
      page.destroy();
    }

    this._pages = [];
    this._cache.clear();
    this._sdfInstances.clear();
    this._solidTexel = null;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _rasterFontSize(size: number): number {
    return size * this._pixelRatio;
  }

  private _getSdf(rasterFontSize: number): GlyphSdf {
    let instance = this._sdfInstances.get(rasterFontSize);

    if (instance === undefined) {
      instance = new GlyphSdf({
        fontSize: rasterFontSize,
        fontFamily: this._family,
        fontWeight: this._fontWeight,
        fontStyle: this._fontStyle,
        fontVariant: this._fontVariant,
        buffer: this._rasterSdfRadius,
        radius: this._rasterSdfRadius,
        cutoff: 0.5,
        direction: this._direction,
        letterSpacing: this._letterSpacing * this._pixelRatio,
      });
      this._sdfInstances.set(rasterFontSize, instance);
    }

    return instance;
  }

  private _rasterizeSdf(line: string, fontSize: number): GlyphInfo {
    const ratio = this._pixelRatio;
    const result = this._getSdf(this._rasterFontSize(fontSize)).draw(line);
    const { page, slot } = this._allocateSlot(result.width, result.height, line, fontSize);

    page.writeSdf(result.data, slot.x, slot.y, result.width, result.height);

    return {
      x: slot.x,
      y: slot.y,
      width: result.width / ratio,
      height: result.height / ratio,
      // The logical measurement, not the raster one: layout has to break in the
      // same place at every density, and the two canvases round differently.
      advance: this._metrics.measureLine(line, fontSize),
      ascent: (result.glyphTop + result.glyphHeight) / ratio,
      page: page.index,
      uvLeft: slot.x / page.width,
      uvTop: slot.y / page.height,
      uvRight: (slot.x + result.width) / page.width,
      uvBottom: (slot.y + result.height) / page.height,
      xBearing: -result.glyphLeft / ratio,
      yBearing: -result.glyphTop / ratio,
    };
  }

  private _rasterizeCanvas(line: string, fontSize: number): GlyphInfo {
    const ratio = this._pixelRatio;
    const rasterSize = this._rasterFontSize(fontSize);
    const state = { ...this._metrics.textState(rasterSize), letterSpacing: this._letterSpacing * ratio };
    const ctx = (this._measureCtx ??= makeMeasureCtx());

    applyCanvasTextState(ctx, state);

    const metrics = ctx.measureText(line);

    const ascent = Math.ceil(
      (metrics as TextMetrics & { fontBoundingBoxAscent?: number }).fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? rasterSize * 0.8,
    );
    const descent = Math.ceil(
      (metrics as TextMetrics & { fontBoundingBoxDescent?: number }).fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? rasterSize * 0.2,
    );
    const bbLeft = Math.max(0, Math.ceil(metrics.actualBoundingBoxLeft ?? 0));
    const bbRight = Math.max(0, Math.ceil(metrics.actualBoundingBoxRight ?? metrics.width));
    const lineWidth = Math.max(1, bbLeft + bbRight);
    const lineHeight = Math.max(1, ascent + descent);

    const { page, slot } = this._allocateSlot(lineWidth + linePadding * 2, lineHeight + linePadding * 2, line, fontSize);

    page.rasterize(line, slot.x, slot.y, ascent, bbLeft, state);
    page.uploadDirtyRegion();

    return {
      x: slot.x,
      y: slot.y,
      width: lineWidth / ratio,
      height: lineHeight / ratio,
      advance: this._metrics.measureLine(line, fontSize),
      ascent: ascent / ratio,
      page: page.index,
      uvLeft: (slot.x + linePadding) / page.width,
      uvTop: (slot.y + linePadding) / page.height,
      uvRight: (slot.x + linePadding + lineWidth) / page.width,
      uvBottom: (slot.y + linePadding + lineHeight) / page.height,
    };
  }

  private _addPage(width: number, height: number): AtlasPage {
    const page = new AtlasPage(this._pages.length, width, height, this._mode);

    this._pages.push(page);

    return page;
  }

  private _allocateSlot(w: number, h: number, line: string, fontSize: number): { page: AtlasPage; slot: { x: number; y: number } } {
    for (const page of this._pages) {
      const slot = page.insert(w, h);

      if (slot !== null) return { page, slot };
    }

    // A page is sized to hold the line that overflowed the previous ones, so a
    // single long line always fits rather than failing the way a fixed-size
    // glyph page does.
    const page = this._addPage(Math.max(defaultPageWidth, w), Math.max(defaultPageHeight, h));
    const slot = page.insert(w, h);

    if (slot === null) {
      throw new Error(
        `ShapedTextSource: the raster for "${line}" at font size ${fontSize} x pixelRatio ${this._pixelRatio} ` +
          `is ${w}x${h}px and could not be placed on a page of its own.`,
      );
    }

    return { page, slot };
  }

  /**
   * Drop every page and every cached line.
   *
   * A shelf packer cannot reclaim the space a released line occupied, so the
   * cheap answer to any release is to start the pages over; the lines still in
   * use are rasterized again by the pass that follows. This runs at the START
   * of a layout pass, never at the end of one, so the pages a renderer is
   * currently drawing from are never pulled out from under it.
   */
  private _repack(): void {
    for (const page of this._pages) {
      page.destroy();
    }

    this._pages = [];
    this._cache.clear();
    this._repackPending = false;
    this._solidTexel = null;
  }
}
