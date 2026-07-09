import { describe, expect, it } from 'vitest';

import { assetMeta, readMeta, stampMeta } from '#resources/assetMeta';

describe('assetMeta', () => {
  it('stamps and reads back meta, non-enumerable', () => {
    const target = new Map<string, number>();
    const returned = stampMeta(target, { kind: 'texture', src: 'ship.png' });

    expect(returned).toBe(target); // returns the same object
    expect(readMeta(target)).toEqual({ kind: 'texture', src: 'ship.png' });
    expect(Object.keys(target)).not.toContain(assetMeta.toString()); // non-enumerable
    expect((target as { [assetMeta]?: unknown })[assetMeta]).toBeDefined();
  });

  it('readMeta returns undefined for unstamped and primitive values', () => {
    expect(readMeta({})).toBeUndefined();
    expect(readMeta(null)).toBeUndefined();
    expect(readMeta(42)).toBeUndefined();
  });
});
