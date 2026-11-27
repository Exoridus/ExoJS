import { decodeImageBlob } from '#assets/factories/decodeImageBlob';
import { RenderError } from '#rendering/RenderError';
import { CompressedTexture } from '#rendering/texture/CompressedTexture';
import { compressedLevelByteLength, CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes, ScaleModes, TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

installFakeWebGl2Globals();

const webGlBackend = (
  floatRenderable: boolean,
  float32Filterable: boolean,
  float32Blendable: boolean,
  sampleCountSupport?: readonly number[],
): WebGl2Backend => {
  const backend = Object.create(WebGl2Backend.prototype) as WebGl2Backend;

  Object.assign(backend as object, {
    _floatRenderable: floatRenderable,
    _float32Filterable: float32Filterable,
    _float32Blendable: float32Blendable,
    _context: createFakeWebGl2Context(new GlRecorder(), {}, sampleCountSupport),
    _contextLost: false,
    _sampleCountsByFormat: new Map(),
  });

  return backend;
};

const webGpuBackend = (features: readonly GPUFeatureName[] = []): WebGpuBackend => {
  const backend = Object.create(WebGpuBackend.prototype) as WebGpuBackend;

  Object.assign(backend as object, { _device: { features: new Set(features) } });

  return backend;
};

describe('color format capabilities', () => {
  test('WebGL2 keeps half-float filtering separate from float32 extension capabilities', () => {
    const unavailable = webGlBackend(false, false, false, [1]);
    const floatTargets = webGlBackend(true, false, false, [1]);
    const float32FullyEnabled = webGlBackend(true, true, true, [1]);

    expect(unavailable.getColorFormatCapabilities(TextureFormat.Rgba16F)).toEqual({
      renderable: false,
      filterable: true,
      blendable: false,
      sampleCounts: [1],
    });
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

  test('WebGL2 reports the multisample support the driver declares for a renderable format', () => {
    const multisampling = webGlBackend(false, false, false, [1, 2, 4, 8]);

    expect(multisampling.getColorFormatCapabilities(TextureFormat.Rgba8Srgb)).toEqual({
      renderable: true,
      filterable: true,
      blendable: true,
      sampleCounts: [1, 2, 4, 8],
    });
    expect(multisampling.getColorFormatCapabilities(TextureFormat.Rgba8)).toEqual({
      renderable: true,
      filterable: true,
      blendable: true,
      sampleCounts: [1, 2, 4, 8],
    });
  });

  test('WebGL2 answers a single sample for a format it cannot render into at all', () => {
    const backend = webGlBackend(false, false, false, [1, 2, 4]);

    expect(backend.getColorFormatCapabilities(TextureFormat.Rgba16F)).toEqual({
      renderable: false,
      filterable: true,
      blendable: false,
      sampleCounts: [1],
    });
  });

  test('WebGPU reads float32 capabilities from features granted to the device', () => {
    const unavailable = webGpuBackend();
    const filterable = webGpuBackend(['float32-filterable']);
    const fullyEnabled = webGpuBackend(['float32-filterable', 'float32-blendable']);

    expect(unavailable.getColorFormatCapabilities(TextureFormat.Rgba32F)).toEqual({
      renderable: true,
      filterable: false,
      blendable: false,
      sampleCounts: [1],
    });
    expect(filterable.getColorFormatCapabilities(TextureFormat.Rgba32F)).toEqual({
      renderable: true,
      filterable: true,
      blendable: false,
      sampleCounts: [1],
    });
    expect(fullyEnabled.getColorFormatCapabilities(TextureFormat.Rgba32F)).toEqual({
      renderable: true,
      filterable: true,
      blendable: true,
      sampleCounts: [1],
    });
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

describe('optional capability failures', () => {
  test('the eight-bit color formats need no optional extension or device feature', () => {
    const sdr = { renderable: true, filterable: true, blendable: true, sampleCounts: [1] };
    const noExtensions = webGlBackend(false, false, false, [1]);
    const noFeatures = webGpuBackend();

    for (const format of [TextureFormat.Rgba8, TextureFormat.Rgba8Srgb] as const) {
      expect(noExtensions.getColorFormatCapabilities(format)).toEqual(sdr);
      expect(noFeatures.getColorFormatCapabilities(format)).toEqual(sdr);
      expect(noExtensions.supportsColorFormat(format)).toBe(true);
      expect(noFeatures.supportsColorFormat(format)).toBe(true);
    }
  });

  test('WebGPU refuses a compressed format the device was not granted with a machine-readable code', () => {
    const format = CompressedTextureFormat.Bc7RgbaUnorm;
    const texture = new CompressedTexture({
      format,
      levels: [{ data: new Uint8Array(compressedLevelByteLength(format, 4, 4)), width: 4, height: 4 }],
    });
    const backend = Object.assign(webGpuBackend(), { _compressedFormats: { formats: [], gpuFormats: new Map() } });

    try {
      (backend as unknown as { _getGpuTextureFormat(texture: CompressedTexture): unknown })._getGpuTextureFormat(texture);
      expect.unreachable('an ungranted compressed format must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).code).toBe('unsupported-format');
      expect((error as RenderError).message).toMatch(/cannot sample the compressed texture format "bc7-rgba-unorm"/);
    }

    texture.destroy();
  });

  test('a numeric image decode is refused rather than converted when the no-conversion decoder is missing', async () => {
    const original = (globalThis as { createImageBitmap?: unknown }).createImageBitmap;

    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = undefined;

    try {
      await expect(
        decodeImageBlob(new Blob([new Uint8Array(4)]), { create: () => 'blob:x', revoke: () => {} } as never, 'data'),
      ).rejects.toThrow(/colorSpaceConversion: 'none'/);
    } finally {
      (globalThis as { createImageBitmap?: unknown }).createImageBitmap = original;
    }
  });

  test('a color decode asks the browser for its default conversion and a numeric decode for none', async () => {
    const original = (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
    const calls: Array<{ colorSpaceConversion?: string; premultiplyAlpha?: string }> = [];

    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = (_blob: Blob, options: (typeof calls)[number]) => {
      calls.push(options);

      return Promise.resolve({} as ImageBitmap);
    };

    try {
      const pool = { create: () => 'blob:x', revoke: () => {} } as never;

      await decodeImageBlob(new Blob([new Uint8Array(4)]), pool, 'color');
      await decodeImageBlob(new Blob([new Uint8Array(4)]), pool, 'data');
    } finally {
      (globalThis as { createImageBitmap?: unknown }).createImageBitmap = original;
    }

    expect(calls).toEqual([
      { colorSpaceConversion: 'default', premultiplyAlpha: 'none' },
      { colorSpaceConversion: 'none', premultiplyAlpha: 'none' },
    ]);
  });
});
