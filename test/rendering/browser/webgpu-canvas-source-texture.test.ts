/**
 * A canvas-sourced `Texture` must upload regardless of which context the canvas
 * already holds.
 *
 * `TextureSource` accepts any `HTMLCanvasElement`, and a caller may well hand
 * over one that is already driven by WebGL or `bitmaprenderer` - a minimap, an
 * offscreen effect, another engine's output. `copyExternalImageToTexture` takes
 * such a canvas happily; `getImageData` cannot, because `getContext('2d')`
 * returns null once a canvas is bound to a different context type. The
 * Safari-workaround upload path therefore has to fall back rather than assume a
 * 2D context exists.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { createWebGpuTestBackend, readWebGpuFrame, renderWebGpuOnce } from './_backendSetup';

const SIZE = 64;

const pixelAt = (frame: ArrayLike<number>, x: number, y: number): readonly [number, number, number, number] => {
  const i = (y * SIZE + x) * 4;

  return [frame[i]!, frame[i + 1]!, frame[i + 2]!, frame[i + 3]!];
};

/** A 16×16 canvas filled opaque red through a WebGL2 context, so no 2D context can be obtained from it. */
const webglBackedCanvas = (edge = 16): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = edge;
  canvas.height = edge;

  const gl = canvas.getContext('webgl2');

  if (gl === null) throw new Error('This suite needs a WebGL2 context to claim the canvas.');

  gl.clearColor(1, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.finish();

  return canvas;
};

describe('WebGPU uploads a canvas-sourced texture whose canvas is not 2D', () => {
  test('getContext("2d") returning null does not fail the upload', async ctx => {
    const backend = await createWebGpuTestBackend(SIZE);
    const root = new Container();
    const canvas = webglBackedCanvas();

    // Precondition of the whole test: this canvas genuinely has no 2D context.
    expect(canvas.getContext('2d')).toBeNull();

    const sprite = new Sprite(new Texture(canvas));

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expect(pixelAt(readWebGpuFrame(backend, SIZE), 16, 16)).toEqual([255, 0, 0, 255]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
