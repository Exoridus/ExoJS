import { DataTexture, type Texture, TextureFormat } from '@codexo/exojs';

import { readAlphaField } from '../readAlphaField';

/** Tuning for {@link deriveNormalsFromAlpha}. */
export interface DeriveNormalsOptions {
  /**
   * How pronounced the derived relief is. Higher values tilt the normals
   * further from the plane, which reads as a steeper edge. Defaults to `2`.
   */
  readonly strength?: number;
}

/** Encoded flat normal - `(0, 0, 1)` in tangent space. */
const flatByte = 128;

/**
 * Derive a tangent-space normal map from a texture's alpha channel.
 *
 * The alpha channel of a 2D sprite is a silhouette, and a silhouette read as a
 * height field gives the one thing a flat sprite lacks: edges that turn away
 * from the light. Sobel over alpha yields the gradient, the gradient becomes a
 * tilt, and the interior - where alpha is flat - stays flat, so the result
 * lights like a relief cut from the shape rather than like a sphere pasted onto
 * it.
 *
 * It is not a substitute for an authored map and does not pretend to be: it has
 * no information about anything inside the silhouette. It is the difference
 * between a scene that reacts to light and one that does not, for projects
 * whose art was never authored with lighting in mind.
 *
 * Runs once, synchronously, over a 2D canvas, so it needs a source the browser
 * can draw - an image, a canvas, an `ImageBitmap`. A texture that is still
 * loading, or one backed by nothing drawable, yields a flat map.
 */
export const deriveNormalsFromAlpha = (texture: Texture, options: DeriveNormalsOptions = {}): DataTexture<TextureFormat.Rgba8> => {
  const width = Math.max(1, texture.width);
  const height = Math.max(1, texture.height);
  const alpha = readAlphaField(texture, width, height);

  return normalsFromAlphaField(alpha, width, height, options);
};

/**
 * The gradient half of {@link deriveNormalsFromAlpha}, over an alpha field that
 * is already in hand - `null` for "unreadable", which yields a flat map.
 *
 * Separate from the pixel read because that half needs a browser canvas and
 * this half is arithmetic: the shape of the result is decided here, and can be
 * checked without a GPU or a DOM.
 * @internal
 */
export const normalsFromAlphaField = (
  alpha: Float32Array | null,
  width: number,
  height: number,
  options: DeriveNormalsOptions = {},
): DataTexture<TextureFormat.Rgba8> => {
  const derived = new DataTexture({ width, height, format: TextureFormat.Rgba8 });

  if (alpha === null) {
    fillFlat(derived.buffer);
    derived.commit();

    return derived;
  }

  const strength = options.strength ?? 2;
  const buffer = derived.buffer;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Sobel over the alpha field. Sampling clamps at the border rather than
      // wrapping: a sprite's edge is where the silhouette ends, not where it
      // continues on the other side.
      const left = sampleAlpha(alpha, width, height, x - 1, y);
      const right = sampleAlpha(alpha, width, height, x + 1, y);
      const top = sampleAlpha(alpha, width, height, x, y - 1);
      const bottom = sampleAlpha(alpha, width, height, x, y + 1);
      const topLeft = sampleAlpha(alpha, width, height, x - 1, y - 1);
      const topRight = sampleAlpha(alpha, width, height, x + 1, y - 1);
      const bottomLeft = sampleAlpha(alpha, width, height, x - 1, y + 1);
      const bottomRight = sampleAlpha(alpha, width, height, x + 1, y + 1);

      const gradientX = topLeft + 2 * left + bottomLeft - (topRight + 2 * right + bottomRight);
      const gradientY = topLeft + 2 * top + topRight - (bottomLeft + 2 * bottom + bottomRight);

      // The gradient points out of the silhouette, so the normal tilts along it
      // and z carries whatever is left of a unit vector.
      const nx = gradientX * strength;
      const ny = gradientY * strength;
      const length = Math.hypot(nx, ny, 1);
      const offset = (y * width + x) * 4;

      buffer[offset] = encode(nx / length);
      buffer[offset + 1] = encode(ny / length);
      buffer[offset + 2] = encode(1 / length);
      buffer[offset + 3] = 255;
    }
  }

  derived.commit();

  return derived;
};

/** `-1..1` to a `0..255` channel, the tangent-space encoding every normal map uses. */
const encode = (value: number): number => Math.round((value * 0.5 + 0.5) * 255);

const fillFlat = (buffer: Uint8Array): void => {
  for (let offset = 0; offset < buffer.length; offset += 4) {
    buffer[offset] = flatByte;
    buffer[offset + 1] = flatByte;
    buffer[offset + 2] = 255;
    buffer[offset + 3] = 255;
  }
};

const sampleAlpha = (alpha: Float32Array, width: number, height: number, x: number, y: number): number => {
  const clampedX = Math.min(width - 1, Math.max(0, x));
  const clampedY = Math.min(height - 1, Math.max(0, y));

  return alpha[clampedY * width + clampedX]!;
};
