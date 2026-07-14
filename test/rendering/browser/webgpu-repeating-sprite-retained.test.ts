/**
 * WebGPU renderer-matrix browser tests — RepeatingSprite retained instruction-
 * set replay (Track B Slice 3 follow-up: extending the flush-level batch
 * cache to RepeatingSprite).
 *
 * Only the GEOMETRY path (TextureRegion source) is recordable — its 32-byte
 * instance layout matches the sprite batch shape exactly (node index at word
 * 7 of the 8-word instance), so it shares the sprite renderer's group-owned
 * bundle and replay seam. Cells:
 *
 * 1. tier equality (collect / entry-replay-record / instruction-replay all
 *    produce the same pixels),
 * 2. the load-bearing correctness gate this follow-up exists for: a scroll-
 *    offset mutation AFTER a batch was recorded must never replay STALE
 *    tiling — `RepeatingSprite.setOffset` marks geometry dirty and calls
 *    `invalidateCache()`, which bumps the node's content revision and
 *    propagates it through the `RetainedContainer` boundary, forcing a
 *    recapture before the next replay,
 * 3. a SHADER-path (bare Texture) RepeatingSprite inside a capture window
 *    poisons it (`_supportsRetainedBatches` only covers the geometry path) —
 *    the group must never reach the replay tier, staying pixel-correct on
 *    the live entry-replay tier across mutations instead.
 *
 * CI guarantees a real WebGPU adapter; tests only skip when the software
 * adapter drops the device mid-test (same convention as the other WebGPU
 * browser specs).
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
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

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

/** A 16x8 source: left half red (x 0..8), right half green (x 8..16). */
const createStripedTexture = (): Texture => {
  const source = document.createElement('canvas');

  source.width = 16;
  source.height = 8;

  const context = source.getContext('2d')!;

  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, 8, 8);
  context.fillStyle = '#00ff00';
  context.fillRect(8, 0, 8, 8);

  return new Texture(source);
};

