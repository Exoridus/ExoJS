import { Signal } from '@/core/Signal';
import { DataTexture } from '@/rendering/texture/DataTexture';
import { Texture } from '@/rendering/texture/Texture';

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
 * SDF buffer radius in pixels — the maximum distance outside a glyph that the
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

function makeCtx(width: number, height: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    if (!ctx) throw new Error('GlyphAtlas: could not obtain OffscreenCanvas 2D context.');
    return { canvas, ctx };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('GlyphAtlas: could not obtain canvas 2D context.');
  return { canvas, ctx };
}

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
  private readonly _sdfTexture: DataTexture<'r8'> | null = null;

  // Canvas mode
  private readonly _ctx: Ctx2D | null = null;
  private readonly _colorGlyphs: boolean;

  public constructor(index: number, width: number, height: number, mode: AtlasMode) {
    this.index = index;
    this.mode = mode;
    this._width = width;
    this._height = height;
    this._colorGlyphs = mode === 'color';
    this._packer = new ShelfPacker(width, height);

    if (mode === 'sdf') {
      this._sdfBuffer = new Uint8Array(width * height);
      this._sdfTexture = new DataTexture({ width, height, format: 'r8', data: this._sdfBuffer });
      this._sdfTexture.setSize(width, height);
      this.texture = this._sdfTexture;
    } else {
      const { canvas, ctx } = makeCtx(width, height);
      this._ctx = ctx;
      this.texture = new Texture(canvas as HTMLCanvasElement);
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
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    const ctx = c.getContext('2d') as Ctx2D;
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
 * font size so the atlas can mix sizes efficiently.
 *
 * In `'color'` mode pages are RGBA canvas textures that preserve full glyph
 * colour data for emoji and colour fonts.
 * @advanced
 */
export class GlyphAtlas implements GlyphProvider {
  private _pages: AtlasPage[] = [];
  private readonly _cache = new Map<GlyphKey, GlyphInfo>();
  private readonly _kerningCache = new Map<string, number>();
  private readonly _pageSize: number;

  private readonly _family: string;
  private readonly _fontStyle: 'normal' | 'italic';
  private readonly _fontWeight: string;
  private readonly _mode: AtlasMode;
  private readonly _sdfRadius: number;

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

  /** {@link GlyphSdf} instances keyed by font size — only used in SDF mode. */
  private readonly _sdfInstances = new Map<number, GlyphSdf>();

  public constructor(
    family: string,
    fontStyle: 'normal' | 'italic',
    fontWeight: string,
    pageSize = 1024,
    mode: AtlasMode = 'sdf',
    sdfRadius = SDF_RADIUS,
  ) {
    this._family = family;
    this._fontStyle = fontStyle;
    this._fontWeight = fontWeight;
    this._pageSize = pageSize;
    this._mode = mode;
    this._sdfRadius = sdfRadius;

    this._addPage();
  }

  public get pages(): readonly AtlasPage[] {
    return this._pages;
  }

  public get mode(): AtlasMode {
    return this._mode;
  }

  public getGlyph(char: string, size: number): GlyphInfo {
    const key: GlyphKey = `${char}:${size}`;
    const cached = this._cache.get(key);
    if (cached !== undefined) return cached;
    return this._mode === 'sdf' ? this._rasterizeSdf(char, size, key) : this._rasterizeCanvas(char, size, key);
  }

  public getKerning(prev: string, next: string, fontSize: number): number {
    const key = `${prev}${next}:${fontSize}`;
    const cached = this._kerningCache.get(key);
    if (cached !== undefined) return cached;

    const font = this._cssFont(fontSize);
    const page = this._pages[0];
    const pair = page.measureGlyph(prev + next, font).width;
    const a = page.measureGlyph(prev, font).width;
    const b = page.measureGlyph(next, font).width;
    const kerning = pair - a - b;

    this._kerningCache.set(key, kerning);
    return kerning;
  }

  public clear(): void {
    this._cache.clear();
    this._kerningCache.clear();
    this._sdfInstances.clear();
    for (const page of this._pages) {
      page.reset();
    }
    this._pages = [];
    this._addPage();
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
    const style = this._fontStyle !== 'normal' ? `${this._fontStyle} ` : '';
    return `${style}${this._fontWeight} ${size}px ${this._family}`;
  }

  private _getSdf(fontSize: number): GlyphSdf {
    let instance = this._sdfInstances.get(fontSize);
    if (instance === undefined) {
      instance = new GlyphSdf({
        fontSize,
        fontFamily: this._family,
        fontWeight: this._fontWeight,
        fontStyle: this._fontStyle,
        buffer: this._sdfRadius,
        radius: this._sdfRadius,
        cutoff: 0.5,
      });
      this._sdfInstances.set(fontSize, instance);
    }
    return instance;
  }

  private _rasterizeSdf(char: string, size: number, key: GlyphKey): GlyphInfo {
    const result = this._getSdf(size).draw(char);

    const { page, slot } = this._allocateSlot(result.width, result.height);
    page.writeSdf(result.data, slot.x, slot.y, result.width, result.height);

    const ps = this._pageSize;
    const info: GlyphInfo = {
      x: slot.x,
      y: slot.y,
      width: result.width,
      height: result.height,
      advance: result.glyphAdvance,
      ascent: result.glyphTop + result.glyphHeight, // distance from tile top to glyph bottom
      page: page.index,
      uvLeft: slot.x / ps,
      uvTop: slot.y / ps,
      uvRight: (slot.x + result.width) / ps,
      uvBottom: (slot.y + result.height) / ps,
      // Shift the quad left/up by the SDF buffer so the glyph content aligns
      // with the logical cursor position (bearing = −buffer on both axes).
      xBearing: -result.glyphLeft,
      yBearing: -result.glyphTop,
    };

    this._cache.set(key, info);
    return info;
  }

  private _rasterizeCanvas(char: string, size: number, key: GlyphKey): GlyphInfo {
    const font = this._cssFont(size);
    const metrics = this._pages[0].measureGlyph(char, font);

    const ascent = Math.ceil(
      (metrics as TextMetrics & { fontBoundingBoxAscent?: number }).fontBoundingBoxAscent ??
        metrics.actualBoundingBoxAscent ??
        size * 0.8,
    );
    const descent = Math.ceil(
      (metrics as TextMetrics & { fontBoundingBoxDescent?: number }).fontBoundingBoxDescent ??
        metrics.actualBoundingBoxDescent ??
        size * 0.2,
    );
    const advance = metrics.width;
    const bbLeft = metrics.actualBoundingBoxLeft ?? 0;
    const bbRight = metrics.actualBoundingBoxRight ?? 0;
    const glyphWidth = Math.max(1, Math.ceil(bbLeft + bbRight) || Math.ceil(advance));
    const glyphHeight = Math.max(1, ascent + descent);

    const slotW = glyphWidth + glyphPadding * 2;
    const slotH = glyphHeight + glyphPadding * 2;

    const { page, slot } = this._allocateSlot(slotW, slotH);
    page.rasterize(char, slot.x, slot.y, ascent, bbLeft, font);
    page.uploadDirtyRegion();

    const ps = this._pageSize;
    const info: GlyphInfo = {
      x: slot.x,
      y: slot.y,
      width: glyphWidth,
      height: glyphHeight,
      advance,
      ascent,
      page: page.index,
      uvLeft: slot.x / ps,
      uvTop: slot.y / ps,
      uvRight: (slot.x + slotW) / ps,
      uvBottom: (slot.y + slotH) / ps,
    };

    this._cache.set(key, info);
    return info;
  }

  private _allocateSlot(w: number, h: number): { page: AtlasPage; slot: { x: number; y: number } } {
    for (const page of this._pages) {
      const slot = page.insert(w, h);
      if (slot !== null) return { page, slot };
    }

    const newPage = this._addPage();
    const slot = newPage.insert(w, h);

    if (slot === null) {
      throw new Error(`GlyphAtlas: glyph (${w}×${h}px) exceeds page size (${this._pageSize}px).`);
    }

    return { page: newPage, slot };
  }
}
