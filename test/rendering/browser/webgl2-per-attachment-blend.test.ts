/**
 * WebGL2: two colour attachments of one draw blended on different terms.
 *
 * One quad with two fragment outputs goes into a two-attachment target cleared
 * to opaque red, declaring `blendModes: [Normal, Additive]`. Both attachments
 * receive the same half-transparent blue fragment, so the only thing that can
 * make them differ is the blend state - the alpha-blended slot keeps half of the
 * red backdrop, the additive one keeps all of it.
 *
 * Skipped where the device has no `OES_draw_buffers_indexed`; that is a
 * capability, and the engine refuses such a draw rather than picking one mode.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import { MultiRenderTarget } from '#rendering/MultiRenderTarget';
import { RenderingContext } from '#rendering/RenderingContext';
import { Shader } from '#rendering/shader/Shader';
import { Sprite } from '#rendering/sprite/Sprite';
import { BlendModes, TextureFormat } from '#rendering/types';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';

const canvasSize = 64;
const targetSize = 32;

/** The backdrop every attachment starts from. */
const backdrop = new Color(255, 0, 0);

/**
 * Writes the same premultiplied half-alpha blue into both attachments, so the
 * two results can only differ by how each one is blended.
 */
const twoSlotWriter = (blendModes?: readonly BlendModes[]): MeshMaterial =>
  new MeshMaterial({
    ...(blendModes !== undefined ? { blendModes } : {}),
    shader: new Shader({
      glsl: {
        vertex: `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_position;
uniform mat3 u_projection;
uniform mat3 u_translation;
void main() {
  gl_Position = vec4((u_projection * u_translation * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}`,
        fragment: `#version 300 es
precision mediump float;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outId;
void main() {
  vec4 value = vec4(0.0, 0.0, 0.5, 0.5);
  outColor = value;
  outId = value;
}`,
      },
    }),
  });

const quad = (width: number, height: number, material: MeshMaterial): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, width, 0, width, height, 0, 0, width, height, 0, height]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
    material,
  });

describe('WebGL2 per-attachment blend', () => {
  test('each attachment of one draw is blended on its own terms', async ctx => {
    const backend: WebGl2Backend = await createWebGl2TestBackend(canvasSize);

    // Asked of the context directly, not through the capability: a broken probe
    // would otherwise turn the only real-GPU proof of this feature green by
    // skipping it. A device that has the extension must run the test, and the
    // capability must agree that it does.
    const available = backend.context.getExtension('OES_draw_buffers_indexed') !== null;

    if (!available) {
      backend.destroy();
      // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
      ctx.skip('This device has no OES_draw_buffers_indexed, so attachments cannot blend differently.');

      return;
    }

    expect(backend.supportsPerAttachmentBlend).toBe(true);

    const target = new MultiRenderTarget(targetSize, targetSize, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const context = new RenderingContext(backend);
    const material = twoSlotWriter([BlendModes.Normal, BlendModes.Additive]);
    const mesh = quad(targetSize, targetSize, material);

    const blended = new Sprite(target.attachment(0));
    const additive = new Sprite(target.attachment(1));
    const display = new Container();

    additive.setPosition(targetSize, 0);
    display.addChild(blended, additive);

    try {
      context.renderTo(mesh, { target, clear: backdrop });
      backend.flush();

      renderWebGl2Once(backend, display);

      const alphaBlended = readWebGl2Pixel(backend, 16, 16);
      const added = readWebGl2Pixel(backend, 48, 16);

      // Alpha blending keeps (1 - 0.5) of the red backdrop, addition keeps all
      // of it; blue is the source and comes out the same on both, which is what
      // says the one draw reached both attachments.
      expect(alphaBlended[0]).toBeGreaterThan(108);
      expect(alphaBlended[0]).toBeLessThan(148);
      expect(added[0]).toBeGreaterThan(235);
      expect(alphaBlended[2]).toBeGreaterThan(108);
      expect(added[2]).toBeGreaterThan(108);
    } finally {
      display.destroy();
      mesh.destroy();
      material.destroy();
      target.destroy();
      backend.destroy();
    }
  });
});
