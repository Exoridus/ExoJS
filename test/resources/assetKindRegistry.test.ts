import '#resources/seamless'; // side-effect: registers core kinds

import { describe, expect, it } from 'vitest';

import { Texture } from '#rendering/texture/Texture';
import { createLeaf, getAssetKind, registerAssetKind } from '#resources/assetKindRegistry';
import { _readMeta } from '#resources/assetMeta';
import { AssetRef } from '#resources/AssetRef';
import { soundSeamlessAdapter } from '#resources/seamless';

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

  it('registerAssetKind throws when re-registering a kind with a different adapter', () => {
    // texture is already registered by the '#resources/seamless' side-effect import above.
    // Re-registering with a different adapter must throw and must NOT mutate the registry.
    expect(() => registerAssetKind('texture', { adapter: soundSeamlessAdapter, isValue: false })).toThrow(/already registered/);
    // Confirm the throw left the original registration intact.
    expect(getAssetKind('texture')?.adapter).not.toBe(soundSeamlessAdapter);
  });

  it('registerAssetKind throws when re-registering a kind with the same adapter but a flipped isValue', () => {
    const before = getAssetKind('texture');
    expect(() => registerAssetKind('texture', { adapter: before?.adapter, isValue: true })).toThrow(/already registered/);
    // Confirm the throw left the original registration intact.
    expect(getAssetKind('texture')).toEqual(before);
  });

  it('createLeaf throws for a kind that has no registration', () => {
    // 'bmFont' is a valid AssetDefinitions key that the core seamless registration does not register.
    expect(() => createLeaf('bmFont', 'x.fnt')).toThrow(/no kind registered/);
  });
});
