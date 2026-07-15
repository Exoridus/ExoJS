/**
 * WebGPU renderer-matrix browser tests — Text retained instruction-set
 * replay (Track B extension, Task 1).
 *
 * Text is the first retained renderer that opts OUT of the shared
 * `TransformBuffer` (`_consumesSharedTransform === false`): it packs its own
 * private per-node style+transform buffer, so the group-owned
 * `TextRetainedReplayState` (node data buffer, FrameUniforms buffer, own
 * quad-index buffer) is the entire replay mechanism — there is no shared-row
 * rebase to get wrong here, but there IS a real risk of stale/garbage node
 * data or a wrong bind group if the replay-time upload/patch logic is broken.
 * These tests reproduce the record frame's pixels exactly through a REAL
 * WebGPU device and pin the own-transform-move O(1) patch against real GPU
 * validation.
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
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { WebGpuTextRenderer } from '#rendering/webgpu/WebGpuTextRenderer';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 96;

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

const readCanvas = (backend: WebGpuBackend): ((x: number, y: number, w?: number, h?: number) => Uint8ClampedArray) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d');

  if (!ctx) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number, w = 1, h = 1): Uint8ClampedArray => ctx.getImageData(Math.floor(x), Math.floor(y), w, h).data;
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 12): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

/** Render a frame through the real plan path inside a validation error scope. */
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

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

/**
 * A single, large, bright-white block-ish glyph over a black background: at
 * this font size a wide uppercase letter fills enough of its cell that a
 * region sampled a few pixels in from its top-left corner is reliably ink,
 * not anti-aliased edge — avoiding brittle single-pixel glyph-shape guesses.
 */
const buildScene = (): { root: Container; group: RetainedContainer; text: Text; destroy: () => void } => {
  const root = new Container();
  const group = new RetainedContainer();
  const text = new Text('MW', { fillColor: Color.white, fontSize: 40 });

  text.setPosition(4, 4);
  group.addChild(text);
  group.setPosition(8, 8);
  root.addChild(group);

  const destroy = (): void => {
    root.destroy();
  };

  return { root, group, text, destroy };
};

const inkProbe = (readPixel: ReturnType<typeof readCanvas>): RgbaTuple => {
  const px = readPixel(20, 24);

  return [px[0]!, px[1]!, px[2]!, px[3]!];
};

