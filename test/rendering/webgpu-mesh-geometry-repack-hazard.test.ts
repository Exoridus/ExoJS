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
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';

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
  const submit = device.queue['submit'] as (buffers: Iterable<GPUCommandBuffer>) => void;

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

  device.queue['submit'] = (buffers: Iterable<GPUCommandBuffer>): void => {
    submit(buffers);
    bound.clear();
  };

  device['createCommandEncoder'] = (): GPUCommandEncoder => {
    const encoder = createCommandEncoder();

    return {
      ...encoder,
      beginRenderPass: (descriptor: GPURenderPassDescriptor): GPURenderPassEncoder => {
        const pass = encoder.beginRenderPass(descriptor);

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
        } as unknown as GPURenderPassEncoder;
      },
    } as unknown as GPUCommandEncoder;
  };

  return hazards;
};

describe('WebGPU cached mesh geometry re-pack', () => {
  test('a retained replay is submitted before a live batch re-packs its shared geometry', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const hazards = watchCachedGeometryHazards(backend);
      const geometry = staticGeometry();
      const texture = createCanvasTexture();
      const retained = new RetainedContainer();
      const live = new Container();
      const replay = vi.spyOn(WebGpuMeshRenderer.prototype, 'replayRetainedBatch');

      retained.addChild(new Mesh({ geometry, texture }), new Mesh({ geometry, texture }));
      live.addChild(new Mesh({ geometry, texture }), new Mesh({ geometry, texture }));

      const frame = (between?: () => void): void => {
        backend.resetStats();
        retained.render(backend);
        between?.();
        live.invalidateContent();
        live.render(backend);
        backend.flush();
      };

      for (let index = 0; index < 3; index++) {
        frame();
      }

      hazards.length = 0;
      replay.mockClear();
      frame(() => geometry.invalidate());

      expect(replay).toHaveBeenCalledOnce();
      expect(backend.stats.drawCalls).toBe(2);
      expect(hazards).toEqual([]);

      retained.destroy();
      live.destroy();
      texture.destroy();
      geometry.destroy();
      backend.destroy();
    } finally {
      vi.restoreAllMocks();
      environment.restore();
    }
  });

  test('unchanged retained geometry and live batches keep sharing one warmed pass', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const geometry = staticGeometry();
      const texture = createCanvasTexture();
      const retained = new RetainedContainer();
      const live = new Container();

      retained.addChild(new Mesh({ geometry, texture }), new Mesh({ geometry, texture }));
      live.addChild(new Mesh({ geometry, texture }), new Mesh({ geometry, texture }));

      for (let index = 0; index < 6; index++) {
        const passesBefore = environment.renderPassLabels().length;

        backend.resetStats();
        retained.render(backend);
        live.invalidateContent();
        live.render(backend);
        backend.flush();

        if (index >= 3) {
          expect(environment.renderPassLabels().length - passesBefore).toBe(1);
          expect(backend.stats.drawCalls).toBe(2);
        }
      }

      retained.destroy();
      live.destroy();
      texture.destroy();
      geometry.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('disconnect submits a retained replay before destroying its cached geometry', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const hazards = watchCachedGeometryHazards(backend);
      const geometry = staticGeometry();
      const texture = createCanvasTexture();
      const retained = new RetainedContainer();
      const mesh = new Mesh({ geometry, texture });
      const replay = vi.spyOn(WebGpuMeshRenderer.prototype, 'replayRetainedBatch');

      retained.addChild(mesh, new Mesh({ geometry, texture }));

      for (let index = 0; index < 3; index++) {
        backend.resetStats();
        retained.render(backend);
        backend.flush();
      }

      hazards.length = 0;
      replay.mockClear();
      backend.resetStats();
      retained.render(backend);
      backend.rendererRegistry.resolve(mesh).disconnect();
      backend.flush();

      expect(replay).toHaveBeenCalledOnce();
      expect(hazards).toEqual([]);

      retained.destroy();
      texture.destroy();
      geometry.destroy();
      backend.destroy();
    } finally {
      vi.restoreAllMocks();
      environment.restore();
    }
  });

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
