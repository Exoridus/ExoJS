/**
 * WebGPU RepeatingSprite browser tests — opt-in, capability-aware.
 *
 * Validates both rendering paths:
 *  - Shader path: bare {@link Texture} source, UV tiling in WGSL, GPUSampler
 *    handles wrapping.
 *  - Geometry path: {@link TextureRegion} source, Cartesian-product quads
 *    built on the CPU with clamped UVs.
 *
 * All WebGPU renderers use inline WGSL — no shader file mocks are needed.
 * Tests skip gracefully when WebGPU is unavailable (software adapter or
 * headless CI without --enable-unsafe-webgpu).
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDeviceOrSkip } from './webgpu-test-helpers';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

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

const setupBackend = async (ctx: { skip: (reason: string) => void }): Promise<WebGpuBackend | null> => {
  if (!navigator.gpu) {
    ctx.skip('WebGPU unavailable: navigator.gpu is absent');

    return null;
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    ctx.skip('WebGPU unavailable: requestAdapter() returned null');

    return null;
  }

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

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 16): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

const createSolidTexture = (color: string, size = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
};

const isDeviceLoss = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const renderScene = async (
  ctx: { skip: (reason: string) => void },
  backend: WebGpuBackend,
  root: RenderNode,
): Promise<boolean> => {
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

// ---------------------------------------------------------------------------
// Shader path tests (bare Texture source)
// ---------------------------------------------------------------------------

describe('WebGPU RepeatingSprite — shader path', () => {
  test('solid-color texture fills destination', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('stretch mode fills destination', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#00ff00', 8);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, {
      width: 48, height: 48,
      modeX: 'stretch', modeY: 'stretch',
    });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(24, 24), [0, 255, 0, 255]);
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('mirror-repeat mode does not crash', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#0000ff', 16);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, {
      width: 40, height: 40,
      modeX: 'mirror-repeat', modeY: 'mirror-repeat',
    });

    try {
      sprite.setPosition(4, 4);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);
      const pixel = readPixel(20, 20);

      expect(pixel[2]).toBeGreaterThan(128);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('tint is applied', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#ffffff');
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(255, 0, 0);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);
      const pixel = readPixel(16, 16);

      expect(pixel[0]).toBeGreaterThan(128);
      expect(pixel[1]).toBeLessThan(32);
      expect(pixel[2]).toBeLessThan(32);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('zero-size does not crash', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 0, height: 0 });

    try {
      sprite.setPosition(16, 16);
      root.addChild(sprite);

      const ok = await renderScene(ctx, backend, root);

      if (ok) {
        const readPixel = readCanvas(backend);

        expectPixelNear(readPixel(16, 16), [0, 0, 0, 255]);
      }
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('node transform (position) is applied', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#ff0000', 16);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 16, height: 16 });

    try {
      sprite.setPosition(40, 40);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(44, 44), [255, 0, 0, 255]);
      expectPixelNear(readPixel(10, 10), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Geometry path tests (TextureRegion source)
// ---------------------------------------------------------------------------

describe('WebGPU RepeatingSprite — geometry path', () => {
  test('solid-color atlas region fills destination', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#0000ff', 32);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 16), [0, 0, 255, 255]);
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('tint is applied on geometry path', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#ffffff');
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(0, 255, 0);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);
      const pixel = readPixel(20, 20);

      expect(pixel[0]).toBeLessThan(32);
      expect(pixel[1]).toBeGreaterThan(128);
      expect(pixel[2]).toBeLessThan(32);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('zero-size geometry path does not crash', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#ff0000');
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, { width: 0, height: 0 });

    try {
      sprite.setPosition(16, 16);
      root.addChild(sprite);

      const ok = await renderScene(ctx, backend, root);

      if (ok) {
        const readPixel = readCanvas(backend);

        expectPixelNear(readPixel(16, 16), [0, 0, 0, 255]);
      }
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('mirror-repeat geometry path does not crash', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#ff0000', 16);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, {
      width: 48, height: 48,
      modeX: 'mirror-repeat', modeY: 'mirror-repeat',
      fitX: 'round', fitY: 'round',
    });

    try {
      sprite.setPosition(4, 4);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);
      const pixel = readPixel(24, 24);

      expect(pixel[0]).toBeGreaterThan(128);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
