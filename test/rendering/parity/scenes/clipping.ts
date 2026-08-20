/**
 * Stencil-clipped scenes.
 *
 * A clip shape sends both backends down a path they otherwise never take -
 * a stencil buffer on WebGL2 against a separate stencil attachment and
 * pipeline state on WebGPU. The sprite inside keeps its coordinate texture, so
 * the surviving pixels remain traceable: this checks not just *that* something
 * was clipped, but that the same texels survived on both sides.
 */

import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Sprite } from '#rendering/sprite/Sprite';

import { buildCoordinateTexture } from '../../browser/_selfDescribingFixture';
import type { Scene } from '../types';

const FIXTURE = 32;
const CANVAS = 64;

/** Right triangle covering the top-left half of a `size` square, in node space. */
const rightTriangle = (size: number): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, size, 0, 0, size]),
    stride: 8,
  });

export const clippingScenes: readonly Scene[] = [
  {
    name: 'mask/triangle-clip',
    feature: 'Mask',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => {
      const root = new Container();
      const clipped = new Container();
      const sprite = new Sprite(buildCoordinateTexture(FIXTURE));

      sprite.setPosition(8, 8);
      clipped.clip = true;
      clipped.clipShape = rightTriangle(FIXTURE);
      clipped.addChild(sprite);
      root.addChild(clipped);

      return root;
    },
  },
];
