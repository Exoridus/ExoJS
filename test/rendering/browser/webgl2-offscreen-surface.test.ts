/**
 * WebGL2 against a surface with no document behind it, and against the two
 * texture sources that only exist once a host is willing to work off the main
 * thread: an `OffscreenCanvas` and a decoded `VideoFrame`.
 *
 * Compile-time acceptance proves nothing here - the whole point is that a real
 * context is acquired from a real `OffscreenCanvas` and that real pixels come
 * back out of it.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { ManualCanvasSizing } from '#core/sizing/ManualCanvasSizing';
import { ResponsiveCanvasSizing } from '#core/sizing/ResponsiveCanvasSizing';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { createWebGl2OffscreenBackend, createWebGl2TestBackend, readWebGl2Frame, renderWebGl2Once } from './_backendSetup';
import { EXACT_TOLERANCE, expectPixelNear, pixelAt } from './_pixels';

const SIZE = 64;

/** A small opaque-red 2D surface, either kind. */
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

describe('WebGL2 renders into an OffscreenCanvas', () => {
  test('a sprite drawn on an offscreen surface reads back as real pixels', async () => {
    const backend = await createWebGl2OffscreenBackend(SIZE);
    const root = new Container();
    const sprite = new Sprite(new Texture(filledOffscreenCanvas()));

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      renderWebGl2Once(backend, root, Color.black);

      expectPixelNear(pixelAt(readWebGl2Frame(backend, SIZE), SIZE, 16, 16), [255, 0, 0, 255], EXACT_TOLERANCE);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('the surface it drew into is the OffscreenCanvas it was given', async () => {
    const backend = await createWebGl2OffscreenBackend(SIZE);

    try {
      expect(backend.context.canvas).toBeInstanceOf(OffscreenCanvas);
    } finally {
      backend.destroy();
    }
  });
});

describe('an application given an OffscreenCanvas on the main thread', () => {
  test('renders into it, reports no element, and leaves the DOM options inert', async () => {
    const surface = new OffscreenCanvas(SIZE, SIZE);
    const app = new Application({
      hello: false,
      backend: { type: 'webgl2' },
      canvas: {
        element: surface,
        width: SIZE,
        height: SIZE,
        pixelRatio: 1,
        // A document affordance the surface does not have. It must be ignored
        // rather than throw, and must not conjure a DOM canvas.
        mount: document.body,
      },
    });

    try {
      expect(app.canvas).toBe(surface);
      expect(app.element).toBeNull();
      expect(app.platform.constructor.name).toBe('OffscreenPlatform');

      // The backing store is sized even though there is no CSS box to size.
      expect(surface.width).toBe(SIZE);
      expect(surface.height).toBe(SIZE);

      // Nothing was appended to the document in the surface's name.
      expect(document.body.querySelector('canvas')).toBeNull();

      const metrics = app.platform.getSurfaceMetrics();

      expect(metrics.backingWidth).toBe(SIZE);
      expect(metrics.backingHeight).toBe(SIZE);
    } finally {
      await app.destroy();
    }
  });

  test('refuses a sizing policy that would have to measure a parent element', () => {
    const surface = new OffscreenCanvas(SIZE, SIZE);

    // The alternative would be a policy that silently observes nothing, which
    // looks like a rendering bug much later with nothing pointing back here.
    expect(
      () =>
        new Application({
          hello: false,
          backend: { type: 'webgl2' },
          canvas: { element: surface, width: SIZE, height: SIZE, sizing: new ResponsiveCanvasSizing() },
        }),
    ).toThrow(/OffscreenCanvas/);
  });

  test('sizes a manually driven surface from Application.resize', async () => {
    const surface = new OffscreenCanvas(SIZE, SIZE);
    const app = new Application({
      hello: false,
      backend: { type: 'webgl2' },
      canvas: { element: surface, width: SIZE, height: SIZE, pixelRatio: 2, sizing: new ManualCanvasSizing() },
    });

    try {
      expect(surface.width).toBe(SIZE * 2);

      app.resize(SIZE * 2, SIZE);

      expect(app.width).toBe(SIZE * 2);
      expect(surface.width).toBe(SIZE * 4);
      expect(surface.height).toBe(SIZE * 2);
    } finally {
      await app.destroy();
    }
  });

  test('leaves a caller-provided surface alone when it goes down', async () => {
    const surface = new OffscreenCanvas(SIZE, SIZE);
    const app = new Application({ hello: false, backend: { type: 'webgl2' }, canvas: { element: surface, width: SIZE, height: SIZE, pixelRatio: 1 } });

    await app.destroy();

    // A surface the caller owns survives the application that drew into it.
    expect(surface.width).toBe(SIZE);
    expect(surface.height).toBe(SIZE);
  });
});

describe('WebGL2 uploads the surface-only texture sources', () => {
  test('an OffscreenCanvas is a texture source on a document-backed surface', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const root = new Container();
    const sprite = new Sprite(new Texture(filledOffscreenCanvas()));

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      renderWebGl2Once(backend, root, Color.black);

      expectPixelNear(pixelAt(readWebGl2Frame(backend, SIZE), SIZE, 16, 16), [255, 0, 0, 255], EXACT_TOLERANCE);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('a VideoFrame uploads, and the engine leaves it open for its owner to close', async ctx => {
    if (!hasVideoFrame(ctx)) return;

    const backend = await createWebGl2TestBackend(SIZE);
    const root = new Container();
    const frame = new VideoFrame(filledCanvas(), { timestamp: 0 });
    const sprite = new Sprite(new Texture(frame));

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      renderWebGl2Once(backend, root, Color.black);

      expectPixelNear(pixelAt(readWebGl2Frame(backend, SIZE), SIZE, 16, 16), [0, 255, 0, 255]);

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
