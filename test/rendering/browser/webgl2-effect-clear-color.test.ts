/**
 * WebGL2 clear-colour containment across effect passes.
 *
 * An effect capture clears its own target to transparent black, and
 * `backend.clear(colour)` writes the colour it is given through to the
 * persistent one. Without restoring it around the child pass, ONE filtered or
 * cached node repaints the application's background for the rest of the
 * session: every later frame clears to transparent black instead of
 * `clearColor`. Found on a real device — the probe's background went from the
 * app colour to see-through the moment a filter scene had run once.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ColorFilter } from '#rendering/filters/ColorFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

type RgbaTuple = [number, number, number, number];

const SIZE = 64;
/** Distinctive so a wrong result cannot coincide with black, white or the content colour. */
const BACKGROUND = new Color(20, 20, 40);

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = SIZE;
  canvas.height = SIZE;

  const app = {
    canvas,
    options: {
      clearColor: BACKGROUND,
      canvas: { width: SIZE, height: SIZE, pixelRatio: 1 },
      rendering: {
        debug: false,
        webglAttributes: { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, stencil: false, depth: false },
        spriteRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const createSolidTexture = (color: string): Texture => {
  const source = document.createElement('canvas');

  source.width = 8;
  source.height = 8;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, 8, 8);

  return new Texture(source);
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), gl.drawingBufferHeight - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

/** A small filtered sprite in the top-left corner, leaving the rest of the surface untouched. */
const createFilteredSubject = (texture: Texture): { root: Container; filter: ColorFilter } => {
  const root = new Container();
  const sprite = new Sprite(texture);
  const filter = new ColorFilter(Color.white);

  sprite.width = 16;
  sprite.height = 16;
  sprite.setPosition(0, 0);
  root.addChild(sprite);
  root.filters = [filter];

  return { root, filter };
};

describe('WebGL2 effect clear colour', () => {
  test('an effect capture does not repaint the background for every later frame', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const { root, filter } = createFilteredSubject(texture);

    try {
      // Frame 1 — no effect has run yet; the far corner is the app background.
      backend.clear();
      backend.flush();
      expectPixelNear(readPixel(backend, SIZE - 4, SIZE - 4), [20, 20, 40, 255]);

      // Frame 2 — the filter runs, which captures into its own target and clears
      // that target to transparent black.
      backend.clear();
      root.render(backend);
      backend.flush();

      // Frame 3 — nothing about the background changed, so it must still be the
      // app colour. Before the fix this read (0, 0, 0, 0): the capture's clear
      // colour had replaced the persistent one.
      backend.clear();
      backend.flush();
      expectPixelNear(readPixel(backend, SIZE - 4, SIZE - 4), [20, 20, 40, 255]);
    } finally {
      root.destroy();
      filter.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('the backend still reports the application clear colour after an effect', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const { root, filter } = createFilteredSubject(texture);

    try {
      backend.clear();
      root.render(backend);
      backend.flush();

      expect([backend.clearColor.r, backend.clearColor.g, backend.clearColor.b, backend.clearColor.a]).toEqual([20, 20, 40, 1]);
    } finally {
      root.destroy();
      filter.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('an explicit clear colour still takes effect and persists', async () => {
    const backend = await createBackend();

    try {
      backend.clear(new Color(0, 128, 0));
      backend.flush();
      expectPixelNear(readPixel(backend, SIZE / 2, SIZE / 2), [0, 128, 0, 255]);

      // Persisting is the whole point of the setter — a later argument-less
      // clear keeps it.
      backend.clear();
      backend.flush();
      expectPixelNear(readPixel(backend, SIZE / 2, SIZE / 2), [0, 128, 0, 255]);
    } finally {
      backend.destroy();
    }
  });
});
