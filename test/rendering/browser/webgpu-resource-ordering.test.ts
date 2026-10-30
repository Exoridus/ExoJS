import { describe, expect, test, vi } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import { RenderingContext } from '#rendering/RenderingContext';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Shader } from '#rendering/shader/Shader';
import { Sprite } from '#rendering/sprite/Sprite';
import { Text } from '#rendering/text/Text';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuTextureNormalizer } from '#rendering/webgpu/WebGpuTextureNormalizer';

import { createWebGpuTestBackend } from './_backendSetup';

const readMip = async (device: GPUDevice, texture: GPUTexture, mipLevel: number, width: number, height: number): Promise<number[]> => {
  const buffer = device.createBuffer({ size: 256 * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture, mipLevel }, { buffer, bytesPerRow: 256 }, { width, height });
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(buffer.getMappedRange());
  const result: number[] = [];

  for (let row = 0; row < height; row++) {
    result.push(...mapped.subarray(row * 256, row * 256 + width * 4));
  }

  buffer.unmap();
  buffer.destroy();

  return result;
};

const red = [128, 0, 0, 128];
const green = [0, 128, 0, 128];
const blue = [0, 0, 128, 128];

describe('WebGPU resource ordering pixels', () => {
  test('normalizes distinct authored mip inputs and smaller reused staging extents', async () => {
    const backend = await createWebGpuTestBackend(16);
    const device = backend.device;
    const normalizer = new WebGpuTextureNormalizer(device);
    const destination = device.createTexture({
      size: [4, 4],
      mipLevelCount: 3,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
    });
    device.pushErrorScope('validation');

    try {
      normalizer.normalizeLevels(destination, 'rgba8unorm', [
        { width: 4, height: 4, data: new Uint8Array(Array.from({ length: 16 }, () => [255, 0, 0, 128]).flat()) },
        { width: 2, height: 2, data: new Uint8Array([0, 255, 0, 128, 0, 0, 255, 128, 0, 0, 255, 128, 0, 255, 0, 128]) },
        { width: 1, height: 1, data: new Uint8Array([0, 0, 255, 128]) },
      ]);
      expect(await readMip(device, destination, 0, 4, 4)).toEqual(Array.from({ length: 16 }, () => red).flat());
      expect(await readMip(device, destination, 1, 2, 2)).toEqual([...green, ...blue, ...blue, ...green]);
      expect(await readMip(device, destination, 2, 1, 1)).toEqual(blue);

      const smaller = device.createTexture({
        size: [2, 2],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
      });
      normalizer.normalizeLevels(smaller, 'rgba8unorm', [
        {
          width: 2,
          height: 2,
          data: new Uint8Array([255, 0, 0, 128, 0, 255, 0, 128, 0, 0, 255, 128, 255, 0, 0, 128]),
        },
      ]);
      expect(await readMip(device, smaller, 0, 2, 2)).toEqual([...red, ...green, ...blue, ...red]);
      smaller.destroy();
      expect(await device.popErrorScope()).toBeNull();
    } finally {
      normalizer.destroy();
      destination.destroy();
      backend.destroy();
    }
  });

  test('preserves old and new additional material texture versions within one frame', async () => {
    const backend = await createWebGpuTestBackend(16);
    const context = new RenderingContext(backend);
    const target = new RenderTexture(16, 16);
    const bytes = new Uint8Array([255, 0, 0, 255]);
    const extra = Texture.fromPixels(
      { colorSpace: 'srgb', alphaMode: 'straight', levels: [{ width: 1, height: 1, data: bytes }] },
      { generateMipMap: false },
    );
    const base = Texture.fromColor(Color.white, 4);
    const material = new SpriteMaterial({
      shader: new Shader({
        wgsl: `
struct UserUniforms { color: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;
@group(2) @binding(1) var extra: texture_2d<f32>;
@group(2) @binding(2) var extraSampler: sampler;
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return textureSample(extra, extraSampler, input.texcoord) * u_user.color;
}`,
      }),
      uniforms: { u_color: new Float32Array([1, 1, 1, 1]), u_extra: extra },
    });
    const left = new Sprite(base);
    const right = new Sprite(base);
    left.material = right.material = material;
    right.x = 8;
    backend.setRenderTarget(target);
    backend.device.pushErrorScope('validation');

    try {
      backend.clear(Color.black);

      for (let index = 0; index < 4; index++) {
        left.render(backend);
      }

      backend.flush();
      backend.clear(Color.black);
      left.render(backend);
      backend.rendererRegistry.resolve(left).flush();
      bytes.set([0, 0, 255, 255]);
      extra.setPixels({ colorSpace: 'srgb', alphaMode: 'straight', levels: [{ width: 1, height: 1, data: bytes }] });
      right.render(backend);
      backend.flush();
      const pixels = (await context.readPixels(target)).data;
      expect(Array.from(pixels.slice((1 * 16 + 1) * 4, (1 * 16 + 1) * 4 + 4))).toEqual([255, 0, 0, 255]);
      expect(Array.from(pixels.slice((1 * 16 + 9) * 4, (1 * 16 + 9) * 4 + 4))).toEqual([0, 0, 255, 255]);
      expect(await backend.device.popErrorScope()).toBeNull();
    } finally {
      left.destroy();
      right.destroy();
      material.destroy();
      base.destroy();
      extra.destroy();
      target.destroy();
      backend.destroy();
    }
  });

  test('replays a mixed mesh and text group without repeated state buffers', async () => {
    const backend = await createWebGpuTestBackend(32);
    const context = new RenderingContext(backend);
    const target = new RenderTexture(32, 32);
    const texture = Texture.fromColor(new Color(255, 0, 0), 4);
    const geometry = new Geometry({
      attributes: [
        { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
        { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      ],
      vertexData: new Float32Array([0, 0, 0, 0, 4, 0, 1, 0, 4, 4, 1, 1, 0, 4, 0, 1]),
      stride: 16,
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    });
    const group = new RetainedContainer();
    const root = new Container();
    root.addChild(group);
    group.preserveDrawOrder = true;
    const first = new Mesh({ geometry, texture });
    const second = new Mesh({ geometry, texture });
    second.x = 8;
    const text = new Text('M', { fontSize: 12, fillColor: Color.white });
    text.y = 12;
    group.addChild(first, second, text);
    backend.setRenderTarget(target);
    backend.device.pushErrorScope('validation');
    const buffers = vi.spyOn(backend.device, 'createBuffer');

    const render = (): void => {
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();
    };

    try {
      render();
      render();
      render();
      const instructions = (group as unknown as { _fragment: RetainedGroupFragment })._fragment.instructions;
      expect(instructions?.hasRecording).toBe(true);
      expect(instructions?.instructions).toHaveLength(2);
      const baseline = (await context.readPixels(target)).data;
      expect(Array.from(baseline.slice((1 * 32 + 1) * 4, (1 * 32 + 1) * 4 + 4))).toEqual([255, 0, 0, 255]);
      expect(baseline.some((value, index) => index % 4 === 1 && value > 0)).toBe(true);
      const mark = buffers.mock.calls.length;

      for (let frame = 0; frame < 10; frame++) {
        render();
      }

      expect(buffers.mock.calls).toHaveLength(mark);
      expect((await context.readPixels(target)).data).toEqual(baseline);
      expect(await backend.device.popErrorScope()).toBeNull();
    } finally {
      buffers.mockRestore();
      root.destroy();
      geometry.destroy();
      texture.destroy();
      target.destroy();
      backend.destroy();
    }
  });
});
