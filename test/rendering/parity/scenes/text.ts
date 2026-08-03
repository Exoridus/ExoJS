/**
 * Text scenes.
 *
 * Text is its own subsystem: glyphs are rasterised into an SDF atlas at
 * runtime and sampled with a dedicated shader, so neither the fixture trick nor
 * nearest sampling applies. The claim here is narrower on purpose — both
 * backends consume the same atlas and must turn it into the same frame.
 *
 * That still catches real divergence: the SDF shaders are written twice, once
 * in GLSL and once in WGSL, and a threshold or channel-swizzle difference
 * between them shows up as an edge that is a pixel fatter on one side.
 *
 * Font rasterisation differs between machines, which is fine — every property
 * compares within a single browser on a single run, never against a baseline.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Text } from '#rendering/text/Text';

import type { Scene } from '../types';

const CANVAS = 64;

export const textScenes: readonly Scene[] = [
  {
    name: 'text/sdf-glyphs',
    feature: 'Text',
    size: CANVAS,
    // SDF sampling is filtered by design; no output pixel maps to one texel.
    fixture: 'interpolated',
    nearestSampled: false,
    build: () => {
      const root = new Container();
      const text = new Text('AB', { fillColor: Color.white, fontSize: 28 });

      text.setPosition(6, 6);
      root.addChild(text);

      return root;
    },
  },
];
