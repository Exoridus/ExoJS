import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';

/** Options accepted by an asset of the built-in `font` type. */
export interface FontAssetOptions {
  /** CSS font-family name the {@link FontFace} is registered under. Required. */
  family: string;
  /** CSS font descriptors (style, weight, stretch, ...). */
  descriptors?: FontFaceDescriptors;
  /**
   * Whether the loaded face is added to `document.fonts`, making it available
   * to CSS and Canvas immediately. Defaults to `true`; a face added this way is
   * removed again when the asset is released, and when the loader is destroyed.
   */
  addToDocument?: boolean;
}

/**
 * Parses web-font binary data (WOFF, WOFF2, TTF, OTF) into a loaded
 * {@link FontFace}.
 * @internal
 */
export class FontFactory implements AssetFactory<ArrayBuffer, FontFace, FontAssetOptions> {
  private readonly _addedFontFaces = new Set<FontFace>();

  public async create(source: ArrayBuffer, context: AssetFactoryContext<FontAssetOptions>): Promise<FontFace> {
    const options = context.options;

    // An empty family is as unusable as a missing one, so both nullish and
    // empty take the same branch on purpose.
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!options?.family) {
      throw new Error('A font asset requires a "family" option naming the CSS font-family it registers under.');
    }

    if (source.byteLength < 4) {
      throw new SyntaxError(`Invalid font data: expected at least 4 bytes, received ${source.byteLength}.`);
    }

    const fontFace = await new FontFace(options.family, source, options.descriptors).load().catch(() => {
      throw new SyntaxError(`Invalid font data in ArrayBuffer (${source.byteLength} bytes).`);
    });

    if (options.addToDocument !== false) {
      document.fonts.add(fontFace);
      this._addedFontFaces.add(fontFace);
    }

    return fontFace;
  }

  /** Unregisters a released face, so CSS and Canvas stop resolving its family. */
  public dispose(resource: FontFace): void {
    if (this._addedFontFaces.delete(resource)) {
      document.fonts.delete(resource);
    }
  }

  public destroy(): void {
    for (const fontFace of this._addedFontFaces) {
      document.fonts.delete(fontFace);
    }

    this._addedFontFaces.clear();
  }
}
