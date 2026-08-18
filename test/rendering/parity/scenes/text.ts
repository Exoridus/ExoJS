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
    // The one scene that cannot be bit-exact across adapters. A glyph edge is
    // an antialiased ramp about one device pixel wide, and coverage there is
    // `(sd - 0.5 + aa) / 2aa` - so the fraction of a channel step by which two
    // adapters' texture filters disagree on the sampled distance comes out
    // multiplied by `1 / 2aa`. Measured: 0 between two hardware adapters, 5
    // between a hardware and a software one, 11 between two software ones, and
    // ~1.5% of the frame - the glyph rim - at all. Widening the edge collapses
    // it back to 0, which is what identifies the cause as the amplification and
    // not the shaders.
    //
    // The bounds are set from both sides. Injected divergences that a reader
    // would call bugs - a 0.04 shift of one backend's fill threshold, a 30%
    // wider edge on one backend - measure 119 and 22 with 6.2-6.6% of the frame
    // touched, so they stay caught; the adapter noise above sits several times
    // under both bounds. Worth re-tightening if the sampling ever becomes
    // adapter-independent.
    crossBackendTolerance: { delta: 16, maxPixelFraction: 0.05 },
    build: () => {
      const root = new Container();
      const text = new Text('AB', { fillColor: Color.white, fontSize: 28 });

      text.setPosition(6, 6);
      root.addChild(text);

      return root;
    },
  },
];
