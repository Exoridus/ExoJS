/**
 * Rendering into a target that an earlier pass sampled, on WebGL2.
 *
 * A texture bound to a sampler unit while it is the framebuffer's colour
 * attachment is a feedback loop: the draw is dropped and nothing says so. The
 * binding does not have to come from the draw being made - a pass that sampled
 * the target last frame leaves its unit bound, and it is the NEXT frame's
 * render into that target that disappears.
 *
 * The frame loop below is the smallest shape that produces it, and it also
 * covers what has to survive the release: the target is sampled again right
 * after being rendered into, and a second texture on another unit keeps its
 * own binding throughout.
 *
 * Run via:  pnpm test:browser:webgl
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

import { createWebGl2TestBackend, readWebGl2Pixel } from './_backendSetup';

const size = 64;

/**
 * Reads the target under test on one unit and a second texture on another, and
 * writes the two added together: a unit that lost its binding reads black, so
 * either half going missing is visible in the channel it owns.
 */
const showSource = {
  glsl: {
    fragment: `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uProbe;
uniform sampler2D uOther;

in vec2 vUv;
out vec4 fragColor;

void main() {
    fragColor = vec4(texture(uProbe, vUv).rgb + texture(uOther, vUv).rgb, 1.0);
}
`,
  },
  wgsl: `@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(1) var uProbe: texture_2d<f32>;
@group(1) @binding(2) var uProbeSampler: sampler;
@group(1) @binding(3) var uOther: texture_2d<f32>;
@group(1) @binding(4) var uOtherSampler: sampler;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(
        textureSampleLevel(uProbe, uProbeSampler, vUv, 0.0).rgb + textureSampleLevel(uOther, uOtherSampler, vUv, 0.0).rgb,
        1.0,
    );
}
`,
};

describe('a target an earlier pass sampled (WebGL2)', () => {
  test('still takes what the next frame renders into it, and gives it back when sampled again', async () => {
    const backend = await createWebGl2TestBackend(size);
    const context = new RenderingContext(backend);
    const passes = new RenderPipeline();
    const target = new RenderTexture(size, size);
    const square = new Sprite(Texture.fromColor(new Color(255, 0, 0), 1));
    const shown = new Sprite(Texture.fromColor(Color.white, 1));
    const other = Texture.fromColor(new Color(0, 255, 0), 1);
    const show = ShaderFilter.from(createFilterShader(showSource), { textures: { uProbe: target, uOther: other } });

    context.view = new View(size / 2, size / 2, size, size);
    square.width = 32;
    square.height = 32;
    square.position.set(16, 16);
    shown.width = size;
    shown.height = size;
    shown.filters = [show];

    passes
      .addPass(new CallbackRenderPass(pass => pass.render(square, { view: context.view }), { target, clear: Color.transparentBlack, label: 'test:into' }))
      .addPass(new CallbackRenderPass(pass => pass.render(shown, { view: context.view }), { label: 'test:show' }));

    const frame = async (): Promise<readonly [number, number]> => {
      backend.clear(Color.black);
      passes.execute(context);
      backend.flush();

      const read = readWebGl2Pixel(backend, size / 2, size / 2);

      return [read[0]!, read[1]!];
    };

    try {
      for (const round of [0, 1, 2]) {
        const [red, green] = await frame();

        // Red is the square this frame rendered INTO the target and then read
        // back out of it; green is the other texture, which shares no unit
        // with it and may not be lost when the target's bindings are released.
        expect(red, `the target's own content, round ${round}`).toBe(255);
        expect(green, `the texture beside it, round ${round}`).toBe(255);
      }
    } finally {
      passes.destroy();
      show.destroy();
      square.destroy();
      shown.destroy();
      other.destroy();
      target.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
