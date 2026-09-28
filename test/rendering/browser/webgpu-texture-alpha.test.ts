import { expect, test } from 'vitest';

import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, TextureFormat } from '#rendering/types';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGpuTestBackend } from './_backendSetup';

const srgbOf = (linear: number): number => Math.round(255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055));

const linearOf = (code: number): number => {
  const value = code / 255;

  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/**
 * Draw one 1x1 sprite through `texture` and return the single red channel the GPU
 * produced.
 *
 * The destination is a LINEAR `rgba8` target read back raw, so the byte that comes
 * back is the sampled linear value rather than a re-encoded one.
 */
const sampleThrough = async (backend: WebGpuBackend, texture: Texture): Promise<readonly [number, number, number, number]> => {
  const target = new RenderTexture(1, 1, { format: TextureFormat.Rgba8 });
  const root = new Container();
  const sprite = new Sprite(texture);

  sprite.width = 1;
  sprite.height = 1;

  try {
    root.addChild(sprite);
    backend.setRenderTarget(target).clear();
    root.render(backend);
    backend.flush();

    const pixels = await backend.readPixels(target, 0, 0, 1, 1);

    return [pixels[0]!, pixels[1]!, pixels[2]!, pixels[3]!];
  } finally {
    root.destroy();
    target.destroy();
  }
};

test('WebGPU stores straight sRGB colour premultiplied in LINEAR light', async () => {
  const backend = await createWebGpuTestBackend(1);
  const alpha = 64;
  const colour = srgbOf(0.5);
  const texture = Texture.fromPixels({
    colorSpace: 'srgb',
    alphaMode: 'straight',
    levels: [{ data: new Uint8Array([colour, colour, colour, alpha]), width: 1, height: 1 }],
  });

  try {
    const [red] = await sampleThrough(backend, texture);
    const premultipliedInLinear = linearOf(0.5) * (alpha / 255) * 255;
    const premultipliedInEncoded = linearOf(Math.round(colour * (alpha / 255))) * 255;
    const notPremultipliedAtAll = linearOf(0.5) * 255;

    // The same acceptance case the WebGL2 half states: 0.5 linear at alpha 0.25
    // stores E(0.125), which reads back as a linear byte of ~32 - versus ~7 for
    // the encoded-space product and ~128 for no premultiply at all. A byte of
    // ~16 would be alpha applied twice, once at upload and once in the draw.
    expect(red).toBeGreaterThan(premultipliedInEncoded + 15);
    expect(red).toBeLessThan(notPremultipliedAtAll - 15);
    expect(Math.abs(red - premultipliedInLinear)).toBeLessThanOrEqual(3);
  } finally {
    texture.destroy();
    backend.destroy();
  }
});

test('WebGPU keeps a fully transparent texel hidden colour out of a linear filter', async () => {
  const backend = await createWebGpuTestBackend(1);
  // Opaque red beside a fully transparent texel whose hidden colour is green.
  const texture = Texture.fromPixels({
    colorSpace: 'srgb',
    alphaMode: 'straight',
    levels: [
      {
        data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 0]),
        width: 2,
        height: 1,
      },
    ],
  });

  texture.scaleMode = ScaleModes.Linear;

  try {
    // One destination fragment, so its UV lands exactly on the texel boundary.
    const target = new RenderTexture(1, 1, { format: TextureFormat.Rgba8 });
    const root = new Container();
    const sprite = new Sprite(texture);

    sprite.width = 1;
    sprite.height = 1;

    root.addChild(sprite);
    backend.setRenderTarget(target).clear();
    root.render(backend);
    backend.flush();

    const pixels = await backend.readPixels(target, 0, 0, 1, 1);
    const [red, green] = [pixels[0]!, pixels[1]!];

    root.destroy();
    target.destroy();

    // Red survives at half coverage and green does not appear at all: the
    // premultiply happened before the filter. Filtering straight colour first
    // would leave green around.
    expect(Math.abs(red - 128)).toBeLessThanOrEqual(6);
    expect(green).toBeLessThanOrEqual(6);
  } finally {
    texture.destroy();
    backend.destroy();
  }
});

test('WebGPU does not premultiply a source that is already associated', async () => {
  const backend = await createWebGpuTestBackend(1);
  // Authored as E(0.5 * 0.25) - the premultiplied authoring definition.
  const stored = Math.round(srgbOf(0.5) * (64 / 255));
  const texture = Texture.fromPixels({
    colorSpace: 'srgb',
    alphaMode: 'premultiplied',
    levels: [{ data: new Uint8Array([stored, stored, stored, 64]), width: 1, height: 1 }],
  });

  try {
    const [red] = await sampleThrough(backend, texture);
    const asAuthored = linearOf(stored) * 255;
    // A second multiply would land near 20: the texel darkened by its own alpha
    // a second time.
    expect(Math.abs(red - asAuthored)).toBeLessThanOrEqual(3);
    expect(red).toBeGreaterThan(linearOf(Math.round(stored * (64 / 255))) * 255 + 8);
  } finally {
    texture.destroy();
    backend.destroy();
  }
});

test('WebGPU never sends numeric data through colour normalization', async () => {
  const backend = await createWebGpuTestBackend(1);
  // A flat normal map: the blue channel carries the direction and must survive
  // upload byte for byte, which a premultiply-by-alpha pass would rewrite.
  const texture = Texture.fromPixels({
    colorSpace: 'none',
    alphaMode: 'straight',
    levels: [{ data: new Uint8Array([128, 128, 255, 64]), width: 1, height: 1 }],
  });

  try {
    const [red] = await sampleThrough(backend, texture);

    expect(red).toBe(128);
  } finally {
    texture.destroy();
    backend.destroy();
  }
});
