import '#assets/coreAssetTypes';

import { describe, expect, it } from 'vitest';

import { Asset } from '#assets/Asset';
import { AssetRef } from '#assets/AssetRef';
import { Assets } from '#assets/Assets';
import { Texture } from '#rendering/texture/Texture';

describe('Assets.one', () => {
  it('builds a single idle value leaf from a config', () => {
    const chunk = Assets.one({ type: 'json', source: 'c.json' });

    expect(chunk).toBeInstanceOf(AssetRef);
    expect(chunk.state).toBe('idle');
  });

  it('builds a single idle resource leaf from a bare path', () => {
    const ship = Assets.one('sprites/ship.png');

    expect(ship).toBeInstanceOf(Texture);
    expect(ship.state).toBe('idle');
  });

  it('accepts an Asset.type() descriptor (same descriptor set as a catalog field)', () => {
    const cfg = Assets.one(Asset.type('json', 'c.json'));

    expect(cfg).toBeInstanceOf(AssetRef);
  });
});
