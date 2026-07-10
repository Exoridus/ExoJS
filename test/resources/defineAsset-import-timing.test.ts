// Import ONLY the catalog facade and the core-binding module — NO Application,
// no Loader. This proves `defineAsset` runs its global kind/extension
// registrations as an import side effect, so `Assets.from` resolves bare paths
// loader-free (asset-system v2 §5). If core registration were still tied to
// Application construction, `createLeaf` would throw here.
import '#resources/coreAssetBindings';

import { describe, expect, it } from 'vitest';

import { Texture } from '#rendering/texture/Texture';
import { AssetRef } from '#resources/AssetRef';
import { Assets } from '#resources/Assets';

describe('defineAsset import-timing regression', () => {
  it('resolves a loader-free catalog from a plain import', () => {
    const catalog = Assets.from({ ship: 'sprites/ship.png', level: 'level.json' });

    // Resource kind → a real placeholder handle.
    expect(catalog.ship).toBeInstanceOf(Texture);
    expect((catalog.ship as Texture).loadState).toBe('idle');

    // Value kind → a deferred AssetRef.
    expect(catalog.level).toBeInstanceOf(AssetRef);
  });
});
