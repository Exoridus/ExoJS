import { readFileSync } from 'node:fs';

// Vitest stubs shader-module imports to empty strings, so the sources are read from disk.
const shaderSource = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const tileFragmentGlsl = shaderSource('../src/webgl2/shaders/tile-chunk.frag');
const tileVertexGlsl = shaderSource('../src/webgl2/shaders/tile-chunk.vert');
const tileShaderWgsl = shaderSource('../src/webgpu/shaders/tile-chunk.wgsl');

describe('tilemap colour contract', () => {
  test('the GLSL tile vertex stage decodes the authored tint, gated on colorPipelineEnabled', () => {
    expect(tileVertexGlsl).toContain('colorPipelineEnabled ? srgbToLinear(a_color.rgb) : a_color.rgb');
    expect(tileVertexGlsl).toContain('v_color = vec4(linearTint * a_color.a, a_color.a);');
  });

  test('the WGSL tile vertex stage decodes the authored tint, gated on colorPipelineEnabled', () => {
    expect(tileShaderWgsl).toContain('select(input.color.rgb, srgbToLinear(input.color.rgb), colorPipelineEnabled)');
    expect(tileShaderWgsl).toContain('output.color = vec4(linearTint * input.color.a, input.color.a);');
  });

  // The tint decode is added ahead of the sample, not inside it - the fragment
  // stage's existing sample-alpha handling (the open alpha fix these draw
  // paths already carry) stays untouched.
  test('the GLSL tile fragment stage keeps its existing sample/tint combine', () => {
    expect(tileFragmentGlsl).toContain('fragColor = sampleColor * v_color;');
  });

  test('the WGSL tile fragment stage keeps its existing sample-alpha association', () => {
    expect(tileShaderWgsl).toContain('select(sample.rgb, sample.rgb * sample.a, sampleAlpha.x != 0.0)');
    expect(tileShaderWgsl).toContain('return vec4<f32>(rgb, sample.a) * input.color;');
  });
});
