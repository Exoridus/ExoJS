import { Signal } from '#core/Signal';
import { DataTexture } from '#rendering/texture/DataTexture';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, TextureFormat } from '#rendering/types';

import { cssFontString, GlyphMetrics } from './GlyphMetrics';
import { GlyphSdf } from './GlyphSdf';
import type { GlyphInfo, GlyphKey, GlyphProvider } from './types';

/**
 * Atlas rendering mode. Determines texture format and rasterization strategy.
 * `'sdf'` uses a single-channel R8 DataTexture with EDT-based rasterization.
 * `'color'` uses an RGBA canvas for emoji / colour-font glyphs.
 * MSDF is supported for {@link BitmapText} via offline-generated atlases only.
 */
export type AtlasMode = 'sdf' | 'color';

/**
 * SDF buffer radius in pixels - the maximum distance outside a glyph that the
 * SDF field encodes. Determines the maximum usable outline/shadow reach.
 * Exported so applications can import this constant when computing shader uniforms.
 */

export const SDF_RADIUS = 8;

const glyphPadding = 2;

// ── ShelfPacker ──────────────────────────────────────────────────────────────

interface Shelf {
  y: number;
  height: number;
  cursorX: number;
}

class ShelfPacker {
  private readonly _shelves: Shelf[] = [];
  private readonly _width: number;
  private readonly _height: number;

  public constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
  }

  public insert(width: number, height: number): { x: number; y: number } | null {
    for (const shelf of this._shelves) {
      if (shelf.height >= height && shelf.cursorX + width <= this._width) {
        const x = shelf.cursorX;
        shelf.cursorX += width;
        return { x, y: shelf.y };
      }
    }

    const last = this._shelves[this._shelves.length - 1];
    const bottomY = last === undefined ? 0 : last.y + last.height;

    if (bottomY + height > this._height) {
      return null;
    }

    this._shelves.push({ y: bottomY, height, cursorX: width });
    return { x: 0, y: bottomY };
  }

  public reset(): void {
    this._shelves.length = 0;
  }
}

// ── AtlasPage ────────────────────────────────────────────────────────────────

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const makeCtx = (width: number, height: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D } => {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    if (!ctx) throw new Error('GlyphAtlas: could not obtain OffscreenCanvas 2D context.');
    return { canvas, ctx };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('GlyphAtlas: could not obtain canvas 2D context.');
  return { canvas, ctx };
};

/**
 * A single texture page within a {@link GlyphAtlas}. Glyphs are packed into
 * the page using a shelf-bin algorithm.
 *
 * In `'sdf'` mode the page owns a `DataTexture` (`r8`) populated by tiny-sdf
 * output. In `'color'` mode a Canvas 2D context preserves full glyph colours
 * for emoji.
 * @advanced
 */
export class AtlasPage {
  public readonly texture: Texture;
  public readonly index: number;
  public readonly mode: AtlasMode;

  private readonly _packer: ShelfPacker;
  private readonly _width: number;
  private readonly _height: number;

  // SDF mode
  private readonly _sdfBuffer: Uint8Array | null = null;
  private readonly _sdfTexture: DataTexture<TextureFormat.R8> | null = null;

  // Canvas mode
  private readonly _ctx: Ctx2D | null = null;
  private readonly _colorGlyphs: boolean;

  /** Scratch context used by {@link measureGlyph} in SDF mode, created on first use. */
  private _measureCtx: Ctx2D | null = null;

  public constructor(index: number, width: number, height: number, mode: AtlasMode) {
    this.index = index;
    this.mode = mode;
    this._width = width;
    this._height = height;
    this._colorGlyphs = mode === 'color';
    this._packer = new ShelfPacker(width, height);

    if (mode === 'sdf') {
      this._sdfBuffer = new Uint8Array(width * height);
      this._sdfTexture = new DataTexture({ width, height, format: TextureFormat.R8, data: this._sdfBuffer });
      // A DataTexture defaults to NEAREST, which is right for the lookup tables
      // that class exists for - a transform row must be read back as the exact
      // number that was written. An SDF page is the opposite kind of data: it
      // stores a CONTINUOUS distance, and bilinear reconstruction of it between
      // texels is the entire reason a distance field is resolution-independent.
      // Sampled with NEAREST the field is piecewise constant, so a glyph drawn
      // at anything other than one atlas texel per device pixel gets a staircased
      // edge (magnified) or a jittered one (minified) - which is exactly what a
      // raised or lowered `Text.pixelRatio` produces.
      this._sdfTexture.setScaleMode(ScaleModes.Linear);
      this._sdfTexture.setSize(width, height);
      this.texture = this._sdfTexture;
    } else {
      const { canvas, ctx } = makeCtx(width, height);
      this._ctx = ctx;
      this.texture = new Texture(canvas);
      // Already the `Texture` default; stated so the two page kinds visibly
      // agree on how a glyph is filtered.
      this.texture.setScaleMode(ScaleModes.Linear);
      this.texture.setSize(width, height);
    }
  }

