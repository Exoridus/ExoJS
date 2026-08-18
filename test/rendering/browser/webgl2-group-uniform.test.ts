/**
 * WebGL2 group-uniform browser test.
 *
 * Verifies that a backend-level group transform (`u_group`) offsets sprite
 * output, and that clearing it restores identity. Establishes the pixel
 * proof for the additive `u_group` plumbing before any caller
 * (RetainedPlanCache / RenderPlanPlayer) constructs a group.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

const canvasSize = 64;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: {
          antialias: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = width;
  src.height = height;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  return new Texture(src);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 group uniform (u_group)', () => {
  test('a backend-level group transform offsets sprite output; clearing it restores identity', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);
    const groupTransform = new Matrix();

    try {
      sprite.setPosition(0, 0);
      root.addChild(sprite);

      // translate(24, 24) as an ExoJS Matrix: x/y carry the translation.
      groupTransform.x = 24;
      groupTransform.y = 24;

      backend._setRenderGroupTransform(groupTransform);
      render(backend, root);

      // Sprite local 0..16 shifted by the group to 24..40.
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [0, 0, 0, 255]);

      backend._setRenderGroupTransform(null);
      render(backend, root);

      // Identity again: sprite back at 0..16.
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
