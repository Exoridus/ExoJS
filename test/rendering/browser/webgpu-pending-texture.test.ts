/**
 * WebGPU pending-texture browser tests - opt-in, capability-aware.
 *
 * A texture whose image has not arrived yet is a lifecycle state the backend
 * has to draw through, not a caller error. Raising instead ended the whole
 * application: the frame guard halts the loop after three consecutive throws,
 * and a drawable carrying its own geometry reaches the texture sync on every
 * frame - unlike a `Sprite`, which measures 0x0 without a frame and is never
 * submitted. `WebGl2Backend` skips the upload in the same situation, so this is
 * also what keeps the two backends answering alike.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Mesh } from '#rendering/mesh/Mesh';
import { Texture } from '#rendering/texture/Texture';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce, webGpuAvailable } from './_backendSetup';
import { expectPixelNear } from './_pixels';

const canvasSize = 64;

/**
 * A loader handle before its payload lands. Built from a real texture and then
 * masked back to the pre-load state, so every internal the backend touches
 * (destroy/release listener sets, version counter) is the genuine article.
 */
const makePendingTexture = (): { texture: Texture; finishLoad: () => void } => {
  const source = document.createElement('canvas');

  source.width = 2;
  source.height = 2;

  const context = source.getContext('2d')!;

  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, 2, 2);

  const texture = new Texture(source);
  const mask = (value: unknown) => ({ value, writable: true, enumerable: true, configurable: true });

  Object.defineProperties(texture, { source: mask(null), width: mask(0), height: mask(0), ready: mask(false) });

  return {
    texture,
    finishLoad: () => {
      Object.defineProperties(texture, { source: mask(source), width: mask(2), height: mask(2), ready: mask(true) });
      texture.updateSource();
    },
  };
};

/** A unit quad centred on the canvas, sampling the whole texture. */
const makeQuad = (texture: Texture): Mesh => {
  const half = canvasSize / 4;
  const quad = new Mesh({
    vertices: new Float32Array([-half, -half, half, -half, half, half, -half, half]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    texture,
  });

  quad.setPosition(canvasSize / 2, canvasSize / 2);

  return quad;
};

describe('WebGPU: a mesh whose texture is still loading', () => {
  test('draws through the pending frame and picks the image up once it lands', async ctx => {
    if (!(await webGpuAvailable())) {
      return;
    }

    const backend = await createWebGpuTestBackend(canvasSize);
    const { texture, finishLoad } = makePendingTexture();
    const quad = makeQuad(texture);

    // The frame that must not raise: three of these in a row used to stop the
    // application outright.
    await renderWebGpuOnce(ctx, backend, quad, Color.black);

    expectPixelNear(readWebGpuPixels(backend, canvasSize)(canvasSize / 2, canvasSize / 2), [0, 0, 0, 255], 4);

    finishLoad();
    await renderWebGpuOnce(ctx, backend, quad, Color.black);

    expectPixelNear(readWebGpuPixels(backend, canvasSize)(canvasSize / 2, canvasSize / 2), [255, 0, 0, 255], 4);

    quad.destroy();
    backend.destroy();
  });
});
