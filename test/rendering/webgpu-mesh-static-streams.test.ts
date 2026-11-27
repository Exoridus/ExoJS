import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';

import { createCanvasTexture, createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

const createGeometry = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, 16, 0, 0, 16]),
    stride: 8,
    indices: new Uint16Array([0, 1, 2]),
  });

describe('WebGPU live static mesh streams', () => {
  test.each([false, true])('packs only unbatched meshes in a mixed flush: %s', async mixed => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const geometry = createGeometry();
      const texture = createCanvasTexture();
      const root = new Container();
      const writes: Array<{ label: string; size: number }> = [];
      const writeBuffer = backend.device.queue.writeBuffer.bind(backend.device.queue);

      vi.spyOn(backend.device.queue, 'writeBuffer').mockImplementation((buffer, offset, data, dataOffset, size) => {
        writes.push({ label: buffer.label, size: size ?? data.byteLength });
        writeBuffer(buffer, offset, data, dataOffset, size);
      });

      if (mixed) {
        root.addChild(new Mesh({ vertices: new Float32Array([0, 0, 8, 0, 0, 8]), texture }));
      }

      root.addChild(new Mesh({ geometry, texture }), new Mesh({ geometry, texture }));

      if (mixed) {
        root.addChild(new Mesh({ vertices: new Float32Array([0, 0, 4, 0, 0, 4]), texture }));
      }

      for (let frame = 0; frame < 3; frame++) {
        writes.length = 0;
        root.invalidateContent();
        backend.resetStats();
        root.render(backend);
        backend.flush();

        expect(backend.stats.drawCalls).toBe(mixed ? 3 : 1);
        expect(writes.filter(write => write.label === 'mesh:vertex-buffer')).toEqual(
          mixed ? [{ label: 'mesh:vertex-buffer', size: 120 }] : [],
        );
        expect(writes.filter(write => write.label === 'mesh:index-buffer')).toEqual(
          mixed ? [{ label: 'mesh:index-buffer', size: 16 }] : [],
        );
        expect(writes.filter(write => write.label === 'mesh:uniform-buffer')).toEqual(
          mixed ? [{ label: 'mesh:uniform-buffer', size: 512 }] : [],
        );
        expect(writes.filter(write => write.label === 'mesh:instanced-node-index-buffer')).toHaveLength(1);
      }

      root.destroy();
      geometry.destroy();
      texture.destroy();
      backend.destroy();
    } finally {
      vi.restoreAllMocks();
      environment.restore();
    }
  });

  test('an isolated static mesh still uploads its default geometry', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const geometry = createGeometry();
      const texture = createCanvasTexture();
      const root = new Container();

      root.addChild(new Mesh({ geometry, texture }));
      root.render(backend);
      backend.flush();

      expect(backend.stats.drawCalls).toBe(1);
      expect(environment.writeBufferLabels()).toContain('mesh:vertex-buffer');
      expect(environment.writeBufferLabels()).not.toContain('mesh:cached-geometry-vertex-buffer');
      root.destroy();
      geometry.destroy();
      texture.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
