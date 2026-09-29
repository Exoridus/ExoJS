import { afterEach, describe, expect, test } from 'vitest';

import { CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';
import { readWebgpuCompressedFormats } from '#rendering/webgpu/compressedFormat';
import { type WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createMockBackend, createMockWebGpuEnvironment, type MockWebGpuEnvironment } from './webgpuMockEnvironment';

describe('WebGpuBackend exact color formats', () => {
  let environment: MockWebGpuEnvironment | null = null;
  let backend: WebGpuBackend | null = null;

  afterEach(() => {
    backend?.destroy();
    environment?.restore();
    backend = null;
    environment = null;
  });

  test('realizes raw sRGB bytes as rgba8unorm-srgb without transforming them', async () => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);
    const bytes = new Uint8Array([128, 64, 32, 255]);
    const texture = Texture.fromPixels({ colorSpace: 'srgb', alphaMode: 'straight', levels: [{ data: bytes, width: 1, height: 1 }] });

    backend.getTextureBinding(texture);

    expect(backend.getTextureFormat(texture)).toBe('rgba8unorm-srgb');
    expect(environment.textureDescriptors().at(-1)?.format).toBe('rgba8unorm-srgb');
    expect(environment.writeTextureData().at(-1)).toBe(bytes);

    texture.destroy();
  });

  test('sizes the GPU texture for an authored raw mip chain so every level can be written', async () => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);
    const texture = Texture.fromPixels(
      {
        colorSpace: 'none',
        alphaMode: 'straight',
        levels: [
          { data: new Uint8Array(4 * 4 * 4), width: 4, height: 4 },
          { data: new Uint8Array(2 * 2 * 4), width: 2, height: 2 },
          { data: new Uint8Array(1 * 1 * 4), width: 1, height: 1 },
        ],
      },
      { generateMipMap: false },
    );

    backend.getTextureBinding(texture);

    expect(environment.textureDescriptors().at(-1)?.mipLevelCount).toBe(3);
    expect(environment.writeTextureData()).toHaveLength(3);

    texture.destroy();
  });

  test('stores a default external image destination as rgba8unorm-srgb', async () => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);
    const destinations: GPUCopyExternalImageDestInfo[] = [];
    const queue = backend.device.queue as GPUQueue & { copyExternalImageToTexture: GPUQueue['copyExternalImageToTexture'] };
    const originalCopy = queue.copyExternalImageToTexture.bind(queue);

    queue.copyExternalImageToTexture = ((source, destination, size) => {
      destinations.push(destination);
      originalCopy(source, destination, size);
    }) as GPUQueue['copyExternalImageToTexture'];

    const source = document.createElement('canvas');

    source.width = 1;
    source.height = 1;
    const texture = new Texture(source, { generateMipMap: false });

    (backend as unknown as { _canvasExternalImageCopySupported: boolean })._canvasExternalImageCopySupported = true;

    backend.getTextureBinding(texture);

    expect(destinations).toHaveLength(1);
    expect(backend.getTextureFormat(texture)).toBe('rgba8unorm-srgb');
    expect(destinations[0]?.colorSpace).toBeUndefined();

    texture.destroy();
  });

  test('keeps sRGB and float render-target formats exact through mip realization', async () => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);
    const srgb = new RenderTexture(4, 4, { format: TextureFormat.Rgba8Srgb, generateMipMap: true });
    const half = new RenderTexture(1, 1, { format: TextureFormat.Rgba16F });
    const full = new RenderTexture(1, 1, { format: TextureFormat.Rgba32F });

    backend.setRenderTarget(srgb);
    backend.submit({} as GPUCommandBuffer);

    expect(backend.getTextureFormat(srgb)).toBe('rgba8unorm-srgb');
    expect(backend.getTextureFormat(half)).toBe('rgba16float');
    expect(backend.getTextureFormat(full)).toBe('rgba32float');
    expect(environment.textureDescriptors().some(descriptor => descriptor.format === 'rgba8unorm-srgb')).toBe(true);
    expect(environment.pipelineTargetFormats().some(formats => formats.includes('rgba8unorm-srgb'))).toBe(true);

    srgb.destroy();
    half.destroy();
    full.destroy();
  });
});

describe('WebGPU compressed formats', () => {
  test('exposes sRGB compressed formats only when the granted device feature carries their family', () => {
    const features = new Set<GPUFeatureName>(['texture-compression-bc']);
    const support = readWebgpuCompressedFormats({ features } as unknown as GPUDevice);

    expect(support.gpuFormats.get(CompressedTextureFormat.Bc7RgbaUnormSrgb)).toBe('bc7-rgba-unorm-srgb');
    expect(support.gpuFormats.get(CompressedTextureFormat.Etc2Rgba8Srgb)).toBeUndefined();
    expect(support.formats).toContain(CompressedTextureFormat.Bc1RgbUnormSrgb);
  });
});
