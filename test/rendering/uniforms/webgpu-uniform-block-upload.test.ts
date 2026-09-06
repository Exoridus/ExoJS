/**
 * The WebGPU half of the upload contract, for a material whose shader source
 * declares a typed uniform schema.
 *
 * The declared block owns its bytes, so the backend has no packing step to
 * diff: the whole decision is the block's revision. These tests drive the real
 * `WebGpuBackend` and mesh renderer against a mock device and require that a
 * static frame writes nothing, that an accessor write costs exactly one
 * `writeBuffer`, and that re-writing the same value costs none - the same
 * guarantee the untyped path already carries.
 */

import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderNode } from '#rendering/RenderNode';
import { UniformType } from '#rendering/uniforms/UniformType';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { countLabel, createCanvasTexture, createMockBackend, createMockWebGpuEnvironment } from '../webgpuMockEnvironment';

const renderFrame = (backend: WebGpuBackend, nodes: readonly RenderNode[]): void => {
  backend.resetStats();
  backend.clear(Color.black);

  for (const node of nodes) {
    node.render(backend);
  }

  backend.flush();
};

/** The user block is generated, so the body only reads through its instance name. */
const meshWgsl = `
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
  let sampled = textureSample(u_texture, u_sampler, in.texcoord);
  return vec4<f32>(sampled.rgb * uniforms.color.rgb * uniforms.strength, 1.0);
}
`.trim();

const declaration = { color: UniformType.Vec4, strength: UniformType.Float } as const;
const source = new ShaderSource({ wgsl: meshWgsl, uniforms: declaration });

const uniformLabel = 'mesh:material-user-uniform-buffer';
const bindGroupLabel = 'mesh:material-user-bind-group';

const makeMesh = (): { mesh: Mesh; material: MeshMaterial<typeof declaration> } => {
  const material = new MeshMaterial({ shader: source, uniforms: { color: [1, 0, 0.5, 1], strength: 1 } });
  const mesh = new Mesh({
    vertices: new Float32Array([0, 0, 16, 0, 16, 16, 0, 0, 16, 16, 0, 16]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
    texture: createCanvasTexture(),
    material,
  });

  mesh.setPosition(24, 24);

  return { mesh, material };
};

describe('WebGPU typed uniform block upload', () => {
  test('the block buffer is sized to the layout, not to a slot per name', () => {
    const { material } = makeMesh();

    // vec4 at 0, f32 at 16, padded to 32 - a slot per name would give the same
    // count here only by accident, so the layout size is asserted directly.
    expect(material._blocks[0]!.byteLength).toBe(32);
  });

  test('a static frame after warmup re-uploads nothing and creates no new buffer or bind group', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const { mesh } = makeMesh();

      renderFrame(backend, [mesh]);

      expect(countLabel(environment.writeBufferLabels(), uniformLabel)).toBe(1);
      expect(countLabel(environment.createBufferLabels(), uniformLabel)).toBe(1);
      expect(countLabel(environment.bindGroupLabels(), bindGroupLabel)).toBe(1);

      const writeMark = environment.writeBufferLabels().length;
      const createMark = environment.createBufferLabels().length;
      const bindMark = environment.bindGroupLabels().length;
      const drawMark = environment.drawIndexedCount();

      renderFrame(backend, [mesh]);

      expect(environment.drawIndexedCount()).toBeGreaterThan(drawMark);
      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writeMark)).toBe(0);
      expect(countLabel(environment.createBufferLabels(), uniformLabel, createMark)).toBe(0);
      expect(countLabel(environment.bindGroupLabels(), bindGroupLabel, bindMark)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('an accessor write costs one upload, and writing the same value again costs none', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const { mesh, material } = makeMesh();

      renderFrame(backend, [mesh]);
      renderFrame(backend, [mesh]);

      const writeMark = environment.writeBufferLabels().length;
      const createMark = environment.createBufferLabels().length;
      const bindMark = environment.bindGroupLabels().length;

      material.uniforms.color.set(0, 1, 0.25, 1);
      renderFrame(backend, [mesh]);

      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writeMark)).toBe(1);
      expect(countLabel(environment.createBufferLabels(), uniformLabel, createMark)).toBe(0);
      expect(countLabel(environment.bindGroupLabels(), bindGroupLabel, bindMark)).toBe(0);

      const settled = environment.writeBufferLabels().length;

      material.uniforms.color.set(0, 1, 0.25, 1);
      renderFrame(backend, [mesh]);

      expect(countLabel(environment.writeBufferLabels(), uniformLabel, settled)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('two materials on one source upload independently', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const first = makeMesh();
      const second = makeMesh();

      renderFrame(backend, [first.mesh, second.mesh]);
      renderFrame(backend, [first.mesh, second.mesh]);

      const writeMark = environment.writeBufferLabels().length;

      first.material.uniforms.strength.set(0.5);
      renderFrame(backend, [first.mesh, second.mesh]);

      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writeMark)).toBe(1);
      expect(second.material.uniforms.strength.value).toBe(1);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
