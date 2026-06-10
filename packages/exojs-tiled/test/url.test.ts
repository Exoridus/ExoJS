import { describe, expect, it } from 'vitest';

import { resolveTiledUrl } from '../src/url';

describe('resolveTiledUrl', () => {
  it('returns an absolute http(s) ref unchanged', () => {
    expect(resolveTiledUrl('https://example.com/tiles.png', 'maps/level.tmj')).toBe('https://example.com/tiles.png');
    expect(resolveTiledUrl('http://example.com/tiles.png', 'maps/level.tmj')).toBe('http://example.com/tiles.png');
  });

  it('returns a protocol-relative ref unchanged', () => {
    expect(resolveTiledUrl('//cdn.example.com/tiles.png', 'maps/level.tmj')).toBe('//cdn.example.com/tiles.png');
  });

  it('returns a root-relative ref unchanged', () => {
    expect(resolveTiledUrl('/assets/tiles.png', 'maps/level.tmj')).toBe('/assets/tiles.png');
  });

  it('returns data: and blob: refs unchanged', () => {
    expect(resolveTiledUrl('data:image/png;base64,AAA=', 'maps/level.tmj')).toBe('data:image/png;base64,AAA=');
    expect(resolveTiledUrl('blob:https://example.com/uuid', 'maps/level.tmj')).toBe('blob:https://example.com/uuid');
  });

  it('resolves a relative ref against an absolute base', () => {
    expect(resolveTiledUrl('tiles.png', 'https://example.com/maps/level.tmj')).toBe('https://example.com/maps/tiles.png');
  });

  it('collapses ../ segments against an absolute base', () => {
    expect(resolveTiledUrl('../shared/tiles.png', 'https://example.com/maps/level.tmj')).toBe('https://example.com/shared/tiles.png');
  });

  it('resolves a relative ref against a relative base, preserving the relative form', () => {
    expect(resolveTiledUrl('tiles.png', 'maps/level.tmj')).toBe('maps/tiles.png');
  });

  it('collapses ../ segments against a relative base', () => {
    expect(resolveTiledUrl('../shared/tiles.png', 'maps/level.tmj')).toBe('shared/tiles.png');
  });

  it('resolves against a relative base with no directory component', () => {
    expect(resolveTiledUrl('tiles.png', 'level.tmj')).toBe('tiles.png');
  });

  it('preserves query strings and fragments on the ref', () => {
    expect(resolveTiledUrl('tiles.png?v=2#frag', 'maps/level.tmj')).toBe('maps/tiles.png?v=2#frag');
  });

  it('chains correctly: TMJ -> TSJ -> image, two levels of relative resolution', () => {
    const tsjUrl = resolveTiledUrl('tilesets/world.tsj', 'maps/level.tmj');
    expect(tsjUrl).toBe('maps/tilesets/world.tsj');

    const imageUrl = resolveTiledUrl('../images/world.png', tsjUrl);
    expect(imageUrl).toBe('maps/images/world.png');
  });
});
