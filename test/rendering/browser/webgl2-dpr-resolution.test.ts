/**
 * WebGL2 device-pixel-ratio / design-resolution browser tests.
 *
 * Verifies that when the canvas backing store is larger than the logical
 * (design) render-target size — i.e. `pixelRatio > 1` — the backend scales the
 * root viewport up to the full backing store. Content authored in logical
 * coordinates therefore fills every device pixel (crisp on HiDPI, no
 * upscale-blur, no rendering stuck in a logical-sized corner) and logical
 * positions land at the matching physical pixel.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

type RgbaTuple = [number, number, number, number];

const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

/**
 * Build a backend whose canvas backing store is `logical × pixelRatio` while
 * the render target stays at the logical size — exactly what Application does
 * for `pixelRatio > 1`.
 */
const createBackend = async (logical: number, pixelRatio: number): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = logical * pixelRatio;
  canvas.height = logical * pixelRatio;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: logical, height: logical, pixelRatio },
      rendering: {
        debug: false,
        webglAttributes: defaultWebGlAttributes,
        spriteRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

/** Read a single pixel in backing-store coordinates (top-left origin). */
const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), gl.drawingBufferHeight - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 4): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

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

/**
 * A sprite covering the LEFT HALF of the logical space: x in [0, logical/2],
 * y in [0, logical]. Its right edge is the probe for the device-pixel mapping.
 */
const createLeftHalfSprite = (texture: Texture, logical: number): Sprite =>
  new Sprite(texture)
    .setPosition(logical / 4, logical / 2)
    .setAnchor(0.5)
    .setScale(logical / 2 / texture.width, logical / texture.height);

describe('WebGL2 device-pixel-ratio resolution', () => {
  test('pixelRatio 2 scales the root viewport to fill the full backing store', async () => {
    const logical = 64;
    const backend = await createBackend(logical, 2);
    const white = createSolidTexture('#ffffff');
    const sprite = createLeftHalfSprite(white, logical);

    try {
      // The backing store is 128×128; the target/view is 64×64 logical.
      expect(backend.context.drawingBufferWidth).toBe(128);
      expect(backend.renderTarget.width).toBe(64);

      backend.clear(Color.black);
      sprite.render(backend);
      backend.flush();

      // The logical left-half edge (x=32) must land at physical x=64.
      expectPixelNear(readPixel(backend, 60, 64), [255, 255, 255, 255]); // just left of the edge → white
      expectPixelNear(readPixel(backend, 68, 64), [0, 0, 0, 255]); // just right of the edge → black

      // Content fills the FULL physical height — not stuck in a logical-sized
      // corner (which would leave the top rows of the backing store empty).
      expectPixelNear(readPixel(backend, 32, 4), [255, 255, 255, 255]); // top
      expectPixelNear(readPixel(backend, 32, 124), [255, 255, 255, 255]); // bottom
      expectPixelNear(readPixel(backend, 124, 64), [0, 0, 0, 255]); // far right → background
    } finally {
      sprite.destroy();
      white.destroy();
      backend.destroy();
    }
  });

  test('pixelRatio 1 control: edge lands at the logical pixel', async () => {
    const logical = 64;
    const backend = await createBackend(logical, 1);
    const white = createSolidTexture('#ffffff');
    const sprite = createLeftHalfSprite(white, logical);

    try {
      expect(backend.context.drawingBufferWidth).toBe(64);

      backend.clear(Color.black);
      sprite.render(backend);
      backend.flush();

      // Edge at logical/physical x=32.
      expectPixelNear(readPixel(backend, 28, 32), [255, 255, 255, 255]);
      expectPixelNear(readPixel(backend, 36, 32), [0, 0, 0, 255]);
    } finally {
      sprite.destroy();
      white.destroy();
      backend.destroy();
    }
  });
});
