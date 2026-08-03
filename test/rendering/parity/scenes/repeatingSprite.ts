/**
 * A tiled sprite over a coordinate-encoding texture.
 *
 * Tiling is UV wrapping, and wrapping is where the two backends configure
 * different objects: a WebGL2 sampler parameter against a WebGPU sampler
 * descriptor. A coordinate texture makes a wrong wrap visible as a repeated
 * or mirrored coordinate run instead of a plausible-looking pattern.
 *
 * The target is a whole multiple of the fixture, so every tile boundary falls
 * on a texel boundary and no output pixel sits between two texels.
 */

import { Container } from '#rendering/Container';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';

import { buildCoordinateTexture } from '../../browser/_selfDescribingFixture';
import type { Scene } from '../types';

const FIXTURE = 16;
const CANVAS = 64;

export const repeatingSpriteScenes: readonly Scene[] = [
  {
    name: 'repeating/tiled',
    feature: 'RepeatingSprite',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => {
      const root = new Container();
      const sprite = new RepeatingSprite(buildCoordinateTexture(FIXTURE), { width: FIXTURE * 2, height: FIXTURE * 2 });

      sprite.setPosition(8, 8);
      root.addChild(sprite);

      return root;
    },
  },
];
