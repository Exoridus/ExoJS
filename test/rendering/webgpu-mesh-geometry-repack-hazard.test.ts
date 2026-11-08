/**
 * A cached static geometry is re-packed into its own GPU buffers when its
 * version changes. Those buffers may already be bound by an instanced draw
 * earlier in the same open pass, and `queue.writeBuffer` / `destroy` land ahead
 * of the pass's submit - so the renderer has to end the pass first, or the
 * earlier draw reads the new contents (or a destroyed buffer).
 */
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import { Sprite } from '#rendering/sprite/Sprite';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createCanvasTexture, createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

const stride = 20;

const triangleVertices = (count: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(count * stride);
  const view = new DataView(buffer);

  for (let index = 0; index < count; index++) {
    view.setFloat32(index * stride, (index % 3) * 16, true);
    view.setFloat32(index * stride + 4, index % 3 === 2 ? 16 : 0, true);
    view.setUint32(index * stride + 16, 0xffffffff, true);
  }

  return buffer;
};

const staticGeometry = (): Geometry =>
  new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    vertexData: triangleVertices(3),
    stride,
    usage: 'static',
  });

/**
 * Record every write into, or destruction of, a cached-geometry buffer while a
 * pass that bound it is still open.
 */
const watchCachedGeometryHazards = (backend: WebGpuBackend): string[] => {
  const device = backend.device as unknown as Record<string, unknown> & { queue: Record<string, unknown> };
  const hazards: string[] = [];
  const bound = new Set<unknown>();
  const isCachedGeometry = (buffer: unknown): boolean => (buffer as { label?: string }).label?.startsWith('mesh:cached-geometry') === true;
  const createBuffer = device['createBuffer'] as (descriptor: GPUBufferDescriptor) => GPUBuffer;
  const createCommandEncoder = device['createCommandEncoder'] as () => GPUCommandEncoder;
  const writeBuffer = device.queue['writeBuffer'] as (buffer: GPUBuffer, ...rest: unknown[]) => void;

  device['createBuffer'] = (descriptor: GPUBufferDescriptor): GPUBuffer => {
    const buffer = createBuffer(descriptor) as unknown as Record<string, unknown>;

    buffer['size'] = descriptor.size;

    buffer['destroy'] = (): void => {
      if (bound.has(buffer)) {
        hazards.push(`destroy ${descriptor.label ?? ''}`);
      }
    };

    return buffer as unknown as GPUBuffer;
  };

  device.queue['writeBuffer'] = (buffer: GPUBuffer, ...rest: unknown[]): void => {
    if (bound.has(buffer) && isCachedGeometry(buffer)) {
      hazards.push(`write ${buffer.label}`);
    }

    writeBuffer(buffer, ...rest);
  };

  device['createCommandEncoder'] = (): GPUCommandEncoder => {
    const encoder = createCommandEncoder();

    return {
      ...encoder,
      beginRenderPass: (descriptor: GPURenderPassDescriptor): GPURenderPassEncoder => {
        const pass = encoder.beginRenderPass(descriptor);

        bound.clear();

        return {
          ...pass,
          setVertexBuffer: (slot: number, buffer: GPUBuffer, ...rest: unknown[]): void => {
            bound.add(buffer);
            (pass.setVertexBuffer as (...args: unknown[]) => void)(slot, buffer, ...rest);
          },
          setIndexBuffer: (buffer: GPUBuffer, ...rest: unknown[]): void => {
            bound.add(buffer);
            (pass.setIndexBuffer as (...args: unknown[]) => void)(buffer, ...rest);
          },
          end: (): void => {
            bound.clear();
            pass.end();
          },
        } as unknown as GPURenderPassEncoder;
      },
    } as unknown as GPUCommandEncoder;
  };

  return hazards;
};

describe('WebGPU cached mesh geometry re-pack', () => {
  test('a re-pack between two flushes ends the pass that already drew the geometry', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const hazards = watchCachedGeometryHazards(backend);
      const geometry = staticGeometry();
      const texture = createCanvasTexture();
      const first = new Container();
      const second = new Container();

      // Two meshes on one static geometry form an instanced batch; the sprite
      // switches renderers, which flushes the mesh batch into the still-open pass.
      first.addChild(new Mesh({ geometry, texture }), new Mesh({ geometry, texture }), new Sprite(texture));
      second.addChild(new Mesh({ geometry, texture }), new Mesh({ geometry, texture }));

      // A warm-up frame sizes the shared stream buffers, so the frame under test
      // does not split its pass for a capacity reason that would hide the hazard.
      const frame = (between?: () => void): void => {
        backend.resetStats();
        first.render(backend);
        between?.();
        second.render(backend);
        backend.flush();
      };

      frame();
      hazards.length = 0;
      frame(() => geometry.invalidate());

      expect(environment.drawIndexedCount()).toBeGreaterThanOrEqual(2);
      expect(hazards).toEqual([]);

      first.destroy();
      second.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
