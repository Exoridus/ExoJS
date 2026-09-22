/**
 * WebGL2 coverage for the one thing `MultiRenderTarget`'s doc comment used to
 * deny: a SPRITE carrying a material whose fragment shader declares one output
 * per attachment writes every attachment of a multi-target pass, exactly as a
 * mesh does. The guard admits it, and this is the picture that proves the draw
 * follows.
 *
 * Run via:  pnpm test:browser:webgl
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
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { expectPixelNear } from './_pixels';

const canvasSize = 64;
const targetSize = 32;

/**
 * A sprite material that writes its base colour to attachment 0 and a constant
 * marker to attachment 1 - two declared outputs, which is what the guard asks
 * of anything drawn into a two-attachment target.
 */
const twoSlotSpriteMaterial = (): SpriteMaterial =>
  new SpriteMaterial({
    shader: new Shader({
      glsl: {
        fragment: `#version 300 es
precision mediump float;
in vec2 v_texcoord;
in vec4 v_color;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outMarker;
void main() {
  outColor = sampleBase(v_textureSlot, v_texcoord) * v_color;
  outMarker = vec4(0.0, 1.0, 0.0, 1.0);
}`,
      },
    }),
  });

describe('WebGL2 sprite in a multi-attachment pass', () => {
  test('a sprite with a two-output material writes both attachments', async () => {
    const backend: WebGl2Backend = await createWebGl2TestBackend(canvasSize);
    const target = new MultiRenderTarget(targetSize, targetSize, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const context = new RenderingContext(backend);
    const material = twoSlotSpriteMaterial();
    const sprite = new Sprite(Texture.fromColor(new Color(255, 0, 0), 1));

    sprite.width = targetSize;
    sprite.height = targetSize;
    sprite.material = material;

    // Show both attachments side by side, so one read per attachment says
    // whether the single draw reached it.
    const colour = new Sprite(target.attachment(0));
    const marker = new Sprite(target.attachment(1));
    const display = new Container();

    marker.setPosition(targetSize, 0);
    display.addChild(colour, marker);

    try {
      context.renderTo(sprite, { target, clear: Color.transparentBlack });
      backend.flush();

      renderWebGl2Once(backend, display);

      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 48, 16), [0, 255, 0, 255]);
    } finally {
      display.destroy();
      sprite.destroy();
      material.destroy();
      target.destroy();
      backend.destroy();
    }
  });
});
