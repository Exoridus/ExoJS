import { expect, test } from 'vitest';

import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, TextureFormat } from '#rendering/types';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createWebGl2TestBackend } from './_backendSetup';
import { readWebGl2Pixel } from './_backendSetup';

const srgbOf = (linear: number): number => Math.round(255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055));

const linearOf = (code: number): number => {
  const value = code / 255;

  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/**
 * Draw one 1x1 sprite through `texture` and return the single red channel the
 * GPU produced.
 *
 * The destination is a LINEAR `rgba8` target, so the byte that comes back is the
 * sampled linear value rather than a re-encoded one. The sprite fragment stage
 * multiplies by the tint and nothing else, so nothing between the sampler and
 * the readback touches alpha.
 */
const sampleThrough = async (backend: WebGl2Backend, texture: Texture): Promise<number> => {
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

    return readWebGl2Pixel(backend, 0, 0)[0];
  } finally {
    root.destroy();
    target.destroy();
  }
};

test('WebGL2 stores straight sRGB colour premultiplied in LINEAR light', async () => {
  const backend = await createWebGl2TestBackend(1);
  const alpha = 64;
  const colour = srgbOf(0.5);
  const texture = Texture.fromPixels({
    colorSpace: 'srgb',
    alphaMode: 'straight',
    levels: [{ data: new Uint8Array([colour, colour, colour, alpha]), width: 1, height: 1 }],
  });

  try {
    const red = await sampleThrough(backend, texture);
    const premultipliedInLinear = linearOf(0.5) * (alpha / 255) * 255;
    const premultipliedInEncoded = linearOf(Math.round(colour * (alpha / 255))) * 255;
    const notPremultipliedAtAll = linearOf(0.5) * 255;

    // The acceptance case: 0.5 linear at alpha 0.25 stores E(0.125), not
    // E(0.5) * 0.25. Read back, that is a linear byte of ~32 - versus ~7 for the
    // encoded-space product and ~128 for no premultiply at all.
    expect(red).toBeGreaterThan(premultipliedInEncoded + 15);
    expect(red).toBeLessThan(notPremultipliedAtAll - 15);
    expect(Math.abs(red - premultipliedInLinear)).toBeLessThanOrEqual(2);
  } finally {
    texture.destroy();
    backend.destroy();
  }
});

test('WebGL2 keeps a fully transparent texel hidden colour out of a linear filter', async () => {
  const backend = await createWebGl2TestBackend(1);
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

    const [red, green] = readWebGl2Pixel(backend, 0, 0);

    root.destroy();
    target.destroy();

    // Red survives at half coverage. Green does not appear at all: the
    // premultiply happened before the filter, so the transparent texel
    // contributed nothing to it. Filtering straight colour first and
    // multiplying afterwards would leave green at ~128.
    expect(Math.abs(red - 128)).toBeLessThanOrEqual(4);
    expect(green).toBeLessThanOrEqual(4);
  } finally {
    texture.destroy();
    backend.destroy();
  }
});

test('WebGL2 does not premultiply a source that is already associated', async () => {
  const backend = await createWebGl2TestBackend(1);
  // Authored as E(0.5 * 0.25) - the premultiplied authoring definition.
  const stored = Math.round(srgbOf(0.5) * (64 / 255));
  const texture = Texture.fromPixels({
    colorSpace: 'srgb',
    alphaMode: 'premultiplied',
    levels: [{ data: new Uint8Array([stored, stored, stored, 64]), width: 1, height: 1 }],
  });

  try {
    const red = await sampleThrough(backend, texture);
    const asAuthored = linearOf(stored) * 255;
    // A second multiply would land near 20 instead: the texel would be darkened
    // by its own alpha a second time.
    expect(Math.abs(red - asAuthored)).toBeLessThanOrEqual(2);
    expect(red).toBeGreaterThan(linearOf(Math.round(stored * (64 / 255))) * 255 + 8);
  } finally {
    texture.destroy();
    backend.destroy();
  }
});

test('WebGL2 never sends numeric data through colour normalization', async () => {
  const backend = await createWebGl2TestBackend(1);
  // A flat normal map: the blue channel carries the direction and must survive
  // upload byte for byte, which a premultiply-by-alpha pass would rewrite.
  const texture = Texture.fromPixels({
    colorSpace: 'none',
    alphaMode: 'straight',
    levels: [{ data: new Uint8Array([128, 128, 255, 64]), width: 1, height: 1 }],
  });

  try {
    const red = await sampleThrough(backend, texture);

    expect(red).toBe(128);
  } finally {
    texture.destroy();
    backend.destroy();
  }
});
