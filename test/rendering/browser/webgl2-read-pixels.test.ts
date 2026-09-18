/**
 * WebGL2: `RenderingContext.readPixels` over a render texture.
 *
 * GL addresses pixels from the bottom-left and this API promises top-left, so
 * the four-colour quadrant scene is the assertion that matters - it fails on a
 * flip, a transpose or a rotation, where a solid fill would pass through all
 * three.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { beforeAll, describe, expect, test } from 'vitest';

import type { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createWebGl2TestBackend } from './_backendSetup';
import type { RgbaTuple } from './_pixels';
import { BOTTOM_RIGHT, drawQuadrants, expectQuadrantLayout, SCENE_SIZE, TOP_LEFT } from './_readPixelsScene';

let backend: WebGl2Backend;
let context: RenderingContext;

// Compared through a labelled string so a failure names the quadrant that
// moved, which is the whole diagnosis when rows come back in the wrong order.
const expectColor = (actual: RgbaTuple, expected: Color, where: string): void => {
  expect(`${where} ${actual.slice(0, 3).join(',')}`).toBe(`${where} ${[expected.r, expected.g, expected.b].join(',')}`);
};

const filledTarget = (): RenderTexture => {
  const target = new RenderTexture(SCENE_SIZE, SCENE_SIZE);

  drawQuadrants(context, target);
  backend.flush();

  return target;
};

beforeAll(async () => {
  backend = await createWebGl2TestBackend(SCENE_SIZE);
  context = new RenderingContext(backend);
});

describe('WebGL2 readPixels', () => {
  test('hands back top-down rows, not the bottom-up ones GL produces', async () => {
    const target = filledTarget();

    try {
      const frame = await context.readPixels(target);

      expect([frame.width, frame.height]).toEqual([SCENE_SIZE, SCENE_SIZE]);
      expect(frame.data).toHaveLength(SCENE_SIZE * SCENE_SIZE * 4);
      expectQuadrantLayout(frame.data, frame.width, expectColor);
    } finally {
      target.destroy();
    }
  });

  test('a region reads that rectangle of the texture, addressed from the top-left', async () => {
    const target = filledTarget();

    try {
      const corner = await context.readPixels(target, { region: new Rectangle(SCENE_SIZE - 2, SCENE_SIZE - 2, 2, 2) });

      expect([corner.width, corner.height]).toEqual([2, 2]);
      expectColor([corner.data[0]!, corner.data[1]!, corner.data[2]!, corner.data[3]!], BOTTOM_RIGHT, 'bottom-right region');

      const origin = await context.readPixels(target, { region: new Rectangle(0, 0, 1, 1) });

      expectColor([origin.data[0]!, origin.data[1]!, origin.data[2]!, origin.data[3]!], TOP_LEFT, 'top-left region');
    } finally {
      target.destroy();
    }
  });

  test('a region whose rows do not land on a 256-byte boundary still unpacks', async () => {
    const target = filledTarget();
    const side = 17;
    const origin = (SCENE_SIZE - side) / 2;

    try {
      // 17 pixels is 68 bytes a row, which WebGPU pads out to 256 and WebGL2
      // does not. Straddling the centre puts one quadrant in each corner, so a
      // row picked up at the wrong stride shows as the wrong colour here.
      const middle = await context.readPixels(target, { region: new Rectangle(origin, origin, side, side) });

      expect([middle.width, middle.height]).toEqual([side, side]);
      expectQuadrantLayout(middle.data, side, expectColor, side);
    } finally {
      target.destroy();
    }
  });

  test('the bytes moved are reported on the frame stats', async () => {
    const target = filledTarget();

    try {
      backend.resetStats();

      const frame = await context.readPixels(target);

      expect(backend.stats.downloadCount).toBe(1);
      expect(backend.stats.downloadBytes).toBe(frame.data.byteLength);
    } finally {
      target.destroy();
    }
  });

  test('a rectangle reaching outside the texture is refused rather than clamped', async () => {
    const target = filledTarget();

    try {
      await expect(context.readPixels(target, { region: new Rectangle(SCENE_SIZE - 1, 0, 4, 4) })).rejects.toThrow(/does not lie inside/);
    } finally {
      target.destroy();
    }
  });

  test('a float target is refused, naming its format', async () => {
    const target = new RenderTexture(4, 4, { format: TextureFormat.Rgba16F });

    try {
      await expect(context.readPixels(target)).rejects.toThrow(/'rgba16f'/);
    } finally {
      target.destroy();
    }
  });

  test('reading borrows no render target of its own', async () => {
    const first = filledTarget();
    const second = new RenderTexture(SCENE_SIZE, SCENE_SIZE);

    try {
      await context.readPixels(first);

      // A read that attached to a render target's framebuffer would leave its
      // attachment cache describing the source, and this draw would then land
      // in the wrong texture.
      drawQuadrants(context, second);
      backend.flush();

      const frame = await context.readPixels(second);

      expectQuadrantLayout(frame.data, frame.width, expectColor);
    } finally {
      second.destroy();
      first.destroy();
    }
  });
});
