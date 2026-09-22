import type { MaterialOptions } from '#rendering/material/Material';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { Shader } from '#rendering/shader/Shader';
import { Texture } from '#rendering/texture/Texture';
import type { SamplerOptions } from '#rendering/texture/TextureOptions';
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

const createShader = (): Shader => new Shader({ glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT }, wgsl: WGSL });

const createMaterialOptions = (overrides: Partial<MaterialOptions> = {}): MaterialOptions => ({
  shader: createShader(),
  ...overrides,
});

const linearClamp: SamplerOptions = {
  scaleMode: ScaleModes.Linear,
  wrapMode: WrapModes.ClampToEdge,
};

const nearestRepeat: SamplerOptions = {
  scaleMode: ScaleModes.Nearest,
  wrapMode: WrapModes.Repeat,
};

describe('Shader', () => {
  test('id is stable per instance and unique between instances', () => {
    const a = createShader();
    const b = createShader();

    expect(a.id).toBe(a.id);
    expect(b.id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
  });

  test('requires at least one language', () => {
    expect(() => new Shader({})).toThrow(/at least one of `glsl` or `wgsl`/);
  });

  test('rejects empty glsl stages', () => {
    expect(() => new Shader({ glsl: { vertex: '', fragment: GLSL_FRAGMENT } })).toThrow(/glsl\.vertex/);
  });

  test('detects GLSL uniforms across both stages', () => {
    const source = new Shader({ glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT } });
    const { glsl } = source.getDeclaredUniforms();

    expect(glsl).toMatchObject({
      u_projection: 'mat3',
      u_time: 'float',
      u_color: 'vec3',
      u_noise: 'sampler2D',
    });
  });

  test('strips commented-out GLSL uniform declarations', () => {
    const source = new Shader({ glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT } });
    const { glsl } = source.getDeclaredUniforms();

    expect(glsl).not.toHaveProperty('u_lineCommented');
    expect(glsl).not.toHaveProperty('u_blockCommented');
  });

  test('detects WGSL @group(2) user uniforms and strips comments', () => {
    const source = new Shader({ wgsl: WGSL });
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
    const source = new Shader({
      glsl: { vertex: GLSL_VERTEX, fragment: 'uniform float u_extra;\nvoid main() {}' },
      wgsl: WGSL,
    });

    const drift = source.detectUniformDrift();

    expect(drift.onlyInGlsl).toContain('u_extra');
    expect(drift.onlyInGlsl).toContain('u_time');
    expect(drift.onlyInWgsl).toContain('u_user');
  });

  describe('fragmentOutputs', () => {
    test('counts a single unqualified GLSL output as one', () => {
      const source = new Shader({ glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT } });

      expect(source.fragmentOutputs.glsl).toBe(1);
    });

    test('counts explicit layout(location = n) GLSL outputs', () => {
      const fragment = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragNormal;
void main() {}
`;
      const source = new Shader({ glsl: { vertex: GLSL_VERTEX, fragment } });

      expect(source.fragmentOutputs.glsl).toBe(2);
    });

    test('counts a WGSL fragment entry that returns @location directly as one', () => {
      const wgsl = /* wgsl */ `
@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0);
}
`;
      const source = new Shader({ wgsl });

      expect(source.fragmentOutputs.wgsl).toBe(1);
    });

    test('counts @location fields on a WGSL fragment entry that returns a struct', () => {
      const wgsl = /* wgsl */ `
struct FragmentOutput {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
};

@fragment
fn fs_main() -> FragmentOutput {
  return FragmentOutput(vec4<f32>(1.0), vec4<f32>(0.0));
}
`;
      const source = new Shader({ wgsl });

      expect(source.fragmentOutputs.wgsl).toBe(2);
    });

    test('is null for a WGSL module with no @fragment entry', () => {
      const wgsl = /* wgsl */ `
@vertex
fn vs_main() -> @builtin(position) vec4<f32> {
  return vec4<f32>(1.0);
}
`;
      const source = new Shader({ wgsl });

      expect(source.fragmentOutputs.wgsl).toBeNull();
    });

    test('is null for a language the source does not supply', () => {
      const source = new Shader({ glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT } });

      expect(source.fragmentOutputs.wgsl).toBeNull();
    });

    // An array output occupies one location per element, so this source really
    // declares two - the regex sees none, and reporting that as `0` would turn
    // a parser limitation into a refused draw.
    test('is null rather than zero for a GLSL output the pattern cannot match', () => {
      const fragment = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 fragColor[2];
void main() { fragColor[0] = vec4(1.0); fragColor[1] = vec4(0.0); }
`;
      const source = new Shader({ glsl: { vertex: GLSL_VERTEX, fragment } });

      expect(source.fragmentOutputs.glsl).toBeNull();
    });

    test('is null rather than zero for a WGSL entry whose return struct declares no @location', () => {
      const wgsl = /* wgsl */ `
struct FragmentOutput {
  @builtin(frag_depth) depth: f32,
};

@fragment
fn fs_main() -> FragmentOutput {
  return FragmentOutput(1.0);
}
`;
      const source = new Shader({ wgsl });

      expect(source.fragmentOutputs.wgsl).toBeNull();
    });

    test('is null for a WGSL entry whose return struct is not declared in the source', () => {
      const wgsl = /* wgsl */ `
@fragment
fn fs_main() -> ImportedOutput {
  return ImportedOutput();
}
`;
      const source = new Shader({ wgsl });

      expect(source.fragmentOutputs.wgsl).toBeNull();
    });

    test('reflects once and returns the same cached record', () => {
      const source = createShader();

      expect(source.fragmentOutputs).toBe(source.fragmentOutputs);
    });
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
    const texture = new Texture();
    const replacement = new Texture();
    const material = new MeshMaterial(createMaterialOptions({ uniforms: { u_time: 0 }, textures: { u_noise: texture } }));

    expect(material.setUniform('u_time', 3)).toBe(material);
    expect(material.setTexture('u_noise', replacement)).toBe(material);
    expect(material.uniforms.u_time).toBe(3);
    expect(material.textures.u_noise).toBe(replacement);
  });

  test('fixes binding names and kinds at construction while keeping values live', () => {
    const material = new MeshMaterial(createMaterialOptions({ uniforms: { u_time: 0, u_pattern: new Texture() }, textures: { u_noise: new Texture() } }));

    expect(() => material.setUniform('u_missing', 1)).toThrow(/fixed binding schema/);
    expect(() => material.setTexture('u_missing', new Texture())).toThrow(/fixed binding schema/);
    expect(() => material.setUniform('u_time', new Texture())).toThrow(/cannot change binding kind/);
    expect(() => material.setUniform('u_pattern', 1)).toThrow(/cannot change binding kind/);
    expect(() => {
      material.uniforms.u_missing = 1;
    }).toThrow();
    expect(() => {
      delete material.textures.u_noise;
    }).toThrow();
  });

  test('rejects duplicate names across uniform and texture binding maps', () => {
    expect(() => new MeshMaterial(createMaterialOptions({ uniforms: { u_pattern: new Texture() }, textures: { u_pattern: new Texture() } }))).toThrow(
      /declared in both/,
    );
  });

  test('destroy invokes dispose callbacks once', () => {
    const material = new MeshMaterial(createMaterialOptions());
    const disposeA = vi.fn();
    const disposeB = vi.fn();

    material.onDispose(disposeA);
    material.onDispose(disposeB);

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
    const shader = createShader();
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

  test('does not change with sampler binding state', () => {
    const shader = createShader();
    const a = new MeshMaterial({ shader, sampler: linearClamp });
    const b = new MeshMaterial({ shader, sampler: nearestRepeat });

    expect(a.pipelineKey).toBe(b.pipelineKey);
  });

  test('does not change when a scalar uniform changes', () => {
    const material = new MeshMaterial(createMaterialOptions({ uniforms: { u_time: 0 } }));
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
    const material = new MeshMaterial(createMaterialOptions({ uniforms: { u_time: 0 } }));
    const initial = material.bindKey;

    material.setUniform('u_time', 7);
    material.setUniform('u_time', 8);

    expect(material.bindKey).toBe(initial);
  });

  test('changes with sampler state, including in-place mutation', () => {
    const material = new MeshMaterial(createMaterialOptions({ sampler: { ...linearClamp } }));
    const initial = material.bindKey;

    material.sampler!.scaleMode = ScaleModes.Nearest;
    const changed = material.bindKey;

    material.sampler!.scaleMode = ScaleModes.Linear;

    expect(changed).not.toBe(initial);
    expect(material.bindKey).toBe(initial);
  });

  test('changes when a declared texture binding is swapped', () => {
    const material = new MeshMaterial(createMaterialOptions({ textures: { u_noise: new Texture() } }));
    const initial = material.bindKey;

    material.setTexture('u_noise', new Texture());
    const swappedOnce = material.bindKey;

    material.setTexture('u_noise', new Texture());
    const swapped = material.bindKey;

    expect(swappedOnce).not.toBe(initial);
    expect(swapped).not.toBe(swappedOnce);
  });

  test('treats a texture-valued uniform as a binding', () => {
    const material = new MeshMaterial(createMaterialOptions({ uniforms: { u_extraTex: new Texture() } }));
    const initial = material.bindKey;

    material.setUniform('u_extraTex', new Texture());

    expect(material.bindKey).not.toBe(initial);
  });

  test('keeps the construction-time binding order stable', () => {
    const material = new MeshMaterial(createMaterialOptions({ textures: { a: new Texture(), b: new Texture() } }));

    material.setTexture('b', new Texture());
    material.setTexture('a', new Texture());

    expect(material._bindingSchema.textureNames).toEqual(['a', 'b']);
  });

  test('differs between distinct material instances even with equal bindings', () => {
    const shader = createShader();
    const a = new MeshMaterial({ shader });
    const b = new MeshMaterial({ shader });

    expect(a.bindKey).not.toBe(b.bindKey);
  });
});
