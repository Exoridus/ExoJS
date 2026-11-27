import { describe, expect, it } from 'vitest';

import { findUsedAssets } from '../../site/src/lib/used-assets';

const base = 'https://example.test/ExoJS/';
const entries = [{ key: 'ship', path: 'images/ship.png' }];

describe('loaded example assets', () => {
  it('accepts canonical URL locators returned by loader inspection', () => {
    expect(findUsedAssets([`url:${base}vendor/exojs-demo-assets/media/images/ship.png`], entries, base)).toEqual([
      { key: 'ship', path: 'images/ship.png', source: `${base}vendor/exojs-demo-assets/media/images/ship.png` },
    ]);
  });
  it('matches actual catalog URLs and deduplicates cache-busting requests', () => {
    expect(
      findUsedAssets(
        [
          `${base}vendor/exojs-demo-assets/media/images/ship.png?no-cache=1`,
          `${base}vendor/exojs-demo-assets/media/images/ship.png?no-cache=2`,
        ],
        entries,
        base,
      ),
    ).toEqual([{ key: 'ship', path: 'images/ship.png', source: `${base}vendor/exojs-demo-assets/media/images/ship.png?no-cache=2` }]);
  });
  it('keeps uncatalogued resources honest instead of inventing a catalog entry', () => {
    expect(findUsedAssets(['https://other.test/images/ship.png'], entries, base)).toEqual([
      { key: undefined, path: 'ship.png', source: 'https://other.test/images/ship.png' },
    ]);
    expect(findUsedAssets([], entries, base)).toEqual([]);
  });
  it('does not turn generated or executable locators into links', () => {
    expect(
      findUsedAssets(
        ['javascript:alert(1)', 'data:image/png;base64,abc', 'blob:https://example.test/generated', 'http://['],
        entries,
        base,
      ),
    ).toEqual([]);
  });
});