const createSolidTexture = (color: string, size = 8): Texture => {
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

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a frame through the real plan path inside a validation error scope.
// Returns false when the device dropped mid-test (the caller should bail).
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

describe('WebGPU renderer matrix: RepeatingSprite retained instruction-set replay', () => {
  test('cell 1 — geometry-path retained replay reproduces the entry-replay/record tier pixels', async ctx => {
    const backend = await setupBackend();
    const blue = createSolidTexture('#0000ff', 16); // 16x16 so (52,8) safely samples inside its 48..64 x 0..16 bounds
    const striped = createStripedTexture();
    const region = new TextureRegion(striped, { x: 0, y: 0, width: 16, height: 8 });
    const root = new Container();
    const outside = new Sprite(blue);
    const group = new RetainedContainer();
    const repeating = new RepeatingSprite(region, { width: 16, height: 8, modeX: 'repeat', fitX: 'clip', modeY: 'stretch' });

    outside.setPosition(48, 0);
    root.addChild(outside);
    group.addChild(repeating);
    group.setPosition(8, 24);
    root.addChild(group);

    try {
      if (!(await renderScene(ctx, backend, root))) return; // F1 dirty collect + capture
      if (!(await renderScene(ctx, backend, root))) return; // F2 entry replay + record

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(12, 28), [255, 0, 0, 255]); // red half
      expectPixelNear(readPixel(20, 28), [0, 255, 0, 255]); // green half

      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      if (!(await renderScene(ctx, backend, root))) return; // F3 instruction splice

      expect(replaySpy).toHaveBeenCalled();
      readPixel = readCanvas(backend);
      expectPixelNear(readPixel(12, 28), [255, 0, 0, 255]);
      expectPixelNear(readPixel(20, 28), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      blue.destroy();
      striped.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — a scroll-offset mutation after capture is never served STALE tiling by the replay tier', async ctx => {
    const backend = await setupBackend();
    const blue = createSolidTexture('#0000ff', 16); // 16x16 so (52,8) safely samples inside its 48..64 x 0..16 bounds
    const striped = createStripedTexture();
    const region = new TextureRegion(striped, { x: 0, y: 0, width: 16, height: 8 });
    const root = new Container();
    const outside = new Sprite(blue);
    const group = new RetainedContainer();
    const repeating = new RepeatingSprite(region, { width: 16, height: 8, modeX: 'repeat', fitX: 'clip', modeY: 'stretch' });

    outside.setPosition(48, 0);
    root.addChild(outside);
    group.addChild(repeating);
    group.setPosition(8, 24);
    root.addChild(group);

    try {
      if (!(await renderScene(ctx, backend, root))) return; // F1 capture
      if (!(await renderScene(ctx, backend, root))) return; // F2 record
      if (!(await renderScene(ctx, backend, root))) return; // F3 splice — fast tier

      let replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      if (!(await renderScene(ctx, backend, root))) return; // steady replay before mutation

      expect(replaySpy).toHaveBeenCalled();
      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(12, 28), [255, 0, 0, 255]); // red half (dest 0..8)
      expectPixelNear(readPixel(20, 28), [0, 255, 0, 255]); // green half (dest 8..16)

      // Scroll by half the source width: 'repeat' wraps modulo srcLen, so the
      // sampled window shifts half a period and the two halves SWAP.
      // `setOffset` marks geometry dirty and calls `invalidateCache()`, which
      // bumps the node's content revision and propagates it through the
      // RetainedContainer boundary — the fragment must recapture rather than
      // replay the OLD (pre-swap) cached bytes.
      repeating.setOffset(8, 0);

      if (!(await renderScene(ctx, backend, root))) return; // dirty collect (content revision changed)
      if (!(await renderScene(ctx, backend, root))) return; // recapture with the new bytes
      if (!(await renderScene(ctx, backend, root))) return; // splice of the fresh recording

      replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      if (!(await renderScene(ctx, backend, root))) return; // steady replay AFTER the mutation

      expect(replaySpy).toHaveBeenCalled(); // still on the fast tier — recaptured, not abandoned
      readPixel = readCanvas(backend);
      // If the replay served the STALE pre-offset bytes, these two assertions
      // would read the OLD (unswapped) colors instead.
      expectPixelNear(readPixel(12, 28), [0, 255, 0, 255]); // now green (was red)
      expectPixelNear(readPixel(20, 28), [255, 0, 0, 255]); // now red (was green)
      expectPixelNear(readPixel(52, 8), [0, 0, 255, 255]); // live sibling unaffected
    } finally {
      root.destroy();
      blue.destroy();
      striped.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — a shader-path RepeatingSprite inside a capture window poisons it: never reaches the replay tier, stays pixel-correct on live entry-replay across mutations', async ctx => {
    const backend = await setupBackend();
    const blue = createSolidTexture('#0000ff', 16); // 16x16 so (52,8) safely samples inside its 48..64 x 0..16 bounds
    const striped = createStripedTexture(); // bare Texture source -> shader path
    const root = new Container();
    const outside = new Sprite(blue);
    const group = new RetainedContainer();
    const repeating = new RepeatingSprite(striped, { width: 16, height: 8, modeX: 'repeat', fitX: 'clip', modeY: 'stretch' });

    outside.setPosition(48, 0);
    root.addChild(outside);
    group.addChild(repeating);
    group.setPosition(8, 24);
    root.addChild(group);

    const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

    try {
      // Several frames, including a scroll mutation — the shader path never
      // records/replays a batch (S3-D5.1: _supportsRetainedBatches only
      // covers the geometry path here), so the group must stay correct via
      // the (poisoned, permanently-entry-replay) live path the whole time.
      for (let i = 0; i < 4; i++) {
        if (!(await renderScene(ctx, backend, root))) return;
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(12, 28), [255, 0, 0, 255]);
      expectPixelNear(readPixel(20, 28), [0, 255, 0, 255]);

      repeating.setOffset(8, 0);

      for (let i = 0; i < 4; i++) {
        if (!(await renderScene(ctx, backend, root))) return;
      }

      readPixel = readCanvas(backend);
      expectPixelNear(readPixel(12, 28), [0, 255, 0, 255]);
      expectPixelNear(readPixel(20, 28), [255, 0, 0, 255]);
      expectPixelNear(readPixel(52, 8), [0, 0, 255, 255]);

      expect(replaySpy).not.toHaveBeenCalled();
    } finally {
      root.destroy();
      blue.destroy();
      striped.destroy();
      backend.destroy();
    }
  });
});
