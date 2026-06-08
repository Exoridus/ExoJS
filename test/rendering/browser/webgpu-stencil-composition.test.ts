/**
 * WebGPU stencil composition matrix — opt-in, capability-aware.
 *
 * Exercises geometric stencil clipping (phase 12E) composed with the other
 * render-pass-consolidation features (phase 12B–12D): rendering a clipped scene
 * into an off-screen RenderTexture and sampling it back, clipping a
 * cacheAsBitmap node, and reusing a pooled RenderTexture for a clip then for
 * plain rendering (no stale stencil attachment).
 *
 * Pixels are read back via drawImage onto a 2D canvas, and every render runs
 * inside pushErrorScope('validation') to catch any GPU validation error.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { RenderingContext } from '#rendering/RenderingContext';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDeviceOrSkip } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const createSolidTexture = (color: string, size = 64): Texture => {
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

// Quad covering [x, x+width) × [y, y+height) in local space.
const createQuadGeometry = (x: number, y: number, width: number, height: number): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([x, y, x + width, y, x + width, y + height, x, y, x + width, y + height, x, y + height]),
    stride: 8,
  });

const setupBackend = async (ctx: { skip: (reason: string) => void }): Promise<WebGpuBackend> => {
  if (!navigator.gpu) {
    ctx.skip('WebGPU unavailable: navigator.gpu is absent');
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    ctx.skip('WebGPU unavailable: requestAdapter() returned null');
  }

  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d');

  if (!ctx) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 12): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

// On the software (swiftshader) adapter used in CI the WebGPU device can be
// dropped mid-test ("Instance dropped in popErrorScope"). Treat that as an
// unavailable-adapter skip rather than a failure, matching setupBackend().
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const withValidation = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, run: () => void): Promise<void> => {
  const device = getBackendDeviceOrSkip(ctx, backend);

  if (!device) {
    return;
  }

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    run();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return;
    }

    throw error;
  }

  expect(validationError).toBeNull();
};

describe('WebGPU stencil composition', () => {
  test('clip into a RenderTexture, then sample it back as a Sprite', async ctx => {
    const backend = await setupBackend(ctx);
    const context = new RenderingContext(backend);
    const texture = createSolidTexture('#ff0000');
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 64;
      sprite.height = 64;
      // Clip the off-screen content to the left half.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 32, 64);
      clipped.addChild(sprite);

      const readPixel = await renderClipIntoTextureAndSample(ctx, backend, context, clipped);

      // Left half survived the clip and was sampled back to the canvas.
      expectPixelNear(readPixel(12, 32), [255, 0, 0, 255]);
      // Right half was clipped away in the off-screen pass → stays black.
      expectPixelNear(readPixel(52, 32), [0, 0, 0, 255]);
    } finally {
      clipped.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a cacheAsBitmap node renders correctly inside a stencil clip', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const cached = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 64;
      sprite.height = 64;
      cached.addChild(sprite);
      cached.cacheAsBitmap = true;
      // Clip the cached node to the top half.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 64, 32);
      clipped.addChild(cached);
      root.addChild(clipped);

      await withValidation(ctx, backend, () => {
        backend.resetStats();
        backend.clear(Color.black);
        root.render(backend);
        backend.flush();
      });

      const readPixel = readCanvas(backend);

      // Top half: the cache sprite, clipped, survives.
      expectPixelNear(readPixel(32, 12), [255, 0, 0, 255]);
      // Bottom half: clipped away.
      expectPixelNear(readPixel(32, 52), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a pooled RenderTexture reused after a clip carries no stale stencil', async ctx => {
    const backend = await setupBackend(ctx);
    const context = new RenderingContext(backend);
    const texture = createSolidTexture('#00ff00');

    try {
      // First pass: clip into an off-screen RenderTexture (allocates + uses a
      // stencil attachment for that target), then release it back to the pool.
      const clipped = new Container();
      const clipSprite = new Sprite(texture);

      clipSprite.width = 64;
      clipSprite.height = 64;
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 32, 64);
      clipped.addChild(clipSprite);

      await withValidation(ctx, backend, () => {
        const first = context.renderTo(clipped, { width: canvasSize, height: canvasSize, clearColor: Color.transparentBlack });

        backend.releaseRenderTexture(first);
      });

      clipped.destroy();
      (clipped.clipShape as Geometry).destroy();

      // Second pass: a plain (unclipped) full-screen sprite into the root. The
      // reused pooled target must not apply any leftover stencil test.
      const plain = new Sprite(texture);

      plain.setPosition(0, 0);
      plain.width = 64;
      plain.height = 64;

      await withValidation(ctx, backend, () => {
        backend.resetStats();
        backend.clear(Color.black);
        plain.render(backend);
        backend.flush();
      });

      const readPixel = readCanvas(backend);

      // Whole canvas is green — no stale stencil clipped any of it.
      expectPixelNear(readPixel(12, 12), [0, 255, 0, 255]);
      expectPixelNear(readPixel(52, 52), [0, 255, 0, 255]);

      plain.destroy();
    } finally {
      texture.destroy();
      backend.destroy();
    }
  });
});

// Render a clipped subtree into an off-screen RenderTexture, then draw that
// texture as a full-screen sprite into the canvas so it can be read back.
const renderClipIntoTextureAndSample = async (
  ctx: { skip: (reason: string) => void },
  backend: WebGpuBackend,
  context: RenderingContext,
  clipped: RenderNode,
): Promise<(x: number, y: number) => RgbaTuple> => {
  let readPixel!: (x: number, y: number) => RgbaTuple;

  await withValidation(ctx, backend, () => {
    const offscreen = context.renderTo(clipped, { width: canvasSize, height: canvasSize, clearColor: Color.transparentBlack });
    const display = new Sprite(offscreen);

    display.setPosition(0, 0);
    display.width = canvasSize;
    display.height = canvasSize;

    backend.clear(Color.black);
    display.render(backend);
    backend.flush();

    readPixel = readCanvas(backend);

    display.destroy();
    offscreen.destroy();
  });

  return readPixel;
};
