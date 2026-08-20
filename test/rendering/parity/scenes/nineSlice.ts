/**
 * Nine-slice scenes over a coordinate-encoding texture.
 *
 * The interesting property of nine-slice is that it is nine separate quads
 * sharing one texture, each with its own UV window - exactly the place a
 * backend can disagree about which texel belongs where. Encoding coordinates
 * in the texels turns "the frames match" into "every quad sampled the window
 * it was supposed to".
 *
 * Both variants stay traceable: under nearest sampling a stretched centre
 * still maps each output pixel to exactly one texel, just more pixels per
 * texel than the unstretched case.
 */

import { Container } from '#rendering/Container';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';

import { buildCoordinateTexture } from '../../browser/_selfDescribingFixture';
import type { Scene } from '../types';

const FIXTURE = 32;
const CANVAS = 64;
const INSET = 8;

const nineSliceOf = (width: number, height: number): Container => {
  const root = new Container();
  const sprite = new NineSliceSprite(buildCoordinateTexture(FIXTURE), {
    slices: INSET,
    border: INSET,
    width,
    height,
  });

  sprite.setPosition(8, 8);
  root.addChild(sprite);

  return root;
};

export const nineSliceScenes: readonly Scene[] = [
  {
    // Target size equals the fixture: every quad draws its window 1:1, so a
    // wrong UV window shows up as a shifted coordinate rather than as blur.
    name: 'nine-slice/unstretched',
    feature: 'NineSlice',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => nineSliceOf(FIXTURE, FIXTURE),
  },
  {
    // Larger than the fixture: corners stay 1:1 while edges and centre
    // stretch, which is where the per-quad UV maths actually earns its keep.
    name: 'nine-slice/stretched',
    feature: 'NineSlice',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => nineSliceOf(48, 48),
  },
];
