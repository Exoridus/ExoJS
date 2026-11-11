/// <reference types="vite/client" />

import { describe, expect, test } from 'vitest';

/**
 * The WebGPU particle stages associate a straight-alpha sample with its alpha
 * before the tint multiply (`uniforms.flags.x`). The built-in GL stages must do
 * the same when the bound texture's policy asks for it, or the same system looks
 * different on the two backends. The renderer supplies the flag from
 * `backend.shouldPremultiplyTextureSample(texture)`.
 */
const fragments = import.meta.glob(['../src/renderers/shaders/particle.frag', '../src/renderModes/shaders/*.frag'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('WebGL2 particle sample association', () => {
  test('every built-in GL particle stage declares the association flag and applies it before the tint', () => {
    const names = Object.keys(fragments)
      .map(path => path.slice(path.lastIndexOf('/') + 1))
      .sort();

    expect(names).toEqual(['particle.frag', 'ribbon.frag', 'trail.frag']);

    for (const source of Object.values(fragments)) {
      expect(source).toContain('uniform float u_associateSample;');
      expect(source).toContain('texel.rgb * texel.a');
    }
  });
});
