import { describe, expect, it } from 'vitest';

import { resolveSubAssetPath } from '#resources/coreAssetBindings';

describe('resolveSubAssetPath', () => {
  it('returns absolute refs unchanged', () => {
    expect(resolveSubAssetPath('https://example.com/page.png', 'demo/fonts/x.fnt')).toBe('https://example.com/page.png');
    expect(resolveSubAssetPath('//cdn.example.com/page.png', 'demo/fonts/x.fnt')).toBe('//cdn.example.com/page.png');
    expect(resolveSubAssetPath('/assets/page.png', 'demo/fonts/x.fnt')).toBe('/assets/page.png');
    expect(resolveSubAssetPath('data:image/png;base64,AAA=', 'demo/fonts/x.fnt')).toBe('data:image/png;base64,AAA=');
  });

  it('resolves a sibling page against an absolute source URL', () => {
    expect(resolveSubAssetPath('page-0.png', 'https://example.com/assets/fonts/x.fnt')).toBe('https://example.com/assets/fonts/page-0.png');
  });

  it('resolves a sibling page against a relative source, staying relative', () => {
    expect(resolveSubAssetPath('page-0.png', 'demo/fonts/x.fnt')).toBe('demo/fonts/page-0.png');
    expect(resolveSubAssetPath('../shared/page-0.png', 'demo/fonts/x.fnt')).toBe('demo/shared/page-0.png');
  });

  it('keeps a root-absolute source root-absolute (deployment under a sub-path)', () => {
    // Regression: this used to return 'site/assets/demo/fonts/page-0.png'
    // (leading slash dropped), which the browser re-resolved against the
    // document base URL — /site/site/assets/… 404s for every BmFont page in
    // the playground.
    expect(resolveSubAssetPath('page-0.png', '/site/assets/demo/fonts/x.fnt')).toBe('/site/assets/demo/fonts/page-0.png');
  });
});
