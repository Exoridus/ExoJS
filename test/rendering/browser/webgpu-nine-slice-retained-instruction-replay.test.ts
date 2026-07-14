/**
 * WebGPU renderer-matrix browser tests — NineSlice retained instruction-set
 * replay (Track B Slice 3).
 *
 * The nine-slice counterpart of `webgpu-retained-instruction-replay.test.ts`.
 * A nine-slice node expands to MANY quad-instances that all share one
 * transform-storage row, so the group-local node-index rebase (S3-D4) and the
 * per-batch byte offset are load-bearing: a live sprite OUTSIDE (and before)
 * the retained group keeps the group's shared rows starting at a non-zero
 * frame-global index, and the group holds two DISTINCT-texture nine-slices
 * (nine-slice binds one base texture per flush → two recorded batches). The
 * replay tier must reproduce the record frame's pixels exactly; a broken
 * rebase (or wrong byte offset) fetches the wrong / out-of-range storage row
 * and the probes diverge.
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

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const createSolidTexture = (color: string, size = 16): Texture => {
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

const hexToRgba = (hex: string): RgbaTuple => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

/**
 * Standard cell scene, mirroring the WebGL2 nine-slice retained cells: a live
 * blue sprite OUTSIDE (and before) the group at (48,0)-(64,16) keeps the
 * group-local rebase load-bearing; the group at (8,24) holds a red nine-slice
 * at group-local (0,0) -> world (8,24)-(24,40) and a green nine-slice at
 * group-local (16,16) -> world (24,40)-(40,56). Each nine-slice fills a 16x16
 * solid rect (slices/border 4 over a 16x16 source), 9 quad-instances sharing
 * one storage row, and binds its own texture -> two recorded batches.
 */
const buildScene = () => {
  const blue = createSolidTexture('#0000ff');
  const red = createSolidTexture('#ff0000');
  const green = createSolidTexture('#00ff00');
  const root = new Container();
  const outside = new Sprite(blue);
  const group = new RetainedContainer();
  const redNine = new NineSliceSprite(red, { slices: 4, border: 4, width: 16, height: 16 });
  const greenNine = new NineSliceSprite(green, { slices: 4, border: 4, width: 16, height: 16 });

  outside.setPosition(48, 0);
  root.addChild(outside);

  greenNine.setPosition(16, 16);
  group.addChild(redNine);
  group.addChild(greenNine);
  group.setPosition(8, 24);
  root.addChild(group);

  const destroy = (): void => {
    root.destroy();
    blue.destroy();
    red.destroy();
    green.destroy();
  };

  return { root, group, redNine, greenNine, destroy };
};

describe('WebGPU renderer matrix: NineSlice retained instruction replay cells', () => {
  test('cell 1 — nine-slice replay is pixel-identical to the record frame (fast/slow equivalence)', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      // F1: dirty collect + capture.
      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      // F2: clean entry replay + record — this IS the slow path's output.
      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      expect(fragmentOf(scene.group).instructions?.hasRecording).toBe(true);

      const probes: ReadonlyArray<readonly [number, number, string]> = [
        [56, 8, '#0000ff'], // live outside sprite
        [16, 32, '#ff0000'], // red nine-slice (batch 1)
        [32, 48, '#00ff00'], // green nine-slice (batch 2)
      ];
      let readPixel = readCanvas(backend);
      const slowPixels = probes.map(([x, y]) => readPixel(x, y));

      for (let i = 0; i < probes.length; i++) {
        expectPixelNear(slowPixels[i]!, hexToRgba(probes[i]![2]));
      }

      // F3: instruction replay — must be identical to the record frame.
      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      readPixel = readCanvas(backend);

      for (let i = 0; i < probes.length; i++) {
        expectPixelNear(readPixel(probes[i]![0], probes[i]![1]), slowPixels[i]!, 0);
      }

      // Background stays clear on the replay tier (no stray out-of-range row).
      expectPixelNear(readPixel(4, 60), [0, 0, 0, 255]);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — camera pan on the cached path: replayed nine-slice pixels track the live view', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      // Reach the fast tier (F1 capture, F2 record, F3 replay).
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) {
          return;
        }
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 32), [255, 0, 0, 255]);

      // Pan the camera 16px right: replayed content must appear 16px further
      // left — projection is resolved live at replay (S3-D1).
      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(40, 8), [0, 0, 255, 255]); // outside sprite 32..48
      expectPixelNear(readPixel(4, 32), [255, 0, 0, 255]); // red now 0..8 visible
      expectPixelNear(readPixel(12, 48), [0, 255, 0, 255]); // green now 8..24
      expectPixelNear(readPixel(16, 32), [0, 0, 0, 255]); // old red spot is background
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — group move on the cached path relocates nine-slice pixels WITHOUT recapture', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) {
          return;
        }
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 32), [255, 0, 0, 255]);

      // The recorded batch instruction must survive the move untouched: a
      // group move only changes the live-composed group matrix (S3-D6).
      const recordedBatch = fragmentOf(scene.group).instructions!.instructions[0];

      scene.group.setPosition(32, 32);

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      expect(fragmentOf(scene.group).instructions!.instructions[0]).toBe(recordedBatch);
      expect(fragmentOf(scene.group).instructions!.hasRecording).toBe(true);

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(40, 40), [255, 0, 0, 255]); // red 32..48 x 32..48
      expectPixelNear(readPixel(56, 56), [0, 255, 0, 255]); // green 48..64 x 48..64
      expectPixelNear(readPixel(16, 32), [0, 0, 0, 255]); // old red spot is background
      expectPixelNear(readPixel(56, 8), [0, 0, 255, 255]); // live sprite unaffected
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });
});
