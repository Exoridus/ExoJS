import type { ObjectUrlPool } from './ObjectUrlPool';

/** Interpretation required from the browser decoder. @internal */
export type ImageDecodeMode = 'color' | 'data';

const colorDecodeOptions: ImageBitmapOptions = Object.freeze({ colorSpaceConversion: 'default', premultiplyAlpha: 'none' });
const dataDecodeOptions: ImageBitmapOptions = Object.freeze({ colorSpaceConversion: 'none', premultiplyAlpha: 'none' });

/**
 * Decodes an image blob, preferring `createImageBitmap` for its zero-copy
 * GPU-upload path and falling back to an `<img>` element where the environment
 * has none.
 *
 * The fallback's object URL is revoked as soon as the element settles either
 * way: the decoded image no longer needs it, and an unrevoked URL pins the blob
 * for the lifetime of the document.
 * @internal
 */
export const decodeImageBlob = (blob: Blob, objectUrls: ObjectUrlPool, mode: ImageDecodeMode = 'color'): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob, mode === 'color' ? colorDecodeOptions : dataDecodeOptions);
  }

  if (mode === 'data') {
    return Promise.reject(
      new TypeError(
        "Numeric image decoding requires createImageBitmap() with colorSpaceConversion: 'none' and premultiplyAlpha: 'none'. Use Texture.fromPixels() or KTX2 bytes instead.",
      ),
    );
  }

  const objectUrl = objectUrls.create(blob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    const settle = (finish: () => void): void => {
      objectUrls.revoke(objectUrl);
      finish();
    };

    image.addEventListener('load', () => settle(() => resolve(image)), { once: true });
    image.addEventListener(
      'error',
      () =>
        settle(() =>
          reject(
            new Error(
              'Failed to decode image source - the bytes may be corrupted, an unsupported format, or (if loaded as the wrong asset type) not an image at all.',
            ),
          ),
        ),
      { once: true },
    );
    image.addEventListener('abort', () => settle(() => reject(new Error('Image loading was canceled.'))), { once: true });

    image.src = objectUrl;
  });
};
