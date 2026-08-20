/**
 * WebGPU text single-pass browser test.
 *
 * The WebGPU render pass survives a renderer switch, so a frame that alternates
 * sprites and text contains SEVERAL text flushes inside one pass. The text
 * renderer used to rewrite its shared vertex / index / node-data buffers from
 * offset 0 on every flush - `queue.writeBuffer` is ordered against the submit,
 * not against the individual draws inside the pass, so flush k+1's bytes would
 * land under the draws flush k had already recorded - and it ended (submitted)
 * the pass unconditionally at the tail of every flush to paper over that. Cost:
 * one pass and one submit PER TEXT FLUSH, i.e. linear in the alternation count.
 *
 * The flush path now appends at pass-scoped cursors (vertex bytes, index bytes,
 * node rows) and adds the base at bind time, so the whole frame collapses to one
 * pass and one submit again.
 *
 * Distinct fill colours AND distinct rows per text node are what make an
 * aliasing regression visible: a flush whose vertex bytes or node rows were
 * overwritten by a later one paints the later node's colour - or nothing at all,
 * leaving its band at the black clear. Collapsing the passes while corrupting the
 * offsets therefore fails the probes, not just the counters.
 *
 * The second test covers the other half of the same budget: a projection
 * rewrite is a pass boundary here, so the skip state has to compare group
 * CONTENT rather than the backend's monotonic group-transform id. A retained
 * group entered and left around text restores byte-identical group bytes while
 * that id advances twice - under an id comparison every boundary split the
 * frame, at one extra pass and submit per boundary.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Sprite } from '#rendering/sprite/Sprite';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuFrame } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 128;
// One horizontal band per text flush, with the sprite column parked to the right
// of `textProbeWidth` so the probe scan only ever sees glyph pixels.
const flushes = 4;
const bandHeight = canvasSize / flushes;
const textProbeWidth = 96;
const spriteColumn = 112;

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

const createSolidTexture = (color: string, size = 8): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const ctx = source.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(source);
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

/**
 * The most strongly covered glyph pixel inside one band. Glyph edges are
 * antialiased, so the fill colour is only reproduced exactly where coverage
 * saturates - the brightest pixel of a thick stem. Returns `null` for a band
 * that holds no ink at all (which is itself a failure: the flush was dropped or
 * drew somewhere else).
 */
const strongestBandPixel = (frame: ArrayLike<number>, band: number): RgbaTuple | null => {
  let best: RgbaTuple | null = null;
  let bestTotal = 0;

  for (let y = band * bandHeight; y < (band + 1) * bandHeight; y++) {
    for (let x = 0; x < textProbeWidth; x++) {
      const i = (y * canvasSize + x) * 4;
      const total = frame[i]! + frame[i + 1]! + frame[i + 2]!;

      if (total > bestTotal) {
        bestTotal = total;
        best = [frame[i]!, frame[i + 1]!, frame[i + 2]!, frame[i + 3]!];
      }
    }
  }

  // A saturated stem pixel of any palette entry sums to at least 255; anything
  // dimmer is edge antialiasing, not a readable sample.
  return bestTotal >= 240 ? best : null;
};

