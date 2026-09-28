import { readFileSync } from 'node:fs';

import { Color } from '@codexo/exojs';

import { ColorGradient } from '../src/distributions/ColorGradient';
import { ColorOverLifetime } from '../src/modules/ColorOverLifetime';
import { ColorOverSpeed } from '../src/modules/ColorOverSpeed';
import { ParticleColorLookup, sampleColorLookup } from '../src/modules/particleLookup';
import { meshParticleWgsl } from '../src/renderModes/MeshParticles';
import { quadParticleWgsl } from '../src/renderModes/QuadParticles';
import { ribbonParticleWgsl } from '../src/renderModes/RibbonParticles';
import { trailParticleWgsl } from '../src/renderModes/TrailParticles';

// Vitest stubs shader-module imports to empty strings, so the sources are read from disk.
const shaderSource = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const particleFragmentGlsl = shaderSource('../src/renderers/shaders/particle.frag');
const particleVertexGlsl = shaderSource('../src/renderers/shaders/particle.vert');
const meshVertexGlsl = shaderSource('../src/renderModes/shaders/mesh.vert');
const ribbonFragmentGlsl = shaderSource('../src/renderModes/shaders/ribbon.frag');
const ribbonVertexGlsl = shaderSource('../src/renderModes/shaders/ribbon.vert');
const trailFragmentGlsl = shaderSource('../src/renderModes/shaders/trail.frag');
const trailVertexGlsl = shaderSource('../src/renderModes/shaders/trail.vert');

/** The gated GLSL tint decode every render mode's vertex stage carries. */
const decodesGlslTint = (source: string): void => {
  expect(source).toContain('colorPipelineEnabled ? srgbToLinear(a_color.rgb) : a_color.rgb');
  expect(source).toContain('v_color = vec4(linearTint * a_color.a, a_color.a);');
};

/** The gated WGSL tint decode every render mode's vertex stage carries. */
const decodesWgslTint = (source: string): void => {
  expect(source).toContain('select(input.color.rgb, srgbToLinear(input.color.rgb), colorPipelineEnabled)');
  expect(source).toContain('output.color = vec4(linearTint * input.color.a, input.color.a);');
};

describe('particle colour rendering - authored tint decode', () => {
  test('quad particles (particle.vert) decode the authored tint', () => {
    decodesGlslTint(particleVertexGlsl);
  });

  test('mesh particles (mesh.vert) decode the authored tint', () => {
    decodesGlslTint(meshVertexGlsl);
  });

  test('ribbon particles (ribbon.vert) decode the authored tint', () => {
    decodesGlslTint(ribbonVertexGlsl);
  });

  test('trail particles (trail.vert) decode the authored tint', () => {
    decodesGlslTint(trailVertexGlsl);
  });

  test('WGSL quad/mesh/ribbon/trail particles decode the authored tint', () => {
    for (const wgsl of [quadParticleWgsl, meshParticleWgsl, ribbonParticleWgsl, trailParticleWgsl]) {
      decodesWgslTint(wgsl);
    }
  });
});

describe('particle colour rendering - fragment stage untouched', () => {
  // The tint decode lives entirely in the vertex stage; every fragment stage's
  // existing sample/tint combine (GLSL: no association yet, matching the
  // sprite/mesh gaps this track documents elsewhere; WGSL: the existing
  // uniforms.flags.x-gated premultiply) stays unchanged.
  test('GLSL fragment stages keep their existing sample/tint combine', () => {
    expect(particleFragmentGlsl).toContain('fragColor = texture(u_texture, v_texcoord) * v_color;');
    expect(ribbonFragmentGlsl).toContain('fragColor = texture(u_texture, v_texcoord) * v_color;');
    expect(trailFragmentGlsl).toContain('fragColor = texture(u_texture, v_texcoord) * v_color;');
  });

  test('WGSL fragment stages keep their existing sample-alpha association', () => {
    for (const wgsl of [quadParticleWgsl, meshParticleWgsl, ribbonParticleWgsl, trailParticleWgsl]) {
      expect(wgsl).toContain('uniforms.flags.x > 0.5');
    }
  });
});

describe('particle colour rendering - shared gradient lookup parity', () => {
  // Mirrors the shader-side sample: texelFetch/textureLoad on an unorm texture
  // returns bytes normalized to 0..1, so the lerp runs in that domain before
  // ColorOverLifetime/ColorOverSpeed's shader body repacks it to bytes - unlike
  // sampleColorLookup, which lerps the raw bytes directly. Both must agree
  // within a byte (see the tolerance rationale in the WebGPU parity browser test).
  const mirrorShaderSample = (data: Uint8Array, t: number): number => {
    const x = Math.max(0, Math.min(1, t)) * 255;
    const lo = Math.floor(x);
    const hi = Math.min(lo + 1, 255);
    const ratio = x - lo;
    let result = 0;

    for (let channel = 0; channel < 4; channel++) {
      const a = (data[lo * 4 + channel] ?? 0) / 255;
      const b = (data[hi * 4 + channel] ?? 0) / 255;

      result |= Math.floor((a + (b - a) * ratio) * 255 + 0.5) << (channel * 8);
    }

    return result >>> 0;
  };

  const expectLookupParity = (data: Uint8Array, t: number): void => {
    const cpu = sampleColorLookup(data, t);
    const shader = mirrorShaderSample(data, t);

    for (const shift of [0, 8, 16, 24]) {
      expect(Math.abs(((cpu >>> shift) & 255) - ((shader >>> shift) & 255))).toBeLessThanOrEqual(1);
    }
  };

  test('gray, color and alpha keyframes agree between the CPU lerp and the shader-normalized lerp', () => {
    const lookup = new ParticleColorLookup();
    const gradients = [
      new ColorGradient([
        { t: 0, color: new Color(32, 32, 32, 1) },
        { t: 1, color: new Color(224, 224, 224, 1) },
      ]),
      new ColorGradient([
        { t: 0, color: new Color(255, 0, 0, 1) },
        { t: 0.5, color: new Color(0, 255, 0, 1) },
        { t: 1, color: new Color(0, 0, 255, 1) },
      ]),
      new ColorGradient([
        { t: 0, color: new Color(255, 255, 255, 1) },
        { t: 1, color: new Color(255, 255, 255, 0) },
      ]),
    ];

    for (const gradient of gradients) {
      const data = lookup.get(gradient);

      for (const t of [0, 0.1, 0.25, 0.41, 0.5, 0.73, 0.9, 1]) expectLookupParity(data, t);
    }
  });

  test('ColorOverLifetime and ColorOverSpeed declare the lookup texture as numeric, not hardware-sRGB', () => {
    const gradient = new ColorGradient([{ t: 0, color: new Color(0, 0, 0) }]);

    for (const module of [new ColorOverLifetime(gradient), new ColorOverSpeed(gradient, 0, 1)]) {
      expect(module.wgsl!().textures).toEqual([{ name: 'gradient', format: 'rgba8unorm' }]);
    }
  });
});
