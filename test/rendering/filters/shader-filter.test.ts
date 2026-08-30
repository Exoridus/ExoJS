/**
 * Backend-neutral ShaderFilter tests.
 *
 * One filter carries both languages and picks between them internally, so the
 * surface a caller touches never names a backend. What is verified here is that
 * choice - which source runs, when the choice is made, and what happens when the
 * source the active backend needs is missing.
 */
import { ShaderFilter } from '#rendering/filters/ShaderFilter';
import { ShaderFilterBackendError } from '#rendering/filters/ShaderFilterBackendError';
import { ShaderSource } from '#rendering/material/ShaderSource';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderTexture } from '#rendering/texture/RenderTexture';

const glslFragment = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main() { fragColor = texture(uTexture, vUv); }
`;

const wgslFragment = `
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(uTexture, uSampler, vUv);
}
`;

/**
 * A backend stub that only answers `backendType`. Enough for everything the
 * attach check does - which is the point: the refusal lands before the filter
 * asks the backend for anything at all.
 */
const makeBackendStub = (backendType: RenderBackendType): RenderBackend => {
  return { backendType } as unknown as RenderBackend;
};

const passesOf = (filter: ShaderFilter): { glsl: unknown; wgsl: unknown } => {
  const internals = filter as unknown as Record<string, unknown>;

  return { glsl: internals['_glslPass'], wgsl: internals['_wgslPass'] };
};

describe('ShaderFilter — source selection', () => {
  test('reports which backends it can run', () => {
    const both = new ShaderFilter({ glsl: { fragment: glslFragment }, wgsl: wgslFragment });
    const glslOnly = new ShaderFilter({ glsl: { fragment: glslFragment } });
    const wgslOnly = new ShaderFilter({ wgsl: wgslFragment });

    expect(both.supports(RenderBackendType.WebGl2)).toBe(true);
    expect(both.supports(RenderBackendType.WebGpu)).toBe(true);
    expect(glslOnly.supports(RenderBackendType.WebGl2)).toBe(true);
    expect(glslOnly.supports(RenderBackendType.WebGpu)).toBe(false);
    expect(wgslOnly.supports(RenderBackendType.WebGl2)).toBe(false);
    expect(wgslOnly.supports(RenderBackendType.WebGpu)).toBe(true);

    both.destroy();
    glslOnly.destroy();
    wgslOnly.destroy();
  });

  test('a filter carrying both sources exposes both on its ShaderSource', () => {
    const filter = new ShaderFilter({ glsl: { fragment: glslFragment }, wgsl: wgslFragment });

    expect(filter.shader).toBeInstanceOf(ShaderSource);
    expect(filter.shader.glsl).not.toBeNull();
    expect(filter.shader.wgsl).not.toBeNull();

    filter.destroy();
  });

  test('attaching to a backend it has no source for throws before any pass is built', () => {
    const filter = new ShaderFilter({ glsl: { fragment: glslFragment } });
    const input = new RenderTexture(8, 8);
    const output = new RenderTexture(8, 8);

    // The stub answers nothing but `backendType`: reaching any GPU entry point
    // would throw a TypeError instead of the typed refusal asserted here.
    let caught: unknown = null;

    try {
      filter.apply(makeBackendStub(RenderBackendType.WebGpu), input, output);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ShaderFilterBackendError);
    expect((caught as ShaderFilterBackendError).backendType).toBe(RenderBackendType.WebGpu);
    expect((caught as ShaderFilterBackendError).missingLanguage).toBe('wgsl');
    expect(passesOf(filter).wgsl).toBeNull();

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  test('the WebGL2 refusal names GLSL and the WebGL2 backend', () => {
    const filter = new ShaderFilter({ wgsl: wgslFragment });
    const input = new RenderTexture(8, 8);
    const output = new RenderTexture(8, 8);

    let caught: unknown = null;

    try {
      filter.apply(makeBackendStub(RenderBackendType.WebGl2), input, output);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ShaderFilterBackendError);
    expect((caught as ShaderFilterBackendError).backendType).toBe(RenderBackendType.WebGl2);
    expect((caught as ShaderFilterBackendError).missingLanguage).toBe('glsl');

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  test('construction fails when neither language is supplied', () => {
    expect(() => new ShaderFilter({ uniforms: { uTime: 0 } })).toThrow(/at least one of/);
  });
});

describe('ShaderFilter.from', () => {
  test('runs a ready-made ShaderSource verbatim', () => {
    const source = new ShaderSource({ glsl: { vertex: '#version 300 es\nvoid main() {}\n', fragment: glslFragment }, wgsl: wgslFragment });
    const filter = ShaderFilter.from(source, { uniforms: { uTime: 1 } });

    expect(filter.shader).toBe(source);
    expect(filter.uniforms['uTime']).toBe(1);

    filter.destroy();
  });

  test('two filters can share one source', () => {
    const source = new ShaderSource({ glsl: { vertex: '#version 300 es\nvoid main() {}\n', fragment: glslFragment } });
    const first = ShaderFilter.from(source);
    const second = ShaderFilter.from(source);

    expect(first.shader).toBe(second.shader);
    expect(first).not.toBe(second);

    first.destroy();
    second.destroy();
  });
});
