/**
 * KTX2 containers through the real factory and upload path, on either backend.
 *
 * The containers carry hand-picked, distinct level contents so a regenerated
 * mip chain, a lost transfer flag or a wrong decode each move the sampled byte
 * far outside the tolerance.
 */
import { describe, expect, onTestFinished, test } from 'vitest';

import { TextureFactory } from '#assets/factories/TextureFactory';
import { Color } from '#core/Color';
import { CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { ScaleModes, TextureFormat } from '#rendering/types';

import { factoryContext } from '../../assets/factory-context';
import { ktx2BlockBytes, ktx2Dfd } from '../../assets/ktx2-dfd';
import { type ColorProbeHarness, drawInto, expectBytes, type OpenColorProbeHarness, spriteScene, srgbDecode, toByte } from './color-probe-fixtures';

const headerBytes = 80;
const levelIndexEntryBytes = 24;
const identifier = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

interface Ktx2Spec {
  readonly vkFormat: number;
  /** Level 0 first. Each entry is tiled to fill its level. */
  readonly levels: ReadonlyArray<{ readonly byteLength: number; readonly pattern: readonly number[] }>;
  /** DFD transfer function: 1 linear, 2 sRGB. */
  readonly transfer: number;
}

const buildKtx2 = ({ vkFormat, levels, transfer }: Ktx2Spec): ArrayBuffer => {
  const dataBytes = levels.reduce((total, level) => total + level.byteLength, 0);
  const dfd = ktx2Dfd(vkFormat, { transfer });
  const dfdOffset = headerBytes + levels.length * levelIndexEntryBytes;
  const blockBytes = ktx2BlockBytes(vkFormat);
  const levelAlignment = Math.max(8, blockBytes === 4 ? 4 : blockBytes);
  const dataOffset = Math.ceil((dfdOffset + dfd.length) / levelAlignment) * levelAlignment;
  const bytes = new Uint8Array(dataOffset + dataBytes);
  const view = new DataView(bytes.buffer);

  bytes.set(identifier);
  view.setUint32(12, vkFormat, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, 4, true);
  view.setUint32(24, 4, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, levels.length, true);
  view.setUint32(48, dfdOffset, true);
  view.setUint32(52, dfd.length, true);
  bytes.set(dfd, dfdOffset);

  let offset = dataOffset + dataBytes;

  for (let index = levels.length - 1; index >= 0; index--) {
    const { byteLength, pattern } = levels[index]!;

    offset -= byteLength;
    view.setUint32(headerBytes + index * levelIndexEntryBytes, offset, true);
    view.setUint32(headerBytes + index * levelIndexEntryBytes + 8, byteLength, true);
    view.setUint32(headerBytes + index * levelIndexEntryBytes + 16, byteLength, true);

    for (let byte = 0; byte < byteLength; byte++) {
      bytes[offset + byte] = pattern[byte % pattern.length]!;
    }
  }

  return bytes.buffer;
};

const opaqueGray = (value: number): readonly number[] => [value, value, value, 255];

/** Three RGBA8 levels (4x4, 2x2, 1x1) with different grays: a regenerated chain could not reproduce them. */
const rgba8Chain = (vkFormat: number, transfer: number): ArrayBuffer =>
  buildKtx2({
    vkFormat,
    transfer,
    levels: [
      { byteLength: 64, pattern: opaqueGray(200) },
      { byteLength: 16, pattern: opaqueGray(100) },
      { byteLength: 4, pattern: opaqueGray(40) },
    ],
  });

/** One BC1 block whose two endpoints are the RGB565 value 0x8410 (expanded to 132, 130, 132) with all indices 0: a constant color. */
const bc1Solid = (vkFormat: number, transfer: number): ArrayBuffer =>
  buildKtx2({ vkFormat, transfer, levels: [{ byteLength: 8, pattern: [0x10, 0x84, 0x10, 0x84, 0, 0, 0, 0] }] });

const bc1Expanded = [132, 130, 132] as const;

export const defineColorKtx2Probes = (title: string, open: OpenColorProbeHarness): void => {
  const start = async (): Promise<ColorProbeHarness> => {
    const h = await open(4);

    onTestFinished(() => h.destroy());

    return h;
  };

  describe(`${title}: KTX2 colour upload`, () => {
    test('supplied sRGB RGBA8 mips are used as authored, decoded on sample and encoded once on write', async () => {
      const h = await start();
      const texture = await new TextureFactory().create(rgba8Chain(43, 2), factoryContext());
      const encoded = new RenderTexture(1, 1, { format: TextureFormat.Rgba8Srgb });
      const raw = new RenderTexture(1, 1, { format: TextureFormat.Rgba8 });

      try {
        texture.setScaleMode(ScaleModes.LinearMipmapLinear);
        expect(texture.colorSpace).toBe('srgb');
        expect(texture.pixels?.levels.map(level => level.width)).toEqual([4, 2, 1]);

        await h.checked(async () => {
          // A 4x4 texture shown on one pixel samples exactly level 2.
          drawInto(h.backend, encoded, spriteScene(texture, 1, 1), Color.black);
          expectBytes(await h.backend.readPixels(encoded, 0, 0, 1, 1), [40, 40, 40, 255]);

          const decoded = toByte(srgbDecode(40 / 255));

          drawInto(h.backend, raw, spriteScene(texture, 1, 1), Color.black);
          expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [decoded, decoded, decoded, 255]);
        });
      } finally {
        encoded.destroy();
        raw.destroy();
        texture.destroy();
      }
    });

    test('supplied linear RGBA8 mips stay numeric through upload and sampling', async () => {
      const h = await start();
      const texture = await new TextureFactory().create(rgba8Chain(37, 1), factoryContext());
      const raw = new RenderTexture(1, 1, { format: TextureFormat.Rgba8 });

      try {
        texture.setScaleMode(ScaleModes.LinearMipmapLinear);
        expect(texture.colorSpace).toBe('linear-srgb');

        await h.checked(async () => {
          drawInto(h.backend, raw, spriteScene(texture, 1, 1), Color.black);
          expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [40, 40, 40, 255]);
        });
      } finally {
        raw.destroy();
        texture.destroy();
      }
    });

    test('a BC1 sRGB block decodes to its endpoint color on sample', async ctx => {
      const h = await start();

      if (!h.backend.supportedTextureFormats.includes(CompressedTextureFormat.Bc1RgbUnormSrgb)) {
        // eslint-disable-next-line vitest/no-disabled-tests -- capability: names the missing format
        ctx.skip(`${CompressedTextureFormat.Bc1RgbUnormSrgb} is not sampleable on this device`);

        return;
      }

      const texture = await new TextureFactory().create(bc1Solid(132, 2), factoryContext());
      const encoded = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });

      try {
        await h.checked(async () => {
          drawInto(h.backend, encoded, spriteScene(texture, 2, 2), Color.black);
          expectBytes(await h.backend.readPixels(encoded, 0, 0, 1, 1), [...bc1Expanded, 255]);
        });
      } finally {
        encoded.destroy();
        texture.destroy();
      }
    });

    test('a BC1 linear block stays numeric on sample', async ctx => {
      const h = await start();

      if (!h.backend.supportedTextureFormats.includes(CompressedTextureFormat.Bc1RgbUnorm)) {
        // eslint-disable-next-line vitest/no-disabled-tests -- capability: names the missing format
        ctx.skip(`${CompressedTextureFormat.Bc1RgbUnorm} is not sampleable on this device`);

        return;
      }

      const texture = await new TextureFactory().create(bc1Solid(131, 1), factoryContext());
      const raw = new RenderTexture(2, 2, { format: TextureFormat.Rgba8 });

      try {
        await h.checked(async () => {
          drawInto(h.backend, raw, spriteScene(texture, 2, 2), Color.black);
          expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [...bc1Expanded, 255]);
        });
      } finally {
        raw.destroy();
        texture.destroy();
      }
    });
  });
};
