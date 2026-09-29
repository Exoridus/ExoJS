import { Color, DataTexture, Texture, TextureFormat } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import type { ForwardBackend } from '../src/backends/ForwardBackend';
import { ForwardLighting } from '../src/ForwardLighting';
import { PointLight } from '../src/lights/PointLight';
import { LitMaterial } from '../src/LitMaterial';
import { NormalMap } from '../src/normals/NormalMap';

const channels = 4;

describe('lighting colour contract', () => {
  test('NormalMap rejects a texture that requests sRGB colour interpretation', () => {
    const srgbTexture = new Texture({ width: 2, height: 2 } as unknown as HTMLCanvasElement, { colorSpace: 'srgb' });

    expect(() => new NormalMap(srgbTexture)).toThrow(/colorSpace "srgb"/);
  });

  test('NormalMap accepts a texture declared as numeric data', () => {
    const dataTexture = new Texture({ width: 2, height: 2 } as unknown as HTMLCanvasElement, { colorSpace: 'none' });

    expect(() => new NormalMap(dataTexture)).not.toThrow();
  });

  test('NormalMap rejects linear-srgb, which is colour, not numeric data', () => {
    const linearTexture = new Texture({ width: 2, height: 2 } as unknown as HTMLCanvasElement, { colorSpace: 'linear-srgb' });

    expect(() => new NormalMap(linearTexture)).toThrow(/colorSpace "linear-srgb"/);
  });

  test('NormalMap accepts a DataTexture', () => {
    const data = new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8 });

    expect(() => new NormalMap(data)).not.toThrow();
  });

  test('a lit draw refuses a normal texture reinterpreted as colour after the NormalMap was built', () => {
    const texture = new Texture({ width: 2, height: 2 } as unknown as HTMLCanvasElement, { colorSpace: 'none' });
    const lighting = new ForwardLighting({ maxLights: 1 });
    const material = new LitMaterial({ lighting, normals: new NormalMap(texture) });

    expect(() => material.bindKey).not.toThrow();

    texture.colorSpace = 'srgb';

    expect(() => material.bindKey).toThrow(/colorSpace "srgb"/);
  });

  test('assigning a colour texture through LitMaterial.normals is refused', () => {
    const lighting = new ForwardLighting({ maxLights: 1 });
    const material = new LitMaterial({ lighting });
    const srgbTexture = new Texture({ width: 2, height: 2 } as unknown as HTMLCanvasElement, { colorSpace: 'srgb' });

    expect(() => (material.normals = { texture: srgbTexture })).toThrow(/colorSpace "srgb"/);
  });
});

describe('lighting colour contract - linear packing', () => {
  test('a gray ambient packs its linear-decoded value, not its authoring byte', () => {
    const lighting = new ForwardLighting({ maxLights: 1, ambient: new Color(128, 128, 128) });

    lighting.update();

    const texture = (lighting.backend as ForwardBackend).lightTexture;
    const headerRow = texture.width * channels;

    // SRGB_BYTE_TO_LINEAR[128] - decoded, and measurably different from 128/255.
    expect(texture.buffer[headerRow]).toBeCloseTo(0.21586050011389926, 6);
  });

  test('a colored light publishes its decoded RGB, not its authoring bytes', () => {
    const lighting = new ForwardLighting({ maxLights: 2 });

    lighting.add(new PointLight({ color: new Color(51, 102, 153) }));
    lighting.update();

    const texture = (lighting.backend as ForwardBackend).lightTexture;
    const offset = (texture.width * 1 + 1) * channels;

    expect(texture.buffer[offset]).toBeCloseTo(0.033104766570885055, 6);
  });
});
