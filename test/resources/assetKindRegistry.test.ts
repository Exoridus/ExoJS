import { describe, expect, it } from 'vitest';
import { Texture } from '#rendering/texture/Texture';
import { AssetRef } from '#resources/AssetRef';
import { createLeaf, getAssetKind } from '#resources/assetKindRegistry';
import { _readMeta } from '#resources/assetMeta';
import '#resources/seamless'; // side-effect: registers core kinds

describe('assetKindRegistry', () => {
  it('registers core resource kinds with an adapter', () => {
    expect(getAssetKind('texture')?.isValue).toBe(false);
    expect(getAssetKind('texture')?.adapter).toBeDefined();
  });

  it('registers core value kinds without an adapter', () => {
    expect(getAssetKind('json')).toEqual({ isValue: true });
  });

  it('createLeaf builds a meta-stamped placeholder Texture for a resource kind', () => {
    const leaf = createLeaf('texture', 'ship.png', { width: 32, height: 16 });
    expect(leaf).toBeInstanceOf(Texture);
    expect((leaf as Texture).loadState).toBe('loading');
    expect(_readMeta(leaf)).toEqual({ kind: 'texture', src: 'ship.png', opts: { width: 32, height: 16 } });
  });

  it('createLeaf builds a meta-stamped AssetRef for a value kind', () => {
    const leaf = createLeaf('json', 'level.json');
    expect(leaf).toBeInstanceOf(AssetRef);
    expect(_readMeta(leaf)).toEqual({ kind: 'json', src: 'level.json', opts: undefined });
  });
});
