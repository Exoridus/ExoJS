/**
 * A sprite over an ordinary canvas-sourced texture.
 *
 * Deliberately not self-describing: an output pixel here carries a colour, not
 * the identity of the texel it came from, so a matching frame proves the two
 * backends agree but not that either placed the right texel. Mirror the UVs and
 * this scene still renders byte-identical frames. The runner therefore caps it
 * at `frame-equal` however exhaustively the frames were compared — which is the
 * point of capping it there rather than trusting the property's claim.
 */

import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import type { Scene } from '../types';

const CANVAS = 64;

const solidTexture = (color: string, edge: number): Texture => {
  const source = document.createElement('canvas');

  source.width = edge;
  source.height = edge;

  const ctx = source.getContext('2d');

  if (ctx === null) throw new Error('A 2D context is required to build the fixture.');

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, edge, edge);

  return new Texture(source);
};

export const spriteCanvasScenes: readonly Scene[] = [
  {
    name: 'sprite/canvas-texture',
    feature: 'Sprite',
    size: CANVAS,
    fixture: 'opaque-solid',
    nearestSampled: false,
    build: () => {
      const root = new Container();
      const sprite = new Sprite(solidTexture('#ff0000', 16));

      sprite.setPosition(8, 8);
      root.addChild(sprite);

      return root;
    },
  },
];
