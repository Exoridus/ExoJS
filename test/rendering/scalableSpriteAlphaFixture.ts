import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';

export const createScalableAlphaTexture = (alphaMode: 'straight' | 'premultiplied'): Texture => {
  const red = alphaMode === 'straight' ? 248 : 120;

  return new Texture(null).setCompressed({
    format: CompressedTextureFormat.Bc3RgbaUnorm,
    colorSpace: 'linear-srgb',
    alphaMode,
    levels: [{ width: 4, height: 4, data: new Uint8Array([128, 128, 0, 0, 0, 0, 0, 0, 0, red, 0, red, 0, 0, 0, 0]) }],
  });
};

export const scalableAlphaPaths = ['nine-slice', 'repeating-geometry', 'repeating-shader'] as const;

export const createScalableAlphaSprite = (
  texture: Texture,
  path: (typeof scalableAlphaPaths)[number],
): NineSliceSprite | RepeatingSprite => {
  if (path === 'nine-slice') {
    return new NineSliceSprite(texture, { slices: 1, width: 16, height: 16 });
  }

  const source = path === 'repeating-shader' ? texture : new TextureRegion(texture, { x: 0, y: 0, width: 4, height: 4 });

  return new RepeatingSprite(source, { width: 16, height: 16 });
};
