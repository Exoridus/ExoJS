import { describe, expect, onTestFinished, test } from 'vitest';

import { Asset } from '#assets/Asset';
import { Loader } from '#assets/Loader';
import { bmFontType } from '#assets/types/font';
import { textureType } from '#assets/types/image';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { Shader } from '#rendering/shader/Shader';
import { spriteVertexGlsl } from '#rendering/sprite/materialSources';
import { Sprite } from '#rendering/sprite/Sprite';
import type { BmFont, BmFontData } from '#rendering/text/BmFont';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, TextureFormat } from '#rendering/types';

import { type ColorProbeHarness, drawInto, expectBytes, type OpenColorProbeHarness, spriteScene } from './color-probe-fixtures';

const fixtureRoot = '/test/fixtures/fonts/';
const sentinelPage = `${fixtureRoot}distance-channel-sentinel.png`;

interface AtlasSample {
  readonly x: number;
  readonly y: number;
  readonly rgba: readonly [number, number, number, number];
}

const loadFont = async (
  loader: Loader,
  page: string,
  size: number,
  declaration = '',
  distanceField?: BmFontData['distanceField'],
): Promise<BmFont> => {
  const descriptor = `info face="Numeric Probe" size=${size}
common lineHeight=${size} base=${size} scaleW=${size} scaleH=${size} pages=1
page id=0 file="${page}"
chars count=1
char id=65 x=0 y=0 width=${size} height=${size} xoffset=0 yoffset=0 xadvance=${size} page=0 chnl=15
${declaration}`;
  const source = URL.createObjectURL(new File([descriptor], 'probe.fnt', { type: 'text/plain' }));

  try {
    return await loader.load(Asset.type('bmFont', source, distanceField === undefined ? {} : { distanceField }));
  } finally {
    URL.revokeObjectURL(source);
  }
};

const channelMaterial = (texture: Texture, channel: 'rgb' | 'alpha'): SpriteMaterial =>
  new SpriteMaterial({
    shader: new Shader({
      glsl: {
        vertex: spriteVertexGlsl,
        fragment: `#version 300 es
precision highp float;
in vec2 v_texcoord;
uniform highp sampler2D u_atlas;
out vec4 fragColor;
void main() {
  vec4 value = texture(u_atlas, v_texcoord);
  fragColor = vec4(${channel === 'rgb' ? 'value.rgb' : 'vec3(value.a)'}, 1.0);
}`,
      },
      wgsl: `struct UserUniforms { unused: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;
@group(2) @binding(1) var u_atlas: texture_2d<f32>;
@group(2) @binding(2) var u_atlasSampler: sampler;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let value = textureSample(u_atlas, u_atlasSampler, input.texcoord);
  return vec4<f32>(${channel === 'rgb' ? 'value.rgb' : 'vec3<f32>(value.a)'}, 1.0);
}`,
    }),
    textures: { u_atlas: texture },
  });

const expectNumericAtlas = async (h: ColorProbeHarness, texture: Texture, samples: readonly AtlasSample[]): Promise<void> => {
  const raw = new RenderTexture(texture.width, texture.height, { format: TextureFormat.Rgba8 });

  texture.setScaleMode(ScaleModes.Nearest);

  try {
    await h.checked(async () => {
      for (const channel of ['rgb', 'alpha'] as const) {
        const material = channelMaterial(texture, channel);
        const sprite = new Sprite(Texture.white);

        sprite.width = texture.width;
        sprite.height = texture.height;
        sprite.material = material;

        try {
          // Direct material sampling bypasses sampleBase's color-alpha association.
          // Opaque outputs expose RGB and alpha independently of blending.
          drawInto(h.backend, raw, sprite);

          for (const { x, y, rgba } of samples) {
            const expected = channel === 'rgb' ? [rgba[0], rgba[1], rgba[2], 255] : [rgba[3], rgba[3], rgba[3], 255];

            expectBytes(await h.backend.readPixels(raw, x, y, 1, 1), expected, 1);
          }
        } finally {
          if (!sprite.destroyed) {
            sprite.destroy();
          }

          material.destroy();
        }
      }
    });
  } finally {
    h.backend.setRenderTarget(null);
    raw.destroy();
  }
};

