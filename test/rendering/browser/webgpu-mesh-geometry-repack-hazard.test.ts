/**
 * A cached static geometry that is re-packed between two flushes of one frame
 * must not change what the earlier flush already drew.
 *
 * `queue.writeBuffer` lands ahead of the open pass's submit, so a draw recorded
 * before the re-pack would otherwise read the new vertex data.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { drawWebGpuEncoded, readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

const canvasSize = 32;
const stride = 16;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black },
  }) as unknown as Application;

const createSolidTexture = (color: string, size = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

const writeQuad = (view: DataView, width: number): void => {
  const corners = [
    [0, 0, 0, 0],
    [width, 0, 1, 0],
    [width, 16, 1, 1],
    [0, 16, 0, 1],
  ];

  corners.forEach((corner, index) => {
    corner.forEach((value, component) => view.setFloat32(index * stride + component * 4, value, true));
  });
};

describe('WebGPU cached mesh geometry re-pack', () => {
  test('a re-pack between two flushes leaves the earlier draw on the old vertex data', async ctx => {
    const canvas = document.createElement('canvas');

    canvas.width = canvasSize;
    canvas.height = canvasSize;

    const backend = new WebGpuBackend(makeApp(canvas));

    wireCoreRenderers(backend);
    await backend.initialize();

    const buffer = new ArrayBuffer(4 * stride);
    const view = new DataView(buffer);

    writeQuad(view, 16);

    const geometry = new Geometry({
      attributes: [
        { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
        { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      ],
      vertexData: buffer,
      stride,
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      usage: 'static',
    });
    const redTexture = createSolidTexture('#ff0000');
    const blueTexture = createSolidTexture('#0000ff');
    const greenTexture = createSolidTexture('#00ff00', 4);
    const first = new Container();
    const second = new Container();
    const marker = new Sprite(greenTexture);
    const redTop = new Mesh({ geometry, texture: redTexture });
    const redBottom = new Mesh({ geometry, texture: redTexture });
    const blueTop = new Mesh({ geometry, texture: blueTexture });
    const blueBottom = new Mesh({ geometry, texture: blueTexture });

    redBottom.setPosition(0, 16);
    blueTop.setPosition(16, 0);
    blueBottom.setPosition(16, 16);
    marker.setPosition(28, 28);
    marker.width = 4;
    marker.height = 4;

    // Two meshes on one static geometry form an instanced batch; the sprite
    // switches renderers and flushes that batch into the still-open pass.
    first.addChild(redTop, redBottom, marker);
    second.addChild(blueTop, blueBottom);

    const frame = (between?: () => void): Promise<boolean> =>
      drawWebGpuEncoded(ctx, backend, () => {
        first.render(backend);
        between?.();
        second.render(backend);
      });

    try {
      // Warm-up frame sizes the shared stream buffers so the measured frame
      // cannot split its pass for a capacity reason that would hide the hazard.
      await frame();
      await frame(() => {
        // Each mesh packs from its own vertex copy, so narrow all of them.
        for (const mesh of [redTop, redBottom, blueTop, blueBottom]) {
          mesh.vertices[2] = 8;
          mesh.vertices[4] = 8;
        }

        geometry.invalidate();
      });

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(12, 8), [255, 0, 0, 255]);
      expectPixelNear(readPixel(12, 24), [255, 0, 0, 255]);
      expectPixelNear(readPixel(20, 8), [0, 0, 255, 255]);
      expectPixelNear(readPixel(28, 8), [0, 0, 0, 255]);
    } finally {
      first.destroy();
      second.destroy();
      redTexture.destroy();
      blueTexture.destroy();
      greenTexture.destroy();
      geometry.destroy();
      backend.destroy();
    }
  });
});
