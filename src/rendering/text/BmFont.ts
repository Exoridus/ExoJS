import type { Texture } from '@/rendering/texture/Texture';

/** Per-character metrics from a BMFont descriptor. */
export interface BmFontChar {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Horizontal draw offset from the cursor to the glyph's left edge. */
  xOffset: number;
  /** Vertical draw offset from the line top to the glyph's top edge. */
  yOffset: number;
  /** Cursor advance after this character. */
  xAdvance: number;
  /** Atlas page this character lives on. */
  page: number;
}

/** Parsed representation of a BMFont (.fnt) descriptor. */
export interface BmFontData {
  /** Texture file names for each atlas page (relative paths). */
  pages: string[];
  /** Code-point → glyph metrics. */
  chars: Map<number, BmFontChar>;
  /**
   * Kerning pairs — key `"${first},${second}"`, value = pixel adjustment.
   * Negative values pull glyphs together; positive push them apart.
   */
  kernings: Map<string, number>;
  /** Full line height in font units. */
  lineHeight: number;
  /** Baseline position from the top of the line in font units. */
  base: number;
}

/**
 * A loaded BMFont asset: the parsed descriptor plus all page textures.
 *
 * Loaded by the built-in BMFont factory — no extra setup required.
 * Pass directly to {@link BitmapText}.
 *
 * ```ts
 * const font = await loader.load('fonts/ui.fnt');       // BmFont via extension
 * const font = await loader.load(BmFont, 'fonts/ui.fnt'); // explicit token
 * const label = new BitmapText('Score: 0', font);
 * ```
 * @stable
 */
export class BmFont {
  public readonly fontData: BmFontData;
  public readonly textures: readonly Texture[];

  public constructor(fontData: BmFontData, textures: readonly Texture[]) {
    this.fontData = fontData;
    this.textures = textures;
  }
}
