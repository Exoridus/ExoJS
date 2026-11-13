import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { createWebGpuTestBackend, drawWebGpuEncoded, readWebGpuPixels } from './_backendSetup';
import { expectPixelNear } from './_pixels';

test.each([false, true])('live static batches preserve geometry and tint slots across a renderer switch: %s', async (split, ctx) => {
  const backend = await createWebGpuTestBackend(96);
  const geometry = new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, 12, 0, 0, 12]),
    stride: 8,
    indices: new Uint16Array([0, 1, 2]),
  });
  const texture = Texture.fromColor(Color.white, 1);
  const root = new Container();
  const lower = new Container();
  const marker = new Sprite(texture);
  const red = new Mesh({ vertices: new Float32Array([0, 0, 12, 0, 0, 12]), texture });
  const first = new Mesh({ geometry, texture });
  const second = new Mesh({ geometry, texture });
  const blue = new Mesh({ vertices: new Float32Array([0, 0, 12, 0, 0, 12]), texture });

  red.position.set(4, 4);
  red.tint = Color.red;
  first.position.set(24, 4);
  first.tint = Color.green;
  second.position.set(44, 4);
  second.tint = Color.green;
  blue.position.set(4, 28);
  blue.tint = Color.blue;
  root.addChild(red, first, second, blue);

  if (split) {
    const lowerRed = new Mesh({ vertices: new Float32Array([0, 0, 12, 0, 0, 12]), texture });
    const lowerFirst = new Mesh({ geometry, texture });
    const lowerSecond = new Mesh({ geometry, texture });
    const lowerBlue = new Mesh({ vertices: new Float32Array([0, 0, 12, 0, 0, 12]), texture });

    marker.position.set(90, 90);
    lowerRed.position.set(4, 52);
    lowerRed.tint = Color.blue;
    lowerFirst.position.set(24, 52);
    lowerFirst.tint = Color.green;
    lowerSecond.position.set(44, 52);
    lowerSecond.tint = Color.green;
    lowerBlue.position.set(4, 76);
    lowerBlue.tint = Color.red;
    lower.addChild(lowerRed, lowerFirst, lowerSecond, lowerBlue);
  }

  try {
    for (let frame = 0; frame < 3; frame++) {
      const writes: Array<{ label: string; bytes: number }> = [];
      const writeBuffer = backend.device.queue.writeBuffer.bind(backend.device.queue);
      const spy = vi.spyOn(backend.device.queue, 'writeBuffer').mockImplementation((buffer, offset, data, dataOffset, size) => {
        writes.push({ label: buffer.label, bytes: size ?? data.byteLength });
        writeBuffer(buffer, offset, data, dataOffset, size);
      });

      try {
        root.invalidateContent();
        backend.resetStats();

        if (
          !(await drawWebGpuEncoded(ctx, backend, () => {
            root.render(backend);

            if (split) {
              marker.render(backend);
              lower.invalidateContent();
              lower.render(backend);
            }
          }))
        ) {
          return;
        }

        const pixel = readWebGpuPixels(backend, 96);

        expect(backend.stats.drawCalls).toBe(split ? 7 : 3);
        expectPixelNear(pixel(6, 6), [255, 0, 0, 255]);
        expectPixelNear(pixel(26, 6), [0, 255, 0, 255]);
        expectPixelNear(pixel(46, 6), [0, 255, 0, 255]);
        expectPixelNear(pixel(6, 30), [0, 0, 255, 255]);

        if (split) {
          expectPixelNear(pixel(6, 54), [0, 0, 255, 255]);
          expectPixelNear(pixel(26, 54), [0, 255, 0, 255]);
          expectPixelNear(pixel(46, 54), [0, 255, 0, 255]);
          expectPixelNear(pixel(6, 78), [255, 0, 0, 255]);
        }

        const flushes = split ? 2 : 1;

        expect(writes.filter(write => write.label === 'mesh:vertex-buffer')).toEqual(
          Array.from({ length: flushes }, () => ({ label: 'mesh:vertex-buffer', bytes: 120 })),
        );
        expect(writes.filter(write => write.label === 'mesh:index-buffer')).toEqual(
          Array.from({ length: flushes }, () => ({ label: 'mesh:index-buffer', bytes: 16 })),
        );
        expect(writes.filter(write => write.label === 'mesh:uniform-buffer')).toEqual(
          Array.from({ length: flushes }, () => ({ label: 'mesh:uniform-buffer', bytes: 512 })),
        );
      } finally {
        spy.mockRestore();
      }

      geometry.invalidate();
    }
  } finally {
    root.destroy();
    lower.destroy();
    marker.destroy();
    geometry.destroy();
    texture.destroy();
    backend.destroy();
  }
});
