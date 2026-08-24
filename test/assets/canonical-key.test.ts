import { resourceKey, canonicalizeSource, resolveAssetUrl } from '#assets/canonicalKey';

describe('canonicalizeSource', () => {
  test('joins a relative source onto the base path', () => {
    expect(canonicalizeSource('/assets/', 'hero.png')).toBe('url:/assets/hero.png');
  });

  test('collapses . and .. segments to one locator', () => {
    expect(canonicalizeSource('/assets/', './hero.png')).toBe('url:/assets/hero.png');
    expect(canonicalizeSource('/assets/', 'sprites/../hero.png')).toBe('url:/assets/hero.png');
    expect(canonicalizeSource('/assets/', 'a/b/../../hero.png')).toBe('url:/assets/hero.png');
  });

  test('collapses duplicate separators', () => {
    expect(canonicalizeSource('/assets/', 'sprites//hero.png')).toBe('url:/assets/sprites/hero.png');
  });

  test('drops the fragment but keeps the query', () => {
    expect(canonicalizeSource('/assets/', 'hero.png#frame-2')).toBe('url:/assets/hero.png');
    expect(canonicalizeSource('/assets/', 'hero.png?v=2')).toBe('url:/assets/hero.png?v=2');
    expect(canonicalizeSource('/assets/', 'hero.png?v=2#a')).toBe('url:/assets/hero.png?v=2');
  });

  test('a differing query is a different resource', () => {
    expect(canonicalizeSource('/assets/', 'hero.png?v=1')).not.toBe(canonicalizeSource('/assets/', 'hero.png?v=2'));
  });

  test('absolute, protocol-relative and root-relative sources ignore the base path', () => {
    expect(canonicalizeSource('/assets/', 'https://cdn.example/a/../hero.png')).toBe('url:https://cdn.example/hero.png');
    expect(canonicalizeSource('/assets/', '//cdn.example/hero.png')).toBe('url://cdn.example/hero.png');
    expect(canonicalizeSource('/assets/', '/other/hero.png')).toBe('url:/other/hero.png');
  });

  test('never rewrites the authority when collapsing an escaping ..', () => {
    expect(canonicalizeSource('/assets/', 'https://cdn.example/../../hero.png')).toBe('url:https://cdn.example/hero.png');
  });

  test('a relative source keeps a leading .. that has nothing to collapse against', () => {
    expect(canonicalizeSource('', '../shared/hero.png')).toBe('url:../shared/hero.png');
  });

  test('blob: and data: sources pass through verbatim', () => {
    expect(canonicalizeSource('/assets/', 'blob:https://app.example/9f2')).toBe('url:blob:https://app.example/9f2');
    expect(canonicalizeSource('/assets/', 'data:text/plain,a#b')).toBe('url:data:text/plain,a#b');
  });

  test('the fetched URL is the locator without its scheme tag', () => {
    expect(`url:${resolveAssetUrl('/assets/', './a/../hero.png')}`).toBe(canonicalizeSource('/assets/', './a/../hero.png'));
  });
});

describe('resourceKey', () => {
  test('an absent or empty discriminator yields the bare type + locator key', () => {
    expect(resourceKey(3, 'url:/a.png')).toBe('3|url:/a.png');
    expect(resourceKey(3, 'url:/a.png', '')).toBe('3|url:/a.png');
  });

  test('a discriminator separates two otherwise identical sources', () => {
    expect(resourceKey(3, 'url:/w.tmj', 'orthogonal')).not.toBe(resourceKey(3, 'url:/w.tmj', 'isometric'));
  });

  test('the same locator under two types never collides', () => {
    expect(resourceKey(1, 'url:/a.json')).not.toBe(resourceKey(2, 'url:/a.json'));
  });
});
