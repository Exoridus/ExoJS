import { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes, ScaleModes, TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

const webGlBackend = (floatRenderable: boolean, float32Filterable: boolean, float32Blendable: boolean): WebGl2Backend => {
  const backend = Object.create(WebGl2Backend.prototype) as WebGl2Backend;

  Object.assign(backend as object, { _floatRenderable: floatRenderable, _float32Filterable: float32Filterable, _float32Blendable: float32Blendable });

  return backend;
};

const webGpuBackend = (features: readonly GPUFeatureName[] = []): WebGpuBackend => {
  const backend = Object.create(WebGpuBackend.prototype) as WebGpuBackend;

  Object.assign(backend as object, { _device: { features: new Set(features) } });

  return backend;
};

describe('color format capabilities', () => {
  test('WebGL2 keeps half-float filtering separate from float32 extension capabilities', () => {
    const unavailable = webGlBackend(false, false, false);
    const floatTargets = webGlBackend(true, false, false);
    const float32FullyEnabled = webGlBackend(true, true, true);

    expect(unavailable.getColorFormatCapabilities(TextureFormat.Rgba16F)).toEqual({ renderable: false, filterable: true, blendable: false, sampleCounts: [1] });
    expect(floatTargets.getColorFormatCapabilities(TextureFormat.Rgba32F)).toEqual({
      renderable: true,
      filterable: false,
      blendable: false,
      sampleCounts: [1],
    });
    expect(float32FullyEnabled.getColorFormatCapabilities(TextureFormat.Rgba32F)).toEqual({
      renderable: true,
      filterable: true,
      blendable: true,
      sampleCounts: [1],
    });
  });

  test('WebGPU reads float32 capabilities from features granted to the device', () => {
    const unavailable = webGpuBackend();
    const filterable = webGpuBackend(['float32-filterable']);
    const fullyEnabled = webGpuBackend(['float32-filterable', 'float32-blendable']);

    expect(unavailable.getColorFormatCapabilities(TextureFormat.Rgba32F)).toEqual({ renderable: true, filterable: false, blendable: false, sampleCounts: [1] });
    expect(filterable.getColorFormatCapabilities(TextureFormat.Rgba32F)).toEqual({ renderable: true, filterable: true, blendable: false, sampleCounts: [1] });
    expect(fullyEnabled.getColorFormatCapabilities(TextureFormat.Rgba32F)).toEqual({ renderable: true, filterable: true, blendable: true, sampleCounts: [1] });
    expect(unavailable.supportsColorFormat(TextureFormat.Rgba32F)).toBe(true);
  });

  test('rejects linear float32 sampling until its backend capability is available', () => {
    const texture = new RenderTexture(2, 2, { format: TextureFormat.Rgba32F, scaleMode: ScaleModes.Linear });

    expect(() => (webGlBackend(true, false, false) as any)._assertTextureFilterable(texture)).toThrow(/OES_texture_float_linear/);
    expect(() => (webGpuBackend() as any)._assertTextureFilterable(texture, texture.scaleMode)).toThrow(/float32-filterable/);
    expect(() => (webGpuBackend(['float32-filterable']) as any)._assertTextureFilterable(texture, texture.scaleMode)).not.toThrow();
  });

  test('rejects fixed-function blending on an unblendable float32 attachment', () => {
    const target = new RenderTexture(2, 2, { format: TextureFormat.Rgba32F });
    const gl = webGlBackend(true, true, false);
    const gpu = webGpuBackend(['float32-filterable']);

    Object.assign(gl as object, { _renderTarget: target });
    Object.assign(gpu as object, { _renderTarget: target });

    expect(() => gl.setBlendMode(BlendModes.Normal)).toThrow(/does not support fixed-function blending/);
    expect(() => gpu.setBlendMode(BlendModes.Normal)).toThrow(/float32-blendable/);
  });
});
