import type { Texture } from '@codexo/exojs';

/**
 * A texture's alpha channel as `0..1` per pixel in row-major order, or `null`
 * when the source cannot be read.
 *
 * Needs a browser canvas, so it is kept apart from everything that consumes
 * it: the arithmetic over an alpha field - derived normals, traced outlines -
 * stays checkable without a GPU or a DOM.
 *
 * A texture that is still loading, backed by nothing drawable, or tainted by a
 * cross-origin image reads as `null` rather than throwing: the silhouette is
 * unknowable, and the caller decides what that means.
 * @internal
 */
export const readAlphaField = (texture: Texture, width: number, height: number): Float32Array | null => {
  const source = texture.source;

  if (source === null || typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (context === null) {
    return null;
  }

  try {
    context.drawImage(source, 0, 0, width, height);
  } catch {
    return null;
  }

  let pixels: Uint8ClampedArray;

  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }

  const alpha = new Float32Array(width * height);

  for (let index = 0; index < alpha.length; index++) {
    alpha[index] = pixels[index * 4 + 3]! / 255;
  }

  return alpha;
};
