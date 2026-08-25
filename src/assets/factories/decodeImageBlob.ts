import type { ObjectUrlPool } from './ObjectUrlPool';

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
export const decodeImageBlob = (blob: Blob, objectUrls: ObjectUrlPool): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
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
