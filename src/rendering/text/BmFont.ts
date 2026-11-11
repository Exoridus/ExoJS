import { assert } from '#core/dev';
import type { Texture } from '#rendering/texture/Texture';

/** Numeric encoding of an external distance atlas, independent of text styling. */
export interface BmFontDistanceField {
  /** SDF uses a scalar channel, MSDF an RGB median, and MTSDF also carries true distance in alpha. */
  readonly fieldType: 'sdf' | 'msdf' | 'mtsdf';
  /**
   * Full encoded distance span in atlas texels, finite and positive, or `null`
   * when unknown. This is not a radius, padding, font size or effect budget.
   */
  readonly distanceRange: number | null;
  /**
   * Encoded sample at zero signed distance, in [0, 1], or `null` when unknown.
   * When both values are known, signed distance in atlas texels is
   * `(sample - zeroDistanceValue) * distanceRange`, positive inside the glyph.
   * Symmetric generators use 0.5; an arbitrary external field need not.
   */
  readonly zeroDistanceValue: number | null;
}

/** Authored BMFont padding in atlas texels; it does not guarantee usable distance or an extra sampling border. */
export interface BmFontPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Per-character metrics from a BMFont descriptor. */
export interface BmFontChar {
  /** Left edge of the sampled glyph rectangle in atlas texels, not an inferred packing cell. */
  x: number;
  /** Top edge of the sampled glyph rectangle in atlas texels. */
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
  /** BMFont channel mask when supplied: 1 blue, 2 green, 4 red, 8 alpha, 15 all. Retained as metadata. */
  channel?: number;
}

/** Parsed BMFont text or JSON descriptor. Glyph metrics and distance spans use atlas texels before BitmapText.fontScale. */
export interface BmFontData {
  /** Texture file names for each atlas page (relative paths). */
  pages: string[];
  /** Code-point → glyph metrics. */
  chars: Map<number, BmFontChar>;
  /**
   * Kerning pairs - key `"${first},${second}"`, value = pixel adjustment.
   * Negative values pull glyphs together; positive push them apart.
   */
  kernings: Map<string, number>;
  /** Full line height in font units. */
  lineHeight: number;
  /** Baseline position from the top of the line in font units. */
  base: number;
  /** Declared distance encoding; absent for an undeclared or ordinary bitmap font. */
  distanceField?: BmFontDistanceField;
  /** Declared page width, or absent when the descriptor does not supply it. */
  atlasWidth?: number;
  /** Declared page height, or absent when the descriptor does not supply it. */
  atlasHeight?: number;
  /** Authored borders, already included in glyph rectangles; absent means unknown. */
  padding?: BmFontPadding;
  /** Declared horizontal/vertical spacing in atlas texels, separate from padding and distance range. */
  spacing?: { readonly x: number; readonly y: number };
}

/**
 * A loaded BMFont asset: the parsed descriptor plus all page textures.
 *
 * Loaded by the built-in BMFont factory - no extra setup required.
 * Pass directly to {@link BitmapText}.
 *
 * ```ts
 * const font = await loader.load(Asset.type('bmFont', 'fonts/ui.fnt'));
 * const label = new BitmapText('Score: 0', font);
 * ```
 * @stable
 */
export class BmFont {
  /** The parsed descriptor, including any declared distance encoding and atlas metadata. */
  public readonly fontData: BmFontData;
  /** Page textures in descriptor page order. This object does not own them;
   * the caller or the producing asset keeps ownership. */
  public readonly textures: readonly Texture[];

  public constructor(fontData: BmFontData, textures: readonly Texture[]) {
    assert(
      textures.length === fontData.pages.length,
      `BmFont: texture count (${textures.length}) must match page count (${fontData.pages.length})`,
    );
    this.fontData = fontData;
    this.textures = textures;
  }
}
