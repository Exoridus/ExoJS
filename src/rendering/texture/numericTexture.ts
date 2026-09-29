import type { Texture } from './Texture';

/**
 * Throws unless `texture` is exact numeric data (`colorSpace: 'none'`).
 *
 * `'linear-srgb'` is rejected too: it is colour, so it carries colour alpha
 * handling (premultiplication before filtering) that would corrupt numeric
 * channels just as the sRGB decode does.
 * @internal
 */
export const assertNumericTexture = (texture: Texture, consumer: string, remedy: string): void => {
  const colorSpace = texture.colorSpace;

  if (colorSpace !== 'none') {
    throw new Error(`${consumer} resolved to colorSpace: '${colorSpace}' - its channels are numeric data, not colour. ${remedy}`);
  }
};
