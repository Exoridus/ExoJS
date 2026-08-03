import { describe, expect, it } from 'vitest';

import { _assetMeta, _readMeta, _stampMeta } from '#assets/assetMeta';
import { AssetRef } from '#assets/AssetRef';

describe('assetMeta', () => {
  it('stamps and reads back meta, non-enumerable', () => {
    const target = new Map<string, number>();
    const returned = _stampMeta(target, { kind: 'texture', src: 'ship.png' });

    expect(returned).toBe(target); // returns the same object
    expect(_readMeta(target)).toEqual({ kind: 'texture', src: 'ship.png' });
    expect(Object.getOwnPropertyDescriptor(target, _assetMeta)?.enumerable).toBe(false); // non-enumerable
    expect((target as { [_assetMeta]?: unknown })[_assetMeta]).toBeDefined();
  });

  it('stamps an AssetRef the same way — the value-leaf half of the same contract', () => {
    const ref = new AssetRef<{ hp: number }>();
    const returned = _stampMeta(ref, { kind: 'json', src: 'config.json' });

    expect(returned).toBe(ref);
    expect(_readMeta(ref)).toEqual({ kind: 'json', src: 'config.json' });
    // The stamp carries no `_resolvedType` — that field is a type-level phantom
    // used to recover the payload type, never written at runtime.
    expect(Object.hasOwn(_readMeta(ref) as object, '_resolvedType')).toBe(false);
  });

  it('readMeta returns undefined for unstamped and primitive values', () => {
    expect(_readMeta({})).toBeUndefined();
    expect(_readMeta(null)).toBeUndefined();
    expect(_readMeta(42)).toBeUndefined();
  });
});
