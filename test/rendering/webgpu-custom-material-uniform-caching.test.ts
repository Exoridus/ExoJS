/**
 * WebGPU custom-material user-uniform flush hot-path caching (expert review B-10).
 *
 * The custom SpriteMaterial / MeshMaterial paths used to allocate a fresh
 * `Float32Array` and issue an unconditional `writeBuffer` for the group(2) user
 * UBO on EVERY flush, and rebuild the user bind group every flush — per-frame GC
 * pressure and buffer churn for any scene using custom materials. These tests
 * drive the REAL WebGpuBackend + renderers against a mock device (see
 * webgpuMockEnvironment) and require, after warmup:
 *
 * - a static frame re-uploads ZERO user uniforms and creates ZERO new user
 *   uniform buffers / bind groups while still drawing,
 * - mutating a uniform value re-uploads exactly once, with NO new buffer and NO
 *   new bind group (the persistent buffer is updated in place),
 * - a renderer disconnect (device-loss teardown) drops the caches so the next
 *   frame rebuilds cleanly, then returns to zero-churn steady state.
 */

import { Color } from '#core/Color';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { countLabel, createCanvasTexture, createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

const renderFrame = (backend: WebGpuBackend, nodes: readonly RenderNode[]): void => {
  backend.resetStats();
  backend.clear(Color.black);

  for (const node of nodes) {
    node.render(backend);
  }

  backend.flush();
};

// Fragment-only WGSL: the engine prepends the canonical sprite vertex module.
const spriteFragmentWgsl = `
struct UserUniforms { color: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let base = textureSample(u_texture, u_sampler, input.texcoord);
  return vec4<f32>(base.rgb * u_user.color.rgb, 1.0);
}
`.trim();

const meshWgsl = `
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
  return vec4<f32>(sampled.rgb * u_user.color.rgb, 1.0);
}
`.trim();

describe('WebGPU custom SpriteMaterial user-uniform flush caching', () => {
  const uniformLabel = 'sprite:material-user-uniform-buffer';
  const bindGroupLabel = 'sprite:material-user-bind-group';

  const makeSprite = (): { sprite: Sprite; material: SpriteMaterial } => {
    const material = new SpriteMaterial({
      shader: new ShaderSource({ wgsl: spriteFragmentWgsl }),
      uniforms: { u_userColor: [1, 0, 0.5, 1] },
    });
    const sprite = new Sprite(createCanvasTexture());

    sprite.material = material;

    return { sprite, material };
  };

  test('a static frame after warmup re-uploads no user uniforms and creates no new user buffers or bind groups', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const { sprite } = makeSprite();

      renderFrame(backend, [sprite]);

      // Warmup uploaded the user UBO once and created it once.
      expect(countLabel(environment.writeBufferLabels(), uniformLabel)).toBe(1);
      expect(countLabel(environment.createBufferLabels(), uniformLabel)).toBe(1);
      expect(countLabel(environment.bindGroupLabels(), bindGroupLabel)).toBe(1);

      const writeMark = environment.writeBufferLabels().length;
      const createMark = environment.createBufferLabels().length;
      const bindMark = environment.bindGroupLabels().length;
      const drawMark = environment.drawIndexedCount();

      renderFrame(backend, [sprite]);

      expect(environment.drawIndexedCount()).toBe(drawMark + 1);
      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writeMark)).toBe(0);
      expect(countLabel(environment.createBufferLabels(), uniformLabel, createMark)).toBe(0);
      expect(countLabel(environment.bindGroupLabels(), bindGroupLabel, bindMark)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('mutating a uniform value re-uploads exactly once with no new buffer and no new bind group', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const { sprite, material } = makeSprite();

      renderFrame(backend, [sprite]);
      renderFrame(backend, [sprite]); // steady state established

      const writeMark = environment.writeBufferLabels().length;
      const createMark = environment.createBufferLabels().length;
      const bindMark = environment.bindGroupLabels().length;

      material.uniforms.u_userColor = [0, 1, 0.25, 1];
      renderFrame(backend, [sprite]);

      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writeMark)).toBe(1);
      expect(countLabel(environment.createBufferLabels(), uniformLabel, createMark)).toBe(0);
      expect(countLabel(environment.bindGroupLabels(), bindGroupLabel, bindMark)).toBe(0);

      // Unchanged again → back to zero uploads.
      const writeAfterChange = environment.writeBufferLabels().length;

      renderFrame(backend, [sprite]);

      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writeAfterChange)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a renderer disconnect drops the caches so the next frame rebuilds, then returns to zero churn', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const { sprite } = makeSprite();

      renderFrame(backend, [sprite]);
      renderFrame(backend, [sprite]);

      // Simulate a device-loss teardown + recovery: disconnect and reconnect
      // every renderer (mirrors WebGpuBackend's reconnect path).
      backend.rendererRegistry.disconnect();
      backend.rendererRegistry.connect(backend);

      const writeMark = environment.writeBufferLabels().length;
      const createMark = environment.createBufferLabels().length;
      const bindMark = environment.bindGroupLabels().length;

      renderFrame(backend, [sprite]);

      // Clean rebuild: a fresh user UBO created + uploaded, fresh bind group.
      expect(countLabel(environment.createBufferLabels(), uniformLabel, createMark)).toBe(1);
      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writeMark)).toBe(1);
      expect(countLabel(environment.bindGroupLabels(), bindGroupLabel, bindMark)).toBe(1);

      // Steady state restored after the rebuild.
      const writeAfterRebuild = environment.writeBufferLabels().length;
      const bindAfterRebuild = environment.bindGroupLabels().length;

      renderFrame(backend, [sprite]);

      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writeAfterRebuild)).toBe(0);
      expect(countLabel(environment.bindGroupLabels(), bindGroupLabel, bindAfterRebuild)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});

describe('WebGPU custom MeshMaterial user-uniform flush caching', () => {
  const uniformLabel = 'mesh:material-user-uniform-buffer';
  const bindGroupLabel = 'mesh:material-user-bind-group';

  const makeMesh = (): { mesh: Mesh; material: MeshMaterial } => {
    const material = new MeshMaterial({
      shader: new ShaderSource({ wgsl: meshWgsl }),
      uniforms: { u_userColor: [1, 0, 0.5, 1] },
    });
    const mesh = new Mesh({
      vertices: new Float32Array([0, 0, 16, 0, 16, 16, 0, 0, 16, 16, 0, 16]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
      texture: createCanvasTexture(),
      material,
    });

    mesh.setPosition(24, 24);

    return { mesh, material };
  };

  test('a static frame after warmup re-uploads no user uniforms and creates no new user buffers or bind groups', async () => {
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

      expect(environment.drawIndexedCount()).toBe(drawMark + 1);
      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writeMark)).toBe(0);
      expect(countLabel(environment.createBufferLabels(), uniformLabel, createMark)).toBe(0);
      expect(countLabel(environment.bindGroupLabels(), bindGroupLabel, bindMark)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('mutating a uniform value re-uploads exactly once with no new buffer and no new bind group', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const { mesh, material } = makeMesh();

      renderFrame(backend, [mesh]);
      renderFrame(backend, [mesh]);

      const writeMark = environment.writeBufferLabels().length;
      const createMark = environment.createBufferLabels().length;
      const bindMark = environment.bindGroupLabels().length;

      material.uniforms.u_userColor = [0, 1, 0.25, 1];
      renderFrame(backend, [mesh]);

      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writeMark)).toBe(1);
      expect(countLabel(environment.createBufferLabels(), uniformLabel, createMark)).toBe(0);
      expect(countLabel(environment.bindGroupLabels(), bindGroupLabel, bindMark)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
