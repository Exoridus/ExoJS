import { DataTexture } from '#rendering/texture/DataTexture';
import { TextureFormat } from '#rendering/types';

/** Largest fixture edge the 8-bit coordinate encoding can address unambiguously. */
export const MAX_FIXTURE_SIZE = 256;

/**
 * A square texture whose every texel names itself: red carries the texel's x,
 * green its y, blue a caller-chosen region id, alpha is always opaque.
 *
 * Sampled with nearest filtering and drawn with a white tint, each rendered
 * pixel therefore reports which texel produced it, which turns a pixel
 * comparison into a statement about UV mapping rather than about colour.
 */
export const buildCoordinateTexture = (size: number, regionOf: (x: number, y: number) => number = () => 0): DataTexture<TextureFormat.Rgba8> => {
  if (!Number.isInteger(size) || size <= 0 || size > MAX_FIXTURE_SIZE) {
    throw new Error(`Fixture size must be an integer in 1..${MAX_FIXTURE_SIZE} (got ${size}).`);
  }

  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      data[i] = x;
      data[i + 1] = y;
      data[i + 2] = regionOf(x, y);
      data[i + 3] = 255;
    }
  }

  return new DataTexture({ width: size, height: size, format: TextureFormat.Rgba8, data });
};

/** Inverse of {@link buildCoordinateTexture}'s encoding for one rendered pixel. */
export const decodeTexel = (rgba: readonly [number, number, number, number]): { x: number; y: number; region: number } => ({
  x: rgba[0],
  y: rgba[1],
  region: rgba[2],
});
