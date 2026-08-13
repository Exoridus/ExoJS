/**
 * WebGPU retained-text quad-index buffer growth browser test.
 *
 * `WebGpuTextRenderer` shares ONE grow-only quad-index buffer across every
 * retained Text batch on the renderer (see `_ensureRetainedQuadIndexBuffer`).
 * Growing it destroys the current buffer before allocating the larger one.
 * Since the pass-cursor sweep, the WebGPU render pass survives a renderer
 * switch and a retained replay no longer ends it — so an EARLIER retained
 * replay in the SAME still-open pass can have a draw bound to the buffer
 * being destroyed. Freeing it under that draw invalidates the whole merged
 * command buffer at the next submit: a WebGPU validation error.
 *
 * `_ensureRetainedQuadIndexBuffer` now ends the open pass before growing
 * whenever it already holds draws, so the earlier replay's draw reaches the
 * queue against the buffer it was actually bound to.
 *
 * Two retained groups reproduce this deterministically: a small one whose
 * replay creates the shared buffer at its initial (small) capacity, and a
 * much larger one — rendered after it in the same tree, so its replay lands
 * in the same open pass — whose quad count forces a growth.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 48;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black },
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

const renderFrame = (backend: WebGpuBackend, root: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  root.render(backend);
  backend.flush();
};

describe('WebGPU retained text quad-index buffer growth', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('growing the shared quad-index buffer while an earlier replay in the pass still binds it submits that replay first', async ctx => {
    const backend = await setupBackend();
    const root = new Container();

    // A small retained group: its replay is what first creates the shared
    // quad-index buffer, at whatever the renderer's initial (small) capacity
    // is — the exact number doesn't matter, only that it is far below the
    // second group's quad count below.
    const groupA = new RetainedContainer();
    const textA = new Text('M', { fillColor: Color.white, fontSize: 16 });

    textA.setPosition(2, 2);
    groupA.addChild(textA);
    groupA.setPosition(0, 0);
    root.addChild(groupA);

    try {
      // F1 capture, F2 record, F3 replay: group A's replay creates the
      // shared quad-index buffer.
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, () => renderFrame(backend, root)))) {
          return;
        }
      }

      const readBeforeGrowth = readWebGpuPixels(backend, canvasSize);
      const inkBeforeGrowth: RgbaTuple = readBeforeGrowth(3, 10);

      // Sanity: group A actually painted something before group B exists.
      expect(inkBeforeGrowth).not.toEqual([0, 0, 0, 255]);

      // A large retained group, added AFTER group A in the tree so its replay
      // is recorded into the pass AFTER group A's — well beyond any plausible
      // initial quad-index capacity, so its first replay forces a growth
      // while group A's own replay draw from this same frame still sits,
      // unsubmitted, in the open pass.
      const groupB = new RetainedContainer();
      const textB = new Text('M'.repeat(1200), { fillColor: Color.white, fontSize: 8 });

      textB.setPosition(0, 40);
      groupB.addChild(textB);
      groupB.setPosition(0, 0);
      root.addChild(groupB);

      // F1 capture, F2 record for group B — group A keeps replaying normally
      // (no growth: its own quad count never exceeds the existing buffer).
      for (let frame = 0; frame < 2; frame++) {
        if (!(await renderGuarded(ctx, backend, () => renderFrame(backend, root)))) {
          return;
        }
      }

      // F3: group B's first replay. Group A's replay draw (recorded earlier
      // in THIS frame, into the still-open pass) is what makes the guard's
      // `coordinator.passHasDraws` check load-bearing.
      if (!(await renderGuarded(ctx, backend, () => renderFrame(backend, root)))) {
        return;
      }

      const readAfterGrowth = readWebGpuPixels(backend, canvasSize);

      // Group A's content survived the growth — the fix submits its replay
      // draw against the buffer it was actually bound to, not the grown one.
      expectPixelNear(readAfterGrowth(3, 10), inkBeforeGrowth);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