describe('WebGPU text single-pass frame', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('many sprite/text alternations cost ONE pass and ONE submit, with per-flush text pixels correct', async ctx => {
    const backend = await setupBackend();
    // Fully saturated primaries plus yellow: any two differ by 255 in some
    // channel, so a band painted by the wrong flush's node row is unmissable.
    const fillColors: readonly RgbaTuple[] = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
    ];
    const texture = createSolidTexture('#ffffff', 8);
    const sprites: Sprite[] = [];
    const texts: Text[] = [];

    for (let i = 0; i < flushes; i++) {
      const sprite = new Sprite(texture);

      sprite.setPosition(spriteColumn, i * bandHeight + 4);
      sprite.width = 8;
      sprite.height = 8;
      sprites.push(sprite);

      // 'M' is wide and solid, so every band has a thick stem whose centre
      // pixels reach full coverage.
      const [r, g, b] = fillColors[i]!;
      const text = new Text('M', { fontSize: 24, fillColor: new Color(r, g, b, 1) });

      text.setPosition(6, i * bandHeight + 4);
      texts.push(text);
    }

    // Closing on a sprite keeps the frame boundary out of the measurement: with
    // text last, the NEXT frame's pending clear is consumed by the text
    // renderer's empty-clear pass, which adds a pass unrelated to what this test
    // measures.
    const trailingSprite = new Sprite(texture);

    trailingSprite.setPosition(spriteColumn, canvasSize - 12);
    trailingSprite.width = 8;
    trailingSprite.height = 8;

    const renderAlternating = (): void => {
      backend.resetStats();
      backend.clear(Color.black);

      for (let i = 0; i < flushes; i++) {
        sprites[i]!.render(backend);
        texts[i]!.render(backend);
      }

      trailingSprite.render(backend);
      backend.flush();
    };

    try {
      // Warm up so pipelines are compiled, the glyph atlas holds 'M' (a dirty
      // atlas page legitimately splits the pass), and the shared buffers have
      // ratcheted up to the frame's total: a capacity growth also splits, and
      // sizing to the post-split flush would peg them at one flush forever.
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, renderAlternating))) {
          return;
        }
      }

      const submits = countSubmits(backend, renderAlternating);

      // One draw call per sprite flush and per text flush, plus the trailing
      // sprite - so the text renderer really did flush `flushes` times.
      expect(backend.stats.drawCalls).toBe(flushes * 2 + 1);
      expect(backend.stats.renderPasses).toBe(1);
      expect(submits).toBe(1);

      const frame = readWebGpuFrame(backend, canvasSize);

      for (let i = 0; i < flushes; i++) {
        const sample = strongestBandPixel(frame, i);

        expect(sample, `band ${i} holds no glyph ink`).not.toBeNull();
        expectPixelNear(sample!, fillColors[i]!);
      }
    } finally {
      texts.forEach(text => text.destroy());
      sprites.forEach(sprite => sprite.destroy());
      trailingSprite.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('entering and leaving a group that restores identical group bytes costs ONE pass and ONE submit', async ctx => {
    const backend = await setupBackend();
    const fillColors: readonly RgbaTuple[] = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ];
    const texture = createSolidTexture('#ffffff', 8);
    const texts: Text[] = [];

    for (let i = 0; i < fillColors.length; i++) {
      const [r, g, b] = fillColors[i]!;
      const text = new Text('M', { fontSize: 24, fillColor: new Color(r, g, b, 1) });

      text.setPosition(6, i * bandHeight + 4);
      texts.push(text);
    }

    // A group sitting at the origin with no transform of its own composes to the
    // identity - the same matrix the ungrouped draws around it are projected
    // with. Entering and leaving it therefore restores BYTE-IDENTICAL group
    // bytes while the backend's group-transform id advances twice, which is
    // exactly the case the projection skip state must not read as a change: a
    // rewrite of the single-slot FrameUniforms UBO is a pass boundary.
    const groupTransform = new Matrix();

    const trailingSprite = new Sprite(texture);

    trailingSprite.setPosition(spriteColumn, canvasSize - 12);
    trailingSprite.width = 8;
    trailingSprite.height = 8;

    const renderGrouped = (): void => {
      backend.resetStats();
      backend.clear(Color.black);

      texts[0]!.render(backend);
      backend._setRenderGroupTransform(groupTransform);
      texts[1]!.render(backend);
      backend._setRenderGroupTransform(null);
      texts[2]!.render(backend);
      trailingSprite.render(backend);
      backend.flush();
    };

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, renderGrouped))) {
          return;
        }
      }

      const groupIdBefore = backend.renderGroupTransformId;
      const submits = countSubmits(backend, renderGrouped);

      // The frame really crossed two group boundaries - without this the
      // counters below would pass for a frame that never entered a group.
      expect(backend.renderGroupTransformId - groupIdBefore).toBe(2);
      // One draw call per text flush (each group boundary drains the pending
      // batch), plus the trailing sprite.
      expect(backend.stats.drawCalls).toBe(texts.length + 1);
      expect(backend.stats.renderPasses).toBe(1);
      expect(submits).toBe(1);

      const frame = readWebGpuFrame(backend, canvasSize);

      for (let i = 0; i < fillColors.length; i++) {
        const sample = strongestBandPixel(frame, i);

        expect(sample, `band ${i} holds no glyph ink`).not.toBeNull();
        expectPixelNear(sample!, fillColors[i]!);
      }
    } finally {
      texts.forEach(text => text.destroy());
      trailingSprite.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
