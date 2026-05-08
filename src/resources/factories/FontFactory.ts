import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';

/**
 * Options accepted by {@link FontFactory.create}.
 */
export interface FontFactoryOptions {
  /** CSS font-family name passed to the {@link FontFace} constructor. Required. */
  family: string;
  /** Optional CSS font descriptors (style, weight, stretch, etc.). */
  descriptors?: FontFaceDescriptors;
  /**
   * When `true` (the default), the loaded {@link FontFace} is added to
   * `document.fonts` so it is immediately available for CSS and Canvas
   * rendering. Set to `false` to skip registration and manage the font
   * lifecycle manually.
   */
  addToDocument?: boolean;
}

/**
 * {@link AssetFactory} implementation that loads web-font binary data (WOFF,
 * WOFF2, TTF, OTF) and produces a parsed {@link FontFace}.
 *
 * By default each created font is registered with `document.fonts`, making it
 * globally available to CSS and Canvas without any further steps. Fonts added
 * this way are automatically removed from `document.fonts` when
 * {@link FontFactory.destroy} is called.
 */
export class FontFactory extends AbstractAssetFactory<FontFace> {
  public readonly storageName = 'font';

  private readonly _addedFontFaces: FontFace[] = [];

  /**
   * Reads the full response body as an {@link ArrayBuffer} suitable for
   * passing to the {@link FontFace} constructor.
   */
  public async process(response: Response): Promise<ArrayBuffer> {
    return response.arrayBuffer();
  }

  /**
   * Constructs and loads a {@link FontFace} from binary font data.
   *
   * Throws if `options.family` is not supplied, or if the buffer contains
   * fewer than 4 bytes or is otherwise unrecognised as a valid font.
   * Unless `options.addToDocument` is explicitly `false`, the font face is
   * registered via `document.fonts.add()` immediately after loading.
   */
  public async create(source: ArrayBuffer, options?: FontFactoryOptions): Promise<FontFace> {
    if (!options?.family) {
      throw new Error('FontFactory.create requires options with a "family" property.');
    }

    const { family, descriptors, addToDocument } = options;

    if (source.byteLength < 4) {
      throw new SyntaxError(`Invalid font data: expected at least 4 bytes, received ${source.byteLength}.`);
    }

    const fontFace = await new FontFace(family, source, descriptors).load().catch(() => {
      throw new SyntaxError(`Invalid font data in ArrayBuffer (${source.byteLength} bytes).`);
    });

    if (addToDocument !== false) {
      document.fonts.add(fontFace);
      this._addedFontFaces.push(fontFace);
    }

    return fontFace;
  }

  /**
   * Removes all font faces previously registered with `document.fonts` by
   * this factory, then releases any tracked object URLs via the base
   * {@link AbstractAssetFactory.destroy} implementation.
   */
  public override destroy(): void {
    for (const fontFace of this._addedFontFaces) {
      document.fonts.delete(fontFace);
    }
    this._addedFontFaces.length = 0;
    super.destroy();
  }
}
