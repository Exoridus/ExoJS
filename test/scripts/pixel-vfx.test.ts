import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Texture } from '@codexo/exojs';
import { AsepriteSheet } from '@codexo/exojs-aseprite';
import { describe, expect, it } from 'vitest';

import { assertSameFiles, checkGeneratedFiles } from '../../scripts/pixel-vfx/files.ts';
import {
  adaptAtlas,
  createRecipeValidator,
  type PixelVfxAtlas,
  type PixelVfxRecipe,
  validatePixels,
} from '../../scripts/pixel-vfx/validation.ts';

const schema = JSON.parse(readFileSync(join(process.cwd(), 'tools/pixel-vfx/pixelbolt.schema.json'), 'utf8')) as object;
const validateRecipe = createRecipeValidator(schema);

const source = (): PixelVfxRecipe => ({
  version: 1,
  name: 'pixel-vfx-test',
  width: 32,
  height: 32,
  palette: { $ref: '../palette.json' },
  frames: [
    { name: 'spark', duration: 40, ops: [{ op: 'pixel', x: 8, y: 8, color: 'w' }] },
    { name: 'trail', duration: 90, ops: [{ op: 'pixel', x: 10, y: 9, color: 'w' }] },
  ],
  animations: { play: { frames: ['spark', 'trail'], loop: false } },
  sheet: { columns: 4, padding: 2, scale: 1, trim: false },
});

