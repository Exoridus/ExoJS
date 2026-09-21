/**
 * Turn the bottom-up rows `gl.readPixels` writes into top-down ones, in place.
 *
 * Swapping halves through a single scratch row keeps the read at one extra row
 * of memory rather than a second copy of the image, which for a full-frame
 * capture is the difference between kilobytes and megabytes.
 * @internal
 */
export const flipRowsInPlace = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  scratch: Uint8ClampedArray = new Uint8ClampedArray(width * 4),
): Uint8ClampedArray => {
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
