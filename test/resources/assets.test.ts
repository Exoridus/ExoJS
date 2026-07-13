import '#resources/coreAssetBindings';

import { Sound } from '#audio/Sound';
import { logger } from '#core/logging';
import { Texture } from '#rendering/texture/Texture';
import { Asset } from '#resources/Asset';
import { _readMeta } from '#resources/assetMeta';
import { AssetRef } from '#resources/AssetRef';
import { Assets } from '#resources/Assets';

describe('Assets', () => {
  test('materializes plain configs into meta-stamped handle-hybrid leaves, exposed as direct properties and via entries', () => {
    const bag = new Assets({
      logo: { kind: 'texture', source: '/logo.png' },
    });

    // The leaf IS a usable placeholder resource (heals in place once adopted),
    // carrying its descriptor as non-enumerable asset meta.
    expect(bag.logo).toBeInstanceOf(Texture);
    expect(_readMeta(bag.logo)).toEqual({ kind: 'texture', src: '/logo.png', opts: undefined });
    expect(bag.entries.logo).toBe(bag.logo);
  });

  test('carries extra config fields into the leaf meta opts', () => {
    const bag = new Assets({
      logo: { kind: 'texture', source: '/logo.png', samplerOptions: { minFilter: 'nearest' } },
    });

    expect(_readMeta(bag.logo)).toEqual({ kind: 'texture', src: '/logo.png', opts: { samplerOptions: { minFilter: 'nearest' } } });
  });

  test('converts an already-constructed Asset into a fresh handle-hybrid leaf (no longer passed through by reference)', () => {
    const existing = new Asset({ kind: 'texture', source: '/shared.png' });
    const bag = new Assets({ logo: existing });

    // Pre-1.0 breaking change: a catalog value is always materialized as a leaf.
    expect(bag.logo).not.toBe(existing);
    expect(bag.logo).toBeInstanceOf(Texture);
    expect(_readMeta(bag.logo)).toEqual({ kind: 'texture', src: '/shared.png', opts: undefined });
    expect(bag.entries.logo).toBe(bag.logo);
  });

  test('rejects a definition that defines a reserved "entries" key', () => {
    expect(() => new Assets({ entries: { kind: 'texture', source: '/x.png' } } as never)).toThrow(/reserved/);
  });
});

describe('Assets.from bare-string inference', () => {
  it('builds a Texture leaf from a .png string, meta-stamped', () => {
    const a = Assets.from({ ship: 'sprites/ship.png' });
    expect(a.ship).toBeInstanceOf(Texture);
    expect(_readMeta(a.ship)).toMatchObject({ kind: 'texture', src: 'sprites/ship.png' });
  });
  it('builds a Sound leaf from an .ogg string', () => {
    expect(Assets.from({ boom: 'sfx/boom.ogg' }).boom).toBeInstanceOf(Sound);
  });
  it('builds an AssetRef leaf from a .json string', () => {
    expect(Assets.from({ level: 'levels/1.json' }).level).toBeInstanceOf(AssetRef);
  });
  it('throws a guiding error for an unregistered suffix', () => {
    expect(() => Assets.from({ x: 'a/b.zzz' })).toThrow(/no asset kind|X\.of\(\)/);
  });
  it('still accepts explicit configs (existing form) unchanged', () => {
    expect(Assets.from({ ship: { kind: 'texture', source: 's.png' } }).ship).toBeInstanceOf(Texture);
  });
});

describe('Assets dev-mode typo guard (#311)', () => {
  let entries: string[];
  let removeSink: () => void;

  beforeEach(() => {
    logger._resetOnce();
    entries = [];
    removeSink = logger.addSink(e => entries.push(e.message));
  });

  afterEach(() => removeSink());

  const missingKeyCount = (): number => entries.filter(m => m.includes('is not a defined catalog key')).length;

  test('warns once when an unknown string key is read (typo)', () => {
    const bag = Assets.from({ logo: 'sprites/logo.png' });

    void (bag as any).logoo;
    void (bag as any).logoo;

    expect(missingKeyCount()).toBe(1); // once, despite two reads
  });

  test('still returns undefined for the unknown key (behavior unchanged)', () => {
    const bag = Assets.from({ logo: 'sprites/logo.png' });

    expect((bag as any).logoo).toBeUndefined();
  });

  test('does not warn for a real catalog key or `entries`', () => {
    const bag = Assets.from({ logo: 'sprites/logo.png' });

    void bag.logo;
    void bag.entries;

    expect(missingKeyCount()).toBe(0);
  });

  test('does not warn for inherited Object.prototype members', () => {
    const bag = Assets.from({ logo: 'sprites/logo.png' });

    void bag.toString;
    void bag.constructor;
    void bag.hasOwnProperty;

    expect(missingKeyCount()).toBe(0);
  });

  test('does not warn for `then` or `toJSON` duck-typing probes', () => {
    const bag = Assets.from({ logo: 'sprites/logo.png' });

    void (bag as any).then;
    void (bag as any).toJSON;

    expect(missingKeyCount()).toBe(0);
  });

  test('does not warn for a Symbol key', () => {
    const bag = Assets.from({ logo: 'sprites/logo.png' });

    void (bag as any)[Symbol.iterator];

    expect(missingKeyCount()).toBe(0);
  });
});
