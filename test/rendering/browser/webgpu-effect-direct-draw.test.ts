/**
 * WebGPU half of the effect direct-draw pixel coverage.
 *
 * `RenderNode._drawTexture` and the stock `ColorMatrixFilter` / `BlurFilter` are
 * backend-neutral - they go through `backend.execute` and `backend.draw` - so
 * the switch to `drawDrawableDirect` changes the WebGPU path as much as the
 * WebGL2 one. WebGPU is also where it could plausibly break differently: a pass
 * is an explicit encoder object here, not ambient state, so a quad issued
 * outside the plan machinery is a real question about which encoder it lands
 * in.
 *
 * Deliberately narrower than the WebGL2 suite: the cases below are the ones
 * whose failure mode is backend-specific (pass/encoder routing, target
 * restore), not the ones that re-test filter arithmetic.
 *
 * The lane guarantees a real adapter, so there is no availability guard here -
 * a mid-test device loss is handled by `renderWebGpuOnce`, which skips.
 *
 * Run via:  pnpm test:browser:webgpu
 */
import { describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { makeTestApp, makeTestCanvas, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

const SIZE = 64;

const solidTexture = (color: string, width = 16, height = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = width;
  source.height = height;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, width, height);

  return new Texture(source);
};

const createBackend = async (): Promise<WebGpuBackend> => {
  const app: Application = makeTestApp(makeTestCanvas(SIZE), SIZE);
  const backend = new WebGpuBackend(app);

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

describe('effect direct-draw pixel behaviour (WebGPU)', () => {
  test('a ColorMatrixFilter composites back into the frame, not into its own target', async ctx => {
    const backend = await createBackend();
    const texture = solidTexture('#ffffff');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(16, 16);
      filtered.addFilter(new ColorMatrixFilter().tint(new Color(255, 0, 0)));
      filtered.addChild(sprite);
      root.addChild(filtered);

      if (!(await renderWebGpuOnce(ctx, backend, root))) {
        return;
      }

      const pixel = readWebGpuPixels(backend, SIZE);

      // A composite that stayed in the filter's own encoder leaves the frame
      // black here; one that ran before the filter leaves white.
      expectPixelNear(pixel(20, 20), [255, 0, 0, 255]);
      expectPixelNear(pixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('two filtered siblings each composite into the frame in order', async ctx => {
    const backend = await createBackend();
    const texture = solidTexture('#ffffff', 8, 8);
    const root = new Container();
    const first = new Sprite(texture);
    const second = new Sprite(texture);

    try {
      first.setPosition(8, 8);
      second.setPosition(40, 40);
      first.addFilter(new ColorMatrixFilter().tint(new Color(255, 0, 0)));
      second.addFilter(new ColorMatrixFilter().tint(new Color(0, 0, 255)));
      root.addChild(first);
      root.addChild(second);

      if (!(await renderWebGpuOnce(ctx, backend, root))) {
        return;
      }

      const pixel = readWebGpuPixels(backend, SIZE);

      expectPixelNear(pixel(10, 10), [255, 0, 0, 255]);
      expectPixelNear(pixel(42, 42), [0, 0, 255, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a cacheAsTexture replay draws the baked texture without re-running the filter', async ctx => {
    const backend = await createBackend();
    const texture = solidTexture('#ffffff');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(16, 16);
      filtered.addFilter(new ColorMatrixFilter().tint(new Color(0, 255, 0)));
      filtered.cacheAsTexture = true;
      filtered.addChild(sprite);
      root.addChild(filtered);

      if (!(await renderWebGpuOnce(ctx, backend, root))) {
        return;
      }

      expectPixelNear(readWebGpuPixels(backend, SIZE)(20, 20), [0, 255, 0, 255]);

      const bakePasses = backend.stats.renderPasses;

      // Frame two takes the bake branch: no capture pass and no filter pass,
      // only the direct composite draw of the cached texture.
      if (!(await renderWebGpuOnce(ctx, backend, root))) {
        return;
      }

      const replayed = readWebGpuPixels(backend, SIZE);

      expectPixelNear(replayed(20, 20), [0, 255, 0, 255]);
      expectPixelNear(replayed(4, 4), [0, 0, 0, 255]);
      // Compared against the bake frame rather than against zero: WebGPU counts
      // the frame's own encoder as a pass (WebGL2 does not), so the absolute
      // floor differs per backend while the drop does not.
      expect(backend.stats.renderPasses).toBeLessThan(bakePasses);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
