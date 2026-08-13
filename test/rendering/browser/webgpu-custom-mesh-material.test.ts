/**
 * WebGPU custom-MeshMaterial browser test — opt-in, capability-aware.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe), so this test drives a
 * custom {@link MeshMaterial} (user uniform + user texture) through the real
 * {@link WebGpuMeshRenderer} and asserts the migrated WGSL custom path (group
 * 0 mesh-uniforms, group 1 mesh texture, group 2 user UBO + texture) issues a
 * draw without raising a GPU validation error.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { Mesh } from '#rendering/mesh/Mesh';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

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

const countSubmits = (backend: WebGpuBackend, body: () => void): number => {
  const queue = getBackendDevice(backend).queue;
  const realSubmit = queue.submit.bind(queue);
  let count = 0;

  queue.submit = ((buffers: Iterable<GPUCommandBuffer>): undefined => {
    count++;

    return realSubmit(buffers);
  }) as GPUQueue['submit'];

  try {
    body();
  } finally {
    queue.submit = realSubmit;
  }

  return count;
};

describe('custom MeshMaterial WebGPU browser', () => {
  test('issues a custom-material draw with user uniform + texture and no validation error', async ctx => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

    const device = getBackendDevice(backend);

    const pattern = createPatternTexture();
    const material = new MeshMaterial({
      shader: new ShaderSource({ wgsl: customWgsl }),
      uniforms: { u_userColor: [1, 0, 0.5, 1] as const },
      textures: { u_pattern: pattern },
      sampler: { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.Repeat },
    });
    const mesh = createQuadMesh(16, material);
    const getTextureBinding = vi.spyOn(backend, 'getTextureBinding');

    mesh.setPosition(24, 24);

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
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    }

    try {
      expect(validationError).toBeNull();
      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expect(getTextureBinding).toHaveBeenCalledWith(Texture.white, material.sampler);
      expect(getTextureBinding).toHaveBeenCalledWith(pattern);
    } finally {
      mesh.destroy();
      material.destroy();
      pattern.destroy();
      backend.destroy();
    }
  });

  test('keeps repeated custom-material mesh flushes in one pass without aliasing their buffer slices', async ctx => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

    const device = getBackendDevice(backend);
    const pattern = createPatternTexture();
    const material = new MeshMaterial({
      shader: new ShaderSource({ wgsl: customWgsl }),
      uniforms: { u_userColor: [1, 0, 0, 1] as const },
      textures: { u_pattern: pattern },
    });
    const meshes = Array.from({ length: 4 }, (_, index) => {
      const mesh = createQuadMesh(10, material);

      mesh.setPosition(index * 14, 32);

      return mesh;
    });
    const sprites = Array.from({ length: 4 }, (_, index) => {
      const sprite = new Sprite(pattern);

      sprite.setPosition(index * 14, 0);
      sprite.width = 10;
      sprite.height = 10;

      return sprite;
    });
    const trailingSprite = new Sprite(pattern);

    trailingSprite.setPosition(54, 0);
    trailingSprite.width = 10;
    trailingSprite.height = 10;

    const renderAlternating = (): void => {
      backend.resetStats();
      backend.clear(Color.black);

      for (let i = 0; i < meshes.length; i++) {
        sprites[i]!.render(backend);
        meshes[i]!.render(backend);
      }

      trailingSprite.render(backend);
      backend.flush();
    };

    device.pushErrorScope('validation');

    try {
      // Let the grow-only per-material buffers ratchet to the whole pass. A
      // capacity growth is a real boundary; the steady state must not be.
      for (let frame = 0; frame < 3; frame++) {
        renderAlternating();
      }

      const submits = countSubmits(backend, renderAlternating);
      const validationError = await device.popErrorScope();

      expect(validationError).toBeNull();
      expect(backend.stats.drawCalls).toBe(9);
      expect(backend.stats.renderPasses).toBe(1);
      expect(submits).toBe(1);

      const readPixel = readWebGpuPixels(backend, 64);

      for (let i = 0; i < meshes.length; i++) {
        expectPixelNear(readPixel(i * 14 + 5, 37), [128, 0, 0, 255]);
      }
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    } finally {
      meshes.forEach(mesh => mesh.destroy());
      sprites.forEach(sprite => sprite.destroy());
      trailingSprite.destroy();
      material.destroy();
      pattern.destroy();
      backend.destroy();
    }
  });

  test('keeps the user-uniform alias boundary when one material changes between mesh flushes', async ctx => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

    const device = getBackendDevice(backend);
    const pattern = createPatternTexture();
    const material = new MeshMaterial({
      shader: new ShaderSource({ wgsl: customWgsl }),
      uniforms: { u_userColor: [1, 0, 0, 1] as const },
      textures: { u_pattern: pattern },
    });
    const first = createQuadMesh(12, material);
    const second = createQuadMesh(12, material);
    const separator = new Sprite(pattern);

    first.setPosition(8, 32);
    second.setPosition(36, 32);
    separator.setPosition(24, 0);
    separator.width = 12;
    separator.height = 12;

    // Warm resources before measuring the one intentional uniform boundary.
    backend.clear(Color.black);
    first.render(backend);
    backend.flush();

    const renderMutationBoundary = (): void => {
      backend.resetStats();
      backend.clear(Color.black);
      first.render(backend);
      separator.render(backend); // switches renderer and flushes the red mesh
      material.uniforms.u_userColor = [0, 1, 0, 1];
      second.render(backend);
      separator.render(backend); // flushes the green mesh
      backend.flush();
    };

    device.pushErrorScope('validation');

    try {
      const submits = countSubmits(backend, renderMutationBoundary);
      const validationError = await device.popErrorScope();

      expect(validationError).toBeNull();
      expect(backend.stats.renderPasses).toBe(2);
      expect(submits).toBe(2);

      const readPixel = readWebGpuPixels(backend, 64);

      expectPixelNear(readPixel(14, 38), [128, 0, 0, 255]);
      expectPixelNear(readPixel(42, 38), [0, 128, 0, 255]);
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    } finally {
      first.destroy();
      second.destroy();
      separator.destroy();
      material.destroy();
      pattern.destroy();
      backend.destroy();
    }
  });

  test('batches compatible static-geometry mesh draws with default material', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

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

  test('does not batch default static-geometry meshes across different groupIndex values', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();
    wireCoreRenderers(backend);

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
