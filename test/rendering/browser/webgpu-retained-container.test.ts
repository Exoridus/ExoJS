/**
 * WebGPU renderer-matrix browser tests — RetainedContainer pixel cells
 * (Track B Slice 2, spec §8/§10(d) correctness gate).
 *
 * Mirrors webgl2-retained-container.test.ts 1:1 on the WebGPU harness: real
 * inline WGSL (no mocks), `renderScene`'s validation-scope helper, and a
 * device-loss skip via `ctx.skip` exactly as the other opt-in WebGPU browser
 * specs do. Seven cells asserting real rendered output for the retained-group
 * feature shipped across tasks 3-8: camera motion over a retained fragment, a
 * group move via the group matrix, a child mutation inside the group, a
 * tint/alpha change inside the group, bitmap text lifted by the group
 * uniform, an effect-bearing direct child (cacheAsBitmap) that escapes the
 * group convention, and a depth-2 effect node whose branch escapes the group
 * (F13/R3 sub-branch escape) while keeping pixel-correct output.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `renderScene` only skips when the software adapter
 * drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { BitmapText, type BmFontData } from '#rendering/text/BitmapText';
import { BmFont } from '#rendering/text/BmFont';
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

// A BitmapText whose single glyph 'A' fills the whole `size`×`size` atlas page,
// placed at the line origin so its quad covers (0,0)–(size,size) before any
// node transform. The atlas page is a solid-colour texture, so the
// colour-atlas shader (msdf = false) emits that colour directly — deterministic
// pixels with no runtime font rasterisation or atlas-upload timing. Copied
// verbatim from webgpu-stencil-clip.test.ts's font fixture.
const createSolidBitmapText = (color: string, size: number): { text: BitmapText; texture: Texture } => {
  const texture = createSolidTexture(color, size);
  const fontData: BmFontData = {
    pages: ['atlas_0.png'],
    chars: new Map([[65, { x: 0, y: 0, width: size, height: size, xOffset: 0, yOffset: 0, xAdvance: size, page: 0 }]]),
    kernings: new Map(),
    // base === lineHeight ⇒ yBearing 0 ⇒ the glyph top sits at the line origin.
    lineHeight: size,
    base: size,
  };

  return { text: new BitmapText('A', new BmFont(fontData, [texture])), texture };
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
// dropped mid-test ("Instance dropped in popErrorScope"). Treat that as a
// device-lost skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a scene through the real plan path inside a validation error scope.
// Returns false when the device dropped mid-test (the caller should bail).
// Every render call gets its own fresh scope — never more than one flush per
// pushErrorScope.
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

describe('WebGPU renderer matrix: RetainedContainer cells', () => {
  test('cell 1 — retained group under camera motion: fragment splices, pixels track the view', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ff0000', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      group.addChild(sprite);
      root.addChild(group);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);

      // Pan the camera 16px right: the sprite must appear 16px further left.
      // The default view of a 64x64 canvas is centered at (32, 32).
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

  test('cell 2 — group move: one matrix update relocates the whole group', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#00ff00', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 8), [0, 255, 0, 255]);

      group.setPosition(32, 32);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(40, 40), [0, 255, 0, 255]);
      expectPixelNear(readPixel(8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — child mutation inside the group is visible on the next frame', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ff0000', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 8), [255, 0, 0, 255]);

      sprite.setPosition(24, 24);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — tint/alpha change on a drawable inside the group is never served stale', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ffffff', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 8), [255, 255, 255, 255]);

      sprite.tint = new Color(0, 255, 0);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 8), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — bitmap text inside a moved group renders at the group position', async ctx => {
    const backend = await setupBackend();
    const { text, texture } = createSolidBitmapText('#ff0000', 32);
    const root = new Container();
    const group = new RetainedContainer();

    try {
      text.setPosition(8, 8); // covers (8,8)-(40,40) — same fixture as webgpu-stencil-clip.test.ts
      group.addChild(text);
      root.addChild(group);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(38, 38), [255, 0, 0, 255]);

      // Move the group by (16, 0): text bakes group-relative vertices, so the
      // u_group uniform must lift them (spec §7 text exception) — the glyph
      // now covers (24,8)-(56,40).
      group.setPosition(16, 0);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(32, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(54, 38), [255, 0, 0, 255]);
      // The original (un-shifted) position is now background.
      expectPixelNear(readPixel(16, 16), [0, 0, 0, 255]);
    } finally {
      text.destroy();
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 6 — effect-bearing DIRECT child (cacheAsBitmap barrier) inside a moved group stays world-correct', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ff0000', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const cached = new Sprite(texture);

    try {
      // Barrier child escapes the group convention: world-space, and
      // cacheAsBitmap is visually neutral, so "semantics-neutral by
      // construction" is directly pixel-assertable: identical placement to
      // a plain sprite at the group position.
      cached.cacheAsBitmap = true;
      group.addChild(cached);
      root.addChild(group);

      group.setPosition(16, 16);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(24, 24), [255, 0, 0, 255]); // sprite 16..32
      expectPixelNear(readPixel(8, 8), [0, 0, 0, 255]);
      expectPixelNear(readPixel(40, 40), [0, 0, 0, 255]);

      if (!(await renderScene(ctx, backend, root))) {
        // spliced frame: barrier re-dispatches, same output
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(24, 24), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 7 — effect-bearing node nested TWO levels deep: its branch escapes the group and output stays correct', async ctx => {
    const backend = await setupBackend();
    const red = createSolidTexture('#ff0000', 16);
    const green = createSolidTexture('#00ff00', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const deepCached = new Sprite(red);
    const plainLeaf = new Sprite(green);

    try {
      deepCached.cacheAsBitmap = true; // barrier at depth 2 -> mid's branch escapes (F13/R3)
      mid.setPosition(8, 8);
      mid.addChild(deepCached);
      group.addChild(mid);
      group.addChild(plainLeaf);
      group.setPosition(16, 16);
      root.addChild(group);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readCanvas(backend);

      // CORRECT output, not a warning: the deep effect lands at its true
      // world position (16+8 -> 24..40) via the escaped world-space branch,
      // and the plain sibling stays group-local under the group uniform
      // (16..32) — retention and the group transform survive for it (F13/R3).
      expectPixelNear(readPixel(36, 36), [255, 0, 0, 255]); // deep cached sprite only
      expectPixelNear(readPixel(18, 18), [0, 255, 0, 255]); // plain leaf only
      expectPixelNear(readPixel(8, 8), [0, 0, 0, 255]);
      expectPixelNear(readPixel(46, 46), [0, 0, 0, 255]);

      if (!(await renderScene(ctx, backend, root))) {
        // second frame: identical (sibling splices, branch re-dispatches)
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(36, 36), [255, 0, 0, 255]);
      expectPixelNear(readPixel(18, 18), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      red.destroy();
      green.destroy();
      backend.destroy();
    }
  });

  test('cell 8 — pixelSnapMode is group-aware: a snapped sprite inside a fractional group renders through the composed path (R2)', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ff0000', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      // Fractional group offset + fractional child: the composed device origin
      // is off-pixel. `position` snapping composes the group matrix in before
      // snapping and peels it back off the uploaded row, so the shader's
      // re-applied u_group still lands the origin on a whole device pixel.
      group.setPosition(8.4, 8.4);
      sprite.setPosition(0.3, 0.3);
      sprite.pixelSnapMode = 'position';
      group.addChild(sprite);
      root.addChild(group);

      const worldBefore = sprite.getWorldTransform().clone();

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      let readPixel = readCanvas(backend);

      // Composed origin ≈ 8.7 → snapped to 9; the 16px sprite covers ~9..25.
      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(2, 2), [0, 0, 0, 255]);

      const first = readPixel(16, 16);

      if (!(await renderScene(ctx, backend, root))) {
        // spliced frame — deterministic, no drift
        return;
      }

      readPixel = readCanvas(backend);

      expect(readPixel(16, 16)).toEqual(first);
      // Render-only: the logical world transform is never mutated by snapping.
      expect(sprite.getWorldTransform().equals(worldBefore)).toBe(true);

      worldBefore.destroy();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  // Slice 4c: once the recording is ARMED (needs a clean record frame + a
  // replay frame first), a direct child move no longer drops the recording and
  // re-records — it patches that one transform row in place via a single
  // queue.writeBuffer sub-range. Cell 3 above moves the child before the
  // recording exists (2 frames), so it records the moved position and never
  // exercises the patch; this cell arms first, then moves. The node test
  // (webgpu-retained-record-replay.test.ts) pins the O(k) write pattern against
  // a mock device; here we prove the sub-range write renders correctly on a
  // real adapter AND that the recording is kept (not re-recorded).
  test('cell 9 — a child move AFTER the recording is armed patches the row in place, real GPU (Slice 4c)', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ff0000', 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    interface FragmentCarrier {
      _fragment: { instructions: { hasRecording: boolean } | null };
    }

    const instructionsOf = (): { hasRecording: boolean } | null => (group as unknown as FragmentCarrier)._fragment.instructions;

    try {
      group.addChild(sprite);
      root.addChild(group);

      // Arm the fast tier: F1 capture → F2 record → F3 replay.
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, root))) {
          return;
        }
      }

      const armed = instructionsOf();

      expect(armed?.hasRecording).toBe(true);

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 8), [255, 0, 0, 255]);

      // Move the direct child: this routes through the in-place patch.
      sprite.setPosition(24, 24);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      // The recording is the SAME object and still armed — a fallback would
      // have dropped it and re-recorded.
      expect(instructionsOf()).toBe(armed);
      expect(instructionsOf()?.hasRecording).toBe(true);

      // The patched transform row is live on the real adapter: the sprite is at
      // its new position, the old one is cleared.
      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
