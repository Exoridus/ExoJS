import tileFragmentGlsl from '../src/webgl2/shaders/tile-chunk.frag?raw';
import tileVertexGlsl from '../src/webgl2/shaders/tile-chunk.vert?raw';
import tileShaderWgsl from '../src/webgpu/shaders/tile-chunk.wgsl?raw';

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
  // paths already carry) is untouched by this task.
  test('the GLSL tile fragment stage keeps its existing sample/tint combine', () => {
    expect(tileFragmentGlsl).toContain('fragColor = sampleColor * v_color;');
  });

  test('the WGSL tile fragment stage keeps its existing sample-alpha association', () => {
    expect(tileShaderWgsl).toContain('select(sample.rgb, sample.rgb * sample.a, sampleAlpha.x != 0.0)');
    expect(tileShaderWgsl).toContain('return vec4<f32>(rgb, sample.a) * input.color;');
  });
});
