/**
 * Shared scene for the ColorMatrixFilter pixel specs (WebGL2 + WebGPU).
 *
 * Everything is drawn over black, so a composited reading of a colour `c` with
 * alpha `a` is simply `c * a` — which is what makes the half-transparent cells
 * able to tell a straight-alpha transform from one applied to the stored
 * premultiplied sample.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { Filter } from '#rendering/filters/Filter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

export const MATRIX_SCENE_SIZE = 64;

/** The sprite covers `[16, 32)`; this point is comfortably inside it. */
export const SPRITE_ORIGIN = 16;
export const SAMPLE = 24;
/** A second sprite for the subtree cells, and a point inside it. */
export const SECOND_ORIGIN = 36;
export const SECOND_SAMPLE = 42;

export const CLEAR = Color.black;

/** A 16×16 texture of one CSS colour, alpha included. */
export const flatTexture = (css: string): Texture => {
  const source = document.createElement('canvas');

  source.width = 16;
  source.height = 16;

  const context = source.getContext('2d');

  if (context === null) throw new Error('A 2D context is required to build colour-matrix fixtures.');

  context.clearRect(0, 0, 16, 16);
  context.fillStyle = css;
  context.fillRect(0, 0, 16, 16);

  return new Texture(source);
};

/** One filtered sprite of `css`, parented into a fresh root. */
export const matrixScene = (css: string, filters: readonly Filter[]): { root: Container; textures: Texture[] } => {
  const texture = flatTexture(css);
  const root = new Container();
  const filtered = new Container();
  const sprite = new Sprite(texture);

  sprite.setPosition(SPRITE_ORIGIN, SPRITE_ORIGIN);

  for (const filter of filters) filtered.addFilter(filter);

  filtered.addChild(sprite);
  root.addChild(filtered);

  return { root, textures: [texture] };
};

/** Two sprites under ONE filtered container — the whole-subtree case. */
export const matrixSubtreeScene = (first: string, second: string, filters: readonly Filter[]): { root: Container; textures: Texture[] } => {
  const firstTexture = flatTexture(first);
  const secondTexture = flatTexture(second);
  const root = new Container();
  const filtered = new Container();
  const a = new Sprite(firstTexture);
  const b = new Sprite(secondTexture);

  a.setPosition(SPRITE_ORIGIN, SPRITE_ORIGIN);
  b.setPosition(SECOND_ORIGIN, SECOND_ORIGIN);

  for (const filter of filters) filtered.addFilter(filter);

  filtered.addChild(a);
  filtered.addChild(b);
  root.addChild(filtered);

  return { root, textures: [firstTexture, secondTexture] };
};