  public insert(w: number, h: number): { x: number; y: number } | null {
    return this._packer.insert(w, h);
  }

  /**
   * Copy R8 SDF data into the page buffer at the given slot origin.
   * Only valid in `'sdf'` mode.
   *
   * `data` is a `Uint8ClampedArray` of single-channel SDF values as produced
   * by {@link GlyphSdf.draw}. Each value is one byte (0 = far outside the
   * glyph, 255 = deep inside, ~128 = glyph edge).
   */
  public writeSdf(data: Uint8ClampedArray, slotX: number, slotY: number, srcW: number, srcH: number): void {
    const buf = this._sdfBuffer!;
    const dstW = this._width;

    for (let row = 0; row < srcH; row++) {
      const srcOff = row * srcW;
      const dstOff = (slotY + row) * dstW + slotX;
      buf.set(data.subarray(srcOff, srcOff + srcW), dstOff);
    }

    this._sdfTexture!.commitRect(slotX, slotY, srcW, srcH);
  }

  public measureGlyph(char: string, font: string): TextMetrics {
    if (this._ctx !== null) {
      this._ctx.font = font;
      this._ctx.textBaseline = 'alphabetic';
      return this._ctx.measureText(char);
    }
    // SDF pages own no drawing context, so measuring needs a scratch one. Kept
    // for the page's lifetime rather than created per call: this runs once per
    // uncached glyph, and a fresh canvas per measurement is a whole allocation
    // (plus a context) for one `measureText`.
    const ctx = (this._measureCtx ??= makeCtx(1, 1).ctx);
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    return ctx.measureText(char);
  }

  /** Rasterize a white glyph into the canvas at the given padded slot origin (canvas mode only). */
  public rasterize(char: string, slotX: number, slotY: number, ascent: number, bbLeft: number, font: string): void {
    const ctx = this._ctx!;
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    if (!this._colorGlyphs) {
      (ctx as CanvasRenderingContext2D).fillStyle = '#ffffff';
    }
    ctx.fillText(char, slotX + glyphPadding + bbLeft, slotY + glyphPadding + ascent);
  }

  public uploadDirtyRegion(): void {
    if (this._sdfTexture !== null) {
      this._sdfTexture.commit();
    } else {
      this.texture.updateSource();
    }
  }

  public reset(): void {
    this._packer.reset();
    if (this._sdfBuffer !== null && this._sdfTexture !== null) {
      this._sdfBuffer.fill(0);
      this._sdfTexture.commit();
    } else if (this._ctx !== null) {
      this._ctx.clearRect(0, 0, this._width, this._height);
      this.texture.updateSource();
    }
  }
}

// ── GlyphAtlas ───────────────────────────────────────────────────────────────

/**
 * A per-font-variant glyph atlas with automatic multi-page growth.
 *
 * In `'sdf'` mode (default) each atlas page is a single-channel R8
 * `DataTexture` populated by {@link GlyphSdf}. One `GlyphSdf` instance is kept per
 * raster font size so the atlas can mix sizes efficiently.
 *
 * In `'color'` mode pages are RGBA canvas textures that preserve full glyph
 * colour data for emoji and colour fonts.
 *
 * **Pixel ratio.** An atlas rasterizes at `pixelRatio` device pixels per logical
 * pixel: a glyph asked for at logical size 9 in a ratio-3 atlas is rendered from
 * a 27px font, and every raster-derived number it hands back is divided by the
 * ratio again so the caller keeps working in logical units. The ratio is part of
 * the atlas's identity ({@link GlyphAtlasPool}) - it has to be, because the pool
 * is process-wide and two applications at different densities must not share one
 * set of pages. The LOGICAL metrics layout consumes (advance, kerning) come from
 * the ratio-independent {@link GlyphMetrics} instead, so the same string lays out
 * identically at every ratio.
 * @advanced
 */
export class GlyphAtlas implements GlyphProvider {
  private _pages: AtlasPage[] = [];
  private readonly _cache = new Map<GlyphKey, GlyphInfo>();
  private readonly _pageSize: number;

  private readonly _family: string;
  private readonly _fontStyle: 'normal' | 'italic';
  private readonly _fontWeight: string;
  private readonly _mode: AtlasMode;
  private readonly _sdfRadius: number;
  private readonly _pixelRatio: number;
  private readonly _rasterSdfRadius: number;
  private readonly _metrics: GlyphMetrics;

