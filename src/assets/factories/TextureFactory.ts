import { AbstractAssetFactory } from '#assets/AbstractAssetFactory';
import { determineMimeType } from '#assets/utils';
import { Texture } from '#rendering/texture/Texture';
import type { TextureOptions } from '#rendering/texture/TextureOptions';

/** Construction options for {@link TextureFactory.create}. */
export interface TextureFactoryOptions {
  /**
   * MIME type for the intermediate blob. Inferred from magic bytes when
   * omitted.
   */
  mimeType?: string;
  /** Sampling and upload state forwarded to the {@link Texture} constructor; any subset. */
  textureOptions?: Partial<TextureOptions>;
}

/**
 * {@link AssetFactory} implementation that loads PNG, JPG, WebP, AVIF, and
 * other browser-supported raster image formats and produces a GPU-ready
 * {@link Texture} instance.
 *
 * MIME type detection is performed automatically from the buffer's magic bytes;
 * pass an explicit `mimeType` to override. Texture state (wrap, filter, etc.)
 * can be configured via `textureOptions`.
 */
export class TextureFactory extends AbstractAssetFactory<Texture> {
  public readonly storageName = 'texture';

  /**
   * Reads the full response body as an {@link ArrayBuffer} for MIME-type
   * detection and blob construction.
   */
  public async process(response: Response): Promise<ArrayBuffer> {
    return response.arrayBuffer();
  }

  /**
   * Decodes image bytes and wraps the result in a {@link Texture}.
   *
   * Prefers `createImageBitmap` for a zero-copy GPU-upload path. Falls back
   * to a temporary object URL + `<img>` element on environments that do not
   * support `createImageBitmap`.
   */
  public async create(source: ArrayBuffer, options: TextureFactoryOptions = {}): Promise<Texture> {
    const { mimeType, textureOptions } = options;
    const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });

    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      return new Texture(bitmap, textureOptions);
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
          resolve(new Texture(image, textureOptions));
        },
        { once: true },
      );
      image.addEventListener(
        'error',
        () => {
          finalize();
          reject(
            new Error(
              'Failed to decode image source — the bytes may be corrupted, an unsupported format, or (if loaded with the wrong Asset.type) not an image at all.',
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
