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

// A canvas-backed texture whose pixels can be repainted mid-test. `repaint`
// redraws the source and calls `updateSource()`, which bumps the texture version
// so the backend re-uploads it (via copyExternalImageToTexture) on next sync.
interface MutableTexture {
  readonly texture: Texture;
  repaint(color: string): void;
}

const createMutableTexture = (color: string, size = 8): MutableTexture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const ctx = source.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  const texture = new Texture(source);

  return {
    texture,
    repaint: (next: string): void => {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = next;
      ctx.fillRect(0, 0, size, size);
      texture.updateSource();
    },
  };
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

// 16 distinct fully-saturated colours; consecutive entries never share a hue so
// a batcher with 8 texture slots breaks into >= 2 draw calls.
const palette16 = [
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

// Parse a `#rrggbb` string to an opaque RGBA tuple (canvas alphaMode 'opaque').
const hexToRgba = (hex: string): RgbaTuple => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];

// A non-overlapping grid of solid sprites, one distinct texture each, so a probe
// at a cell centre validates that a given batch drew its OWN instance bytes (a
// broken arena that aliases batches would paint a cell with another batch's data).
const buildGridScene = (textures: readonly Texture[], columns: number, cell: number): Container => {
  const root = new Container();

  for (let i = 0; i < textures.length; i++) {
    const sprite = new Sprite(textures[i]!);

    sprite.setPosition((i % columns) * cell, Math.floor(i / columns) * cell);
    sprite.width = cell;
    sprite.height = cell;
    root.addChild(sprite);
  }

  return root;
};

// A scene that forces a batch break: `textures[0]` at the top-left corner (0,0)
// and the rest laid out in a row at y=24. With >= 9 distinct textures the 8-slot
// batcher flushes the first 8 sprites (including textures[0]) into an open pass,
// which is exactly the "earlier draws recorded into a still-open pass" precondition
// the deferral defects hinge on. The (0,0) sprite centre (4,4) is the probe point.
const buildBreakScene = (textures: readonly Texture[], corner: Texture): Container => {
  const root = new Container();
  const cornerSprite = new Sprite(corner);

  cornerSprite.setPosition(0, 0);
  cornerSprite.width = 8;
  cornerSprite.height = 8;
  root.addChild(cornerSprite);

  for (let i = 0; i < textures.length; i++) {
    const sprite = new Sprite(textures[i]!);

    sprite.setPosition(i * 7, 24);
    sprite.width = 8;
    sprite.height = 8;
    root.addChild(sprite);
  }

  return root;
};

const renderRoot = (backend: WebGpuBackend, root: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  root.render(backend);
  backend.flush();
};

