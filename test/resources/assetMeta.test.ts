import { describe, expect, it } from 'vitest';

import { _assetMeta, _readMeta, _stampMeta } from '#resources/assetMeta';

describe('assetMeta', () => {
  it('stamps and reads back meta, non-enumerable', () => {
    const target = new Map<string, number>();
    const returned = _stampMeta(target, { kind: 'texture', src: 'ship.png' });

    expect(returned).toBe(target); // returns the same object
    expect(_readMeta(target)).toEqual({ kind: 'texture', src: 'ship.png' });
    expect(Object.getOwnPropertyDescriptor(target, _assetMeta)?.enumerable).toBe(false); // non-enumerable
    expect((target as { [_assetMeta]?: unknown })[_assetMeta]).toBeDefined();
  });

  it('readMeta returns undefined for unstamped and primitive values', () => {
    expect(_readMeta({})).toBeUndefined();
    expect(_readMeta(null)).toBeUndefined();
    expect(_readMeta(42)).toBeUndefined();
  });
});