  /**
   * Dispatched whenever a new atlas page is allocated.
   *
   * Listen here to detect unexpected atlas growth (e.g. many unique CJK glyphs
   * or an oversized font size). The payload is the zero-based page index.
   *
   * ```ts
   * const atlas = pool.getAtlas('Roboto', 'normal', '400');
   * atlas.onPageAdded.on(idx => console.warn(`Atlas page ${idx} added`));
   * ```
   */
  public readonly onPageAdded = new Signal<[pageIndex: number]>();

  /**
   * Dispatched after {@link clear} discards every rasterized glyph and kerning
   * entry. A node holding `GlyphInfo` from this atlas has to re-layout - its
   * UVs still address the (now-repacked) pages, but the glyph that used to sit
   * there is gone. {@link Text} listens on the atlas it currently draws from
   * and re-lays out in response; a caller driving `GlyphAtlas` directly should
   * do the same for anything it cached from {@link getGlyph}.
   */
  public readonly onCleared = new Signal();

  /** {@link GlyphSdf} instances keyed by RASTER font size - only used in SDF mode. */
  private readonly _sdfInstances = new Map<number, GlyphSdf>();

  public constructor(
    family: string,
    fontStyle: 'normal' | 'italic',
    fontWeight: string,
    pageSize = 1024,
    mode: AtlasMode = 'sdf',
    sdfRadius = SDF_RADIUS,
    pixelRatio = 1,
    metrics?: GlyphMetrics,
  ) {
    this._family = family;
    this._fontStyle = fontStyle;
    this._fontWeight = fontWeight;
    this._pageSize = pageSize;
    this._mode = mode;
    this._sdfRadius = sdfRadius;
    this._pixelRatio = pixelRatio;
    // The SDF buffer has to grow with the raster grid, or the encoded distance
    // field would reach `sdfRadius / pixelRatio` LOGICAL pixels past the glyph
    // and an outline or shadow would silently shorten as the ratio rises.
    this._rasterSdfRadius = Math.max(1, Math.round(sdfRadius * pixelRatio));
    // A variant measured elsewhere hands its metrics in so every atlas of the
    // same typeface answers with the same advances; a standalone atlas measures
    // for itself.
    this._metrics = metrics ?? new GlyphMetrics(family, fontStyle, fontWeight);

    this._addPage();
  }

  public get pages(): readonly AtlasPage[] {
    return this._pages;
  }

  public get mode(): AtlasMode {
    return this._mode;
  }

  /**
   * Device pixels per logical pixel this atlas rasterizes at. Part of its
   * identity in the {@link GlyphAtlasPool}: a ratio-2 and a ratio-3 atlas of the
   * same font variant are different resources holding different pages.
   */
  public get pixelRatio(): number {
    return this._pixelRatio;
  }

  /**
   * SDF buffer radius in LOGICAL pixels - the outline/shadow reach this atlas
   * can encode. Independent of {@link pixelRatio}: the raster buffer grows with
   * the ratio so the logical reach stays put.
   */
  public get sdfRadius(): number {
    return this._sdfRadius;
  }

  /** The shared logical metrics this atlas takes its advances and kerning from. */
  public get metrics(): GlyphMetrics {
    return this._metrics;
  }

  public getGlyph(char: string, size: number): GlyphInfo {
    const key: GlyphKey = `${char}:${size}`;
    const cached = this._cache.get(key);
    if (cached !== undefined) return cached;
    return this._mode === 'sdf' ? this._rasterizeSdf(char, size, key) : this._rasterizeCanvas(char, size, key);
  }

  public getKerning(prev: string, next: string, fontSize: number): number {
    return this._metrics.getKerning(prev, next, fontSize);
  }

