import { describe, expect, it } from 'vitest';

import { _makeAsset, AssetImpl } from '#resources/Asset';

describe('_makeAsset', () => {
  it('builds an AssetImpl with kind + source + spread opts', () => {
    const a = _makeAsset('texture', 's.png', { mimeType: 'image/png' });
    expect(a).toBeInstanceOf(AssetImpl);
    expect(a._config).toMatchObject({ type: 'texture', source: 's.png', mimeType: 'image/png' });
  });

  it('works with no opts', () => {
    expect(_makeAsset('json', 'a.json')._config).toEqual({ type: 'json', source: 'a.json' });
  });
});
