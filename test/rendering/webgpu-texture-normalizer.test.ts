import { afterEach, describe, expect, test } from 'vitest';

import { Texture } from '#rendering/texture/Texture';
import { ScaleModes } from '#rendering/types';
import { textureNormalizeWgsl, WebGpuTextureNormalizer } from '#rendering/webgpu/WebGpuTextureNormalizer';

import { createMockBackend, createMockWebGpuEnvironment, type MockWebGpuEnvironment } from './webgpuMockEnvironment';

const srgbOf = (linear: number): number => Math.round(255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055));

const straightTexture = (
  bytes: number[],
  options: { colorSpace?: 'srgb' | 'linear-srgb'; alphaMode?: 'straight' | 'premultiplied'; premultiplyAlpha?: boolean } = {},
): Texture =>
  Texture.fromPixels(
    {
      colorSpace: options.colorSpace ?? 'srgb',
      alphaMode: options.alphaMode ?? 'straight',
      levels: [{ data: new Uint8Array(bytes), width: 1, height: 1 }],
    },
    options.premultiplyAlpha === undefined ? undefined : { premultiplyAlpha: options.premultiplyAlpha },
  );

const NORMALIZE_PASS = 'backend:color-normalize-pass';

describe('WebGPU managed-colour alpha normalization', () => {
  let environment: MockWebGpuEnvironment | null = null;

  afterEach(() => {
    environment?.restore();
    environment = null;
  });

  test('runs one unblended 1:1 pass from straight sRGB bytes into an sRGB destination', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const texture = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 64]);

    backend.getTextureBinding(texture);

    // The destination is sRGB storage, the straight bytes went to a scratch
    // texture rather than the destination, and one pass wrote the level.
    expect(environment.textureDescriptors().some(entry => entry.format === 'rgba8unorm-srgb')).toBe(true);
    expect(environment.renderPassLabels()).toContain(NORMALIZE_PASS);
    // Four bytes per texel: a 1x1 level stages one row of four.
    expect(environment.writeTextureRows()).toContain(4);

    texture.destroy();
    backend.destroy();
  });

  test('normalizes a linear-srgb payload through a linear destination', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const texture = straightTexture([128, 128, 128, 128], { colorSpace: 'linear-srgb' });

    backend.getTextureBinding(texture);

    expect(environment.renderPassLabels()).toContain(NORMALIZE_PASS);
    expect(environment.textureDescriptors().every(entry => entry.format !== 'rgba8unorm-srgb')).toBe(true);

    texture.destroy();
    backend.destroy();
  });

  test('skips a source that is already premultiplied instead of multiplying twice', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const texture = straightTexture([64, 32, 16, 64], { alphaMode: 'premultiplied' });

    backend.getTextureBinding(texture);

    expect(environment.renderPassLabels()).not.toContain(NORMALIZE_PASS);
    // Straight bytes went to the destination itself, not to a scratch texture.
    expect(environment.writeTextureRows()).toEqual([4]);

    texture.destroy();
    backend.destroy();
  });

  test('skips a source that asks for no normalization', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const texture = straightTexture([64, 32, 16, 64], { premultiplyAlpha: false });

    backend.getTextureBinding(texture);

    expect(environment.renderPassLabels()).not.toContain(NORMALIZE_PASS);

    texture.destroy();
    backend.destroy();
  });

  test('skips a fully opaque level, which multiplying by alpha cannot change', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const texture = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 255]);

    backend.getTextureBinding(texture);

    expect(environment.renderPassLabels()).not.toContain(NORMALIZE_PASS);
    expect(environment.writeTextureRows()).toEqual([4]);

    texture.destroy();
    backend.destroy();
  });

  test('never sends numeric data through the pass', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const texture = Texture.fromPixels({
      colorSpace: 'none',
      alphaMode: 'straight',
      levels: [{ data: new Uint8Array([128, 128, 255, 255]), width: 1, height: 1 }],
    });

    backend.getTextureBinding(texture);

    expect(environment.renderPassLabels()).not.toContain(NORMALIZE_PASS);
    expect(environment.textureDescriptors().some(entry => entry.format === 'rgba8unorm-srgb')).toBe(false);

    texture.destroy();
    backend.destroy();
  });

  test('refuses to normalize numeric data even when the caller asks for it', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const texture = Texture.fromPixels({
      colorSpace: 'none',
      alphaMode: 'straight',
      levels: [{ data: new Uint8Array([128, 128, 255, 255]), width: 1, height: 1 }],
    });

    expect(() => texture.setPremultiplyAlpha(true)).toThrow(/numeric texture data/i);

    texture.destroy();
    backend.destroy();
  });

  test('normalizes every authored mip level separately, sharing one staging texture', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const texture = Texture.fromPixels({
      colorSpace: 'srgb',
      alphaMode: 'straight',
      levels: [
        { data: new Uint8Array(4 * 4 * 4).fill(64), width: 4, height: 4 },
        { data: new Uint8Array(2 * 2 * 4).fill(64), width: 2, height: 2 },
      ],
    });

    backend.getTextureBinding(texture);

    expect(environment.renderPassLabels().filter(label => label === NORMALIZE_PASS)).toHaveLength(2);
    // Each level is staged with its own row pitch, and only ONE scratch texture
    // was created for the pair.
    expect(environment.writeTextureRows().filter(row => row % 4 === 0)).toEqual([16, 8]);
    // Base level plus one staging texture for the whole chain.
    expect(environment.textureDescriptors().length).toBe(2);

    texture.destroy();
    backend.destroy();
  });

  test('keeps an opaque level out of the pass while normalizing its translucent neighbour', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const opaque = new Uint8Array(4 * 4 * 4).fill(255);
    const texture = Texture.fromPixels({
      colorSpace: 'srgb',
      alphaMode: 'straight',
      levels: [
        { data: opaque, width: 4, height: 4 },
        { data: new Uint8Array(2 * 2 * 4).fill(64), width: 2, height: 2 },
      ],
    });

    backend.getTextureBinding(texture);

    expect(environment.renderPassLabels().filter(label => label === NORMALIZE_PASS)).toHaveLength(1);
    // The opaque level went straight to the destination at the base level's row
    // pitch; the translucent one was staged and passed.
    expect(environment.writeTextureRows()).toEqual([16, 8]);

    texture.destroy();
    backend.destroy();
  });

  test('generates missing mips from the normalized level, not from a straight one', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const texture = Texture.fromPixels(
      {
        colorSpace: 'srgb',
        alphaMode: 'straight',
        levels: [{ data: new Uint8Array(4 * 4 * 4).fill(64), width: 4, height: 4 }],
      },
      { generateMipMap: true },
    );

    backend.getTextureBinding(texture);

    // One authored level, three mip levels on the texture: the chain would be
    // incomplete without generating the two above it, and they have to be built
    // from the level the pass normalized.
    const descriptor = environment.textureDescriptors().find(entry => entry.format === 'rgba8unorm-srgb');

    expect(descriptor?.mipLevelCount).toBe(3);
    expect(environment.renderPassLabels().filter(label => label === NORMALIZE_PASS)).toHaveLength(1);
    // The box-filter downsample passes follow, one per generated level.
    expect(environment.renderPassLabels().filter(label => label === 'backend:render-pass')).toHaveLength(2);

    texture.destroy();
    backend.destroy();
  });

  test('leaves an implicit browser source on the pre-activation upload path', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const canvas = document.createElement('canvas');

    canvas.width = 2;
    canvas.height = 2;

    const texture = new Texture(canvas);

    backend.getTextureBinding(texture);

    // The activation gate stays closed until R41, so an ordinary decoded image
    // keeps linear storage rather than acquiring sRGB storage and a pass.
    expect(environment.renderPassLabels()).not.toContain(NORMALIZE_PASS);
    expect(environment.textureDescriptors().some(entry => entry.format === 'rgba8unorm-srgb')).toBe(false);

    texture.destroy();
    backend.destroy();
  });

  test('normalizes a browser image source through an external copy', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const canvas = document.createElement('canvas');

    canvas.width = 2;
    canvas.height = 2;

    const texture = new Texture(canvas, { colorSpace: 'srgb' });

    backend.getTextureBinding(texture);

    expect(environment.renderPassLabels()).toContain(NORMALIZE_PASS);
    expect(environment.textureDescriptors().some(entry => entry.format === 'rgba8unorm-srgb')).toBe(true);

    texture.destroy();
    backend.destroy();
  });

  test('pools one scratch texture and one pipeline across textures of the same format', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const first = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 64]);
    const second = straightTexture([srgbOf(0.25), srgbOf(0.25), srgbOf(0.25), 128]);

    backend.getTextureBinding(first);
    const passesAfterFirst = environment.renderPassLabels().filter(label => label === NORMALIZE_PASS).length;
    const texturesAfterFirst = environment.textureDescriptors().length;
    const modulesAfterFirst = environment.shaderModuleCount();

    backend.getTextureBinding(second);

    // Two destinations, still ONE scratch texture and ONE shader module: the
    // pass allocates per device and format, not per texture.
    expect(environment.renderPassLabels().filter(label => label === NORMALIZE_PASS)).toHaveLength(passesAfterFirst + 1);
    expect(environment.textureDescriptors()).toHaveLength(texturesAfterFirst + 1);
    expect(environment.shaderModuleCount()).toBe(modulesAfterFirst);

    first.destroy();
    second.destroy();
    backend.destroy();
  });

  test('rebuilds its device-owned state after a reset', async () => {
    environment = createMockWebGpuEnvironment();
    const device = (await createMockBackend(environment)).device;
    const normalizer = new WebGpuTextureNormalizer(device);
    const destination = device.createTexture({
      size: { width: 1, height: 1 },
      format: 'rgba8unorm-srgb',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const level = { level: 0, width: 1, height: 1, data: new Uint8Array([128, 128, 128, 64]) };

    normalizer.normalizeLevels(destination, 'rgba8unorm-srgb', [level]);

    const afterFirst = environment.textureDescriptors().length;
    const modulesAfterFirst = environment.shaderModuleCount();

    normalizer.reset();
    normalizer.normalizeLevels(destination, 'rgba8unorm-srgb', [level]);

    // A lost device leaves the staging texture and pipeline handles dead, so the
    // reset has to rebuild both rather than reuse them.
    expect(environment.textureDescriptors()).toHaveLength(afterFirst + 1);
    expect(environment.shaderModuleCount()).toBe(modulesAfterFirst + 1);

    normalizer.destroy();
    destination.destroy();
  });

  test('leaves the draw-time association off exactly when storage is already associated', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const normalized = straightTexture([srgbOf(0.5), srgbOf(0.5), srgbOf(0.5), 64]);
    const alreadyAssociated = straightTexture([64, 32, 16, 64], { alphaMode: 'premultiplied' });
    const straight = straightTexture([64, 32, 16, 64], { premultiplyAlpha: false });
    const numeric = Texture.fromPixels({
      colorSpace: 'none',
      alphaMode: 'straight',
      levels: [{ data: new Uint8Array([128, 128, 255, 64]), width: 1, height: 1 }],
    });

    // The upload pass and the draw shader both multiplying by alpha would darken
    // every translucent texel by its own alpha a second time. The flag has to
    // follow the STORED samples, not the upload request.
    expect(backend.shouldPremultiplyTextureSample(normalized)).toBe(false);
    expect(backend.shouldPremultiplyTextureSample(alreadyAssociated)).toBe(false);
    expect(backend.shouldPremultiplyTextureSample(straight)).toBe(false);
    expect(backend.shouldPremultiplyTextureSample(numeric)).toBe(false);

    normalized.destroy();
    alreadyAssociated.destroy();
    straight.destroy();
    numeric.destroy();
    backend.destroy();
  });

  test('still asks the draw to associate a straight-storage browser source', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const canvas = document.createElement('canvas');

    canvas.width = 2;
    canvas.height = 2;

    // Pre-activation this texture is uploaded straight, because the legacy
    // WebGPU path premultiplied nothing at upload.
    const texture = new Texture(canvas);

    expect(backend.shouldPremultiplyTextureSample(texture)).toBe(true);

    texture.destroy();
    backend.destroy();
  });

  test('states the pass in WGSL rather than evaluating a transfer function', () => {
    // The hardware does the sRGB decode on sample and the encode on store, so
    // the shader may only multiply by alpha. A hand-rolled transfer function here
    // would double-decode an sRGB sample and silently darken every texture.
    expect(textureNormalizeWgsl).not.toMatch(/pow\s*\(/);
    expect(textureNormalizeWgsl).not.toMatch(/0\.04045|0\.0031308|12\.92/);
    expect(textureNormalizeWgsl).toMatch(/texel\.rgb \* texel\.a/);
  });

  test('samples the source without a mip-aware filter, so the copy stays 1:1', async () => {
    environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);
    const texture = Texture.fromPixels({
      colorSpace: 'srgb',
      alphaMode: 'straight',
      levels: [{ data: new Uint8Array(2 * 2 * 4).fill(64), width: 2, height: 2 }],
    });

    texture.scaleMode = ScaleModes.Linear;

    backend.getTextureBinding(texture);

    expect(environment.renderPassLabels()).toContain(NORMALIZE_PASS);
    expect(textureNormalizeWgsl).toMatch(/textureDimensions\(sourceTexture, 0\)/);

    texture.destroy();
    backend.destroy();
  });
});
