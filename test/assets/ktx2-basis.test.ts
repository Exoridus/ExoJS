import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { decodeKtx2 } from '#assets/factories/decodeKtx2';
import { TextureFactory } from '#assets/factories/TextureFactory';
import { compressedLevelByteLength, CompressedTextureFormat as Format } from '#rendering/texture/CompressedTextureFormat';

import { factoryContext } from './factory-context';

const fixture = (name: string): ArrayBuffer => Uint8Array.from(readFileSync(`test/fixtures/${name}.ktx2`)).buffer;
afterEach(() => vi.unstubAllGlobals());

describe('KTX2 decode dispatch', () => {
  test.each(['bc7-unorm', 'astc-4x4-unorm', 'etc2-rgba8-unorm'])('native %s never creates a worker and aliases its source', async name => {
    const worker = vi.fn(() => {
      throw new Error('Basis must stay lazy');
    });
    vi.stubGlobal('Worker', worker);
    const buffer = fixture(`color-external/${name}`);
    const payload = await decodeKtx2(buffer, 'native.ktx2');
    const factory = new TextureFactory();
    const texture = await factory.create(buffer, factoryContext());
    expect(worker).not.toHaveBeenCalled();
    expect(payload.levels.every(level => level.data.buffer === buffer)).toBe(true);
    texture.destroy();
    factory.destroy();
  });

  test.each([
    ['etc1s-opaque-srgb', [Format.Bc4RUnorm, Format.Bc3RgbaUnormSrgb, Format.Bc7RgbaUnormSrgb], Format.Bc3RgbaUnormSrgb, 3],
    ['etc1s-alpha-linear', [Format.Bc1RgbUnorm, Format.Etc2Rgb8Unorm, Format.Bc7RgbaUnorm], Format.Bc7RgbaUnorm, 6],
    ['uastc-alpha-srgb', [Format.Bc7RgbaUnorm, Format.Astc4x4Srgb], Format.Astc4x4Srgb, 10],
    ['uastc-opaque-linear', [Format.Etc2Rgb8Unorm], Format.Etc2Rgb8Unorm, 0],
    ['uastc-alpha-srgb-zstd', [], undefined, 13],
  ] as const)('selects %s from the capability order and preserves metadata/mips', async (name, formats, expected, targetId) => {
    const transcode = vi.fn(async (_buffer, _descriptor, target) => {
      expect(target.id).toBe(targetId);

      return Array.from({ length: 5 }, (_, index) => {
        const width = Math.max(28 >> index, 1),
          height = Math.max(12 >> index, 1);

        return new Uint8Array(expected === undefined ? width * height * 4 : compressedLevelByteLength(expected, width, height));
      });
    });
    const payload = await decodeKtx2(fixture(`basis/${name}`), name, formats, transcode);
    expect(transcode).toHaveBeenCalledOnce();
    expect(payload.kind).toBe(expected === undefined ? 'rgba8' : 'compressed');

    if (payload.kind === 'compressed') {
      expect(payload.format).toBe(expected);
    }

    expect(payload.colorSpace).toBe(name.includes('srgb') ? 'srgb' : 'linear-srgb');
    expect(payload.alphaMode).toBe('straight');
    expect(payload.levels.map(({ width, height }) => [width, height])).toEqual([
      [28, 12],
      [14, 6],
      [7, 3],
      [3, 1],
      [1, 1],
    ]);
  });

  test('preserves premultiplied alpha and rejects truncated worker output', async () => {
    const buffer = fixture('basis/uastc-alpha-linear');
    const view = new DataView(buffer);
    view.setUint8(view.getUint32(48, true) + 15, 1);
    const transcode = async () => Array.from({ length: 5 }, (_, i) => new Uint8Array(Math.max(28 >> i, 1) * Math.max(12 >> i, 1) * 4));
    expect((await decodeKtx2(buffer, 'pma.ktx2', [], transcode)).alphaMode).toBe('premultiplied');
    await expect(decodeKtx2(buffer, 'bad.ktx2', [], async () => [new Uint8Array(1)])).rejects.toThrow(/level/);
  });

  test('already aborted loads cannot initialize Basis', async () => {
    const controller = new AbortController();
    controller.abort();
    const transcode = vi.fn();
    await expect(decodeKtx2(fixture('basis/etc1s-alpha-srgb'), 'abort.ktx2', [], transcode, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(transcode).not.toHaveBeenCalled();
  });
});
