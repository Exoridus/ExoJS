/**
 * WebGPU custom-MeshMaterial browser test — opt-in, capability-aware.
 *
 * Skips gracefully when WebGPU is unavailable (navigator.gpu absent or no
 * adapter), matching webgpu-smoke.test.ts. When WebGPU IS available it drives a
 * custom {@link MeshMaterial} (user uniform + user texture) through the real
 * {@link WebGpuMeshRenderer} and asserts the migrated WGSL custom path (group
 * 0 mesh-uniforms, group 1 mesh texture, group 2 user UBO + texture) issues a
 * draw without raising a GPU validation error.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { Container } from '@/rendering/Container';
import { Geometry } from '@/rendering/geometry/Geometry';
import { MeshMaterial } from '@/rendering/material/MeshMaterial';
import { ShaderSource } from '@/rendering/material/ShaderSource';
import { Mesh } from '@/rendering/mesh/Mesh';
import { Texture } from '@/rendering/texture/Texture';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';

// Custom WGSL honouring the mesh contract: group(0) auto-bound mesh uniforms,
// group(1) the mesh's own texture+sampler, group(2) the user UBO followed by
// the user texture+sampler (declaration order = bind order).
const customWgsl = `
struct MeshUniforms {
  projection: mat3x3<f32>,
  translation: mat3x3<f32>,
  tint: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u_mesh: MeshUniforms;

@group(1) @binding(0) var u_texture: texture_2d<f32>;
@group(1) @binding(1) var u_sampler: sampler;

struct UserUniforms { color: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;
@group(2) @binding(1) var u_pattern: texture_2d<f32>;
@group(2) @binding(2) var u_patternSampler: sampler;

struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) texcoord: vec2<f32>,
  @location(2) color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) texcoord: vec2<f32>,
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
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
  let sampled = textureSample(u_pattern, u_patternSampler, in.texcoord);
  return vec4<f32>(sampled.rgb * u_user.color.rgb, 1.0);
}
`.trim();

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: 64, height: 64 },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const createPatternTexture = (): Texture => {
  const source = document.createElement('canvas');

  source.width = 8;
  source.height = 8;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = 'rgb(128, 128, 128)';
  context.fillRect(0, 0, source.width, source.height);

  return new Texture(source);
};

const createQuadMesh = (size: number, material: MeshMaterial): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, size, 0, size, size, 0, 0, size, size, 0, size]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
    material,
  });

const createQuadGeometry = (size: number): Geometry => {
  const stride = 20;
  const vertexCount = 6;
  const data = new ArrayBuffer(vertexCount * stride);
  const view = new DataView(data);
  const positions = [
    [0, 0, 0, 0],
    [size, 0, 1, 0],
    [size, size, 1, 1],
    [0, 0, 0, 0],
    [size, size, 1, 1],
    [0, size, 0, 1],
  ] as const;

  for (let i = 0; i < vertexCount; i++) {
    const base = i * stride;
    const [x, y, u, v] = positions[i];

    view.setFloat32(base + 0, x, true);
    view.setFloat32(base + 4, y, true);
    view.setFloat32(base + 8, u, true);
    view.setFloat32(base + 12, v, true);
    view.setUint8(base + 16, 255);
    view.setUint8(base + 17, 255);
    view.setUint8(base + 18, 255);
    view.setUint8(base + 19, 255);
  }

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    vertexData: data,
    stride,
    usage: 'static',
  });
};

describe('custom MeshMaterial WebGPU browser', () => {
  test('issues a custom-material draw with user uniform + texture and no validation error', async ctx => {
    if (!navigator.gpu) {
      ctx.skip('WebGPU unavailable: navigator.gpu is absent');
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      ctx.skip('WebGPU unavailable: requestAdapter() returned null');
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();

    const pattern = createPatternTexture();
    const material = new MeshMaterial({
      shader: new ShaderSource({ wgsl: customWgsl }),
      uniforms: { u_userColor: [1, 0, 0.5, 1] as const },
      textures: { u_pattern: pattern },
    });
    const mesh = createQuadMesh(16, material);

    mesh.setPosition(24, 24);

    const device = backend.device;

    device.pushErrorScope('validation');

    let validationError: GPUError | null;

    try {
      backend.resetStats();
      backend.clear(Color.black);
      mesh.render(backend);
      backend.flush();
      validationError = await device.popErrorScope();
    } catch (error) {
      // The software (swiftshader) adapter used in CI can drop the device
      // mid-test ("Instance dropped in popErrorScope"); treat that as an
      // unavailable-adapter skip rather than a failure.
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        mesh.destroy();
        material.destroy();
        pattern.destroy();
        backend.destroy();
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    }

    try {
      expect(validationError).toBeNull();
      expect(backend.stats.drawCalls).toBeGreaterThan(0);
    } finally {
      mesh.destroy();
      material.destroy();
      pattern.destroy();
      backend.destroy();
    }
  });

  test('batches compatible static-geometry mesh draws with default material', async ctx => {
    if (!navigator.gpu) {
      ctx.skip('WebGPU unavailable: navigator.gpu is absent');
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      ctx.skip('WebGPU unavailable: requestAdapter() returned null');
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();

    const root = new Container();
    const texture = Texture.white;
    const geometry = createQuadGeometry(12);
    const first = new Mesh({ geometry, texture });
    const second = new Mesh({ geometry, texture });

    first.setPosition(8, 20);
    second.setPosition(28, 20);
    root.addChild(first, second);

    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();

    try {
      expect(backend.stats.drawCalls).toBe(1);
    } finally {
      root.destroy();
      geometry.destroy();
      backend.destroy();
    }
  });

  test('does not batch default static-geometry meshes across different groupIndex values', async ctx => {
    if (!navigator.gpu) {
      ctx.skip('WebGPU unavailable: navigator.gpu is absent');
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
      ctx.skip('WebGPU unavailable: requestAdapter() returned null');
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();

    const root = new Container();
    const texture = Texture.white;
    const geometry = createQuadGeometry(12);
    const first = new Mesh({ geometry, texture });
    const second = new Mesh({ geometry, texture });

    first.setPosition(8, 20);
    second.setPosition(28, 20);
    first.zIndex = 0;
    second.zIndex = 1;
    root.addChild(first, second);

    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();

    try {
      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      geometry.destroy();
      backend.destroy();
    }
  });
});
