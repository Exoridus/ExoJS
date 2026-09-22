/**
 * WebGL2: `PixelReader` over a render texture.
 *
 * The one-shot `readPixels` blocks on this backend; the reader must not. The
 * observable half of that contract is that a read is never ready in the task
 * that requested it and lands a frame or more later through the frame-start
 * drain. The four-colour quadrant scene then proves the pack-buffer path
 * flips its rows the same way the blocking one does.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { beforeAll, describe, expect, test } from 'vitest';

import type { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createWebGl2TestBackend } from './_backendSetup';
import { driveUntilSettled } from './_pixelReaderDrive';
import type { RgbaTuple } from './_pixels';
import { BOTTOM_RIGHT, drawQuadrants, expectQuadrantLayout, SCENE_SIZE, TOP_LEFT } from './_readPixelsScene';

let backend: WebGl2Backend;
let context: RenderingContext;

const expectColor = (actual: RgbaTuple, expected: Color, where: string): void => {
  expect(`${where} ${actual.slice(0, 3).join(',')}`).toBe(`${where} ${[expected.r, expected.g, expected.b].join(',')}`);
};

const filledTarget = (): RenderTexture => {
  const target = new RenderTexture(SCENE_SIZE, SCENE_SIZE);

  drawQuadrants(context, target);
  backend.flush();

  return target;
};

const loseAndRestoreContext = async (): Promise<void> => {
  const gl = backend.context;
  const lose = gl.getExtension('WEBGL_lose_context');

  expect(lose, 'WEBGL_lose_context must be available to drive this test').not.toBeNull();

  const restored = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('webglcontextrestored not delivered within 5s')), 5000);

    backend.onContextRestored.add(() => {
      clearTimeout(timeout);
      resolve();
    });
  });

  lose!.loseContext();
  await restored;
};

beforeAll(async () => {
  backend = await createWebGl2TestBackend(SCENE_SIZE);
  context = new RenderingContext(backend);
});

describe('WebGL2 PixelReader', () => {
  test('is never ready in the task that requested it, then lands top-down', async () => {
    const target = filledTarget();
    const reader = context.createPixelReader(target);

    try {
      const read = reader.request()!;

      expect(read).not.toBeNull();
      expect([read.ready, read.failed]).toEqual([false, false]);

      // The drain in the same task must not see the fence signalled.
      backend.resetStats();
      expect(read.ready).toBe(false);

      await driveUntilSettled(backend, read);

      expect(read.failed).toBe(false);
      expect(read.data!.width).toBe(SCENE_SIZE);
      expectQuadrantLayout(read.data!.data, SCENE_SIZE, expectColor);
      expect(backend.context.getError()).toBe(backend.context.NO_ERROR);
    } finally {
      reader.destroy();
      target.destroy();
    }
  });

  test('a region read describes only its rectangle', async () => {
    const target = filledTarget();
    const reader = context.createPixelReader(target, { region: new Rectangle(SCENE_SIZE - 2, SCENE_SIZE - 2, 2, 2) });

    try {
      const read = reader.request()!;

      await driveUntilSettled(backend, read);

      const { width, height, data } = read.data!;

      expect([width, height, data.length]).toEqual([2, 2, 16]);
      expectColor([data[0]!, data[1]!, data[2]!, data[3]!], BOTTOM_RIGHT, 'corner');
    } finally {
      reader.destroy();
      target.destroy();
    }
  });

  test('delivers in request order, accounts the download, and reuses a released slot', async () => {
    const target = filledTarget();
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
      target.destroy();
    }
  });

  test('destroying the reader with a read in flight fails it and leaves the context clean', async () => {
    const target = filledTarget();
    const reader = context.createPixelReader(target);
    const read = reader.request()!;

    reader.destroy();

    expect([read.ready, read.failed]).toEqual([false, true]);
    expect(() => backend.resetStats()).not.toThrow();
    expect(backend.context.getError()).toBe(backend.context.NO_ERROR);
    target.destroy();
  });

  test('context loss fails the read in flight and the reader works again after restore', async () => {
    const target = filledTarget();
    const reader = context.createPixelReader(target);
    const lost = reader.request()!;

    try {
      await loseAndRestoreContext();

      expect([lost.ready, lost.failed]).toEqual([false, true]);
      lost.release();

      // The target's pixels died with the context; draw them again before
      // asking for them.
      drawQuadrants(context, target);
      backend.flush();

      const read = reader.request()!;

      expect(read.failed).toBe(false);

      await driveUntilSettled(backend, read);

      expectQuadrantLayout(read.data!.data, SCENE_SIZE, expectColor);
      expect(backend.context.getError()).toBe(backend.context.NO_ERROR);
    } finally {
      reader.destroy();
      target.destroy();
    }
  });
});
