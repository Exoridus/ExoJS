/**
 * Shared scene for the isotropic-blur pixel specs (WebGL2 + WebGPU).
 *
 * A 16×16 white square sits dead centre in a 64×64 frame, so the sampling
 * points below come in exact mirror pairs about both axes and both diagonals.
 * The probe that matters is {@link DIAGONAL}: one pixel out from a corner, it
 * is reached ONLY by a kernel that mixes the two axes. An axis-separable pass
 * pair covers it; the cross-shaped sampler this filter used to be leaves it at
 * zero, because neither of its two independent axis sweeps ever sees a lit
 * texel from there.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { Filter } from '#rendering/filters/Filter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

export const BLUR_SCENE_SIZE = 64;

/** The square: `[24, 40)` on both axes, so its centre is exactly 32. */
export const SQUARE_ORIGIN = 24;
export const SQUARE_EXTENT = 16;

/** First pixel outside the square on the high side, and its mirror on the low side. */
export const OUTSIDE_HIGH = 40;
export const OUTSIDE_LOW = 23;

/** A pixel just off a corner — diagonal from every lit texel. */
export const DIAGONAL: readonly [number, number] = [OUTSIDE_HIGH, OUTSIDE_HIGH];

/** The same distance out, but straight along an axis. */
export const ON_AXIS: readonly [number, number] = [OUTSIDE_HIGH, 31];

export const CLEAR = Color.black;

/** A `size×size` white texture. */
export const whiteSquareTexture = (size = SQUARE_EXTENT): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (context === null) throw new Error('A 2D context is required to build blur fixtures.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

/** The white square under `filters`, parented into a fresh root. */
export const blurScene = (filters: readonly Filter[], origin = SQUARE_ORIGIN): { root: Container; texture: Texture } => {
  const texture = whiteSquareTexture();
  const root = new Container();
  const filtered = new Container();
  const sprite = new Sprite(texture);

  sprite.setPosition(origin, origin);

  for (const filter of filters) filtered.addFilter(filter);

  filtered.addChild(sprite);
  root.addChild(filtered);

  return { root, texture };
};
