/**
 * Tint and blend scenes.
 *
 * Both recolour a coordinate texture, which is why they declare
 * `colour-modified`: the sprite still lands on exactly the right pixels, but
 * the channels now carry a product of texel and tint instead of coordinates,
 * so no pixel can be traced back. The runner caps them at `frame-equal`
 * accordingly - the geometry is exact, the provenance is not.
 *
 * They are worth measuring precisely because colour maths is where the two
 * backends run genuinely different code: fixed-function blend state on WebGL2
 * against a blend descriptor plus, for the backdrop-aware modes, a shader.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { BlendModes } from '#rendering/types';

import { buildCoordinateTexture } from '../../browser/_selfDescribingFixture';
import type { Scene } from '../types';

const FIXTURE = 32;
const CANVAS = 64;

const tinted = (color: Color): Container => {
  const root = new Container();
  const sprite = new Sprite(buildCoordinateTexture(FIXTURE));

  sprite.tint = color;
  sprite.setPosition(8, 8);
  root.addChild(sprite);

  return root;
};

export const colourScenes: readonly Scene[] = [
  {
    // A half-intensity tint: every channel is scaled, so a backend that applies
    // the tint in the wrong colour space diverges here and nowhere else.
    name: 'tint/half-intensity',
    feature: 'Tint',
    size: CANVAS,
    fixture: 'colour-modified',
    nearestSampled: true,
    build: () => tinted(new Color(128, 128, 128, 1)),
  },
  {
    // Additive blending over an opaque backdrop - the classic case where a
    // premultiply mismatch between backends shows up as a brighter or darker
    // overlap while each sprite alone looks correct.
    name: 'blend/additive-overlap',
    feature: 'BlendMode',
    size: CANVAS,
    fixture: 'colour-modified',
    nearestSampled: true,
    build: () => {
      const root = new Container();
      const backdrop = new Sprite(buildCoordinateTexture(FIXTURE));
      const overlay = new Sprite(buildCoordinateTexture(FIXTURE));

      backdrop.setPosition(8, 8);
      overlay.setPosition(24, 24);
      overlay.blendMode = BlendModes.Additive;

      root.addChild(backdrop);
      root.addChild(overlay);

      return root;
    },
  },
];
