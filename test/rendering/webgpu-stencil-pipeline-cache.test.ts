import { WebGpuStencilClipper } from '#rendering/webgpu/WebGpuStencilClipper';

test.each([true, false])('stencil pipeline cache distinguishes topology (increment=%s)', increment => {
  const clipper = new WebGpuStencilClipper();
  const createRenderPipeline = vi.fn((descriptor: GPURenderPipelineDescriptor) => ({ descriptor }));
  const internals = clipper as unknown as {
    _device: unknown;
    _getPipeline(
      format: GPUTextureFormat,
      increment: boolean,
      topology: 'triangle-list' | 'triangle-strip',
    ): { descriptor: GPURenderPipelineDescriptor };
  };

  internals._device = { createRenderPipeline };
  const list = internals._getPipeline('rgba8unorm', increment, 'triangle-list');
  const strip = internals._getPipeline('rgba8unorm', increment, 'triangle-strip');

  expect(strip).not.toBe(list);
  expect(list.descriptor.primitive?.topology).toBe('triangle-list');
  expect(strip.descriptor.primitive?.topology).toBe('triangle-strip');
  expect(internals._getPipeline('rgba8unorm', increment, 'triangle-list')).toBe(list);
  expect(internals._getPipeline('rgba8unorm', increment, 'triangle-strip')).toBe(strip);
  expect(createRenderPipeline).toHaveBeenCalledTimes(2);
});
