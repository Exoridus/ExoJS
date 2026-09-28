import particleFragmentGlsl from '../src/renderers/shaders/particle.frag?raw';
import particleVertexGlsl from '../src/renderers/shaders/particle.vert?raw';
import { meshParticleWgsl } from '../src/renderModes/MeshParticles';
import { quadParticleWgsl } from '../src/renderModes/QuadParticles';
import { ribbonParticleWgsl } from '../src/renderModes/RibbonParticles';
import meshVertexGlsl from '../src/renderModes/shaders/mesh.vert?raw';
import ribbonFragmentGlsl from '../src/renderModes/shaders/ribbon.frag?raw';
import ribbonVertexGlsl from '../src/renderModes/shaders/ribbon.vert?raw';
import trailFragmentGlsl from '../src/renderModes/shaders/trail.frag?raw';
import trailVertexGlsl from '../src/renderModes/shaders/trail.vert?raw';
import { trailParticleWgsl } from '../src/renderModes/TrailParticles';

/** The gated GLSL tint decode this task adds to every render mode's vertex stage. */
const decodesGlslTint = (source: string): void => {
  expect(source).toContain('colorPipelineEnabled ? srgbToLinear(a_color.rgb) : a_color.rgb');
  expect(source).toContain('v_color = vec4(linearTint * a_color.a, a_color.a);');
};

/** The gated WGSL tint decode this task adds to every render mode's vertex stage. */
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
  // uniforms.flags.x-gated premultiply) is unchanged by this task.
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
