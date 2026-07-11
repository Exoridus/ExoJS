/**
 * WebGPU renderer-matrix browser tests — retained instruction-set replay
 * (Track B Slice 3, Tasks 9/10 pixel gate).
 *
 * Drives the real backend through the retained fallback ladder — F1 dirty
 * collect, F2 clean entry replay + record, F3+ instruction replay — and
 * asserts the REPLAY tier reproduces the slow path's pixels exactly:
 *
 * 1. multi-batch replay (9 textures → 2 recorded batches) is pixel-identical
 *    to the record frame,
 * 2. B-06: a cached frame with 3 retained groups submits exactly ONCE while
 *    every group still draws (before the fix each group boundary ended the
 *    pass, fragmenting the single-submit frame into >= N submits),
 * 3. camera pan over the cached path: projection is a live read,
 * 4. group move on the cached path relocates pixels WITHOUT a recapture (the
 *    recorded batch instructions stay identical),
 * 5. tint change inside the group is never served stale (recapture path),
 * 6. a texture resize fails the backend's view-identity validation and falls
 *    back cleanly — fresh content, correct UVs, no stale frame — then the
 *    fast tier resumes.
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

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
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

/** Count `device.queue.submit` calls for exactly one invocation of `body`. */
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

const hexToRgba = (hex: string): RgbaTuple => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

// Distinct colours built from four channel levels (black skipped): enough of
// them to overflow the batcher's MAXIMUM texture-slot tier (32, see
// resolveSpriteBatchTextureSlots) so one retained group records TWO batches
// (multi-batch replay coverage) whatever slot count the device was granted.
const channelLevels = ['00', '55', 'aa', 'ff'] as const;
const paletteColor = (index: number): string => {
  const combo = index + 1; // +1 skips black (the clear colour)

  return `#${channelLevels[combo % 4]!}${channelLevels[Math.floor(combo / 4) % 4]!}${channelLevels[Math.floor(combo / 16) % 4]!}`;
};
const palette36 = Array.from({ length: 36 }, (_, i) => paletteColor(i));

