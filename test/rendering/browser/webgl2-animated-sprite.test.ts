/**
 * WebGL2 AnimatedSprite browser test — v0.16 renderer-matrix follow-up.
 *
 * {@link AnimatedSprite} reuses the normal Sprite renderer but swaps the
 * texture-frame UV sub-region per animation frame. This asserts that swap
 * actually samples the correct sub-rect of a shared spritesheet texture: a
 * two-cell spritesheet (each cell a distinct solid color) is rendered at
 * frame 0, then advanced to frame 1, with pixel reads proving the sampled
 * color changes to match the new cell.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

const canvasSize = 64;
const cellSize = 16;

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

/**
 * Builds a horizontal N-cell spritesheet texture, each cell filled with a
 * distinct solid color, so a frame swap is provably a different sub-rect
 * rather than a coincidentally-similar sample.
 */
const createSpritesheetTexture = (colors: readonly string[], size = cellSize): Texture => {
  const src = document.createElement('canvas');

  src.width = size * colors.length;
  src.height = size;

  const ctx = src.getContext('2d')!;

  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(index * size, 0, size, size);
  });

  return new Texture(src);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 AnimatedSprite — frame-region UV swap', () => {
  test('frame 0 samples the first spritesheet cell', async () => {
    const backend = await createBackend();
    const texture = createSpritesheetTexture(['#ff0000', '#0000ff']);
    const root = new Container();
    const sprite = new AnimatedSprite(texture, {
      cells: { frames: [new Rectangle(0, 0, cellSize, cellSize), new Rectangle(cellSize, 0, cellSize, cellSize)], fps: 10 },
    });

    try {
      sprite.play('cells');
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);

      // Interior of the sprite (16x16 at 8,8 → covers 8..24) shows cell 0 (red)
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
      // Outside the sprite's bounds remains the clear color (black)
      expectPixelNear(readWebGl2Pixel(backend, 40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('advancing playback swaps to the second spritesheet cell', async () => {
    const backend = await createBackend();
    const texture = createSpritesheetTexture(['#ff0000', '#0000ff']);
    const root = new Container();
    const sprite = new AnimatedSprite(texture, {
      cells: { frames: [new Rectangle(0, 0, cellSize, cellSize), new Rectangle(cellSize, 0, cellSize, cellSize)], fps: 10 },
    });

    try {
      sprite.play('cells');
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);

      // Advance exactly one frame's worth of time (fps 10 → 100ms/frame)
      sprite.update(100 / 1000);
      expect(sprite.currentFrame).toBe(1);

      render(backend, root);

      // Same screen position now samples cell 1 (blue) — proves the UV
      // sub-rect swap, not just a re-render of the same frame.
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [0, 0, 255, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('play() restart returns playback to the first spritesheet cell', async () => {
    const backend = await createBackend();
    const texture = createSpritesheetTexture(['#ff0000', '#0000ff']);
    const root = new Container();
    const sprite = new AnimatedSprite(texture, {
      cells: { frames: [new Rectangle(0, 0, cellSize, cellSize), new Rectangle(cellSize, 0, cellSize, cellSize)], fps: 10 },
    });

    try {
      sprite.play('cells');
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      sprite.update(100 / 1000);
      expect(sprite.currentFrame).toBe(1);

      // Restart (the default) rewinds to frame 0
      sprite.play('cells');
      expect(sprite.currentFrame).toBe(0);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
