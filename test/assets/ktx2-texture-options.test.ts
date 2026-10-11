import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NormalMap } from '@codexo/exojs-lighting';
import { describe, expect, test } from 'vitest';

import { type TextureAssetOptions, TextureFactory } from '#assets/factories/TextureFactory';

import { factoryContext } from './factory-context';

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/color');

const fixture = (name: string): ArrayBuffer => {
  const bytes = readFileSync(join(FIXTURE_DIR, name));

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const load = (name: string, textureOptions?: TextureAssetOptions['textureOptions']) =>
  new TextureFactory().create(
    fixture(name),
    factoryContext<TextureAssetOptions>(textureOptions === undefined ? undefined : { textureOptions }),
  );

describe('KTX2 texture options', () => {
  test('a linear payload declared numeric loads as exact data with its upload options', async () => {
    const texture = await load('rgba8-linear.ktx2', { colorSpace: 'none', premultiplyAlpha: false, generateMipMap: false });

    expect(texture.colorSpace).toBe('none');
    expect(texture.premultiplyAlpha).toBe(false);
    expect(texture.generateMipMap).toBe(false);
  });

  test('without a request the file keeps the meaning its descriptor declares', async () => {
    expect((await load('rgba8-linear.ktx2')).colorSpace).toBe('linear-srgb');
    expect((await load('rgba8-srgb.ktx2')).colorSpace).toBe('srgb');
  });

  test('an sRGB payload cannot be relabelled numeric or linear', async () => {
    await expect(load('rgba8-srgb.ktx2', { colorSpace: 'none' })).rejects.toThrow(/contradicts the file's srgb transfer/);
    await expect(load('rgba8-srgb.ktx2', { colorSpace: 'linear-srgb' })).rejects.toThrow(/contradicts/);
  });

  test('a linear payload cannot be relabelled sRGB', async () => {
    await expect(load('rgba8-linear.ktx2', { colorSpace: 'srgb' })).rejects.toThrow(/contradicts the file's linear-srgb transfer/);
  });

  test('a contradicting alpha declaration is refused in both directions', async () => {
    await expect(load('alpha-straight-srgb.ktx2', { alphaMode: 'premultiplied' })).rejects.toThrow(/alphaMode 'premultiplied' contradicts/);
    await expect(load('alpha-pma-srgb.ktx2', { alphaMode: 'straight' })).rejects.toThrow(/alphaMode 'straight' contradicts/);
    expect((await load('alpha-pma-srgb.ktx2', { alphaMode: 'premultiplied' })).alphaMode).toBe('premultiplied');
  });

  test('upload options that cannot apply to block-compressed data are refused instead of ignored', async () => {
    await expect(load('native-bc1-rgb-unorm.ktx2', { generateMipMap: true })).rejects.toThrow(/generateMipMap cannot apply/);
    await expect(load('native-bc1-rgb-unorm.ktx2', { premultiplyAlpha: true })).rejects.toThrow(/premultiplyAlpha cannot apply/);
    await expect(load('rgba8-linear.ktx2', { flipY: true })).rejects.toThrow(/flipY cannot re-orient/);
  });

  test('a compressed linear payload may be declared numeric', async () => {
    const texture = await load('native-bc1-rgb-unorm.ktx2', { colorSpace: 'none' });

    expect(texture.colorSpace).toBe('none');
    expect(texture.compressed).not.toBeNull();
  });

  test('a normal map stored in a linear container is usable once it is declared numeric', async () => {
    const declared = await load('rgba8-linear.ktx2', { colorSpace: 'none' });
    const undeclared = await load('rgba8-linear.ktx2');

    expect(() => new NormalMap(declared)).not.toThrow();
    expect(() => new NormalMap(undeclared)).toThrow(/colorSpace "linear-srgb"/);
  });
});
