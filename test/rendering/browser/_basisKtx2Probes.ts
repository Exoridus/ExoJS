import { describe, expect, onTestFinished, test } from 'vitest';

import { Asset } from '#assets/Asset';
import { selectBasisTarget } from '#assets/factories/basisTargets';
import { TextureFactory } from '#assets/factories/TextureFactory';
import { Loader } from '#assets/Loader';
import { textureType } from '#assets/types/image';
import { Color } from '#core/Color';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { ScaleModes, TextureFormat } from '#rendering/types';

import { factoryContext } from '../../assets/factory-context';
import { drawInto, expectBytes, type OpenColorProbeHarness, spriteScene, srgbDecode } from './color-probe-fixtures';

const files = import.meta.glob('../../fixtures/basis/*.ktx2', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const sourceUrl = (name: string): string => files[`../../fixtures/basis/${name}.ktx2`]!;

export const defineBasisKtx2Probes = (backend: string, open: OpenColorProbeHarness): void => {
  describe(`${backend}: Basis Universal KTX2`, () => {
    test.each([
      'etc1s-opaque-linear',
      'etc1s-opaque-srgb',
      'etc1s-alpha-linear',
      'etc1s-alpha-srgb',
      'uastc-opaque-linear',
      'uastc-opaque-srgb',
      'uastc-alpha-linear',
      'uastc-alpha-srgb',
      'uastc-opaque-linear-zstd',
      'uastc-opaque-srgb-zstd',
      'uastc-alpha-linear-zstd',
      'uastc-alpha-srgb-zstd',
    ])('%s: fetch, worker, WASM, loader and real GPU readback', async name => {
      const h = await open(4);
      const loader = new Loader();
      loader._installAssetTypes([textureType]);
      loader.variants.profile = { textureFormats: h.backend.supportedTextureFormats, resolution: 1 };
      onTestFinished(() => {
        loader.destroy();
        h.destroy();
      });
      const start = performance.now();
      const texture = await loader.load(Asset.type('texture', sourceUrl(name)));
      const loadMs = performance.now() - start;
      const hasAlpha = name.includes('alpha'),
        srgb = name.includes('srgb');
      const target = selectBasisTarget(h.backend.supportedTextureFormats, hasAlpha, srgb);
      expect(texture.compressed?.format).toBe(target.format);
      expect(texture.colorSpace).toBe(srgb ? 'srgb' : 'linear-srgb');
      expect(texture.alphaMode).toBe('straight');
      expect((texture.compressed?.levels ?? texture.pixels?.levels)?.map(({ width, height }) => [width, height])).toEqual([
        [28, 12],
        [14, 6],
        [7, 3],
        [3, 1],
        [1, 1],
      ]);
      const raw = new RenderTexture(1, 1, { format: TextureFormat.Rgba8 });
      onTestFinished(() => raw.destroy());
      texture.setScaleMode(ScaleModes.LinearMipmapLinear);
      await h.checked(async () => {
        drawInto(h.backend, raw, spriteScene(texture, 1, 1), Color.transparentBlack);
        const alpha = hasAlpha ? 128 / 255 : 1;
        const rgb = [128, 64, 32].map(channel => (srgb ? srgbDecode(channel / 255) : channel / 255) * alpha * 255);
        expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [...rgb, hasAlpha ? 128 : 255], name.startsWith('etc1s') ? 7 : 3);
      });

      if (name === 'etc1s-opaque-linear' || name === 'uastc-opaque-linear') {
        console.info(`Basis ${backend} ${name}: first load ${loadMs.toFixed(2)} ms, target ${target.format ?? 'RGBA8'}`);
      }
    });

    test.each(['etc1s-alpha-srgb-odd', 'uastc-alpha-srgb-odd'])('%s falls back to RGBA8 with authored odd mips', async name => {
      const h = await open(4),
        factory = new TextureFactory();
      onTestFinished(() => {
        factory.destroy();
        h.destroy();
      });
      const response = await fetch(sourceUrl(name));
      const texture = await factory.create(
        await response.arrayBuffer(),
        factoryContext({}, { textureFormats: h.backend.supportedTextureFormats }),
      );
      onTestFinished(() => texture.destroy());
      expect(texture.compressed).toBeNull();
      expect(texture.pixels?.levels.map(({ width, height }) => [width, height])).toEqual([
        [17, 9],
        [8, 4],
        [4, 2],
        [2, 1],
        [1, 1],
      ]);
      const raw = new RenderTexture(1, 1, { format: TextureFormat.Rgba8 });
      onTestFinished(() => raw.destroy());
      texture.setScaleMode(ScaleModes.LinearMipmapLinear);
      await h.checked(async () => {
        drawInto(h.backend, raw, spriteScene(texture, 1, 1), Color.transparentBlack);
        const rgb = [128, 64, 32].map(channel => srgbDecode(channel / 255) * 128);
        expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [...rgb, 128], 7);
      });
    });

    test.each(['etc1s-alpha-srgb', 'uastc-alpha-srgb'])('%s retains premultiplied association through real GPU upload', async name => {
      const h = await open(4),
        factory = new TextureFactory();
      onTestFinished(() => {
        factory.destroy();
        h.destroy();
      });
      const bytes = await (await fetch(sourceUrl(name))).arrayBuffer(),
        view = new DataView(bytes);
      view.setUint8(view.getUint32(48, true) + 15, 1);
      const texture = await factory.create(bytes, factoryContext({}, { textureFormats: h.backend.supportedTextureFormats }));
      onTestFinished(() => texture.destroy());
      expect(texture.alphaMode).toBe('premultiplied');
      const raw = new RenderTexture(1, 1, { format: TextureFormat.Rgba8 });
      onTestFinished(() => raw.destroy());
      texture.setScaleMode(ScaleModes.LinearMipmapLinear);
      await h.checked(async () => {
        drawInto(h.backend, raw, spriteScene(texture, 1, 1), Color.transparentBlack);
        expectBytes(
          await h.backend.readPixels(raw, 0, 0, 1, 1),
          [...[128, 64, 32].map(channel => srgbDecode(channel / 255) * 255), 128],
          7,
        );
      });
    });

    test('reuses the worker for concurrent requests and rejects malformed universal codec data', async () => {
      const factory = new TextureFactory();
      onTestFinished(() => factory.destroy());
      const bytes = await (await fetch(sourceUrl('etc1s-alpha-srgb'))).arrayBuffer();
      const results = await Promise.all([factory.create(bytes, factoryContext()), factory.create(bytes, factoryContext())]);
      results.forEach(texture => {
        expect(texture.pixels?.levels).toHaveLength(5);
        texture.destroy();
      });
      expect(bytes.byteLength).toBeGreaterThan(0);
      const corrupt = bytes.slice(0),
        view = new DataView(corrupt);
      const sgdOffset = view.getUint32(64, true),
        sgdLength = view.getUint32(72, true);
      new Uint8Array(corrupt).fill(255, sgdOffset + 20 + 5 * 20, sgdOffset + sgdLength);
      await expect(factory.create(corrupt, factoryContext())).rejects.toThrow(/Basis/);
      const start = performance.now(),
        texture = await factory.create(bytes, factoryContext());
      console.info(`Basis ${backend} subsequent ETC1S RGBA8 load: ${(performance.now() - start).toFixed(2)} ms`);
      texture.destroy();
    });
  });
};
