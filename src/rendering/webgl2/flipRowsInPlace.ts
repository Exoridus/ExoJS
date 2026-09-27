import type { PixelArray } from '#rendering/pixelPayload';

/**
 * Turn the bottom-up rows `gl.readPixels` writes into top-down ones, in place.
 *
 * Swapping halves through a single scratch row keeps the read at one extra row
 * of memory rather than a second copy of the image, which for a full-frame
 * capture is the difference between kilobytes and megabytes.
 * @internal
 */
export const flipRowsInPlace = <T extends PixelArray>(
  pixels: T,
  width: number,
  height: number,
  scratch: PixelArray = pixels instanceof Float32Array ? new Float32Array(width * 4) : new Uint8ClampedArray(width * 4),
): T => {
  const stride = width * 4;

  for (let row = 0; row < height >> 1; row++) {
    const top = row * stride;
    const bottom = (height - 1 - row) * stride;

    scratch.set(pixels.subarray(top, top + stride));
    pixels.copyWithin(top, bottom, bottom + stride);
    pixels.set(scratch, bottom);
  }

  return pixels;
};
