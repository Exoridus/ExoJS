import { builtinLeaf, builtinTypeForExtension, builtinTypeForPath, coreAssetTypes } from '#assets/coreAssetTypes';
import { AudioStream } from '#audio/AudioStream';
import { Sound } from '#audio/Sound';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';

/** Every built-in id, in the order the list installs them. */
const ids = coreAssetTypes.map(type => type.id);

describe('coreAssetTypes', () => {
  test('the list is frozen, so no import can add to or replace a built-in', () => {
    expect(Object.isFrozen(coreAssetTypes)).toBe(true);
  });

  test('every built-in has a unique id', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('covers every built-in kind the engine ships', () => {
    expect(ids).toEqual(['texture', 'sound', 'music', 'video', 'json', 'text', 'svg', 'subtitle', 'xml', 'csv', 'binary', 'bmFont', 'font', 'image', 'wasm']);
  });

  test('no two built-ins claim the same suffix', () => {
    const claimed = coreAssetTypes.flatMap(type => type.extensions);

    expect(new Set(claimed).size).toBe(claimed.length);
  });

  test('a type whose resource has a public class dispatches on it', () => {
    const tokenOf = (id: string): unknown => coreAssetTypes.find(type => type.id === id)?._token;

    expect(tokenOf('texture')).toBe(Texture);
    expect(tokenOf('sound')).toBe(Sound);
    expect(tokenOf('music')).toBe(AudioStream);
    expect(tokenOf('video')).toBe(Video);
    expect(tokenOf('bmFont')).toBe(BmFont);
  });

  test('an environment-gated type is still listed, so the suffix table and the type table agree', () => {
    // Constructing the type touches nothing; only loading an asset of it does.
    // A conditional list left the type-level suffix table claiming a type the
    // runtime had never installed.
    expect(ids).toContain('font');
    expect(ids).toContain('image');
    expect(ids).toContain('wasm');
  });
});

describe('the built-in suffix table', () => {
  test('resolves a suffix a leaf-capable built-in claims', () => {
    expect(builtinTypeForExtension('png')).toBe('texture');
    expect(builtinTypeForExtension('.PNG')).toBe('texture');
    expect(builtinTypeForExtension('mp3')).toBe('sound');
    expect(builtinTypeForExtension('vtt')).toBe('subtitle');
    expect(builtinTypeForExtension('srt')).toBe('subtitle');
  });

  test('omits a type that hands out no catalog leaf, so its bare path stays unresolvable', () => {
    // `font` and `bmFont` claim suffixes, but neither has a placeholder to hand
    // out - their assets have to be named explicitly.
    expect(builtinTypeForExtension('woff2')).toBeUndefined();
    expect(builtinTypeForExtension('fnt')).toBeUndefined();
  });

  test('matches the longest dot-suffix of the basename first', () => {
    expect(builtinTypeForPath('assets/v1.2/hero.png')).toBe('texture');
    expect(builtinTypeForPath('data/level.json?v=3')).toBe('json');
    expect(builtinTypeForPath('unknown.custom')).toBeUndefined();
  });
});

describe('built-in leaf strategies', () => {
  test('a type that heals in place carries its adapter', () => {
    expect(typeof builtinLeaf('texture')).toBe('object');
    expect(typeof builtinLeaf('sound')).toBe('object');
  });

  test('a decoded value hands out a deferred ref', () => {
    for (const id of ['json', 'text', 'csv', 'xml', 'subtitle', 'binary', 'wasm']) {
      expect(builtinLeaf(id)).toBe('ref');
    }
  });

  test('a type with no meaningful placeholder declares none', () => {
    for (const id of ['music', 'video', 'svg', 'image', 'font', 'bmFont']) {
      expect(builtinLeaf(id)).toBe('none');
    }
  });

  test('answers with nothing for a name no built-in claims', () => {
    expect(builtinLeaf('com.example.world')).toBeUndefined();
  });
});

describe('the subtitle type reads both formats from one codec', () => {
  test('a .vtt locator decodes as WebVTT', async () => {
    const subtitle = coreAssetTypes.find(type => type.id === 'subtitle')!;

    await expect(subtitle.codec!.decode('WEBVTT\n', { locator: 'url:/captions.vtt' })).resolves.toEqual({ fmt: 'vtt', text: 'WEBVTT\n' });
  });

  test('a .srt locator decodes as SubRip, query string and case ignored', async () => {
    const subtitle = coreAssetTypes.find(type => type.id === 'subtitle')!;

    await expect(subtitle.codec!.decode('1\n', { locator: 'url:/CAPTIONS.SRT?v=2' })).resolves.toEqual({ fmt: 'srt', text: '1\n' });
  });
});
