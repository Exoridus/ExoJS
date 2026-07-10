import { describe, expect, it } from 'vitest';

import { Asset, AssetImpl } from '#resources/Asset';

describe('Asset.kind config shape', () => {
  it('builds an AssetImpl with kind + source + spread opts', () => {
    const a = Asset.kind('texture', 's.png', { mimeType: 'image/png' });
    expect(a).toBeInstanceOf(AssetImpl);
    expect(a._config).toMatchObject({ kind: 'texture', source: 's.png', mimeType: 'image/png' });
  });

  it('works with no opts', () => {
    expect(Asset.kind('json', 'a.json')._config).toEqual({ kind: 'json', source: 'a.json' });
  });
});
