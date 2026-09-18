/**
 * WebGPU: `RenderingContext.readPixels` over a render texture.
 *
 * `copyTextureToBuffer` pads every row out to a 256-byte boundary, so anything
 * narrower than 64 pixels comes back with gaps between its rows that have to be
 * unpacked. The four-colour quadrant scene is the one the WebGL2 spec asserts
 * against as well: both backends promise the identical layout, and running the
 * same expectations against both is what proves it.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { describe, expect, test, type TestContext } from 'vitest';

import type { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGpuTestBackend, isDeviceLoss, webGpuAvailable } from './_backendSetup';
import type { RgbaTuple } from './_pixels';
import { BOTTOM_RIGHT, drawQuadrants, expectQuadrantLayout, SCENE_SIZE, TOP_LEFT } from './_readPixelsScene';

// Compared through a labelled string so a failure names the quadrant that
// moved, which is the whole diagnosis when rows come back at the wrong stride.
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

describe('WebGPU readPixels', () => {
  test('hands back the same top-down rows WebGL2 does', async ctx => {
    await withFilledTarget(ctx, async (context, _backend, target) => {
      const frame = await context.readPixels(target);

      expect([frame.width, frame.height]).toEqual([SCENE_SIZE, SCENE_SIZE]);
      expect(frame.data).toHaveLength(SCENE_SIZE * SCENE_SIZE * 4);
      expectQuadrantLayout(frame.data, frame.width, expectColor);
    });
  });

  test('a region reads that rectangle of the texture, addressed from the top-left', async ctx => {
    await withFilledTarget(ctx, async (context, _backend, target) => {
      const corner = await context.readPixels(target, { region: new Rectangle(SCENE_SIZE - 2, SCENE_SIZE - 2, 2, 2) });

      expect([corner.width, corner.height]).toEqual([2, 2]);
      expectColor([corner.data[0]!, corner.data[1]!, corner.data[2]!, corner.data[3]!], BOTTOM_RIGHT, 'bottom-right region');

      const origin = await context.readPixels(target, { region: new Rectangle(0, 0, 1, 1) });

      expectColor([origin.data[0]!, origin.data[1]!, origin.data[2]!, origin.data[3]!], TOP_LEFT, 'top-left region');
    });
  });

  test('a region whose rows do not fill the 256-byte stride still unpacks', async ctx => {
    await withFilledTarget(ctx, async (context, _backend, target) => {
      const side = 17;
      const origin = (SCENE_SIZE - side) / 2;
      // 17 pixels is 68 bytes a row against a 256-byte stride, so almost three
      // quarters of every staged row is padding. Straddling the centre puts one
      // quadrant in each corner, and a row picked up at the wrong offset shows
      // as the wrong colour rather than as noise.
      const middle = await context.readPixels(target, { region: new Rectangle(origin, origin, side, side) });

      expect([middle.width, middle.height]).toEqual([side, side]);
      expectQuadrantLayout(middle.data, side, expectColor, side);
    });
  });

  test('the bytes moved are reported on the frame stats', async ctx => {
    await withFilledTarget(ctx, async (context, backend, target) => {
      backend.resetStats();

      const frame = await context.readPixels(target);

      expect(backend.stats.downloadCount).toBe(1);
      expect(backend.stats.downloadBytes).toBe(frame.data.byteLength);
    });
  });

  test('a rectangle reaching outside the texture is refused rather than clamped', async ctx => {
    await withFilledTarget(ctx, async (context, _backend, target) => {
      await expect(context.readPixels(target, { region: new Rectangle(SCENE_SIZE - 1, 0, 4, 4) })).rejects.toThrow(/does not lie inside/);
    });
  });

  test('a float target is refused, naming its format', async ctx => {
    await withFilledTarget(ctx, async context => {
      const float = new RenderTexture(4, 4, { format: TextureFormat.Rgba16F });

      try {
        await expect(context.readPixels(float)).rejects.toThrow(/'rgba16f'/);
      } finally {
        float.destroy();
      }
    });
  });
});