export const defineDistanceFontProbes = (title: string, open: OpenColorProbeHarness): void => {
  const start = async (): Promise<{ h: ColorProbeHarness; loader: Loader }> => {
    const h = await open(8);
    const loader = new Loader();

    loader._installAssetTypes([textureType, bmFontType]);
    onTestFinished(() => {
      loader.destroy();
      h.destroy();
    });

    return { h, loader };
  };

  describe(`${title}: external distance-font metadata`, () => {
    test('a declared MTSDF atlas preserves independent RGB and low-alpha data through Loader and GPU upload', async () => {
      const { h, loader } = await start();
      const font = await loadFont(loader, sentinelPage, 1, 'distanceField fieldType=mtsdf distanceRange=4');

      expect(font.fontData.distanceField).toEqual({ fieldType: 'mtsdf', distanceRange: 4, zeroDistanceValue: 0.5 });
      expect(font.textures[0]!.colorSpace).toBe('none');

      // This PNG was encoded directly from RGBA bytes, without a canvas round trip.
      await expectNumericAtlas(h, font.textures[0]!, [{ x: 0, y: 0, rgba: [213, 149, 97, 31] }]);
    });

    test('range 4 and range 16 atlases keep their own encoded samples for identical square geometry', async () => {
      const { h, loader } = await start();
      const range4 = await loadFont(loader, `${fixtureRoot}distance-square-range4.png`, 5, 'distanceField fieldType=mtsdf distanceRange=4');
      const range16 = await loadFont(
        loader,
        `${fixtureRoot}distance-square-range16.png`,
        5,
        'distanceField fieldType=mtsdf distanceRange=16',
      );

      expect(range4.fontData.distanceField).toEqual({ fieldType: 'mtsdf', distanceRange: 4, zeroDistanceValue: 0.5 });
      expect(range16.fontData.distanceField).toEqual({ fieldType: 'mtsdf', distanceRange: 16, zeroDistanceValue: 0.5 });
      expect(range4.fontData.chars.get(65)).toEqual({
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        xOffset: 0,
        yOffset: 0,
        xAdvance: 5,
        page: 0,
        channel: 15,
      });
      expect(range16.fontData.chars).toEqual(range4.fontData.chars);
      expect(range16.fontData.lineHeight).toBe(range4.fontData.lineHeight);
      expect(range16.fontData.base).toBe(range4.fontData.base);
      expect(range4.textures[0]!.colorSpace).toBe('none');
      expect(range16.textures[0]!.colorSpace).toBe('none');

      // Both fixtures encode the square [1.5, 3.5] on each atlas axis.
      // At these texel centers d=-1/+1, so round(255 * (0.5 + d/range)) gives the literals below.
      await expectNumericAtlas(h, range4.textures[0]!, [
        { x: 0, y: 2, rgba: [64, 64, 64, 64] },
        { x: 2, y: 2, rgba: [191, 191, 191, 191] },
      ]);
      await expectNumericAtlas(h, range16.textures[0]!, [
        { x: 0, y: 2, rgba: [112, 112, 112, 112] },
        { x: 2, y: 2, rgba: [143, 143, 143, 143] },
      ]);
    });

    test('a distance declaration without range remains numeric without inferring range from glyph size', async () => {
      const { h, loader } = await start();
      const font = await loadFont(loader, sentinelPage, 1, 'distanceField fieldType=mtsdf');

      expect(font.fontData.distanceField).toEqual({ fieldType: 'mtsdf', distanceRange: null, zeroDistanceValue: 0.5 });
      expect(font.textures[0]!.colorSpace).toBe('none');
      await expectNumericAtlas(h, font.textures[0]!, [{ x: 0, y: 0, rgba: [213, 149, 97, 31] }]);
    });

    test('an explicit distance-field override gives a legacy descriptor the numeric atlas route', async () => {
      const { h, loader } = await start();
      const font = await loadFont(loader, sentinelPage, 1, '', {
        fieldType: 'mtsdf',
        distanceRange: 16,
        zeroDistanceValue: 0.375,
      });

      expect(font.fontData.distanceField).toEqual({ fieldType: 'mtsdf', distanceRange: 16, zeroDistanceValue: 0.375 });
      expect(font.textures[0]!.colorSpace).toBe('none');
      await expectNumericAtlas(h, font.textures[0]!, [{ x: 0, y: 0, rgba: [213, 149, 97, 31] }]);
    });

    test('ordinary bitmap-font and color loads of the same PNG keep sRGB interpretation alongside a distance font', async () => {
      const { h, loader } = await start();
      const distance = await loadFont(loader, sentinelPage, 1, 'distanceField fieldType=mtsdf distanceRange=4');
      const bitmap = await loadFont(loader, sentinelPage, 1);
      const color = await loader.load(Asset.type('texture', sentinelPage));
      const raw = new RenderTexture(2, 2, { format: TextureFormat.Rgba8 });

      try {
        expect(bitmap.fontData.distanceField).toBeUndefined();
        expect(bitmap.textures[0]!.colorSpace).toBe('srgb');
        expect(color.colorSpace).toBe('srgb');
        await expectNumericAtlas(h, distance.textures[0]!, [{ x: 0, y: 0, rgba: [213, 149, 97, 31] }]);

        await h.checked(async () => {
          for (const texture of [bitmap.textures[0]!, color]) {
            drawInto(h.backend, raw, spriteScene(texture, 2, 2));
            // sRGB-decode([213,149,97]/255) * (31/255), stored over opaque black.
            expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [21, 9, 4, 255]);
          }
        });
      } finally {
        h.backend.setRenderTarget(null);
        raw.destroy();
      }
    });
  });
};