describe('WebGPU single-submit frame', () => {
  test('a multi-batch single-target sprite scene submits the frame exactly once, with correct per-batch pixels', async ctx => {
    const backend = await setupBackend();
    // 16 distinct textures over a 4x4 grid of 16px cells: sprites 0-7 land in the
    // first batch, 8-15 in the second (the 8-slot batcher breaks past texture 8).
    const textures = palette16.map(color => createSolidTexture(color, 16));
    const root = buildGridScene(textures, 4, 16);

    try {
      // Warm up: compile pipelines, upload textures, and let the instance arena
      // grow to hold the whole frame so steady state is reached.
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, () => renderRoot(backend, root)))) {
          return;
        }
      }

      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();
      const drawCalls = backend.stats.drawCalls;

      // The grid breaks into more than one batch (draw call).
      expect(drawCalls).toBeGreaterThan(1);

      // The measured frame: exactly one GPU submit regardless of draw-call count.
      const submits = countSubmits(backend, () => renderRoot(backend, root));

      expect(submits).toBe(1);

      // Pixel probes at cell centres across BOTH batches. A broken arena where
      // every batch reads the last batch's bytes would still submit once, but
      // these cells would paint the wrong colour/position — so the probes are
      // what actually guard the merge. Cell i centre = (col*16+8, row*16+8).
      const readPixel = readCanvas(backend);

      // Batch 1 (sprites 0-7):
      expectPixelNear(readPixel(8, 8), hexToRgba(palette16[0]!)); // cell 0
      expectPixelNear(readPixel(56, 8), hexToRgba(palette16[3]!)); // cell 3
      // Batch 2 (sprites 8-15):
      expectPixelNear(readPixel(8, 40), hexToRgba(palette16[8]!)); // cell 8
      expectPixelNear(readPixel(40, 40), hexToRgba(palette16[10]!)); // cell 10
      expectPixelNear(readPixel(56, 56), hexToRgba(palette16[15]!)); // cell 15
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

  // Defect 1 — `reserve()` in the second render's `_beginDrawPlan` grows (frees)
  // the shared transform-storage buffer while the FIRST render's pass is still
  // open and bound to it. Pre-fix the freed buffer invalidated the whole merged
  // command buffer at submit, silently dropping every batch since the last
  // boundary. The fix ends the open pass before the growth.
  test('two render() calls in one frame — first batch-breaks, second grows transform storage — keep both plans, no validation error', async ctx => {
    const backend = await setupBackend();
    const breakTextures = palette16.slice(1, 9).map(color => createSolidTexture(color, 8));
    const cornerTexture = createSolidTexture(palette16[0]!, 8);
    const fillTexture = createSolidTexture('#00ff80', 16);
    const planOne = buildBreakScene(breakTextures, cornerTexture);

    // The second plan is many same-texture sprites stacked at one spot: it adds a
    // lot of transform-storage rows (forcing growth) without a batch break.
    const buildPlanTwo = (count: number): Container => {
      const root = new Container();

      for (let i = 0; i < count; i++) {
        const sprite = new Sprite(fillTexture);

        sprite.setPosition(32, 32);
        sprite.width = 16;
        sprite.height = 16;
        root.addChild(sprite);
      }

      return root;
    };

    const renderFrame = (planTwoCount: number): void => {
      const planTwo = buildPlanTwo(planTwoCount);

      backend.resetStats();
      backend.clear(Color.black);
      planOne.render(backend); // 9 distinct textures → batch break → pass open
      planTwo.render(backend); // reserve() grows the storage while that pass is open
      backend.flush();
      planTwo.destroy();
    };

    try {
      // Warm up with a SMALL second plan so pipelines/textures are ready but the
      // storage capacity stays small; the measured frame's large plan then forces
      // the growth-while-a-pass-is-open path.
      for (let frame = 0; frame < 2; frame++) {
        if (!(await renderGuarded(ctx, backend, () => renderFrame(6)))) {
          return;
        }
      }

      // renderGuarded asserts no validation error was raised — pre-fix the freed
      // storage buffer trips exactly that.
      if (!(await renderGuarded(ctx, backend, () => renderFrame(200)))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // First plan's corner sprite survived (its batch was not dropped):
      expectPixelNear(readPixel(4, 4), hexToRgba(palette16[0]!));
      // Second plan's fill is present:
      expectPixelNear(readPixel(40, 40), hexToRgba('#00ff80'));
    } finally {
      planOne.destroy();
      breakTextures.forEach(texture => texture.destroy());
      cornerTexture.destroy();
      fillTexture.destroy();
      backend.destroy();
    }
  });

  // Defect 2 — a mid-frame `clear()` while a pass is open only set a pending flag
  // that the next `acquirePass` never consumed, so the clear silently deferred
  // (surviving this frame, detonating at the next pass open). The fix ends the
  // open pass so the clear applies at the point it was requested.
  test('a mid-frame clear() applies where requested: it wipes prior content and keeps later content', async ctx => {
    const backend = await setupBackend();
    const breakTextures = palette16.slice(1, 9).map(color => createSolidTexture(color, 8));
    const cornerTexture = createSolidTexture(palette16[0]!, 8);
    const greenTexture = createSolidTexture('#00ff00', 16);
    const planOne = buildBreakScene(breakTextures, cornerTexture);
    const laterRoot = new Container();
    const laterSprite = new Sprite(greenTexture);

    laterSprite.setPosition(32, 32);
    laterSprite.width = 16;
    laterSprite.height = 16;
    laterRoot.addChild(laterSprite);

    const renderFrame = (): void => {
      backend.resetStats();
      backend.clear(Color.black); // frame-initial clear (no pass open yet)
      planOne.render(backend); // batch break → batch recorded in an open pass
      backend.clear(Color.black); // MID-FRAME clear — must wipe planOne's content
      laterRoot.render(backend); // drawn AFTER the clear — must survive
      backend.flush();
    };

    try {
      for (let frame = 0; frame < 2; frame++) {
        if (!(await renderGuarded(ctx, backend, renderFrame))) {
          return;
        }
      }

      if (!(await renderGuarded(ctx, backend, renderFrame))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // planOne's corner sprite was wiped by the mid-frame clear → black.
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
      // Content drawn after the clear survives.
      expectPixelNear(readPixel(40, 40), hexToRgba('#00ff00'));
    } finally {
      planOne.destroy();
      laterRoot.destroy();
      breakTextures.forEach(texture => texture.destroy());
      cornerTexture.destroy();
      greenTexture.destroy();
      backend.destroy();
    }
  });

  // Defect 3 — a texture re-uploaded between two same-frame render() calls lands
  // on the queue timeline before the deferred submit, so the earlier render's
  // draws (recorded into the still-open pass) would sample the NEW content. The
  // fix ends the pass before the re-upload, so the earlier draw keeps the OLD
  // content and only the later draw sees the new content.
  test('a texture updated between two same-frame renders: the earlier draw keeps the OLD content', async ctx => {
    const backend = await setupBackend();
    const breakTextures = palette16.slice(1, 9).map(color => createSolidTexture(color, 8));
    const mutable = createMutableTexture('#ff0000', 8);
    const planOne = buildBreakScene(breakTextures, mutable.texture);
    const laterRoot = new Container();
    const laterSprite = new Sprite(mutable.texture);

    laterSprite.setPosition(32, 32);
    laterSprite.width = 8;
    laterSprite.height = 8;
    laterRoot.addChild(laterSprite);

    const renderFrame = (secondColor: string): void => {
      backend.resetStats();
      backend.clear(Color.black);
      planOne.render(backend); // corner sprite (the mutable texture) → recorded in an open pass
      mutable.repaint(secondColor); // bump the texture version BETWEEN the two renders
      laterRoot.render(backend); // references the mutable texture → triggers its re-upload
      backend.flush();
    };

    try {
      // Warm up with a stable colour (still red after repaint) so pipelines and
      // textures are ready and the storage capacity is large enough that the
      // Defect-1 growth guard does NOT fire on the measured frame — isolating the
      // texture-mutation split.
      for (let frame = 0; frame < 2; frame++) {
        if (!(await renderGuarded(ctx, backend, () => renderFrame('#ff0000')))) {
          return;
        }
      }

      // Measured frame: the corner is drawn while the texture is red, then the
      // texture is repainted green before the second render.
      if (!(await renderGuarded(ctx, backend, () => renderFrame('#00ff00')))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Earlier draw (first render, open pass) keeps the OLD (red) content.
      expectPixelNear(readPixel(4, 4), [255, 0, 0, 255]);
      // Later draw (second render) shows the NEW (green) content.
      expectPixelNear(readPixel(36, 36), [0, 255, 0, 255]);
    } finally {
      planOne.destroy();
      laterRoot.destroy();
      breakTextures.forEach(texture => texture.destroy());
      mutable.texture.destroy();
      backend.destroy();
    }
  });
});
