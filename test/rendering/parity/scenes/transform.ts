/**
 * Transform scenes over a coordinate-encoding texture.
 *
 * Every transform here is loss-free under nearest sampling - quarter turns,
 * whole-number scales, axis flips - so each output pixel still names exactly
 * one source texel. A backend that builds its matrix differently (row-major
 * against column-major, a flipped clip-space Y) shows up as coordinates that
 * disagree, not as a slightly softer image.
 */

import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';

import { buildCoordinateTexture } from '../../browser/_selfDescribingFixture';
import type { Scene } from '../types';

const FIXTURE = 16;
const CANVAS = 64;

const sprite = (): Sprite => new Sprite(buildCoordinateTexture(FIXTURE));

const rooted = (node: Sprite | Container): Container => {
  const root = new Container();

  root.addChild(node);

  return root;
};

export const transformScenes: readonly Scene[] = [
  {
    // A quarter turn maps texels onto texels exactly; no resampling involved.
    // Anchored at the canvas centre so the sprite stays fully inside whichever
    // way the rotation turns - off-canvas would silently halve the pixels under
    // test while every comparison still passed.
    name: 'transform/rotated-quarter-turn',
    feature: 'Transform',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () =>
      rooted(
        sprite()
          .setPosition(CANVAS / 2, CANVAS / 2)
          .setRotation(90),
      ),
  },
  {
    // Whole-number scale: every output pixel still belongs to one texel, just
    // four pixels per texel instead of one.
    name: 'transform/scaled-2x',
    feature: 'Transform',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => rooted(sprite().setPosition(8, 8).setScale(2, 2)),
  },
  {
    // Negative scale on one axis - the mirror case, where a coordinate texture
    // is the difference between "looks fine" and "provably flipped".
    name: 'transform/flipped-x',
    feature: 'Transform',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => rooted(sprite().setPosition(40, 8).setScale(-1, 1)),
  },
  {
    // Transform composed through a parent: the child's own offset must combine
    // with the parent's, and both backends must compose in the same order.
    name: 'transform/nested-parent-offset',
    feature: 'Transform',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => {
      const root = new Container();
      const parent = new Container();

      parent.setPosition(16, 16);
      parent.addChild(sprite().setPosition(8, 8));
      root.addChild(parent);

      return root;
    },
  },
];
