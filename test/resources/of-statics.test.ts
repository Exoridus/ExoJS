import { describe, expect, expectTypeOf, it } from 'vitest';

import { AudioStream } from '#audio/AudioStream';
import { Sound } from '#audio/Sound';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';
import type { Asset } from '#resources/Asset';
import { CsvAsset, FontAsset, Json, TextAsset } from '#resources/tokens';

describe('X.of statics', () => {
  it('Json.of carries the json kind + generic type', () => {
    const a = Json.of<{ hp: number }>('l.json');
    expect(a._config).toMatchObject({ kind: 'json', source: 'l.json' });
    expectTypeOf(a).toEqualTypeOf<Asset<{ hp: number }>>();
  });

  it('TextAsset.of carries text kind', () => {
    expect(TextAsset.of('a.txt')._config).toMatchObject({ kind: 'text', source: 'a.txt' });
  });

  it('CsvAsset.of carries csv kind', () => {
    expect(CsvAsset.of('t.csv')._config).toMatchObject({ kind: 'csv', source: 't.csv' });
  });

  it('FontAsset.of carries font kind + options', () => {
    const a = FontAsset.of('f.woff2', { family: 'MyFont' });
    expect(a._config).toMatchObject({ kind: 'font', source: 'f.woff2', family: 'MyFont' });
  });

  it('Texture.of carries texture kind + opts', () => {
    const a = Texture.of('s.png');
    expect(a._config).toMatchObject({ kind: 'texture', source: 's.png' });
    expectTypeOf(a).toEqualTypeOf<Asset<Texture>>();
  });

  it('Sound.of carries sound kind', () => {
    expect(Sound.of('b.ogg')._config).toMatchObject({ kind: 'sound', source: 'b.ogg' });
  });

  it('AudioStream.of carries music kind', () => {
    expect(AudioStream.of('b.mp3')._config).toMatchObject({ kind: 'music', source: 'b.mp3' });
  });

  it('Video.of carries video kind', () => {
    expect(Video.of('v.mp4')._config).toMatchObject({ kind: 'video', source: 'v.mp4' });
  });

  it('BmFont.of carries bmFont kind', () => {
    expect(BmFont.of('f.fnt')._config).toMatchObject({ kind: 'bmFont', source: 'f.fnt' });
  });
});
