/**
 * WebGPU single-submit browser tests.
 *
 * Guards the pass-lifecycle contract behind the "submit the frame once instead
 * of once per batch flush" performance fix (see
 * `.workspace/specs/04-webgpu-overhead-investigation.md`). The WebGPU backend
 * used to open a fresh command encoder + render pass and call
 * `device.queue.submit()` on EVERY batch flush — i.e. once per draw call. In the
 * `batch-breaking` archetype (many interleaved textures overflowing the 8-slot
 * batcher) that is one GPU submit per ~8 sprites, and Dawn/D3D12's per-submit
 * cost degrades super-linearly, so the frame time explodes.
 *
 * These tests spy on `device.queue.submit` for a single rendered frame:
 *   1. A single-target sprite scene that forces MANY batch flushes must still
 *      submit the frame exactly ONCE.
 *   2. A render-target switch and a stencil clip must STILL end the pass where
 *      they must — merging those away would silently corrupt rendering — so
 *      those scenes submit more than once AND keep correct pixels.
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
import { RenderTexture } from '#rendering/texture/RenderTexture';
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

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

const createSolidTexture = (color: string, size = 8): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const ctx = source.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(source);
};

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

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

/** Render `body` inside a validation error scope; returns false on a device-loss skip. */
const renderGuarded = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, body: () => void): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    body();
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

/**
 * Count `device.queue.submit` calls for exactly one invocation of `body`.
 * Restores the real method afterwards.
 */
const countSubmits = (backend: WebGpuBackend, body: () => void): number => {
  const queue = getBackendDevice(backend).queue;
  const real = queue.submit.bind(queue);
  let count = 0;

  queue.submit = ((buffers: Iterable<GPUCommandBuffer>): undefined => {
    count++;

    return real(buffers);
  }) as GPUQueue['submit'];

  try {
    body();
  } finally {
    queue.submit = real;
  }

  return count;
};

// A grid of overlapping sprites that cycle through `textureCount` distinct
// textures so consecutive sprites never share a texture. The batcher holds 8
// texture slots, so a new distinct texture past the 8th forces a batch flush —
// this reproduces the `batch-breaking` archetype in miniature.
const buildInterleavedScene = (textures: readonly Texture[], spriteCount: number): { root: Container; sprites: Sprite[] } => {
  const root = new Container();
  const sprites: Sprite[] = [];

  for (let i = 0; i < spriteCount; i++) {
    const sprite = new Sprite(textures[i % textures.length]!);

    sprite.setPosition((i * 3) % canvasSize, ((i * 5) % canvasSize) | 0);
    sprite.width = 8;
    sprite.height = 8;
    root.addChild(sprite);
    sprites.push(sprite);
  }

  return { root, sprites };
};

const renderRoot = (backend: WebGpuBackend, root: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  root.render(backend);
  backend.flush();
};

describe('WebGPU single-submit frame', () => {
  test('a multi-batch single-target sprite scene submits the frame exactly once', async ctx => {
    const backend = await setupBackend();
    const palette = [
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#ffff00',
      '#ff00ff',
      '#00ffff',
      '#ff8000',
      '#8000ff',
      '#00ff80',
      '#80ff00',
      '#0080ff',
      '#ff0080',
      '#808080',
      '#c04040',
      '#40c040',
      '#4040c0',
    ];
    const textures = palette.map(color => createSolidTexture(color));
    const { root } = buildInterleavedScene(textures, 64);

    try {
      // Warm up: compile pipelines, upload textures + mipmaps, and let the
      // instance arena grow to hold the whole frame so steady state is reached.
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, () => renderRoot(backend, root)))) {
          return;
        }
      }

      // With 16 interleaved textures over 64 sprites the batcher breaks into
      // multiple draw calls (a flush every ~8 sprites).
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();
      const drawCalls = backend.stats.drawCalls;

      expect(drawCalls).toBeGreaterThan(1);

      // The measured frame: exactly one GPU submit regardless of draw-call count.
      const submits = countSubmits(backend, () => renderRoot(backend, root));

      expect(submits).toBe(1);
    } finally {
      root.destroy();
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    }
  });

  test('a render-target switch still ends the pass (more than one submit) and keeps pixels correct', async ctx => {
    const backend = await setupBackend();
    const context = new RenderingContext(backend);
    const offscreen = new RenderTexture(32, 32);
    const green = createSolidTexture('#00ff00', 8);
    const source = new Sprite(green);
    const rtRoot = new Container();
    const rtSprite = new Sprite(offscreen);

    source.setPosition(0, 0);
    source.width = 32;
    source.height = 32;
    rtSprite.setPosition(0, 0);
    rtSprite.width = 32;
    rtSprite.height = 32;
    rtRoot.addChild(rtSprite);

    const renderCrossTarget = (): void => {
      backend.resetStats();
      backend.clear(Color.black);
      context.renderTo(source, { target: offscreen, view: offscreen.view, clear: Color.transparentBlack });
      rtRoot.render(backend);
      backend.flush();
    };

    try {
      for (let frame = 0; frame < 2; frame++) {
        if (!(await renderGuarded(ctx, backend, renderCrossTarget))) {
          return;
        }
      }

      const submits = countSubmits(backend, renderCrossTarget);

      // The offscreen target and the root target are distinct color
      // attachments: the pass MUST end at the target switch, so a merged frame
      // that collapsed this to one submit would be a correctness bug.
      expect(submits).toBeGreaterThan(1);

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 16), [0, 255, 0, 255]);
    } finally {
      rtRoot.destroy();
      green.destroy();
      offscreen.destroy();
      backend.destroy();
    }
  });

  test('a stencil clip still ends the pass (more than one submit) and clips pixels correctly', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ff0000', 8);
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    sprite.setPosition(0, 0);
    sprite.width = 48;
    sprite.height = 48;
    // Right triangle covering the lower-left half: (0,0)->(48,0)->(0,48).
    clipped.clip = true;
    clipped.clipShape = new Geometry({
      attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
      vertexData: new Float32Array([0, 0, 48, 0, 0, 48]),
      stride: 8,
    });
    clipped.addChild(sprite);
    root.addChild(clipped);

    try {
      for (let frame = 0; frame < 2; frame++) {
        if (!(await renderGuarded(ctx, backend, () => renderRoot(backend, root)))) {
          return;
        }
      }

      const submits = countSubmits(backend, () => renderRoot(backend, root));

      // A geometric stencil clip is a real pass barrier (stencil-write passes +
      // the clipped content pass): it cannot collapse into a single submit.
      expect(submits).toBeGreaterThan(1);

      const readPixel = readCanvas(backend);

      // Inside the triangle (x + y << 48): red survives.
      expectPixelNear(readPixel(6, 6), [255, 0, 0, 255]);
      // Outside the triangle (x + y >> 48): clipped to the black clear.
      expectPixelNear(readPixel(44, 44), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
