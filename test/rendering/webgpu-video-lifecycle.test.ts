import { WebGpuSpriteRenderer } from '#rendering/webgpu/WebGpuSpriteRenderer';
import { WebGpuVideoRenderer } from '#rendering/webgpu/WebGpuVideoRenderer';

import { createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

test.each(['flush', 'disconnect'] as const)('video teardown releases its own resources when delegated %s throws', async failure => {
  const environment = createMockWebGpuEnvironment();
  const backend = await createMockBackend(environment);
  const renderer = new WebGpuVideoRenderer();
  const delegate = new WebGpuSpriteRenderer();
  const state = renderer as unknown as {
    _materialRenderer: WebGpuSpriteRenderer | null;
    _device: GPUDevice | null;
    _uniformBuffer: GPUBuffer | null;
    _indexBuffer: GPUBuffer | null;
  };

  renderer.connect(backend);
  delegate.connect(backend);
  state._materialRenderer = delegate;

  const uniform = state._uniformBuffer!;
  const index = state._indexBuffer!;
  const destroyUniform = vi.spyOn(uniform, 'destroy');
  const destroyIndex = vi.spyOn(index, 'destroy');
  const failingMethod = vi.spyOn(delegate, failure).mockImplementation(() => {
    throw new Error(`${failure} failed`);
  });

  try {
    expect(() => renderer.disconnect()).toThrow(`${failure} failed`);
    expect(destroyUniform).toHaveBeenCalledOnce();
    expect(destroyIndex).toHaveBeenCalledOnce();
    expect(state._device).toBeNull();
    expect(state._materialRenderer).toBeNull();
    renderer.connect(backend);
    expect(state._device).toBe(backend.device);
    expect(state._uniformBuffer).not.toBe(uniform);
    expect(state._indexBuffer).not.toBe(index);
  } finally {
    failingMethod.mockRestore();
    renderer.disconnect();
    delegate.disconnect();
    backend.destroy();
    environment.restore();
  }
});
