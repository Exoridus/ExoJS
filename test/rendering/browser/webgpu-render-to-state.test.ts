/**
 * What a render into a caller's own target leaves behind, on WebGPU, where
 * the save and restore go through the pass coordinator rather than through the
 * backend's own target and view.
 *
 * `renderTo` saves the target and the view and puts them back, and a frame
 * that runs after one has to draw what it drew before. The case is small on
 * purpose: no lighting, one pass, one sprite, and a read either side of the
 * call, so a failure here is a failure of the backend's own state and of
 * nothing else.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { CallbackRenderPass } from '#rendering/CallbackRenderPass';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';

import { createWebGpuTestBackend, readWebGpuFrame, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';

const size = 32;

describe('a render into a caller-owned target (WebGPU)', () => {
  test.for([
    [0, 1],
    [1, 0],
  ])('collapsed viewports (%s, %s) draw no pixels and remain WebGPU-valid', async ([width, height], ctx) => {
    const backend = await createWebGpuTestBackend(size);
    const texture = Texture.fromColor(Color.white, 1);
    const sprite = new Sprite(texture);

    sprite.width = size;
    sprite.height = size;

    try {
      if (!(await renderWebGpuOnce(ctx, backend, sprite))) {
        return;
      }

      expect(readWebGpuFrame(backend, size).filter((value, index) => index % 4 === 0 && value > 0).length).toBe(size * size);
      backend.view.setViewport(0.25, 0.25, width, height);

      if (!(await renderWebGpuOnce(ctx, backend, sprite))) {
        return;
      }

      expect(readWebGpuFrame(backend, size).filter((value, index) => index % 4 !== 3 && value > 0).length).toBe(0);
    } finally {
      sprite.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('leaves the frame that follows it drawing what it drew before', async () => {
    const backend = await createWebGpuTestBackend(size);
    const context = new RenderingContext(backend);
    const passes = new RenderPipeline();
    const white = new Sprite(Texture.fromColor(Color.white, 1));
    const aside = new Sprite(Texture.fromColor(new Color(255, 0, 0), 1));
    const elsewhere = new RenderTexture(size, size);

    context.view = new View(size / 2, size / 2, size, size);
    white.width = size;
    white.height = size;
    aside.width = size;
    aside.height = size;
    passes.addPass(new CallbackRenderPass(pass => pass.render(white, { view: context.view }), { label: 'test:white' }));

    const frame = (): number => {
      backend.clear(Color.black);
      passes.execute(context);
      backend.flush();

      return readWebGpuPixels(backend, size)(size / 2, size / 2)[0]!;
    };

    try {
      expect(frame(), 'the first frame').toBe(255);

      const targetBefore = backend.renderTarget;
      const viewBefore = backend.view;

      context.renderTo(aside, { target: elsewhere, clear: Color.black });

      expect(backend.renderTarget, 'the target the frame was pointed at').toBe(targetBefore);
      expect(backend.view, 'the view the frame was pointed at').toBe(viewBefore);
      expect(frame(), 'the frame after it').toBe(255);
    } finally {
      passes.destroy();
      white.destroy();
      aside.destroy();
      elsewhere.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
