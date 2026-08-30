/**
 * The GLSL slot table spliced into the Text fragment stages.
 *
 * Text reads a distance field, not a colour, and that is what separates its
 * prologue from the sprite-material one it is built from: the value coming out
 * of the sampler is compared against a threshold with a band a fraction of a
 * texel wide, so the precision the sampler returns at IS the precision of the
 * antialiased edge.
 */

import { composeTextAtlasFragmentGlsl, textAtlasTextureSlots } from '#rendering/text/atlasTextureSlots';

// GLSL ES 3.00 orders a qualifier list storage-then-precision, so a precision
// qualifier sits between `uniform` and the type. Anchoring on that order is
// part of the assertion: ahead of `uniform` it would not compile at all.
const SAMPLER_DECL = /^\s*uniform\s+(?:(highp|mediump|lowp)\s+)?sampler2D\s+u_texture\d+;/gm;

const samplerPrecisions = (source: string): Array<string | undefined> => {
  return [...source.matchAll(SAMPLER_DECL)].map(match => match[1]);
};

describe('text atlas fragment prologue', () => {
  const composed = composeTextAtlasFragmentGlsl(['#version 300 es', 'precision highp float;', '', 'void main(void) {}'].join('\n'));

  test('declares one sampler per atlas slot', () => {
    expect(samplerPrecisions(composed)).toHaveLength(textAtlasTextureSlots);
  });

  // A GLSL ES 3.00 fragment shader defaults `sampler2D` to `lowp`, whose step
  // is 2^-6. The edge fades over about +/- one device pixel, so on an atlas
  // magnified past its own density only a handful of those steps would land
  // inside the band and the glyph would read as a staircase. `precision highp
  // float` in the fragment does not cover this: sampler precision is declared
  // separately and governs what `texture()` returns.
  //
  // Asserted over the composed source rather than a rendered frame because the
  // adapters that honour the qualifier are not the ones tests run on here -
  // desktop ANGLE and SwiftShader compute at fp32 whatever it says, so no frame
  // available to this suite can tell the two declarations apart.
  test('samples the distance field at fp32', () => {
    expect(samplerPrecisions(composed).every(precision => precision === 'highp')).toBe(true);
  });

  test('splices below the version directive and the author precision statement', () => {
    const lines = composed.split('\n');

    expect(lines[0]).toBe('#version 300 es');
    expect(lines.slice(0, 3).join('\n')).toContain('precision highp float;');
  });
});
