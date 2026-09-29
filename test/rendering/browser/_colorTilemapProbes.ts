/**
 * Tilemap chunks through the real renderer binding, on either backend.
 *
 * A tileset texture is ordinary color content: it decodes on sample, layer
 * opacity is applied once as coverage, and the write encodes once.
 */
import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode } from '@codexo/exojs-tilemap';
import { describe, onTestFinished, test } from 'vitest';

import { Color } from '#core/Color';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';

import { makeTileset, wireTilemapRenderers } from './_tilemapScene';
import { type ColorProbeHarness, drawInto, expectBytes, type OpenColorProbeHarness, srgbDecode, srgbEncode, toByte } from './color-probe-fixtures';

const grayCanvasTexture = (gray: number, options?: ConstructorParameters<typeof Texture>[1]): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = 16;
  canvas.height = 16;

  const context = canvas.getContext('2d')!;

  context.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
  context.fillRect(0, 0, 16, 16);

  return new Texture(canvas, options);
};

const tileNode = (texture: Texture, opacity: number): TileMapNode => {
  const tileset = makeTileset(texture);
  const layer = new TileLayer({ id: 1, name: 'ground', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], opacity });

  layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

  return new TileMapNode(new TileMap({ name: 'm', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: [layer] }));
};

export const defineColorTilemapProbes = (title: string, open: OpenColorProbeHarness): void => {
  const start = async (): Promise<ColorProbeHarness> => {
    const h = await open(16);

    wireTilemapRenderers(h.backend);
    onTestFinished(() => h.destroy());

    return h;
  };

  describe(`${title}: tilemap colour`, () => {
    test('an sRGB tile keeps its authored byte, and layer opacity is applied once in linear light', async () => {
      const h = await start();
      const texture = grayCanvasTexture(128);
      const opaque = new RenderTexture(16, 16, { format: TextureFormat.Rgba8Srgb });
      const half = new RenderTexture(16, 16, { format: TextureFormat.Rgba8Srgb });
      const halfRaw = new RenderTexture(16, 16, { format: TextureFormat.Rgba8 });

      try {
        await h.checked(async () => {
          drawInto(h.backend, opaque, tileNode(texture, 1), Color.black);
          expectBytes(await h.backend.readPixels(opaque, 8, 8, 1, 1), [128, 128, 128, 255]);

          const linearHalf = srgbDecode(128 / 255) * 0.5;
          const displayed = toByte(srgbEncode(linearHalf));

          drawInto(h.backend, half, tileNode(texture, 0.5), Color.black);
          expectBytes(await h.backend.readPixels(half, 8, 8, 1, 1), [displayed, displayed, displayed, 255]);

          drawInto(h.backend, halfRaw, tileNode(texture, 0.5), Color.black);
          expectBytes(await h.backend.readPixels(halfRaw, 8, 8, 1, 1), [toByte(linearHalf), toByte(linearHalf), toByte(linearHalf), 255]);
        });
      } finally {
        opaque.destroy();
        half.destroy();
        halfRaw.destroy();
        texture.destroy();
      }
    });

    test('a numeric tileset texture is not decoded', async () => {
      const h = await start();
      const texture = grayCanvasTexture(128, { colorSpace: 'none' });
      const raw = new RenderTexture(16, 16, { format: TextureFormat.Rgba8 });

      try {
        await h.checked(async () => {
          drawInto(h.backend, raw, tileNode(texture, 1), Color.black);
          expectBytes(await h.backend.readPixels(raw, 8, 8, 1, 1), [128, 128, 128, 255]);
        });
      } finally {
        raw.destroy();
        texture.destroy();
      }
    });
  });
};
