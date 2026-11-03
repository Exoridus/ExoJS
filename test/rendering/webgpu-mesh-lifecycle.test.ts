import { Mesh } from '#rendering/mesh/Mesh';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { ScaleModes, TextureFormat } from '#rendering/types';
import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';

import { createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

test.each(['texture validation', 'pass ending'] as const)('mesh disconnect releases resources after failed %s', async failure => {
  const environment = createMockWebGpuEnvironment();
  const renderer = new WebGpuMeshRenderer();

  try {
    const backend = await createMockBackend(environment);
    const buffers: GPUBuffer[] = [];
    const createBuffer = backend.device.createBuffer.bind(backend.device);

    vi.spyOn(backend.device, 'createBuffer').mockImplementation(descriptor => {
      const buffer = createBuffer(descriptor);

      if (descriptor.label?.startsWith('mesh:')) {
        vi.spyOn(buffer, 'destroy');
        buffers.push(buffer);
      }

      return buffer;
    });

    const texture = new RenderTexture(2, 2, { format: TextureFormat.Rgba32F, scaleMode: ScaleModes.Nearest });
    const mesh = new Mesh({ vertices: new Float32Array([0, 0, 2, 0, 0, 2]), texture });

    renderer.connect(backend);
    renderer.render(mesh);
    renderer.flush();

    expect(buffers.map(buffer => buffer.label)).toEqual(
      expect.arrayContaining([
        'mesh:vertex-buffer',
        'mesh:index-buffer',
        'mesh:uniform-buffer',
        'mesh:instanced-uniform-buffer',
        'mesh:instanced-node-index-buffer',
      ]),
    );

    if (failure === 'texture validation') {
      texture.scaleMode = ScaleModes.Linear;
      renderer.render(mesh);
    } else {
      vi.spyOn(backend.passCoordinator.activePass!.pass, 'end').mockImplementationOnce(() => {
        throw new Error('pass ending failed');
      });
    }

    expect(() => renderer.disconnect()).toThrow(failure === 'texture validation' ? /float32-filterable/ : 'pass ending failed');

    for (const buffer of buffers) {
      expect(buffer.destroy).toHaveBeenCalledTimes(1);
    }

    expect(renderer).toMatchObject({ _device: null, _backend: null });
    texture.scaleMode = ScaleModes.Nearest;
    expect(() => renderer.disconnect()).not.toThrow();

    for (const buffer of buffers) {
      expect(buffer.destroy).toHaveBeenCalledTimes(1);
    }

    const nextEnvironment = createMockWebGpuEnvironment();

    try {
      const nextBackend = await createMockBackend(nextEnvironment);

      expect(nextBackend.device).not.toBe(backend.device);
      renderer.connect(nextBackend);
      expect(renderer).toMatchObject({ _device: nextBackend.device, _backend: nextBackend });
      renderer.render(mesh);
      renderer.flush();
      expect(nextEnvironment.drawIndexedCount()).toBe(1);
      renderer.disconnect();
      nextBackend.destroy();
    } finally {
      nextEnvironment.restore();
    }

    backend.destroy();
    mesh.destroy();
    texture.destroy();
  } finally {
    vi.restoreAllMocks();
    environment.restore();
  }
});
