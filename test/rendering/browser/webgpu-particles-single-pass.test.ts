/**
 * WebGPU particle single-pass browser tests.
 *
 * `WebGpuParticleRenderer` used to open a coordinator pass, record one draw call
 * into it and end (submit) it again - per draw call. It had to: every particle
 * system rewrote the mode's shared vertex buffer and the system uniform buffer
 * from offset 0, and `queue.writeBuffer` is ordered against the submit rather
 * than against the individual draws inside it, so leaving the pass open would
 * have made every earlier draw read the last system's bytes. A frame that
 * alternates sprites and particle systems therefore cost one pass and one submit
 * PER ALTERNATION.
 *
 * The renderer now appends at pass-scoped cursors (a byte offset into the mode's
 * vertex buffer, a slot in the uniform ring) and adds the base at bind time, so
 * the whole frame collapses to one pass and one submit again.
 *
 * These tests spy on `device.queue.submit` for exactly one rendered frame and
 * additionally probe a pixel per flush: a change that merges the passes but
 * corrupts the offsets paints the wrong colour (vertex buffer aliased) or leaves
 * a cell at the clear colour (uniform ring aliased, so every system draws at the
 * last one's position), and fails here rather than passing as a win.
 *
 * The last describe covers the other half of that contract - the one hazard
 * appending CANNOT cover, so the renderer has to end the pass after all.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Time } from '#core/units';
import { materializeRendererBindings } from '#extensions/materialize';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { ApplyForce, particlesExtension, ParticleSystem } from '../../../packages/exojs-particles/src/index';
import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

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
  // The particle renderer is not part of the core renderer bindings - the
  // `@codexo/exojs-particles` package materialises it itself via its Extension
  // descriptor, and these tests build a bare backend without an Application.
  const { renderers } = particlesExtension;

  if (!renderers) {
    throw new Error('particlesExtension exposes no renderer bindings');
  }

  materializeRendererBindings(backend, renderers);

  return backend;
};

const createSolidTexture = (color: string, size = 8): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
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

// Fully saturated, mutually distant colours: any two differ by 255 in at least
// one channel, far above the probe tolerance, and none of them is the black
// clear colour.
const particleColors: readonly RgbaTuple[] = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 255],
  [255, 255, 0, 255],
  [0, 255, 255, 255],
  [255, 0, 255, 255],
];

/**
 * A one-particle system tinted `color` and placed at (`x`, `y`). The particle
 * itself sits at the system's local origin, so its screen position comes from
 * the system transform (the per-draw UNIFORM slot) while its colour comes from
 * the built instance record (the per-draw VERTEX sub-range) - one probe
 * therefore covers both cursors.
 *
 * Deterministic by construction: spawn modules are bypassed and one particle is
 * emitted at its defaults, and `update()` is never called, so nothing ages and
 * the particle cannot expire.
 */
const createTintedSystem = (texture: Texture, color: RgbaTuple, x: number, y: number): ParticleSystem => {
  const system = new ParticleSystem(texture, { capacity: 4 });
  const particle = system.emit()!;

  particle.color = new Color(color[0], color[1], color[2]).toRgba();
  system.setPosition(x, y);

  return system;
};

