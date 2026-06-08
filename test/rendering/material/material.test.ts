import type { MaterialOptions } from '#rendering/material/Material';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import type { SamplerOptions } from '#rendering/texture/Sampler';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, ScaleModes, WrapModes } from '#rendering/types';

const GLSL_VERTEX = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position;
uniform mat3 u_projection;
uniform float u_time;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const GLSL_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 u_color;
uniform sampler2D u_noise;
// uniform float u_lineCommented;
/* uniform float u_blockCommented; */
out vec4 fragColor;
void main() { fragColor = vec4(u_color, 1.0); }
`;

const WGSL = /* wgsl */ `
struct MeshUniforms { projection: mat3x3<f32> };
@group(0) @binding(0) var<uniform> u_mesh: MeshUniforms;
@group(2) @binding(0) var<uniform> u_user: UserUniforms;
@group(2) @binding(1) var u_noise: texture_2d<f32>;
// @group(2) @binding(2) var u_hidden: texture_2d<f32>;
`;

const createShaderSource = (): ShaderSource => new ShaderSource({ glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT }, wgsl: WGSL });

const createMaterialOptions = (overrides: Partial<MaterialOptions> = {}): MaterialOptions => ({
  shader: createShaderSource(),
  ...overrides,
});

const linearClamp: SamplerOptions = {
  scaleMode: ScaleModes.Linear,
  wrapMode: WrapModes.ClampToEdge,
  premultiplyAlpha: false,
  generateMipMap: false,
  flipY: false,
};

const nearestRepeat: SamplerOptions = {
  scaleMode: ScaleModes.Nearest,
  wrapMode: WrapModes.Repeat,
  premultiplyAlpha: false,
  generateMipMap: false,
  flipY: false,
};

describe('ShaderSource', () => {
  test('id is stable per instance and unique between instances', () => {
    const a = createShaderSource();
    const b = createShaderSource();

    expect(a.id).toBe(a.id);
    expect(b.id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
  });

  test('requires at least one language', () => {
    expect(() => new ShaderSource({})).toThrow(/at least one of `glsl` or `wgsl`/);
  });

  test('rejects empty glsl stages', () => {
    expect(() => new ShaderSource({ glsl: { vertex: '', fragment: GLSL_FRAGMENT } })).toThrow(/glsl\.vertex/);
  });

  test('detects GLSL uniforms across both stages', () => {
    const source = new ShaderSource({ glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT } });
    const { glsl } = source.getDeclaredUniforms();

    expect(glsl).toMatchObject({
      u_projection: 'mat3',
      u_time: 'float',
      u_color: 'vec3',
      u_noise: 'sampler2D',
    });
  });

  test('strips commented-out GLSL uniform declarations', () => {
    const source = new ShaderSource({ glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT } });
    const { glsl } = source.getDeclaredUniforms();

    expect(glsl).not.toHaveProperty('u_lineCommented');
    expect(glsl).not.toHaveProperty('u_blockCommented');
  });

  test('detects WGSL @group(2) user uniforms and strips comments', () => {
    const source = new ShaderSource({ wgsl: WGSL });
    const { wgsl } = source.getDeclaredUniforms();

    expect(wgsl).toMatchObject({
      u_user: 'UserUniforms',
      u_noise: 'texture_2d<f32>',
    });
    expect(wgsl).not.toHaveProperty('u_hidden');
    // group(0) mesh-uniform binding must not be reported as a user uniform.
    expect(wgsl).not.toHaveProperty('u_mesh');
  });

  test('detectUniformDrift reports names declared in only one language', () => {
    const source = new ShaderSource({
      glsl: { vertex: GLSL_VERTEX, fragment: 'uniform float u_extra;\nvoid main() {}' },
      wgsl: WGSL,
    });

    const drift = source.detectUniformDrift();

    expect(drift.onlyInGlsl).toContain('u_extra');
    expect(drift.onlyInGlsl).toContain('u_time');
    expect(drift.onlyInWgsl).toContain('u_user');
  });
});

describe('Material base', () => {
  test('defaults blendMode to Normal and sampler to null', () => {
    const material = new MeshMaterial(createMaterialOptions());

    expect(material.blendMode).toBe(BlendModes.Normal);
    expect(material.sampler).toBeNull();
  });

  test('copies uniform/texture inputs instead of aliasing them', () => {
    const uniforms = { u_time: 1 };
    const material = new MeshMaterial(createMaterialOptions({ uniforms }));

    material.setUniform('u_time', 2);

    expect(uniforms.u_time).toBe(1);
    expect(material.uniforms.u_time).toBe(2);
  });

  test('setUniform and setTexture mutate state and return this', () => {
    const material = new MeshMaterial(createMaterialOptions());
    const texture = new Texture();

    expect(material.setUniform('u_time', 3)).toBe(material);
    expect(material.setTexture('u_noise', texture)).toBe(material);
    expect(material.uniforms.u_time).toBe(3);
    expect(material.textures.u_noise).toBe(texture);
  });

  test('destroy invokes dispose callbacks once', () => {
    const material = new MeshMaterial(createMaterialOptions());
    const disposeA = vi.fn();
    const disposeB = vi.fn();

    material._onDispose(disposeA);
    material._onDispose(disposeB);

    material.destroy();
    material.destroy();

    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
  });
});

describe('MeshMaterial / SpriteMaterial', () => {
  test('expose their target', () => {
    expect(new MeshMaterial(createMaterialOptions()).target).toBe('mesh');
    expect(new SpriteMaterial(createMaterialOptions()).target).toBe('sprite');
  });
});

describe('Material.pipelineKey', () => {
  test('is stable across repeated reads without state changes', () => {
    const material = new MeshMaterial(createMaterialOptions({ sampler: linearClamp }));

    expect(material.pipelineKey).toBe(material.pipelineKey);
  });

  test('is shared by identically configured materials', () => {
    const shader = createShaderSource();
    const a = new MeshMaterial({ shader, blendMode: BlendModes.Additive, sampler: linearClamp });
    const b = new MeshMaterial({ shader, blendMode: BlendModes.Additive, sampler: linearClamp });

    expect(a.pipelineKey).toBe(b.pipelineKey);
  });

  test('differs when the shader identity differs', () => {
    const a = new MeshMaterial(createMaterialOptions());
    const b = new MeshMaterial(createMaterialOptions());

    expect(a.pipelineKey).not.toBe(b.pipelineKey);
  });

  test('changes with blendMode and restores when reverted', () => {
    const material = new MeshMaterial(createMaterialOptions());
    const initial = material.pipelineKey;

    material.blendMode = BlendModes.Multiply;
    const changed = material.pipelineKey;

    material.blendMode = BlendModes.Normal;

    expect(changed).not.toBe(initial);
    expect(material.pipelineKey).toBe(initial);
  });

  test('changes with sampler state', () => {
    const shader = createShaderSource();
    const a = new MeshMaterial({ shader, sampler: linearClamp });
    const b = new MeshMaterial({ shader, sampler: nearestRepeat });

    expect(a.pipelineKey).not.toBe(b.pipelineKey);
  });

  test('does not change when a scalar uniform changes', () => {
    const material = new MeshMaterial(createMaterialOptions());
    const initial = material.pipelineKey;

    material.setUniform('u_time', 42);

    expect(material.pipelineKey).toBe(initial);
  });
});

describe('Material.bindKey', () => {
  test('is stable across repeated reads without state changes', () => {
    const material = new MeshMaterial(createMaterialOptions());

    expect(material.bindKey).toBe(material.bindKey);
  });

  test('does not change when a scalar uniform changes', () => {
    const material = new MeshMaterial(createMaterialOptions());
    const initial = material.bindKey;

    material.setUniform('u_time', 7);
    material.setUniform('u_time', 8);

    expect(material.bindKey).toBe(initial);
  });

  test('changes when a texture binding is added or swapped', () => {
    const material = new MeshMaterial(createMaterialOptions());
    const initial = material.bindKey;

    material.setTexture('u_noise', new Texture());
    const withTexture = material.bindKey;

    material.setTexture('u_noise', new Texture());
    const swapped = material.bindKey;

    expect(withTexture).not.toBe(initial);
    expect(swapped).not.toBe(withTexture);
  });

  test('treats a texture-valued uniform as a binding', () => {
    const material = new MeshMaterial(createMaterialOptions());
    const initial = material.bindKey;

    material.setUniform('u_extraTex', new Texture());

    expect(material.bindKey).not.toBe(initial);
  });

  test('is independent of insertion order for the same bindings', () => {
    const shader = createShaderSource();
    const texA = new Texture();
    const texB = new Texture();

    const first = new MeshMaterial({ shader });
    first.setTexture('a', texA);
    first.setTexture('b', texB);

    const second = new MeshMaterial({ shader });
    second.setTexture('b', texB);
    second.setTexture('a', texA);

    // Same material identity is required for an equal bind key, so compare the
    // descriptor effect by re-deriving on one instance with swapped order.
    const ordered = first.bindKey;
    delete first.textures.a;
    delete first.textures.b;
    first.setTexture('b', texB);
    first.setTexture('a', texA);

    expect(first.bindKey).toBe(ordered);
  });

  test('differs between distinct material instances even with equal bindings', () => {
    const shader = createShaderSource();
    const a = new MeshMaterial({ shader });
    const b = new MeshMaterial({ shader });

    expect(a.bindKey).not.toBe(b.bindKey);
  });
});
