import { describe, expect, it } from 'vitest';

import { Asset, AssetImpl } from '#resources/Asset';

describe('Asset.type config shape', () => {
  it('builds an AssetImpl with kind + source + spread opts', () => {
    const a = Asset.type('texture', 's.png', { mimeType: 'image/png' });
    expect(a).toBeInstanceOf(AssetImpl);
    expect(a._config).toMatchObject({ type: 'texture', source: 's.png', mimeType: 'image/png' });
  });

  it('works with no opts', () => {
    expect(Asset.type('json', 'a.json')._config).toEqual({ type: 'json', source: 'a.json' });
  });
});
