/**
 * WebGPU: depth written by a mesh material and read back as a texture.
 *
 * The WebGL2 counterpart of this suite (`webgl2-depth-attachment`) asserts the
 * same three facts about the same scene. What is asserted is the ORDERING -
 * nearer is darker, untouched stays at the far plane - because the stored value
 * is each backend's own window-space mapping of the clip-space z and the two
 * mappings differ.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import { RenderingContext } from '#rendering/RenderingContext';
import { Shader } from '#rendering/shader/Shader';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce, webGpuAvailable } from './_backendSetup';

const canvasSize = 64;

const meshPreamble = `
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
`;

/** A material whose vertex stage pins every fragment at one clip-space depth. */
const depthWriter = (z: number): MeshMaterial =>
  new MeshMaterial({
    writesDepth: true,
    shader: new Shader({
      wgsl: `${meshPreamble}
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let world = u_mesh.translation * vec3<f32>(input.position, 1.0);
  let clip = u_mesh.projection * world;
  out.position = vec4<f32>(clip.xy, ${z.toFixed(2)}, 1.0);
  out.texcoord = input.texcoord;
  return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
`.trim(),
    }),
  });

/**
 * Reads the depth attachment of `source` and writes it out as greyscale. A
 * depth attachment binds as `texture_depth_2d` and yields a bare `f32`.
 */
const depthReader = (source: RenderTexture): MeshMaterial =>
  new MeshMaterial({
    shader: new Shader({
      wgsl: `${meshPreamble}
@group(2) @binding(1) var u_depth: texture_depth_2d;
@group(2) @binding(2) var u_depthSampler: sampler;

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
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
  let depth = textureSample(u_depth, u_depthSampler, in.texcoord);
  return vec4<f32>(depth, depth, depth, 1.0);
}
`.trim(),
    }),
    textures: { u_depth: source.depthTexture! },
  });

const quad = (width: number, height: number, material: MeshMaterial): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, width, 0, width, height, 0, 0, width, height, 0, height]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
    material,
  });

describe('WebGPU depth attachment', () => {
  test('a depth-writing material fills the attachment and a later pass samples it', async ctx => {
    if (!(await webGpuAvailable())) {
      // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: no WebGPU adapter on this machine
      ctx.skip('No WebGPU adapter available.');

      return;
    }

    const backend: WebGpuBackend = await createWebGpuTestBackend(canvasSize);
    const target = new RenderTexture(canvasSize, canvasSize, { depth: true });
    const context = new RenderingContext(backend);

    const nearMaterial = depthWriter(0.1);
    const farMaterial = depthWriter(0.9);
    const near = quad(24, canvasSize, nearMaterial);
    const far = quad(24, canvasSize, farMaterial);
    const scene = new Container();

    far.setPosition(24, 0);
    scene.addChild(near, far);

    const readerMaterial = depthReader(target);
    const display = quad(canvasSize, canvasSize, readerMaterial);

    try {
      context.renderTo(scene, { target, clear: Color.black });
      backend.flush();

      if (!(await renderWebGpuOnce(ctx, backend, display))) {
        return;
      }

      const pixel = readWebGpuPixels(backend, canvasSize);
      const nearPixel = pixel(12, 32);
      const farPixel = pixel(36, 32);
      const untouched = pixel(56, 32);

      // Nearer geometry is the smaller depth, and the strip nothing covered
      // still holds the clear value at the far plane.
      expect(nearPixel[0]).toBeLessThan(farPixel[0]);
      expect(farPixel[0]).toBeLessThan(untouched[0]);
      expect(untouched[0]).toBe(255);
    } finally {
      display.destroy();
      readerMaterial.destroy();
      scene.destroy();
      nearMaterial.destroy();
      farMaterial.destroy();
      target.destroy();
      backend.destroy();
    }
  });

  test('a target without the opt-in reports no depth texture and still draws', async ctx => {
    if (!(await webGpuAvailable())) {
      // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: no WebGPU adapter on this machine
      ctx.skip('No WebGPU adapter available.');

      return;
    }

    const backend: WebGpuBackend = await createWebGpuTestBackend(canvasSize);
    const target = new RenderTexture(canvasSize, canvasSize);
    const context = new RenderingContext(backend);
    const material = depthWriter(0.5);
    const mesh = quad(24, 24, material);

    try {
      expect(target.depthTexture).toBeNull();

      context.renderTo(mesh, { target, clear: Color.black });
      backend.flush();

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
    } finally {
      mesh.destroy();
      material.destroy();
      target.destroy();
      backend.destroy();
    }
  });
});
