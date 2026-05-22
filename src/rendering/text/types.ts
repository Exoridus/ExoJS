/** Horizontal alignment mode for multi-line text layout. */
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

/**
 * Minimal interface consumed by {@link layoutText} and {@link measureText}.
 * Both {@link TextStyle} and the BMFont adapter satisfy this structurally.
 */
export interface TextLayoutStyle {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly leading: number;
  readonly align: TextAlignment;
}

/**
 * Provider of per-character glyph metrics, consumed by {@link layoutText}.
 *
 * {@link GlyphAtlas} implements this for runtime-rasterized text.
 * `BmFontAdapter` implements it for pre-built BMFont atlases.
 */
export interface GlyphProvider {
  /** Return metrics for the given character at the given font size. */
  getGlyph(char: string, fontSize: number): GlyphInfo;
  /**
   * Return the kerning adjustment (in pixels) between two adjacent characters.
   * Positive values add space; negative values pull glyphs together.
   * Optional — callers treat a missing method as zero kerning.
   */
  getKerning?(prev: string, next: string, fontSize: number): number;
}

/**
 * Per-page quad geometry for a single text node, consumed by the text
 * renderer for both {@link Text} and {@link BitmapText}.
 */
export interface TextPageQuads {
  /** Atlas page index. */
  readonly pageIndex: number;
  /** Vertex positions: [x, y] × 4 vertices × quadCount. */
  readonly vertices: Float32Array;
  /** UV coordinates: [u, v] × 4 vertices × quadCount. */
  readonly uvs: Float32Array;
  /** Index buffer: 6 indices × quadCount. */
  readonly indices: Uint16Array;
  readonly quadCount: number;
}

/**
 * A key that uniquely identifies a glyph within a {@link GlyphAtlas}.
 * Format: `${char}:${size}`
 */
export type GlyphKey = string;

/**
 * Cached glyph data stored in an atlas page after rasterization.
 */
export interface GlyphInfo {
  /** Atlas X position (pixels, top-left of slot). */
  readonly x: number;
  /** Atlas Y position (pixels, top-left of slot). */
  readonly y: number;
  /** Quad render width in pixels (full SDF tile in sdf mode; glyph only in canvas mode). */
  readonly width: number;
  /** Quad render height in pixels. */
  readonly height: number;
  /** Horizontal advance in pixels (how far to move the cursor). */
  readonly advance: number;
  /** Distance from the quad top to the glyph ascent line in pixels. */
  readonly ascent: number;
  /** Which {@link AtlasPage} within the atlas holds this glyph. */
  readonly page: number;
  /** UV left edge (0..1). */
  readonly uvLeft: number;
  /** UV top edge (0..1). */
  readonly uvTop: number;
  /** UV right edge (0..1). */
  readonly uvRight: number;
  /** UV bottom edge (0..1). */
  readonly uvBottom: number;
  /**
   * X offset applied to the quad relative to the cursor position.
   * Non-zero in SDF mode to account for the left SDF padding.
   */
  readonly xBearing?: number;
  /**
   * Y offset applied to the quad relative to the line top.
   * Non-zero in SDF mode to account for the top SDF padding.
   */
  readonly yBearing?: number;
}

/** Pixel dimensions of a laid-out text string returned by {@link measureText}. */
export interface TextSize {
  readonly width: number;
  readonly height: number;
}

/**
 * A single glyph's quad placement in local text space.
 * Origin is the top-left of the first line.
 */
export interface GlyphPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Which {@link AtlasPage} within the atlas holds this glyph's texture data. */
  readonly page: number;
  readonly uvLeft: number;
  readonly uvTop: number;
  readonly uvRight: number;
  readonly uvBottom: number;
}