describe('WebGPU renderer matrix: retained instruction replay cells', () => {
  test('cell 1 — multi-batch replay is pixel-identical to the record frame (fast/slow equivalence)', async ctx => {
    const backend = await setupBackend();
    const textures = palette36.map(color => createSolidTexture(color, 8));
    const root = new Container();
    const group = new RetainedContainer();

    try {
      // A 6x6 grid of 8px sprites over 36 distinct textures: more than the
      // granted texture-slot tier, so the first `slots` sprites land in the
      // first recorded batch and the rest in the second.
      for (let i = 0; i < textures.length; i++) {
        const sprite = new Sprite(textures[i]!);

        sprite.setPosition((i % 6) * 8, Math.floor(i / 6) * 8);
        group.addChild(sprite);
      }

      root.addChild(group);

      // F1: dirty collect + capture.
      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      // F2: clean entry replay + record — this IS the slow path's output.
      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);

      // Cell i centre = ((i % 6) * 8 + 4, floor(i / 6) * 8 + 4). Cells 0-15
      // sit in the first recorded batch on every tier; cells 33 and 35 sit in
      // the second batch on every tier (the tier ceiling is 32).
      const probes: ReadonlyArray<readonly [number, number, string]> = [
        [4, 4, palette36[0]!], // batch 1
        [20, 4, palette36[2]!], // batch 1
        [12, 12, palette36[7]!], // batch 1
        [28, 44, palette36[33]!], // batch 2
        [44, 44, palette36[35]!], // batch 2
      ];
      let readPixel = readCanvas(backend);
      const slowPixels = probes.map(([x, y]) => readPixel(x, y));

      for (let i = 0; i < probes.length; i++) {
        expectPixelNear(slowPixels[i]!, hexToRgba(probes[i]![2]));
      }

      // F3: instruction replay — identical pixels.
      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      readPixel = readCanvas(backend);

      for (let i = 0; i < probes.length; i++) {
        expectPixelNear(readPixel(probes[i]![0], probes[i]![1]), slowPixels[i]!, 0);
      }
    } finally {
      root.destroy();
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    }
  });

  test('cell 2 — B-06: three cached retained groups submit the frame exactly once, all groups drawn', async ctx => {
    const backend = await setupBackend();
    const colors = ['#ff0000', '#00ff00', '#0000ff'];
    const textures = colors.map(color => createSolidTexture(color, 8));
    const root = new Container();
    const groups: RetainedContainer[] = [];

    try {
      for (let i = 0; i < 3; i++) {
        const group = new RetainedContainer();
        const sprite = new Sprite(textures[i]!);

        group.setPosition(4 + i * 20, 28);
        group.addChild(sprite);
        groups.push(group);
        root.addChild(group);
      }

      // F1 capture, F2 record, F3 first replay (arena/pipelines warm).
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, root))) {
          return;
        }
      }

      expect(fragmentOf(groups[2]!).instructions?.hasRecording).toBe(true);

      // Measured cached frame: ONE submit for three replayed groups.
      const submits = countSubmits(backend, () => {
        backend.resetStats();
        backend.clear(Color.black);
        root.render(backend);
        backend.flush();
      });

      expect(submits).toBe(1);
      // All three group batches went through the replay tier.
      expect(backend.stats.drawCalls).toBe(3);
      expect(backend.stats.submittedNodes).toBe(3);

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 32), hexToRgba(colors[0]!));
      expectPixelNear(readPixel(28, 32), hexToRgba(colors[1]!));
      expectPixelNear(readPixel(48, 32), hexToRgba(colors[2]!));
    } finally {
      root.destroy();
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    }
  });

  test('cell 3 — camera pan on the cached path: replayed pixels track the live view', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ff0000', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      group.addChild(sprite);
      root.addChild(group);

      // Reach the fast tier (F1 capture, F2 record, F3 replay).
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, root))) {
          return;
        }
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);

      // Pan the camera 16px right: the replayed sprite must appear 16px
      // further left — projection is resolved live at replay (S3-D1).
      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(0, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(24, 16), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — group move on the cached path relocates pixels WITHOUT recapture', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#00ff00', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, root))) {
          return;
        }
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 8), [0, 255, 0, 255]);

      // The recorded batch instruction must survive the move untouched: a
      // group move only changes the live-composed group matrix (S3-D6).
      const recordedBatch = fragmentOf(group).instructions!.instructions[0];

      group.setPosition(32, 32);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      expect(fragmentOf(group).instructions!.instructions[0]).toBe(recordedBatch);
      expect(fragmentOf(group).instructions!.hasRecording).toBe(true);

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(40, 40), [0, 255, 0, 255]);
      expectPixelNear(readPixel(8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — tint change inside the group is never served stale from the cached bytes', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ffffff', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, root))) {
          return;
        }
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 8), [255, 255, 255, 255]);

      // Tint is baked into the recorded instance bytes — the revision bump
      // must recapture, and the next frames (recapture, re-record, replay)
      // must all show the tinted output.
      sprite.setTint(new Color(255, 0, 0));

      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, root))) {
          return;
        }

        readPixel = readCanvas(backend);

        expectPixelNear(readPixel(8, 8), [255, 0, 0, 255]);
      }
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 6 — texture resize fails validation and falls back cleanly: fresh content, correct UVs, fast tier resumes', async ctx => {
    const backend = await setupBackend();
    const source = document.createElement('canvas');

    source.width = 8;
    source.height = 8;

    const sourceCtx = source.getContext('2d')!;

    sourceCtx.fillStyle = '#ff0000';
    sourceCtx.fillRect(0, 0, 8, 8);

    const texture = new Texture(source);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, root))) {
          return;
        }
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(4, 4), [255, 0, 0, 255]);

      // Resize the source (8x8 red → 16x16, left half green / right half
      // blue) WITHOUT touching the sprite: no node revision bumps, only the
      // backend-side view-identity/dimension validation can catch this. The
      // sprite's captured 8x8 frame now covers the LEFT HALF of the texture,
      // so the correct output is an all-green 8x8 sprite. Stale recorded UV
      // words (normalized against the OLD 8px size) would sample the WHOLE
      // texture instead and paint the sprite's right half blue.
      source.width = 16;
      source.height = 16;
      sourceCtx.fillStyle = '#00ff00';
      sourceCtx.fillRect(0, 0, 8, 16);
      sourceCtx.fillStyle = '#0000ff';
      sourceCtx.fillRect(8, 0, 8, 16);
      texture.updateSource();

      // The fallback frame AND the following replay frame must both sample
      // with live-correct UVs: green across the whole 8x8 sprite.
      for (let frame = 0; frame < 2; frame++) {
        if (!(await renderScene(ctx, backend, root))) {
          return;
        }

        readPixel = readCanvas(backend);

        expectPixelNear(readPixel(2, 4), [0, 255, 0, 255]);
        expectPixelNear(readPixel(6, 4), [0, 255, 0, 255]);
        expectPixelNear(readPixel(12, 4), [0, 0, 0, 255]);
      }

      expect(fragmentOf(group).instructions?.hasRecording).toBe(true);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
