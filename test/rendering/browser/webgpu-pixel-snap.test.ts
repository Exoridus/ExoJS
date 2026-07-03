/**
 * WebGPU render-only pixel-snapping browser tests — opt-in, capability-aware.
 *
 * Mirrors `webgl2-pixel-snap.test.ts` case-for-case on the WebGPU backend.
 * The exact snapping math is proven by `test/rendering/pixel-snap.test.ts`;
 * these end-to-end tests verify that snapping flows through the real WebGPU
 * pipeline without breaking rendering, keeps logical state untouched, produces
 * seam-free geometry, stays deterministic, and downgrades gracefully under
 * rotation.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe), so these tests do not skip on a missing adapter —
 * `renderScene` only skips when the software adapter drops the device
 * mid-test (a DOMException device-loss caught during rendering).
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

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

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = width;
  src.height = height;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  return new Texture(src);
};

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

// Read the presented WebGPU canvas back through a 2D canvas.
const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d')!;

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 12): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

// On the software (swiftshader) adapter the WebGPU device can be dropped
// mid-test. Treat that as an unavailable-adapter skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a scene inside a validation error scope.
// Returns false when the device dropped mid-test (caller should bail).
const renderScene = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  return true;
};

// ---------------------------------------------------------------------------
// Sprite — position snapping is render-only
// ---------------------------------------------------------------------------

describe('WebGPU pixel snapping — Sprite position mode', () => {
  test('renders correctly at a fractional position and leaves logical state untouched', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(12.37, 14.83);
      sprite.pixelSnapMode = 'position';
      root.addChild(sprite);

      const worldBefore = sprite.getGlobalTransform().clone();

      if (!(await renderScene(ctx, backend, root))) {
        worldBefore.destroy();

        return;
      }

      const readPixel = readCanvas(backend);

      // Renders through the snap pipeline (interior covered, exterior clear).
      expectPixelNear(readPixel(20, 22), [255, 0, 0, 255]);
      expectPixelNear(readPixel(2, 2), [0, 0, 0, 255]);

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

  test('unsnapped baseline renders the same interior color', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(12.37, 14.83);
      sprite.pixelSnapMode = 'none';
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(20, 22), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('snapped rendering is deterministic across frames', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#00ff00', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(9.6, 5.2);
      sprite.pixelSnapMode = 'geometry';
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const source = backend.context.canvas as HTMLCanvasElement;
      const rb1 = document.createElement('canvas');

      rb1.width = canvasSize;
      rb1.height = canvasSize;
      rb1.getContext('2d')!.drawImage(source, 0, 0);

      const first = rb1.getContext('2d')!.getImageData(0, 0, canvasSize, canvasSize).data;

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const rb2 = document.createElement('canvas');

      rb2.width = canvasSize;
      rb2.height = canvasSize;
      rb2.getContext('2d')!.drawImage(source, 0, 0);

      const second = rb2.getContext('2d')!.getImageData(0, 0, canvasSize, canvasSize).data;

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

describe('WebGPU pixel snapping — NineSlice geometry mode', () => {
  test('produces no interior seams at a fractional placement', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ff0000', 32, 32);
    const root = new Container();
    const panel = new NineSliceSprite(texture, { slices: 8, width: 41, height: 41 });

    try {
      panel.setPosition(6.3, 6.3);
      panel.pixelSnapMode = 'geometry';
      root.addChild(panel);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Scan a horizontal line well inside the panel: every pixel must be the
      // solid panel colour — a snapping-induced seam would show as black.
      for (let x = 10; x <= 44; x++) {
        const pixel = readPixel(x, 26);

        expect(pixel[0]).toBeGreaterThan(200); // red present → no gap
      }
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('geometry mode under rotation downgrades without error and keeps logical transform', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#0000ff', 32, 32);
    const root = new Container();
    const panel = new NineSliceSprite(texture, { slices: 8, width: 30, height: 30 });

    try {
      panel.setPosition(32, 32);
      panel.setRotation(25);
      panel.pixelSnapMode = 'geometry';
      root.addChild(panel);

      const worldBefore = panel.getGlobalTransform().clone();

      if (!(await renderScene(ctx, backend, root))) {
        worldBefore.destroy();

        return;
      }

      const readPixel = readCanvas(backend);

      // Logical transform untouched by the (downgraded) snap.
      expect(panel.getGlobalTransform().equals(worldBefore)).toBe(true);
      // Still drew something blue near the centre.
      expect(readPixel(32, 32)[2]).toBeGreaterThan(128);

      worldBefore.destroy();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
