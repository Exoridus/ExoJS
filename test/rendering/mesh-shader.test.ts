import { MeshShader } from '@/rendering/mesh/MeshShader';

const minimalGlsl = {
  vertex: '#version 300 es\nvoid main(){gl_Position=vec4(0.0);}',
  fragment: '#version 300 es\nprecision lowp float;out vec4 c;void main(){c=vec4(1.0);}',
};

const minimalWgsl = `
@vertex fn vertexMain() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }
@fragment fn fragmentMain() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }
`.trim();

describe('MeshShader', () => {
  describe('construction', () => {
    test('throws when neither glsl nor wgsl is provided', () => {
      expect(() => new MeshShader({})).toThrow('MeshShader requires at least one of `glsl` or `wgsl`.');
    });

    test('accepts glsl-only construction', () => {
      const shader = new MeshShader({ glsl: minimalGlsl });
      expect(shader.glsl).toEqual(minimalGlsl);
      expect(shader.wgsl).toBeNull();
    });

    test('accepts wgsl-only construction', () => {
      const shader = new MeshShader({ wgsl: minimalWgsl });
      expect(shader.glsl).toBeNull();
      expect(shader.wgsl).toBe(minimalWgsl);
    });

    test('accepts dual-language construction', () => {
      const shader = new MeshShader({ glsl: minimalGlsl, wgsl: minimalWgsl });
      expect(shader.glsl).toEqual(minimalGlsl);
      expect(shader.wgsl).toBe(minimalWgsl);
    });

    test('throws when glsl.vertex is empty', () => {
      expect(() => new MeshShader({ glsl: { vertex: '', fragment: minimalGlsl.fragment } })).toThrow('MeshShader.glsl.vertex must be a non-empty string.');
    });

    test('throws when glsl.fragment is empty', () => {
      expect(() => new MeshShader({ glsl: { vertex: minimalGlsl.vertex, fragment: '' } })).toThrow('MeshShader.glsl.fragment must be a non-empty string.');
    });

    test('throws when wgsl source is empty', () => {
      expect(() => new MeshShader({ wgsl: '' })).toThrow('MeshShader.wgsl must be a non-empty string.');
    });
  });

  describe('uniforms', () => {
    test('initializes uniforms map empty by default', () => {
      const shader = new MeshShader({ glsl: minimalGlsl });
      expect(shader.uniforms).toEqual({});
    });

    test('clones the initial uniforms map (does not share reference)', () => {
      const initial = { uTime: 1.0, uColor: [1, 0, 0, 1] as const };
      const shader = new MeshShader({ glsl: minimalGlsl, uniforms: initial });

      expect(shader.uniforms).toEqual(initial);
      expect(shader.uniforms).not.toBe(initial);

      // Mutating the original after construction does not affect the shader.
      (initial as Record<string, unknown>).uTime = 99;
      expect(shader.uniforms.uTime).toBe(1.0);
    });

    test('setUniform writes through to the uniforms map', () => {
      const shader = new MeshShader({ glsl: minimalGlsl });
      shader.setUniform('uTime', 2.5);
      expect(shader.uniforms.uTime).toBe(2.5);
    });

    test('uniforms can be mutated directly via property assignment', () => {
      const shader = new MeshShader({ glsl: minimalGlsl, uniforms: { uTime: 0 } });
      shader.uniforms.uTime = 3.0;
      expect(shader.uniforms.uTime).toBe(3.0);
    });
  });

  describe('reflection', () => {
    test('getDeclaredUniforms parses GLSL uniforms from vertex + fragment', () => {
      const shader = new MeshShader({
        glsl: {
          vertex: `#version 300 es
            uniform mat3 u_projection;
            uniform mat3 u_translation;
            in vec2 a_position;
            void main(){gl_Position=vec4(a_position,0.0,1.0);}`,
          fragment: `#version 300 es
            precision lowp float;
            uniform vec4 u_tint;
            uniform sampler2D u_texture;
            uniform float uTime;
            out vec4 c;
            void main(){c=u_tint;}`,
        },
      });

      const declared = shader.getDeclaredUniforms();

      expect(declared.glsl).toEqual({
        u_projection: 'mat3',
        u_translation: 'mat3',
        u_tint: 'vec4',
        u_texture: 'sampler2D',
        uTime: 'float',
      });
      expect(declared.wgsl).toEqual({});
    });

    test('getDeclaredUniforms parses WGSL @group(2) user uniforms only', () => {
      const shader = new MeshShader({
        wgsl: `
          struct UserUniforms { uTime: f32, uColor: vec4<f32> };

          @group(0) @binding(0) var<uniform> u_mesh: MeshUniforms;
          @group(1) @binding(0) var u_texture: texture_2d<f32>;
          @group(1) @binding(1) var u_sampler: sampler;
          @group(2) @binding(0) var<uniform> u_user: UserUniforms;
          @group(2) @binding(1) var u_extraTex: texture_2d<f32>;
          @group(2) @binding(2) var u_extraSampler: sampler;
        `,
      });

      const declared = shader.getDeclaredUniforms();

      expect(declared.glsl).toEqual({});
      expect(declared.wgsl).toMatchObject({
        u_user: 'UserUniforms',
        u_extraTex: 'texture_2d<f32>',
        u_extraSampler: 'sampler',
      });
    });

    test('detectUniformDrift returns empty when only one language is set', () => {
      const glslOnly = new MeshShader({
        glsl: {
          vertex: '#version 300 es\nuniform float uTime;\nvoid main(){gl_Position=vec4(0.0);}',
          fragment: '#version 300 es\nprecision lowp float;\nout vec4 c;void main(){c=vec4(1.0);}',
        },
      });

      expect(glslOnly.detectUniformDrift()).toEqual({ onlyInGlsl: [], onlyInWgsl: [] });
    });

    test('detectUniformDrift catches names that exist in only one language', () => {
      const shader = new MeshShader({
        glsl: {
          vertex: '#version 300 es\nuniform float uTime;\nuniform float uOnlyGlsl;\nvoid main(){gl_Position=vec4(0.0);}',
          fragment: '#version 300 es\nprecision lowp float;\nout vec4 c;void main(){c=vec4(1.0);}',
        },
        wgsl: `
          struct UserUniforms { uTime: f32, uOnlyWgsl: f32 };

          @group(2) @binding(0) var<uniform> u_user: UserUniforms;
          @group(2) @binding(1) var uOnlyWgsl: texture_2d<f32>;
          @group(2) @binding(2) var uOnlyWgslSampler: sampler;
        `,
      });

      const drift = shader.detectUniformDrift();

      // GLSL declares uTime + uOnlyGlsl; WGSL declares u_user + uOnlyWgsl + uOnlyWgslSampler.
      // The drift detector compares declared user-uniform names; auto-bound
      // names (u_projection, u_translation, u_tint, u_texture, u_mesh) are
      // excluded but no others.
      expect(drift.onlyInGlsl).toContain('uTime');
      expect(drift.onlyInGlsl).toContain('uOnlyGlsl');
      expect(drift.onlyInWgsl).toContain('uOnlyWgsl');
    });

    test('reflection ignores commented-out uniform declarations', () => {
      const shader = new MeshShader({
        glsl: {
          vertex: '#version 300 es\n// uniform float uIgnored;\nuniform float uReal;\nvoid main(){gl_Position=vec4(0.0);}',
          fragment: '#version 300 es\nprecision lowp float;\n/* uniform float uAlsoIgnored; */\nout vec4 c;void main(){c=vec4(1.0);}',
        },
      });

      const { glsl } = shader.getDeclaredUniforms();
      expect(glsl).toEqual({ uReal: 'float' });
    });
  });

  describe('lifecycle', () => {
    test('destroy fires registered dispose callbacks', () => {
      const shader = new MeshShader({ glsl: minimalGlsl });
      const callback = vi.fn();

      shader._onDispose(callback);
      shader.destroy();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('destroy can be called multiple times safely', () => {
      const shader = new MeshShader({ glsl: minimalGlsl });
      const callback = vi.fn();

      shader._onDispose(callback);
      shader.destroy();
      shader.destroy();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('multiple dispose callbacks all fire on destroy', () => {
      const shader = new MeshShader({ glsl: minimalGlsl });
      const a = vi.fn();
      const b = vi.fn();

      shader._onDispose(a);
      shader._onDispose(b);
      shader.destroy();

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });
  });
});