describe('WebGPU renderer matrix: Text retained instruction replay cells', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('cell 1 — Text opts in and replay reproduces the record frame exactly (fast/slow equivalence)', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      expect(new WebGpuTextRenderer()._supportsRetainedBatches).toBe(true);

      if (!(await renderScene(ctx, backend, scene.root))) return; // F1: capture
      if (!(await renderScene(ctx, backend, scene.root))) return; // F2: record (slow path)

      expect(fragmentOf(scene.group).instructions?.hasRecording).toBe(true);

      const ink = inkProbe(readCanvas(backend));

      // Glyph ink must be visible somewhere in the probed region (not still
      // pure background) — otherwise the whole comparison below is vacuous.
      expect(ink).not.toEqual([0, 0, 0, 255]);

      const recordRegion = readCanvas(backend)(0, 0, canvasSize, canvasSize);

      if (!(await renderScene(ctx, backend, scene.root))) return; // F3: replay (fast path)

      const replayRegion = readCanvas(backend)(0, 0, canvasSize, canvasSize);

      expect(replayRegion).toEqual(recordRegion);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — camera pan on the cached path: replayed glyph pixels track the live view', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) return;
      }

      const before = inkProbe(readCanvas(backend));

      expect(before).not.toEqual([0, 0, 0, 255]);

      const recordedInstruction = fragmentOf(scene.group).instructions!.instructions[0];

      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);

      if (!(await renderScene(ctx, backend, scene.root))) return;

      // No recapture: the SAME recorded instruction object still replays —
      // only the live projection uniform changed.
      expect(fragmentOf(scene.group).instructions!.instructions[0]).toBe(recordedInstruction);
      expect(fragmentOf(scene.group).instructions!.hasRecording).toBe(true);

      const readPixel = readCanvas(backend);

      // Panning the camera 16px right moves scene content 16px left on screen.
      const panned: RgbaTuple = [readPixel(4, 24)[0]!, readPixel(4, 24)[1]!, readPixel(4, 24)[2]!, readPixel(4, 24)[3]!];

      expect(panned).not.toEqual([0, 0, 0, 255]);
      expectPixelNear(panned, before, 40);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — group move on the cached path relocates glyph pixels WITHOUT recapture', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) return;
      }

      const recordedInstruction = fragmentOf(scene.group).instructions!.instructions[0];

      scene.group.setPosition(28, 8);

      if (!(await renderScene(ctx, backend, scene.root))) return;

      expect(fragmentOf(scene.group).instructions!.instructions[0]).toBe(recordedInstruction);
      expect(fragmentOf(scene.group).instructions!.hasRecording).toBe(true);

      const readPixel = readCanvas(backend);
      const moved: RgbaTuple = [readPixel(40, 24)[0]!, readPixel(40, 24)[1]!, readPixel(40, 24)[2]!, readPixel(40, 24)[3]!];
      const oldSpot: RgbaTuple = [readPixel(20, 24)[0]!, readPixel(20, 24)[1]!, readPixel(20, 24)[2]!, readPixel(20, 24)[3]!];

      expect(moved).not.toEqual([0, 0, 0, 255]);
      expectPixelNear(oldSpot, [0, 0, 0, 255], 4);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — an own-transform move patches the node-data row in place (O(1)) — no re-record', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) return;
      }

      const recordedInstruction = fragmentOf(scene.group).instructions!.instructions[0];

      scene.text.setPosition(24, 4);

      if (!(await renderScene(ctx, backend, scene.root))) return;

      // The O(1) patch rewrites the persisted row in place — the SAME
      // recorded instruction object replays; a full re-record would have
      // produced a fresh instruction from a fresh `_recordRetainedBatch` call.
      expect(fragmentOf(scene.group).instructions!.instructions[0]).toBe(recordedInstruction);
      expect(fragmentOf(scene.group).instructions!.hasRecording).toBe(true);

      const readPixel = readCanvas(backend);
      const moved: RgbaTuple = [readPixel(40, 24)[0]!, readPixel(40, 24)[1]!, readPixel(40, 24)[2]!, readPixel(40, 24)[3]!];
      const oldSpot: RgbaTuple = [readPixel(20, 24)[0]!, readPixel(20, 24)[1]!, readPixel(20, 24)[2]!, readPixel(20, 24)[3]!];

      expect(moved).not.toEqual([0, 0, 0, 255]);
      expectPixelNear(oldSpot, [0, 0, 0, 255], 4);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — a content change forces a full re-record and replays the new content', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) return;
      }

      expect(fragmentOf(scene.group).instructions?.hasRecording).toBe(true);

      scene.text.text = 'X';

      if (!(await renderScene(ctx, backend, scene.root))) return; // content-dirty frame

      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) return;
      }

      expect(fragmentOf(scene.group).instructions?.hasRecording).toBe(true);

      const ink = inkProbe(readCanvas(backend));

      expect(ink).not.toEqual([0, 0, 0, 255]);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 6 — deliberate break: a neutered _replayRetainedBatch drops the retained draw and diverges', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();
    const original = WebGpuTextRenderer.prototype._replayRetainedBatch;

    try {
      for (let frame = 0; frame < 2; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) return;
      } // F1 capture, F2 record

      expect(fragmentOf(scene.group).instructions?.hasRecording).toBe(true);

      const recordDraws = backend.stats.drawCalls;
      const recordInk = inkProbe(readCanvas(backend));

      expect(recordInk).not.toEqual([0, 0, 0, 255]);

      // F3 (static, no scene change): the fast/instruction-replay tier is the
      // ONLY path that can reach this frame's draw — no move, no content
      // change, nothing to reconcile — so `backend.stats.drawCalls` only
      // increments if `_replayRetainedBatch` actually ran. A neutered version
      // that never acquires a pass or issues `drawIndexed` leaves it at 0.
      WebGpuTextRenderer.prototype._replayRetainedBatch = function (): void {};

      if (!(await renderScene(ctx, backend, scene.root))) return; // F3: broken replay

      expect(backend.stats.drawCalls).toBe(0);
      expect(backend.stats.drawCalls).not.toBe(recordDraws);
    } finally {
      WebGpuTextRenderer.prototype._replayRetainedBatch = original;
      scene.destroy();
      backend.destroy();
    }
  });
});
