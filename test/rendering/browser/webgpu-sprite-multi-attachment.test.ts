/**
 * WebGPU counterpart of `webgl2-sprite-multi-attachment`: a sprite whose
 * material declares one fragment output per attachment writes every attachment
 * of a multi-target pass.
 *
 * This is the backend the `MultiRenderTarget` doc comment claimed could not do
 * it at all - a sprite pipeline was said to declare a single target - so the
 * assertion that matters here is the absence of a validation error alongside
 * the picture.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { MultiRenderTarget } from '#rendering/MultiRenderTarget';
import { RenderingContext } from '#rendering/RenderingContext';
import { Shader } from '#rendering/shader/Shader';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce, webGpuAvailable } from './_backendSetup';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 64;
const targetSize = 32;

/** Base colour into attachment 0, a constant marker into attachment 1. */
const twoSlotSpriteMaterial = (): SpriteMaterial =>
  new SpriteMaterial({
    shader: new Shader({
      wgsl: `
struct FragmentOutput {
    @location(0) colour: vec4<f32>,
    @location(1) marker: vec4<f32>,
};

@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    output.colour = sampleBase(input.textureSlot, input.texcoord) * input.color;
    output.marker = vec4<f32>(0.0, 1.0, 0.0, 1.0);

    return output;
}`,
    }),
  });

describe('WebGPU sprite in a multi-attachment pass', () => {
  test('a sprite with a two-output material writes both attachments', async ctx => {
    if (!(await webGpuAvailable())) {
      // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: no adapter on this machine
      ctx.skip('No WebGPU adapter available.');

      return;
    }

    const backend: WebGpuBackend = await createWebGpuTestBackend(canvasSize);
    const device = getBackendDevice(backend);
    const target = new MultiRenderTarget(targetSize, targetSize, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const context = new RenderingContext(backend);
    const material = twoSlotSpriteMaterial();
    const sprite = new Sprite(Texture.fromColor(new Color(255, 0, 0), 1));

    sprite.width = targetSize;
    sprite.height = targetSize;
    sprite.material = material;

    const colour = new Sprite(target.attachment(0));
    const marker = new Sprite(target.attachment(1));
    const display = new Container();

    marker.setPosition(targetSize, 0);
    display.addChild(colour, marker);

    const cleanup = (): void => {
      display.destroy();
      sprite.destroy();
      material.destroy();
      target.destroy();
      backend.destroy();
    };

    device.pushErrorScope('validation');

    try {
      // The multi-attachment draw is the thing under test, so its validation
      // scope is popped here rather than inside the helper that displays it.
      context.renderTo(sprite, { target, clear: Color.transparentBlack });
      backend.flush();

      expect(await device.popErrorScope()).toBeNull();

      if (!(await renderWebGpuOnce(ctx, backend, display))) {
        // The device was lost; `finally` still releases everything.
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expect(readPixel(16, 16)[0]).toBeGreaterThan(200);
      expect(readPixel(48, 16)[1]).toBeGreaterThan(200);
    } finally {
      cleanup();
    }
  });
});
