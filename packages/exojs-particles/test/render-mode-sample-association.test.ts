import { describe, expect, test } from 'vitest';

import particleFragment from '../src/renderers/shaders/particle.frag?raw';
import rendererSource from '../src/renderers/WebGl2ParticleRenderer.ts?raw';
import ribbonFragment from '../src/renderModes/shaders/ribbon.frag?raw';
import trailFragment from '../src/renderModes/shaders/trail.frag?raw';

/**
 * The WebGPU particle stages associate a straight-alpha sample with its alpha
 * before the tint multiply (`uniforms.flags.x`). The built-in GL stages must do
 * the same when the bound texture's policy asks for it, or the same system looks
 * different on the two backends.
 */
describe('WebGL2 particle sample association', () => {
  const fragments = { 'particle.frag': particleFragment, 'trail.frag': trailFragment, 'ribbon.frag': ribbonFragment };

  test.each(Object.entries(fragments))('%s declares the association flag and applies it before the tint', (_name, source) => {
    expect(source).toContain('uniform float u_associateSample;');
    expect(source).toContain('texel.rgb * texel.a');
  });

  test('the renderer sets the flag from the backend texture policy', () => {
    expect(rendererSource).toContain("shader.uniforms.has('u_associateSample')");
    expect(rendererSource).toContain('shouldPremultiplyTextureSample(texture)');
  });
});
