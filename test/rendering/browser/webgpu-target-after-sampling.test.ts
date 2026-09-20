/**
 * Rendering into a target that an earlier pass sampled, on WebGPU, where the
 * same shape must hold although the backend enforces it differently.
 *
 * A texture bound to a sampler unit while it is the framebuffer's colour
 * attachment is a feedback loop: the draw is dropped and nothing says so. The
 * binding does not have to come from the draw being made - a pass that sampled
 * the target last frame leaves its unit bound, and it is the NEXT frame's
 * render into that target that disappears. The frame loop below is the
 * smallest shape that produces it: draw into a texture, show that texture,
 * repeat.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { CallbackRenderPass } from '#rendering/CallbackRenderPass';
import { createFilterShader, ShaderFilter } from '#rendering/filters/ShaderFilter';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';

import { createWebGpuTestBackend, readWebGpuPixels } from './_backendSetup';

const size = 64;

describe('a target an earlier pass sampled (WebGPU)', () => {
  test('still takes what the next frame renders into it', async () => {
    const backend = await createWebGpuTestBackend(size);
    const context = new RenderingContext(backend);
    const passes = new RenderPipeline();
    const target = new RenderTexture(size, size);
    const square = new Sprite(Texture.fromColor(Color.white, 1));
    const shown = new Sprite(Texture.fromColor(Color.white, 1));

    context.view = new View(size / 2, size / 2, size, size);
    square.width = 32;
    square.height = 32;
    square.position.set(16, 16);
    shown.width = size;
    shown.height = size;

    // The second pass samples the target the way a filter does: as a texture
    // of its own, bound alongside the filter's input rather than as the input.
    const showShader = createFilterShader({
      glsl: {
        fragment: `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uProbe;

in vec2 vUv;
out vec4 fragColor;

void main() {
    fragColor = vec4(texture(uProbe, vUv).rgb, 1.0);
}
`,
      },
      wgsl: `@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(1) var uProbe: texture_2d<f32>;
@group(1) @binding(2) var uProbeSampler: sampler;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(textureSampleLevel(uProbe, uProbeSampler, vUv, 0.0).rgb, 1.0);
}
`,
    });
    const show = ShaderFilter.from(showShader, { textures: { uProbe: target } });

    shown.filters = [show];
    passes
      .addPass(new CallbackRenderPass(pass => pass.render(square, { view: context.view }), { target, clear: Color.transparentBlack, label: 'test:into' }))
      .addPass(new CallbackRenderPass(pass => pass.render(shown, { view: context.view }), { label: 'test:show' }));

    const frame = (): number => {
      backend.clear(Color.black);
      passes.execute(context);
      backend.flush();

      return readWebGpuPixels(backend, size)(size / 2, size / 2)[0]!;
    };

    try {
      expect(frame(), 'the first frame').toBe(255);
      expect(frame(), 'the frame after the target was sampled').toBe(255);
      expect(frame(), 'and the one after that').toBe(255);
    } finally {
      passes.destroy();
      show.destroy();
      square.destroy();
      shown.destroy();
      target.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
