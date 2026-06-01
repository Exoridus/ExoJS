/**
 * WebGPU sprite transform-storage browser tests — opt-in, capability-aware.
 *
 * The WebGPU {@link WebGpuSpriteRenderer} fetches each instance's world
 * transform from the shared transform storage buffer keyed by `nodeIndex`
 * (mirroring the WebGL2 sprite renderer + the mesh renderer) instead of packing
 * the affine rows inline. These tests assert the fetched transform reaches the
 * GPU: a translated sprite lands at its position, a scaled sprite stretches to
 * its scaled bounds, and several sprites with distinct transforms sharing one
 * texture batch into a single instanced draw yet each resolve their own row.
 *
 * Correctness is checked two ways:
 *  - GPU validation: each scenario runs inside a pushErrorScope('validation') so
 *    a mismatched bind-group layout / storage binding fails loudly.
 *  - Pixels: the presented WebGPU canvas is read back via drawImage onto a 2D
 *    canvas (a standard cross-context read) and sampled.
 *
 * All tests skip gracefully when WebGPU is unavailable.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { Container } from '@/rendering/Container';
import type { RenderNode } from '@/rendering/RenderNode';
import { Sprite } from '@/rendering/sprite/Sprite';
import { Texture } from '@/rendering/texture/Texture';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';

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

const createSolidTexture = (color: string, size: number): Texture => {
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

  return backend;
};

// Read the presented WebGPU canvas back through a 2D canvas. drawImage accepts a
// WebGPU-configured canvas as an image source, giving CPU-side pixel access
// without touching the backend's managed GPU textures.
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

// Render a scene through the real plan path inside a validation error scope.
// Returns false when the device dropped mid-test (the caller should bail).
const renderScene = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDeviceOrSkip(ctx, backend);

  if (!device) {
    return false;
  }

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

describe('WebGPU sprite transform storage', () => {
  test('a translated sprite lands at its buffer-resolved position', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000', 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      // 16×16 sprite at (16, 16) covers [16, 32]. Its position only reaches the
      // GPU through the shared transform buffer (no inline transform rows).
      sprite.setPosition(16, 16);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(24, 24), [255, 0, 0, 255]);
      // Outside the translated quad on both sides stays the black clear.
      expectPixelNear(readPixel(8, 8), [0, 0, 0, 255]);
      expectPixelNear(readPixel(40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a scaled sprite stretches to its scaled bounds via the buffer transform', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000', 8);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      // 8×8 texture scaled 2× from a top-left origin at (10, 10) covers [10, 26].
      // A pixel at (24, 24) is red only if the non-identity scale reaches the GPU
      // through the transform buffer (unscaled it would be bounded at [10, 18]).
      sprite.setPosition(10, 10);
      sprite.setScale(2, 2);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(12, 12), [255, 0, 0, 255]);
      expectPixelNear(readPixel(24, 24), [255, 0, 0, 255]);
      expectPixelNear(readPixel(30, 30), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('multiple sprites with distinct transforms batch into one draw, each at its own position', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000', 8);
    const root = new Container();
    const a = new Sprite(texture);
    const b = new Sprite(texture);
    const c = new Sprite(texture);

    try {
      // Same texture ⇒ one instanced batch; each sprite carries its own
      // nodeIndex into the shared transform storage buffer.
      a.setPosition(8, 8);
      b.setPosition(28, 28);
      c.setPosition(48, 48);
      root.addChild(a, b, c);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      expect(backend.stats.drawCalls).toBe(1);

      const readPixel = readCanvas(backend);

      // Each instance resolves its own transform row, so all three land at their
      // distinct positions instead of collapsing onto a single row.
      expectPixelNear(readPixel(10, 10), [255, 0, 0, 255]);
      expectPixelNear(readPixel(30, 30), [255, 0, 0, 255]);
      expectPixelNear(readPixel(50, 50), [255, 0, 0, 255]);
      // The gaps between them stay clear.
      expectPixelNear(readPixel(20, 20), [0, 0, 0, 255]);
      expectPixelNear(readPixel(40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
