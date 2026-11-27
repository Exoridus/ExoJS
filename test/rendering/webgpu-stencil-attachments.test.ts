import { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { MultiRenderTarget } from '#rendering/MultiRenderTarget';
import type { ColorTextureFormat } from '#rendering/types';
import { TextureFormat } from '#rendering/types';

import { createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

test('stencil push and pop match every color attachment and cache the complete layout', async () => {
  const environment = createMockWebGpuEnvironment();
  const backend = await createMockBackend(environment);
  const createPipeline = vi.spyOn(backend.device, 'createRenderPipeline');
  const shape = new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, 32, 0, 0, 32]),
    stride: 8,
  });
  const layouts: Array<{ formats: ColorTextureFormat[]; targets: GPUColorTargetState[] }> = [
    {
      formats: [TextureFormat.Rgba8, TextureFormat.Rgba16F],
      targets: [
        { format: 'rgba8unorm', writeMask: 0 },
        { format: 'rgba16float', writeMask: 0 },
      ],
    },
    {
      formats: [TextureFormat.Rgba8, TextureFormat.Rgba8],
      targets: [
        { format: 'rgba8unorm', writeMask: 0 },
        { format: 'rgba8unorm', writeMask: 0 },
      ],
    },
    {
      formats: [TextureFormat.Rgba16F, TextureFormat.Rgba8],
      targets: [
        { format: 'rgba16float', writeMask: 0 },
        { format: 'rgba8unorm', writeMask: 0 },
      ],
    },
    { formats: [TextureFormat.Rgba8], targets: [{ format: 'rgba8unorm', writeMask: 0 }] },
  ];
  const targets = layouts.map(layout => new MultiRenderTarget(32, 32, { formats: layout.formats }));

  try {
    for (const [index, layout] of layouts.entries()) {
      backend.setRenderTarget(targets[index]!);
      backend.pushStencilClip(shape, Matrix.identity);
      backend.popStencilClip();

      expect(environment.renderPassAttachmentCounts().slice(-2)).toEqual([layout.targets.length, layout.targets.length]);

      const descriptors = createPipeline.mock.calls.slice(index * 2).map(([descriptor]) => descriptor);

      expect(descriptors).toHaveLength(2);
      expect(descriptors.map(descriptor => [...descriptor.fragment!.targets])).toEqual([layout.targets, layout.targets]);
      expect(descriptors.map(descriptor => descriptor.depthStencil?.stencilFront?.passOp)).toEqual(['increment-clamp', 'decrement-clamp']);
    }

    backend.setRenderTarget(targets[0]!);
    backend.pushStencilClip(shape, Matrix.identity);
    backend.popStencilClip();

    expect(createPipeline).toHaveBeenCalledTimes(8);
  } finally {
    backend.destroy();

    for (const target of targets) {
      target.destroy();
    }

    shape.destroy();
    environment.restore();
  }
});
