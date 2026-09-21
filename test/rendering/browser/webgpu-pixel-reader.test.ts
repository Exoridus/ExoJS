/**
 * WebGPU: `PixelReader` over a render texture.
 *
 * `copyTextureToBuffer` pads every row to 256 bytes, so a read narrower than
 * 64 pixels lands with gaps between its rows that the drain has to unpack, and
 * a 17px region is the fixture that catches a wrong stride. The quadrant scene
 * is the one the WebGL2 spec asserts against as well: both backends promise
 * the identical layout from the reader, as they do from `readPixels`.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { describe, expect, test, type TestContext } from 'vitest';

import type { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGpuTestBackend, isDeviceLoss, webGpuAvailable } from './_backendSetup';
import { driveUntilSettled } from './_pixelReaderDrive';
import type { RgbaTuple } from './_pixels';
import { BOTTOM_RIGHT, drawQuadrants, expectQuadrantLayout, SCENE_SIZE, TOP_LEFT } from './_readPixelsScene';

const expectColor = (actual: RgbaTuple, expected: Color, where: string): void => {
  expect(`${where} ${actual.slice(0, 3).join(',')}`).toBe(`${where} ${[expected.r, expected.g, expected.b].join(',')}`);
};

/**
 * Run `body` against a fresh backend holding the filled scene, or skip.
 *
 * The adapter check is per test rather than once for the file: a suite-level
 * guard would have to resolve before collection, and the software adapter can
 * also disappear mid-run, which is a skip and not a failure.
 */
const withFilledTarget = async (
  ctx: TestContext,
  body: (context: RenderingContext, backend: WebGpuBackend, target: RenderTexture) => Promise<void>,
): Promise<void> => {
  if (!(await webGpuAvailable())) {
    ctx.skip('No WebGPU adapter available.');

    return;
  }

  const backend = await createWebGpuTestBackend(SCENE_SIZE);
  const context = new RenderingContext(backend);
  const target = new RenderTexture(SCENE_SIZE, SCENE_SIZE);

  try {
    drawQuadrants(context, target);
    backend.flush();

    await body(context, backend, target);
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test - unstable software adapter');

      return;
    }

    throw error;
  } finally {
    target.destroy();
    backend.destroy();
  }
};

describe('WebGPU PixelReader', () => {
  test('is never ready in the task that requested it, then lands top-down', async ctx => {
    await withFilledTarget(ctx, async (context, backend, target) => {
      const reader = context.createPixelReader(target);

      try {
        const read = reader.request()!;

        expect(read).not.toBeNull();
        expect([read.ready, read.failed]).toEqual([false, false]);

        // The drain in the same task must not see the map settled.
        backend.resetStats();
        expect(read.ready).toBe(false);

        await driveUntilSettled(backend, read);

        expect(read.failed).toBe(false);
        expect(read.data!.width).toBe(SCENE_SIZE);
        expectQuadrantLayout(read.data!.data, SCENE_SIZE, expectColor);
      } finally {
        reader.destroy();
      }
    });
  });

  test('unpacks a region whose rows do not fill the 256-byte stride', async ctx => {
    await withFilledTarget(ctx, async (context, backend, target) => {
      const side = 17;
      const origin = SCENE_SIZE / 2 - Math.floor(side / 2);
      const reader = context.createPixelReader(target, { region: new Rectangle(origin, origin, side, side) });

      try {
        const read = reader.request()!;

        await driveUntilSettled(backend, read);

        expect([read.data!.width, read.data!.height, read.data!.data.length]).toEqual([side, side, side * side * 4]);
        expectQuadrantLayout(read.data!.data, side, expectColor);
      } finally {
        reader.destroy();
      }
    });
  });

  test('a region read describes only its rectangle', async ctx => {
    await withFilledTarget(ctx, async (context, backend, target) => {
      const reader = context.createPixelReader(target, { region: new Rectangle(SCENE_SIZE - 2, SCENE_SIZE - 2, 2, 2) });

      try {
        const read = reader.request()!;

        await driveUntilSettled(backend, read);

        const { width, height, data } = read.data!;

        expect([width, height, data.length]).toEqual([2, 2, 16]);
        expectColor([data[0]!, data[1]!, data[2]!, data[3]!], BOTTOM_RIGHT, 'corner');
      } finally {
        reader.destroy();
      }
    });
  });

  test('delivers in request order, accounts the download, and reuses a released slot', async ctx => {
    await withFilledTarget(ctx, async (context, backend, target) => {
      const reader = context.createPixelReader(target, { region: new Rectangle(0, 0, 4, 4), slots: 2 });

      try {
        const first = reader.request()!;
        const second = reader.request()!;

        expect(reader.request()).toBeNull();

        await driveUntilSettled(backend, second);

        expect([first.ready, second.ready]).toEqual([true, true]);
        expectColor([first.data!.data[0]!, first.data!.data[1]!, first.data!.data[2]!, first.data!.data[3]!], TOP_LEFT, 'first');
        expect(backend.stats.downloadCount).toBeGreaterThanOrEqual(1);
        expect(backend.stats.downloadBytes % (4 * 4 * 4)).toBe(0);

        first.release();

        const third = reader.request();

        expect(third).toBe(first);
        expect(third!.ready).toBe(false);

        await driveUntilSettled(backend, third!);

        expect(third!.ready).toBe(true);
        expect(reader.inFlight).toBe(2);
      } finally {
        reader.destroy();
      }
    });
  });

  test('destroying the reader with a read in flight fails it and the drain stays quiet', async ctx => {
    await withFilledTarget(ctx, async (context, backend, target) => {
      const reader = context.createPixelReader(target);
      const read = reader.request()!;

      reader.destroy();

      expect([read.ready, read.failed]).toEqual([false, true]);
      expect(() => backend.resetStats()).not.toThrow();
      // Let the aborted map settle so a rejection surfacing later would still
      // land inside this test rather than in the next one.
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  });
});
