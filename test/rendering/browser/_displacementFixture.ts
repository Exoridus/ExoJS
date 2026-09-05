/**
 * Shared scene for the displacement pixel specs (WebGL2 + WebGPU).
 *
 * The blur fixture's 16x16 white square at [24, 40) is displaced by a map that
 * is one constant colour, so every fragment reads from the same direction and
 * the square arrives whole somewhere else. The map pushes the SAMPLE right and
 * down, which moves the image left and up by {@link DISPLACEMENT_SHIFT}.
 *
 * The vertical half is the point: the two backends store the effect domain the
 * other way up, so a filter that ignored `uOrientation` would move the square
 * up on one and down on the other.
 */

import { DisplacementFilter } from '#rendering/filters/DisplacementFilter';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';

/**
 * Byte the map carries in red and green. `204 / 255` is exactly `0.8`, which
 * the shader decodes to exactly `+0.6` - so the shift below is an integer
 * number of pixels rather than something the probes have to be lenient about.
 */
const MAP_CHANNEL = 204;

/** The filter's own default, used unchanged so the spec covers it. */
export const DISPLACEMENT_SCALE = 20;

/** `0.6 * DISPLACEMENT_SCALE`, in logical units, right and down. */
export const DISPLACEMENT_SHIFT = 12;

/** Inside the displaced square, clear of its edges. */
export const DISPLACED_SQUARE: readonly [number, number] = [20, 20];

/** Where the square was before the displacement, now vacated. */
export const VACATED_SQUARE: readonly [number, number] = [34, 34];

/** Beyond the displaced square on the low side. */
export const BEFORE_SQUARE: readonly [number, number] = [8, 8];

/** Where the square would land if the vertical direction were flipped. */
export const MIRRORED_SQUARE: readonly [number, number] = [20, 44];

/** A constant map: red and green both {@link MAP_CHANNEL}, so every texel points the same way. */
export const constantDisplacementMap = (size = 4): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (context === null) throw new Error('A 2D context is required to build displacement fixtures.');

  const image = context.createImageData(size, size);

  for (let i = 0; i < size * size; i++) {
    const offset = i * 4;

    image.data[offset] = MAP_CHANNEL;
    image.data[offset + 1] = MAP_CHANNEL;
    image.data[offset + 2] = 0;
    image.data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);

  return new Texture(source, { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.ClampToEdge, generateMipMap: false });
};

export const displacement = (map: Texture): DisplacementFilter => new DisplacementFilter({ map });
