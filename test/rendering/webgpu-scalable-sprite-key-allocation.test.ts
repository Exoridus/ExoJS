import { BlendModes, ScaleModes } from '#rendering/types';
import { WebGpuStencilMode } from '#rendering/webgpu/stencilState';
import { WebGpuScalableSpriteRenderer } from '#rendering/webgpu/WebGpuScalableSpriteRenderer';

interface Lookups {
  _device: unknown;
  _shaderModule: unknown;
  _pipelineLayout: unknown;
  _getPipeline(kind: 'shader' | 'geo', blend: BlendModes, format: GPUTextureFormat, stencil: WebGpuStencilMode): GPURenderPipeline;
  _getOrCreateSampler(device: GPUDevice, modeX: 'repeat', modeY: 'mirror-repeat', scaleMode: ScaleModes): GPUSampler;
}

const iterations = 300_000;

// Warm lookups must not build a key string per call; a string key costs tens of bytes each.
describe('WebGpuScalableSpriteRenderer cache lookups', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'GPUColorWrite', { configurable: true, value: { ALL: 0xf } });
  });

  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'GPUColorWrite');
  });

  test('warm pipeline and sampler lookups allocate nothing per call', () => {
    const device = {
      createRenderPipeline: (): GPURenderPipeline => ({}) as GPURenderPipeline,
      createSampler: (): GPUSampler => ({}) as GPUSampler,
    } as unknown as GPUDevice;
    const renderer = new WebGpuScalableSpriteRenderer() as unknown as Lookups;

    renderer._device = device;
    renderer._shaderModule = {};
    renderer._pipelineLayout = {};

    const pipeline = renderer._getPipeline('geo', BlendModes.Additive, 'bgra8unorm', WebGpuStencilMode.None);
    const sampler = renderer._getOrCreateSampler(device, 'repeat', 'mirror-repeat', ScaleModes.Linear);

    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      renderer._getPipeline('geo', BlendModes.Additive, 'bgra8unorm', WebGpuStencilMode.None);
      renderer._getOrCreateSampler(device, 'repeat', 'mirror-repeat', ScaleModes.Linear);
    }

    const grown = process.memoryUsage().heapUsed - before;

    expect(renderer._getPipeline('geo', BlendModes.Additive, 'bgra8unorm', WebGpuStencilMode.None)).toBe(pipeline);
    expect(renderer._getOrCreateSampler(device, 'repeat', 'mirror-repeat', ScaleModes.Linear)).toBe(sampler);
    expect(grown).toBeLessThan(4 * 1024 * 1024);
  });
});
