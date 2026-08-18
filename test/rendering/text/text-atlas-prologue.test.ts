/**
 * The GLSL slot table spliced into the Text fragment stages.
 *
 * Text reads a distance field, not a colour, and that is what separates its
 * prologue from the sprite-material one it is built from: the value coming out
 * of the sampler is compared against a threshold with a band a fraction of a
 * texel wide, so the precision the sampler returns at IS the precision of the
 * antialiased edge.
 */

import { composeTextAtlasFragmentGlsl, textAtlasTextureSlots } from '#rendering/text/textAtlasTextureSlots';

// GLSL ES 3.00 orders a qualifier list storage-then-precision, so a precision
// qualifier sits between `uniform` and the type. Anchoring on that order is
// part of the assertion: ahead of `uniform` it would not compile at all.
const SAMPLER_DECL = /^\s*uniform\s+(?:(highp|mediump|lowp)\s+)?sampler2D\s+u_texture\d+;/gm;

function samplerPrecisions(source: string): Array<string | undefined> {
  return [...source.matchAll(SAMPLER_DECL)].map(match => match[1]);
}

describe('text atlas fragment prologue', () => {
  const composed = composeTextAtlasFragmentGlsl(['#version 300 es', 'precision highp float;', '', 'void main(void) {}'].join('\n'));

  test('declares one sampler per atlas slot', () => {
    expect(samplerPrecisions(composed)).toHaveLength(textAtlasTextureSlots);
  });

  // A GLSL ES 3.00 fragment shader defaults `sampler2D` to `lowp`, whose step
  // around the threshold is 2^-6. The edge fades over about +/- one device
  // pixel, so on an atlas magnified past its own density only a handful of
  // those steps land inside the band and the glyph reads as a staircase. A
  // driver that treats `lowp` as fp32 anyway (desktop ANGLE, SwiftShader) hides
  // it; one that honours it (Mesa's llvmpipe) does not. `precision highp float`
  // in the fragment does not cover this: sampler precision is declared
  // separately and governs what `texture()` returns.
  test('samples the distance field at fp32', () => {
    expect(samplerPrecisions(composed).every(precision => precision === 'highp')).toBe(true);
  });

  test('splices below the version directive and the author precision statement', () => {
    const lines = composed.split('\n');

    expect(lines[0]).toBe('#version 300 es');
    expect(lines.slice(0, 3).join('\n')).toContain('precision highp float;');
  });
});
