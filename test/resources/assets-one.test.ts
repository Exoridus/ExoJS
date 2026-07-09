import '#resources/coreAssetBindings';

import { describe, expect, it } from 'vitest';

import { Texture } from '#rendering/texture/Texture';
import { Asset } from '#resources/Asset';
import { AssetRef } from '#resources/AssetRef';
import { Assets } from '#resources/Assets';

describe('Assets.one', () => {
  it('builds a single idle value leaf from a config', () => {
    const chunk = Assets.one({ kind: 'json', source: 'c.json' });

    expect(chunk).toBeInstanceOf(AssetRef);
    expect(chunk.state).toBe('idle');
  });

  it('builds a single idle resource leaf from a bare path', () => {
    const ship = Assets.one('sprites/ship.png');

    expect(ship).toBeInstanceOf(Texture);
    expect(ship.state).toBe('idle');
  });

  it('accepts an Asset.kind() descriptor (same descriptor set as a catalog field)', () => {
    const cfg = Assets.one(Asset.kind('json', 'c.json'));

    expect(cfg).toBeInstanceOf(AssetRef);
  });
});
