/**
 * WebGPU: two colour attachments of one draw blended on different terms.
 *
 * The same scene as `webgl2-per-attachment-blend`, asserted against the same
 * numbers: one quad with two fragment outputs into a two-attachment target
 * cleared to opaque red, declaring `blendModes: [Normal, Additive]`. Both
 * attachments receive the same half-transparent blue fragment, so the blend
 * state is the only thing that can make them differ. Here it is pipeline state,
 * one `blend` per fragment target, and needs no device feature.
 *
 * Run via:  pnpm test:browser:webgpu
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
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce, webGpuAvailable } from './_backendSetup';

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
      wgsl: `
struct MeshUniforms {
  projection: mat3x3<f32>,
  translation: mat3x3<f32>,
  tint: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u_mesh: MeshUniforms;

@group(1) @binding(0) var u_texture: texture_2d<f32>;
@group(1) @binding(1) var u_sampler: sampler;

struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) texcoord: vec2<f32>,
  @location(2) color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) texcoord: vec2<f32>,
};

struct FragmentOut {
  @location(0) color: vec4<f32>,
  @location(1) id: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let world = u_mesh.translation * vec3<f32>(input.position, 1.0);
  let clip = u_mesh.projection * world;
  out.position = vec4<f32>(clip.xy, 0.0, 1.0);
  out.texcoord = input.texcoord;
  return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> FragmentOut {
  let value = vec4<f32>(0.0, 0.0, 0.5, 0.5);
  var out: FragmentOut;
  out.color = value;
  out.id = value;
  return out;
}
`.trim(),
    }),
  });

const quad = (width: number, height: number, material: MeshMaterial): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, width, 0, width, height, 0, 0, width, height, 0, height]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
    material,
  });

describe('WebGPU per-attachment blend', () => {
  test('each attachment of one draw is blended on its own terms', async ctx => {
    if (!(await webGpuAvailable())) {
      // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: no WebGPU adapter on this machine
      ctx.skip('No WebGPU adapter available.');

      return;
    }

    const backend: WebGpuBackend = await createWebGpuTestBackend(canvasSize);
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
      expect(backend.supportsPerAttachmentBlend).toBe(true);

      context.renderTo(mesh, { target, clear: backdrop });
      backend.flush();

      if (!(await renderWebGpuOnce(ctx, backend, display))) {
        return;
      }

      const pixel = readWebGpuPixels(backend, canvasSize);
      const alphaBlended = pixel(16, 16);
      const added = pixel(48, 16);

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
