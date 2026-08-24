/**
 * WebGPU against a surface with no document behind it, and against the two
 * texture sources that only exist once a host is willing to work off the main
 * thread: an `OffscreenCanvas` and a decoded `VideoFrame`.
 *
 * Compile-time acceptance proves nothing here - the whole point is that a real
 * `GPUCanvasContext` is configured on a real `OffscreenCanvas` and that real
 * pixels come back out of it.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { createWebGpuOffscreenBackend, createWebGpuTestBackend, readWebGpuFrame, renderWebGpuOnce } from './_backendSetup';
import { expectPixelNear, pixelAt } from './_pixels';

const SIZE = 64;

const filledOffscreenCanvas = (edge = 16): OffscreenCanvas => {
  const canvas = new OffscreenCanvas(edge, edge);
  const context = canvas.getContext('2d');

  if (context === null) throw new Error('This suite needs a 2D context on an OffscreenCanvas.');

  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, edge, edge);

  return canvas;
};

/** Whether this browser ships WebCodecs at all. Recorded rather than failed. */
const hasVideoFrame = (ctx: { skip: (reason: string) => void }): boolean => {
  if (typeof VideoFrame === 'function') {
    return true;
  }

  ctx.skip('This browser has no WebCodecs VideoFrame.');

  return false;
};

const filledCanvas = (edge = 16): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = edge;
  canvas.height = edge;

  const context = canvas.getContext('2d');

  if (context === null) throw new Error('This suite needs a 2D context.');

  context.fillStyle = '#00ff00';
  context.fillRect(0, 0, edge, edge);

  return canvas;
};

describe('WebGPU renders into an OffscreenCanvas', () => {
  test('a sprite drawn on an offscreen surface reads back as real pixels', async ctx => {
    const backend = await createWebGpuOffscreenBackend(SIZE);
    const root = new Container();
    const sprite = new Sprite(new Texture(filledOffscreenCanvas()));

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expectPixelNear(pixelAt(readWebGpuFrame(backend, SIZE), SIZE, 16, 16), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('the surface it configured is the OffscreenCanvas it was given', async () => {
    const backend = await createWebGpuOffscreenBackend(SIZE);

    try {
      expect(backend.context.canvas).toBeInstanceOf(OffscreenCanvas);
    } finally {
      backend.destroy();
    }
  });
});

describe('WebGPU uploads the surface-only texture sources', () => {
  test('an OffscreenCanvas is a texture source on a document-backed surface', async ctx => {
    const backend = await createWebGpuTestBackend(SIZE);
    const root = new Container();
    const sprite = new Sprite(new Texture(filledOffscreenCanvas()));

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expectPixelNear(pixelAt(readWebGpuFrame(backend, SIZE), SIZE, 16, 16), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('a VideoFrame uploads, and the engine leaves it open for its owner to close', async ctx => {
    if (!hasVideoFrame(ctx)) return;

    const backend = await createWebGpuTestBackend(SIZE);
    const root = new Container();
    const frame = new VideoFrame(filledCanvas(), { timestamp: 0 });
    const sprite = new Sprite(new Texture(frame));

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expectPixelNear(pixelAt(readWebGpuFrame(backend, SIZE), SIZE, 16, 16), [0, 255, 0, 255]);

      // A closed frame reports a null format. The engine reads a frame during
      // upload and never retains or releases it, so this one is still usable.
      expect(frame.format).not.toBeNull();
    } finally {
      root.destroy();
      backend.destroy();
      frame.close();
    }
  });
});
