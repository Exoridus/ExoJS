/**
 * Sprite scenes over a coordinate-encoding texture.
 *
 * Each is drawn 1:1 - one screen pixel per texel - so a sample point never
 * lands on a texel boundary and every output pixel has exactly one correct
 * source texel.
 */

import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';

import { buildCoordinateTexture } from '../../browser/_selfDescribingFixture';
import type { Scene } from '../types';

const FIXTURE = 32;
const CANVAS = 64;

const spriteAt = (x: number, y: number): Container => {
  const root = new Container();
  const sprite = new Sprite(buildCoordinateTexture(FIXTURE));

  sprite.setPosition(x, y);
  root.addChild(sprite);

  return root;
};

export const spriteScenes: readonly Scene[] = [
  {
    name: 'sprite/origin',
    feature: 'Sprite',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => spriteAt(0, 0),
  },
  {
    // Same sprite at a whole-pixel offset: a translation must move the image
    // without altering which texel any given output pixel came from.
    name: 'sprite/translated',
    feature: 'Sprite',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => spriteAt(16, 8),
  },
];
