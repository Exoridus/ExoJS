import { AbstractAssetFactory } from '#resources/AbstractAssetFactory';
import { determineMimeType } from '#resources/utils';

/** Decoded image result from {@link ImageFactory.create}. */
export type DecodedImage = HTMLImageElement | ImageBitmap;

/** Construction options for {@link ImageFactory.create}. */
export interface ImageFactoryOptions {
  /**
   * MIME type used when constructing the intermediate {@link Blob}. When
   * omitted the type is inferred from the buffer's magic bytes via
   * `determineMimeType`.
   */
  mimeType?: string;
}

/**
 * {@link AssetFactory} implementation that loads PNG, JPG, WebP, AVIF, and
 * other browser-supported raster image formats and produces a decoded image.
 *
 * When `createImageBitmap` is available (all modern browsers) the factory
 * returns an {@link ImageBitmap} — a zero-copy GPU-upload path that avoids
 * the HTMLImageElement render-pipeline overhead. On older environments it
 * falls back to an {@link HTMLImageElement}.
 *
 * MIME type detection is performed automatically from the buffer's magic bytes;
 * pass an explicit `mimeType` in options to override.
 */
export class ImageFactory extends AbstractAssetFactory<DecodedImage> {
  public readonly storageName = 'image';

  /**
   * Reads the full response body as an {@link ArrayBuffer} for MIME-type
   * detection and blob construction.
   */
  public async process(response: Response): Promise<ArrayBuffer> {
    return response.arrayBuffer();
  }

  /**
   * Decodes image bytes into a {@link DecodedImage}.
   *
   * Prefers `createImageBitmap` for a zero-copy GPU-upload path. Falls back
   * to a temporary object URL + `<img>` element on environments that do not
   * support `createImageBitmap`.
   */
  public async create(source: ArrayBuffer, options: ImageFactoryOptions = {}): Promise<DecodedImage> {
    const blob = new Blob([source], { type: options.mimeType ?? determineMimeType(source) });

    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob);
    }

    const objectUrl = this.createObjectUrl(blob);

    return new Promise((resolve, reject) => {
      const image = new Image();
      const finalize = (): void => {
        this.revokeObjectUrl(objectUrl);
      };

      image.addEventListener(
        'load',
        () => {
          finalize();
          resolve(image);
        },
        { once: true },
      );
      image.addEventListener(
        'error',
        () => {
          finalize();
          reject(
            new Error(
              'Failed to decode image source — the bytes may be corrupted, an unsupported format, or (if loaded with the wrong Asset.kind) not an image at all.',
            ),
          );
        },
        { once: true },
      );
      image.addEventListener(
        'abort',
        () => {
          finalize();
          reject(new Error('Image loading was canceled.'));
        },
        { once: true },
      );

      image.src = objectUrl;
    });
  }
}