const nativeAtlas = (): PixelVfxAtlas => ({
  frames: {
    spark: {
      frame: { x: 2, y: 2, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
      duration: 40,
    },
    trail: {
      frame: { x: 38, y: 2, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
      duration: 90,
    },
  },
  animations: { play: { frames: ['spark', 'trail'], loop: false, duration: 130 } },
  meta: {
    app: 'Pixelbolt',
    version: '1',
    image: 'pixel-vfx-test.png',
    format: 'RGBA8888',
    size: { w: 144, h: 36 },
    scale: '1',
    frameTags: [{ name: 'play', from: 0, to: 1, direction: 'forward' }],
  },
});

const image = () => {
  const data = new Uint8Array(144 * 36 * 4);
  data.set([240, 220, 160, 255], (10 * 144 + 10) * 4);
  data.set([240, 220, 160, 255], (11 * 144 + 48) * 4);

  return { width: 144, height: 36, data };
};

describe('Pixel VFX source contract', () => {
  it('validates ordinary recipes using the published schema', () => {
    expect(validateRecipe(source(), 'test')).toEqual(source());
    expect(() => validateRecipe({ ...source(), unsupported: true }, 'test')).toThrow(/schema/i);
    const fractionalCoordinate = source();
    fractionalCoordinate.frames[0].ops = [{ op: 'pixel', x: 1.5, y: 8, color: 'w' }];
    expect(() => validateRecipe(fractionalCoordinate, 'test')).toThrow(/schema/i);
  });

  it('rejects scaled, rectangular, trimmed, or unpadded sources', () => {
    for (const invalid of [
      { ...source(), height: 64 },
      { ...source(), width: 48, height: 48 },
      { ...source(), sheet: { ...source().sheet, scale: 2 } },
      { ...source(), sheet: { ...source().sheet, trim: true } },
      { ...source(), sheet: { ...source().sheet, padding: 0 } },
    ]) {
      expect(() => validateRecipe(invalid, 'test')).toThrow(/native|sheet/i);
    }
  });

  it('rejects implicit timing, palette overrides, and noncontiguous playback', () => {
    const noTiming = source();
    delete (noTiming.frames[0] as { duration?: number }).duration;
    expect(() => validateRecipe(noTiming, 'test')).toThrow(/duration/i);
    expect(() => validateRecipe({ ...source(), palette: { $ref: '../palette.json', w: '#fff' } }, 'test')).toThrow(/palette/i);
    expect(() => validateRecipe({ ...source(), animations: { play: { frames: ['trail', 'spark'], loop: false } } }, 'test')).toThrow(
      /order/i,
    );
    expect(() => validateRecipe({ ...source(), animations: { play: { frames: ['spark', 'trail'] } } }, 'test')).toThrow(/loop/i);
  });
});

describe('Pixelbolt to Aseprite metadata', () => {
  it('preserves unequal frame timing and one-shot completion in the existing parser', () => {
    const original = nativeAtlas();
    const result = adaptAtlas(original, source());
    expect(result.meta.frameTags[0].repeat).toBe('1');
    const texture = new Texture();
    texture.width = 144;
    texture.height = 36;
    const sheet = AsepriteSheet.parse(result, texture);

    expect(sheet.clips.get('play')?.frameDurations).toEqual([0.04, 0.09]);
    expect(sheet.clips.get('play')?.repeat).toBe(1);
    expect(sheet.clips.get('play')?.frames.map(frame => [frame.x, frame.y, frame.width, frame.height])).toEqual([
      [2, 2, 32, 32],
      [38, 2, 32, 32],
    ]);
    expect(original.meta.frameTags[0].repeat).toBeUndefined();
    expect('animations' in result).toBe(false);
  });

  it('maps looped playback to the existing parser repeat sentinel', () => {
    const recipe = source();
    const atlas = nativeAtlas();
    recipe.animations.play.loop = true;
    atlas.animations.play.loop = true;
    const texture = new Texture();
    texture.width = 144;
    texture.height = 36;

    const result = adaptAtlas(atlas, recipe);
    expect(result.meta.frameTags[0].repeat).toBe('0');
    expect(AsepriteSheet.parse(result, texture).clips.get('play')?.repeat).toBe(-1);
  });

  it('rejects missing tags, reordered frames, changed timing, and out-of-bounds rectangles', () => {
    const missingTag = nativeAtlas();
    missingTag.meta.frameTags = [];
    const reordered = nativeAtlas();
    reordered.frames = { trail: reordered.frames.trail, spark: reordered.frames.spark };
    const badTiming = nativeAtlas();
    badTiming.frames.trail.duration = 40;
    const badBounds = nativeAtlas();
    badBounds.frames.trail.frame.x = 130;
    const changedLoop = nativeAtlas();
    changedLoop.animations.play.loop = true;

    for (const atlas of [missingTag, reordered, badTiming, badBounds, changedLoop]) {
      expect(() => adaptAtlas(atlas, source())).toThrow(/tag|order|duration|rectangle|loop/i);
    }
  });
});

describe('native pixel integrity', () => {
  it('accepts palette-only binary pixels with transparent gutters and frame borders', () => {
    const result = validatePixels(image(), nativeAtlas(), source(), { w: '#f0dca0' });

    expect(result.opaquePixels).toBe(2);
    expect(result.colors).toEqual(['#f0dca0']);
    expect(result.frameBounds).toEqual([
      { name: 'spark', x: 8, y: 8, w: 1, h: 1, pixels: 1 },
      { name: 'trail', x: 10, y: 9, w: 1, h: 1, pixels: 1 },
    ]);
  });

  it('rejects partial alpha and palette drift', () => {
    const partial = image();
    partial.data[(10 * 144 + 10) * 4 + 3] = 128;
    expect(() => validatePixels(partial, nativeAtlas(), source(), { w: '#f0dca0' })).toThrow(/alpha/i);
    expect(() => validatePixels(image(), nativeAtlas(), source(), { w: '#ff0000' })).toThrow(/palette/i);
  });

  it('rejects nontransparent gutters, occupied frame borders, and mismatched dimensions', () => {
    const gutter = image();
    gutter.data.set([240, 220, 160, 255], (10 * 144 + 35) * 4);
    expect(() => validatePixels(gutter, nativeAtlas(), source(), { w: '#f0dca0' })).toThrow(/gutter/i);
    const border = image();
    border.data.set([240, 220, 160, 255], (10 * 144 + 3) * 4);
    expect(() => validatePixels(border, nativeAtlas(), source(), { w: '#f0dca0' })).toThrow(/border/i);
    expect(() => validatePixels({ ...image(), width: 143 }, nativeAtlas(), source(), { w: '#f0dca0' })).toThrow(/dimensions/i);
  });

  it('rejects entirely empty effects', () => {
    const empty = image();
    empty.data.fill(0);

    expect(() => validatePixels(empty, nativeAtlas(), source(), { w: '#f0dca0' })).toThrow(/transparent/i);
  });
});

describe('deterministic generated files', () => {
  it('compares every filename and byte from independent exports', () => {
    const first = new Map([['sprite.png', Buffer.from([1, 2, 3])]]);

    expect(() => assertSameFiles(first, new Map(first))).not.toThrow();
    expect(() => assertSameFiles(first, new Map([['sprite.png', Buffer.from([1, 2, 4])]]))).toThrow(/sprite.png/);
    expect(() => assertSameFiles(first, new Map())).toThrow(/sprite.png/);
    expect(() => assertSameFiles(first, new Map([...first, ['extra.json', Buffer.from('{}')]]))).toThrow(/extra.json/);
  });

  it('reports stale or missing committed files without modifying them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'exo-pixel-vfx-'));

    try {
      writeFileSync(join(directory, 'sprite.png'), 'old');
      const expected = new Map([
        ['sprite.png', Buffer.from('new')],
        ['sprite.json', Buffer.from('{}')],
      ]);

      expect(checkGeneratedFiles(expected, directory)).toEqual(['sprite.json: missing', 'sprite.png: differs']);
      expect(readFileSync(join(directory, 'sprite.png'), 'utf8')).toBe('old');
      writeFileSync(join(directory, 'sprite.png'), 'new');
      writeFileSync(join(directory, 'sprite.json'), '{}');
      expect(checkGeneratedFiles(expected, directory)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const recipesDirectory = join(process.cwd(), 'tools/pixel-vfx/recipes');
const effects = readdirSync(recipesDirectory).filter(file => file.endsWith('.pixel.json'));

describe.each(effects)('committed effect %s', filename => {
  it('loads with the ordinary Aseprite parser and preserves source timing and loop intent', () => {
    const effect = filename.slice(0, -'.pixel.json'.length);
    const recipe = validateRecipe(JSON.parse(readFileSync(join(recipesDirectory, filename), 'utf8')) as unknown, effect);
    const atlas = JSON.parse(readFileSync(join(process.cwd(), 'examples/assets/images', `${recipe.name}.json`), 'utf8')) as Omit<
      PixelVfxAtlas,
      'animations'
    >;
    const texture = new Texture();
    texture.width = atlas.meta.size.w;
    texture.height = atlas.meta.size.h;
    const sheet = AsepriteSheet.parse(atlas, texture);

    expect(Object.keys(atlas.frames)).toEqual(recipe.frames.map(frame => frame.name));
    expect(sheet.clips.get('play')?.frames).toHaveLength(recipe.frames.length);
    expect(sheet.clips.get('play')?.frameDurations).toEqual(recipe.frames.map(frame => frame.duration / 1000));
    expect(sheet.clips.get('play')?.repeat).toBe(recipe.animations.play.loop ? -1 : 1);
  });
});