  public clear(): void {
    this._cache.clear();
    this._metrics.clear();
    this._sdfInstances.clear();
    // Pages are reset in place, not discarded: a fresh page would own a new
    // DataTexture/Texture (and GPU resource) while the old one leaks, and
    // reuse needs nothing a fresh page would have had anyway - `reset()`
    // already zeroes the raster content and rewinds the shelf packer.
    for (const page of this._pages) {
      page.reset();
    }
    this.onCleared.dispatch();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _addPage(): AtlasPage {
    const index = this._pages.length;
    const page = new AtlasPage(index, this._pageSize, this._pageSize, this._mode);
    this._pages.push(page);
    if (index > 0) this.onPageAdded.dispatch(index);
    return page;
  }

  private _cssFont(size: number): string {
    return cssFontString(this._family, this._fontStyle, this._fontWeight, size);
  }

  /** Raster font size, in device pixels, for a glyph asked for at `size` logical pixels. */
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
        buffer: this._rasterSdfRadius,
        radius: this._rasterSdfRadius,
        cutoff: 0.5,
      });
      this._sdfInstances.set(rasterFontSize, instance);
    }
    return instance;
  }

  private _rasterizeSdf(char: string, size: number, key: GlyphKey): GlyphInfo {
    const ratio = this._pixelRatio;
    const result = this._getSdf(this._rasterFontSize(size)).draw(char);

    const { page, slot } = this._allocateSlot(result.width, result.height, char, size);
    page.writeSdf(result.data, slot.x, slot.y, result.width, result.height);

    const ps = this._pageSize;
    const info: GlyphInfo = {
      x: slot.x,
      y: slot.y,
      // Slot origin and UVs stay in ATLAS TEXELS - they address the raster grid.
      // Everything else is divided back into logical pixels, which is the space
      // the quad, the cursor and the node's bounds live in.
      width: result.width / ratio,
      height: result.height / ratio,
      // Not `result.glyphAdvance`: the advance is a logical typographic number
      // and comes from the shared metrics, so it is bit-identical at every
      // ratio and a re-rasterization can never move a line break.
      advance: this._metrics.advance(char, size),
      ascent: (result.glyphTop + result.glyphHeight) / ratio, // tile top → glyph bottom
      page: page.index,
      uvLeft: slot.x / ps,
      uvTop: slot.y / ps,
      uvRight: (slot.x + result.width) / ps,
      uvBottom: (slot.y + result.height) / ps,
      // Shift the quad left/up by the SDF buffer so the glyph content aligns
      // with the logical cursor position (bearing = −buffer on both axes).
      xBearing: -result.glyphLeft / ratio,
      yBearing: -result.glyphTop / ratio,
    };

    this._cache.set(key, info);
    return info;
  }

  private _rasterizeCanvas(char: string, size: number, key: GlyphKey): GlyphInfo {
    const ratio = this._pixelRatio;
    const rasterSize = this._rasterFontSize(size);
    // Colour glyphs are rasterized by the canvas at the RASTER size, so their
    // tile metrics have to be measured there too - the ratio-1 numbers would
    // size the slot for a glyph a third the size of the one actually drawn.
    const font = this._cssFont(rasterSize);
    // Invariant: a base page is always present (constructor + clear add one).
    const metrics = this._pages[0]!.measureGlyph(char, font);

    const ascent = Math.ceil(
      (metrics as TextMetrics & { fontBoundingBoxAscent?: number }).fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? rasterSize * 0.8,
    );
    const descent = Math.ceil(
      (metrics as TextMetrics & { fontBoundingBoxDescent?: number }).fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? rasterSize * 0.2,
    );
    const bbLeft = metrics.actualBoundingBoxLeft ?? 0;
    const bbRight = metrics.actualBoundingBoxRight ?? 0;
    const glyphWidth = Math.max(1, Math.ceil(bbLeft + bbRight) || Math.ceil(metrics.width));
    const glyphHeight = Math.max(1, ascent + descent);

    const slotW = glyphWidth + glyphPadding * 2;
    const slotH = glyphHeight + glyphPadding * 2;

    const { page, slot } = this._allocateSlot(slotW, slotH, char, size);
    page.rasterize(char, slot.x, slot.y, ascent, bbLeft, font);
    page.uploadDirtyRegion();

    const ps = this._pageSize;
    const info: GlyphInfo = {
      x: slot.x,
      y: slot.y,
      width: glyphWidth / ratio,
      height: glyphHeight / ratio,
      advance: this._metrics.advance(char, size),
      ascent: ascent / ratio,
      page: page.index,
      uvLeft: slot.x / ps,
      uvTop: slot.y / ps,
      uvRight: (slot.x + slotW) / ps,
      uvBottom: (slot.y + slotH) / ps,
    };

    this._cache.set(key, info);
    return info;
  }

  private _allocateSlot(w: number, h: number, char: string, size: number): { page: AtlasPage; slot: { x: number; y: number } } {
    for (const page of this._pages) {
      const slot = page.insert(w, h);
      if (slot !== null) return { page, slot };
    }

    const newPage = this._addPage();
    const slot = newPage.insert(w, h);

    if (slot === null) {
      // Named in full: at a raised pixel ratio the tile that overflows is
      // several times the size the caller asked for, and "glyph too big" with
      // no ratio in it sends the reader looking at the wrong number.
      throw new Error(
        `GlyphAtlas: the tile for "${char}" at font size ${size} × pixelRatio ${this._pixelRatio} ` +
          `is ${w}×${h}px and exceeds the ${this._pageSize}px atlas page. ` +
          `Lower the font size, lower the text pixelRatio, or use a larger atlas page size.`,
      );
    }

    return { page: newPage, slot };
  }
}
