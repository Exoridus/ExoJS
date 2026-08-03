/**
 * WebGL2 render-only pixel-snapping browser tests.
 *
 * The exact snapping math (device-pixel mapping, rounding, shared-boundary
 * snapping, downgrade) is proven by `test/rendering/pixel-snap.test.ts`. These
 * end-to-end tests verify that snapping flows through the real WebGL2 pipeline
 * without breaking rendering, keeps logical state untouched, produces seam-free
 * geometry, stays deterministic, and downgrades gracefully under rotation.
 *
 * Note on single-frame pixel assertions: a solid quad's rasterised coverage is
 * already quantised to the device grid (pixel-centre rule), so a static
 * solid-colour frame cannot distinguish snapped from unsnapped — the snapping
 * benefit is sampling stability under motion. We therefore assert render
 * correctness, the render-only contract, and seam-freeness rather than a
 * snapped-vs-unsnapped solid-pixel diff.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { PixelSnapMode } from '#rendering/pixelSnap';
import type { RenderNode } from '#rendering/RenderNode';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

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
          alpha: false,
          antialias: false,
          premultipliedAlpha: false,
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

const readAll = (backend: WebGl2Backend): Uint8Array => {
  const buf = new Uint8Array(canvasSize * canvasSize * 4);
  const gl = backend.context;

  gl.readPixels(0, 0, canvasSize, canvasSize, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return buf;
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
// Sprite — position snapping is render-only
// ---------------------------------------------------------------------------

describe('WebGL2 pixel snapping — Sprite position mode', () => {
  test('renders correctly at a fractional position and leaves logical state untouched', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(12.37, 14.83);
      sprite.pixelSnapMode = PixelSnapMode.Position;
      root.addChild(sprite);

      const worldBefore = sprite.getGlobalTransform().clone();

      render(backend, root);

      // Renders through the snap pipeline (interior covered, exterior clear).
      expectPixelNear(readWebGl2Pixel(backend, 20, 22), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 2, 2), [0, 0, 0, 255]);

      // Render-only: logical position and world transform are unchanged.
      expect(sprite.x).toBe(12.37);
      expect(sprite.y).toBe(14.83);
      expect(sprite.getGlobalTransform().equals(worldBefore)).toBe(true);

      worldBefore.destroy();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('unsnapped baseline renders the same interior color', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(12.37, 14.83);
      sprite.pixelSnapMode = PixelSnapMode.None;
      root.addChild(sprite);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 20, 22), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('snapped rendering is deterministic across frames', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#00ff00', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(9.6, 5.2);
      sprite.pixelSnapMode = PixelSnapMode.Geometry;
      root.addChild(sprite);

      render(backend, root);
      const first = readAll(backend);

      render(backend, root);
      const second = readAll(backend);

      expect(Array.from(second)).toEqual(Array.from(first));
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// NineSlice — geometry snapping is seam-free and downgrades under rotation
// ---------------------------------------------------------------------------

describe('WebGL2 pixel snapping — NineSlice geometry mode', () => {
  test('produces no interior seams at a fractional placement', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 32, 32);
    const root = new Container();
    const panel = new NineSliceSprite(texture, { slices: 8, width: 41, height: 41 });

    try {
      panel.setPosition(6.3, 6.3);
      panel.pixelSnapMode = PixelSnapMode.Geometry;
      root.addChild(panel);

      render(backend, root);

      // Scan a horizontal line well inside the panel: every pixel must be the
      // solid panel colour — a snapping-induced seam would show as black.
      for (let x = 10; x <= 44; x++) {
        const pixel = readWebGl2Pixel(backend, x, 26);

        expect(pixel[0]).toBeGreaterThan(200); // red present → no gap
      }
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('geometry mode under rotation downgrades without error and keeps logical transform', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#0000ff', 32, 32);
    const root = new Container();
    const panel = new NineSliceSprite(texture, { slices: 8, width: 30, height: 30 });

    try {
      panel.setPosition(32, 32);
      panel.setRotation(25);
      panel.pixelSnapMode = PixelSnapMode.Geometry;
      root.addChild(panel);

      const worldBefore = panel.getGlobalTransform().clone();

      expect(() => render(backend, root)).not.toThrow();

      // Logical transform untouched by the (downgraded) snap.
      expect(panel.getGlobalTransform().equals(worldBefore)).toBe(true);
      // Still drew something blue near the centre.
      expect(readWebGl2Pixel(backend, 32, 32)[2]).toBeGreaterThan(128);

      worldBefore.destroy();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
