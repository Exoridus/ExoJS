/**
 * Cross-package importer colour contract.
 *
 * Tiled, LDtk and Aseprite sheets all resolve their sheet/tile-image/image-
 * layer textures through the generic `texture` asset (`TextureFactory`,
 * covered directly by `test/assets/texture-factory.test.ts`). None of them
 * has a concrete route to a non-colour import - a tile image is always
 * colour, never a data payload - so the plan's "importer images become sRGB
 * colour" acceptance is a property of NOT overriding the asset's default
 * texture options, not of any importer-specific colour code.
 *
 * This suite locks that in at the source level: every `Asset.type('texture',
 * ...)` request an importer package makes passes no second (options)
 * argument, so it always takes `TextureFactory`'s default resolution -
 * `colorSpace: 'linear-srgb'` while COLOR_PIPELINE_ENABLED is closed,
 * `'srgb'` once it activates - exactly as any other browser-sourced Texture
 * does. An importer that started passing `colorSpace: 'none'` or any other
 * override would silently opt its images out of that contract; this fails
 * the moment that happens instead of only failing when a screenshot drifts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

/** Every `Asset.type('texture', ...)` call in `file`, as its full argument list text. */
const textureAssetCalls = (file: string): string[] => {
  const source = readFileSync(resolve(root, file), 'utf8');

  return [...source.matchAll(/Asset\.type\(\s*'texture'\s*,[^)]*\)/g)].map(match => match[0]);
};

describe('importer texture colour contract', () => {
  test('Tiled sheet, tile-image and image-layer loads request the default texture colour', () => {
    const calls = textureAssetCalls('packages/exojs-tiled/src/loadTiledMap.ts');

    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) {
      // No colorSpace/textureOptions override in the call text: the request
      // carries only a URL, so it takes TextureFactory's default resolution.
      expect(call).not.toMatch(/colorSpace|textureOptions/);
    }
  });

  test('LDtk tileset loads request the default texture colour', () => {
    const calls = textureAssetCalls('packages/exojs-ldtk/src/loadLdtkMap.ts');

    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) {
      expect(call).not.toMatch(/colorSpace|textureOptions/);
    }
  });

  test('Aseprite sheet loads request the default texture colour', () => {
    const calls = textureAssetCalls('packages/exojs-aseprite/src/asepriteType.ts');

    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) {
      expect(call).not.toMatch(/colorSpace|textureOptions/);
    }
  });
});
