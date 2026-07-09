import '#resources/seamless';

import { Texture } from '#rendering/texture/Texture';
import { Asset } from '#resources/Asset';
import { _readMeta } from '#resources/assetMeta';
import { Assets } from '#resources/Assets';

describe('Assets', () => {
  test('materializes plain configs into meta-stamped handle-hybrid leaves, exposed as direct properties and via entries', () => {
    const bag = new Assets({
      logo: { type: 'texture', source: '/logo.png' },
    });

    // The leaf IS a usable placeholder resource (heals in place once adopted),
    // carrying its descriptor as non-enumerable asset meta.
    expect(bag.logo).toBeInstanceOf(Texture);
    expect(_readMeta(bag.logo)).toEqual({ kind: 'texture', src: '/logo.png', opts: undefined });
    expect(bag.entries.logo).toBe(bag.logo);
  });

  test('carries extra config fields into the leaf meta opts', () => {
    const bag = new Assets({
      logo: { type: 'texture', source: '/logo.png', samplerOptions: { minFilter: 'nearest' } },
    });

    expect(_readMeta(bag.logo)).toEqual({ kind: 'texture', src: '/logo.png', opts: { samplerOptions: { minFilter: 'nearest' } } });
  });

  test('converts an already-constructed Asset into a fresh handle-hybrid leaf (no longer passed through by reference)', () => {
    const existing = new Asset({ type: 'texture', source: '/shared.png' });
    const bag = new Assets({ logo: existing });

    // Pre-1.0 breaking change: a catalog value is always materialized as a leaf.
    expect(bag.logo).not.toBe(existing);
    expect(bag.logo).toBeInstanceOf(Texture);
    expect(_readMeta(bag.logo)).toEqual({ kind: 'texture', src: '/shared.png', opts: undefined });
    expect(bag.entries.logo).toBe(bag.logo);
  });

  test('rejects a definition that defines a reserved "entries" key', () => {
    expect(() => new Assets({ entries: { type: 'texture', source: '/x.png' } } as never)).toThrow(/reserved/);
  });
});