describe('WebGPU particle single-pass frame', () => {
  test('many sprite/particle alternations cost ONE pass and ONE submit, with per-flush particle pixels correct', async ctx => {
    const backend = await setupBackend();
    // Each alternation switches the active renderer, so this frame contains N
    // separate particle flushes. All systems run the SHARED default render mode,
    // whose vertex buffer the renderer caches against the mode's material - so
    // they all append into one buffer, which is exactly the aliasing this
    // guards.
    const alternations = particleColors.length;
    const cell = 8;
    const spriteRow = 0;
    const particleRow = 40;
    const texture = createSolidTexture('#ffffff', cell);
    const sprites: Sprite[] = [];
    const systems: ParticleSystem[] = [];

    for (let i = 0; i < alternations; i++) {
      const sprite = new Sprite(texture);

      sprite.setPosition(i * 10, spriteRow);
      sprite.width = cell;
      sprite.height = cell;
      sprites.push(sprite);

      // Centres 10px apart with a ±4px quad: 2px of clear colour between cells.
      systems.push(createTintedSystem(texture, particleColors[i]!, 5 + i * 10, particleRow));
    }

    // Closing on a sprite keeps the frame boundary out of the measurement: with
    // a particle system last, the NEXT frame's pending clear is consumed by an
    // empty pass the particle renderer opens for it, which adds a pass unrelated
    // to what this test measures.
    const trailingSprite = new Sprite(texture);

    trailingSprite.setPosition(0, canvasSize - cell);
    trailingSprite.width = cell;
    trailingSprite.height = cell;

    const renderAlternating = (): void => {
      backend.resetStats();
      backend.clear(Color.black);

      for (let i = 0; i < alternations; i++) {
        sprites[i]!.render(backend);
        systems[i]!.render(backend);
      }

      trailingSprite.render(backend);
      backend.flush();
    };

    try {
      // Warm up so pipelines are compiled and the shared buffers have ratcheted
      // up to the frame's total: a capacity growth legitimately splits the pass,
      // and sizing to the post-split draw would peg them at one draw forever.
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, renderAlternating))) {
          return;
        }
      }

      const submits = countSubmits(backend, renderAlternating);

      // One draw call per sprite flush and per particle flush, plus the trailing sprite.
      expect(backend.stats.drawCalls).toBe(alternations * 2 + 1);
      expect(backend.stats.renderPasses).toBe(1);
      expect(submits).toBe(1);

      const readPixel = readWebGpuPixels(backend, canvasSize);

      for (let i = 0; i < alternations; i++) {
        expectPixelNear(readPixel(5 + i * 10, particleRow), particleColors[i]!);
      }

      // The gap between two systems: a frame that drew every system at one
      // position would leave the cells empty rather than the gaps.
      expectPixelNear(readPixel(10, particleRow), [0, 0, 0, 255]);
      expectPixelNear(readPixel(30, particleRow), [0, 0, 0, 255]);
    } finally {
      systems.forEach(system => system.destroy());
      sprites.forEach(sprite => sprite.destroy());
      trailingSprite.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a GPU-compute system alternating with a CPU one still costs ONE pass and ONE submit', async ctx => {
    const backend = await setupBackend();
    // The compute simulation runs from the system's OWN encoder and submit, in
    // `update()` - a compute pass, never nested in the render pass - and writes
    // an instance buffer owned by that one system. So it neither shares a cursor
    // with the CPU path nor forces a render-pass boundary here; the only thing
    // the render side does differently is bind that buffer at offset 0. This
    // pins both halves of that: the compute system's pixels stay correct while
    // the frame keeps merging.
    const cell = 8;
    const texture = createSolidTexture('#ffffff', cell);
    const gpuSystem = new ParticleSystem(texture, { capacity: 4, device: getBackendDevice(backend) });
    const cpuSystem = createTintedSystem(texture, particleColors[1]!, 45, 40);
    const sprite = new Sprite(texture);
    const trailingSprite = new Sprite(texture);

    sprite.setPosition(0, 0);
    sprite.width = cell;
    sprite.height = cell;
    trailingSprite.setPosition(0, canvasSize - cell);
    trailingSprite.width = cell;
    trailingSprite.height = cell;

    const renderFrame = (): void => {
      backend.resetStats();
      backend.clear(Color.black);
      sprite.render(backend);
      gpuSystem.render(backend);
      cpuSystem.render(backend);
      // A second flush of the same renderer pair, so the merge is measured
      // across a renderer switch rather than within one flush.
      trailingSprite.render(backend);
      backend.flush();
    };

    try {
      gpuSystem.addUpdateModule(new ApplyForce(0, 0));

      const particle = gpuSystem.emit()!;

      particle.color = new Color(particleColors[0]![0], particleColors[0]![1], particleColors[0]![2]).toRgba();
      particle.lifetime = 100;
      gpuSystem.setPosition(15, 40);

      // The system tears its GPU state down the first time it sees a backend it
      // has not been collected against, so the first frame is always the CPU
      // path. Render once to bind the backend, then update - that update is the
      // one that compiles the compute pipeline.
      if (!(await renderGuarded(ctx, backend, renderFrame))) {
        return;
      }

      gpuSystem.update(Time.toSeconds(Time.milliseconds(16)));

      expect(gpuSystem.gpuMode).toBe(true);

      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, renderFrame))) {
          return;
        }
      }

      const submits = countSubmits(backend, renderFrame);

      expect(backend.stats.renderPasses).toBe(1);
      expect(submits).toBe(1);

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // The compute-fed system and the CPU-fed one keep their own colour and
      // their own position, which a shared uniform slot would collapse.
      expectPixelNear(readPixel(15, 40), particleColors[0]!);
      expectPixelNear(readPixel(45, 40), particleColors[1]!);
    } finally {
      gpuSystem.destroy();
      cpuSystem.destroy();
      sprite.destroy();
      trailingSprite.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGPU particle viewport invalidation', () => {
  test('a viewport moved between two particle flushes does NOT let the second draw render through the first viewport', async ctx => {
    const backend = await setupBackend();
    const texture = createSolidTexture('#ffffff', 8);
    // ONE camera object for the whole frame - the viewport moves by mutating it
    // in place. A `setView` to a different View would end the pass on its own
    // and prove nothing about the renderer's guard.
    const view = new View(canvasSize / 2, canvasSize / 2, canvasSize, canvasSize);
    // Both systems sit at the camera centre, so each lands in the middle of
    // whichever viewport rectangle its own pass carries: the left half's centre
    // for the first, the right half's for the second. The viewport is applied
    // when the pass OPENS and cannot be rewritten on an open one, so a second
    // draw appended to the first pass paints the left cell instead.
    const first = createTintedSystem(texture, particleColors[0]!, canvasSize / 2, canvasSize / 2);
    const second = createTintedSystem(texture, particleColors[1]!, canvasSize / 2, canvasSize / 2);
    // Present only to switch the active renderer, which flushes the first
    // particle draw into the pass while the viewport is still the left half.
    // Parked in a corner, clear of both probes.
    const switcher = new Sprite(texture);

    switcher.setPosition(8, 8);
    switcher.width = 8;
    switcher.height = 8;

    const leftCellX = canvasSize / 4;
    const rightCellX = (canvasSize * 3) / 4;
    const cellY = canvasSize / 2;

    const renderFrame = (): void => {
      backend.resetStats();
      backend.clear(Color.black);
      backend.setView(view);
      view.viewport.set(0, 0, 0.5, 1);

      first.render(backend);
      // Renderer switch: flushes the first particle draw into the open pass
      // under the left viewport, then queues the sprite.
      switcher.render(backend);
      // Switch back: flushes the sprite into that same pass, queues the second
      // particle draw.
      second.render(backend);
      // The move lands with the second draw queued but not yet recorded, and
      // with no other renderer left to flush after it - so nothing except the
      // particle renderer's own guard can end the pass here.
      view.viewport.set(0.5, 0, 0.5, 1);
      backend.flush();
    };

    try {
      // Warm up so pipelines are compiled and the shared buffers have ratcheted
      // to the frame's total: a capacity growth ends the pass for its own
      // reasons and would answer a different question than the one asked here.
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, renderFrame))) {
          return;
        }
      }

      const submits = countSubmits(backend, renderFrame);
      const readPixel = readWebGpuPixels(backend, canvasSize);

      // Asserted before the counts, so a regression reports the rendered result
      // rather than the mechanism that produced it. The second draw landing in
      // the RIGHT cell is the whole point; the first draw still owning the LEFT
      // one rules out "it just painted everything".
      expectPixelNear(readPixel(rightCellX, cellY), particleColors[1]!);
      expectPixelNear(readPixel(leftCellX, cellY), particleColors[0]!);

      // Exactly one extra boundary: the viewport move, and nothing else.
      expect(backend.stats.renderPasses).toBe(2);
      expect(submits).toBe(2);
    } finally {
      first.destroy();
      second.destroy();
      switcher.destroy();
      view.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
