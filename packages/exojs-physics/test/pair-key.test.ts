import { describe, expect, it } from 'vitest';

import { pairKey,pairKeyStride } from '../src/ContactGraph';

/**
 * A4: the contact pair key packs two collider ids into one integer. The old
 * `(aId << 16) | bId` overflowed once any id reached 65536 (JS bitwise ops are
 * 32-bit), silently colliding distinct pairs. Ids are allocated monotonically
 * and never recycled, so a long-running world with heavy spawn/destroy churn
 * can reach that limit.
 */
describe('ContactGraph pairKey (A4 16-bit overflow fix)', () => {
  it('produces a distinct key for every distinct ordered id pair, including ids past 65535', () => {
    const ids = [1, 2, 65_535, 65_536, 65_537, 100_000, 1_000_000];
    const keys = new Set<number>();

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        keys.add(pairKey(ids[i], ids[j]));
      }
    }

    // C(7,2) = 21 pairs, all keys distinct.
    expect(keys.size).toBe(21);
  });

  it('stays within the safe-integer range for large ids', () => {
    const key = pairKey(1_000_000, 2_000_000);

    expect(Number.isSafeInteger(key)).toBe(true);
    expect(key).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });

  it('regression: the old 16-bit scheme collided where the new one does not', () => {
    const oldKey = (aId: number, bId: number): number => (aId << 16) | bId;

    // id 65536 wraps to 0 under `<< 16`, colliding pair (65536, 5) with (0, 5).
    expect(oldKey(65_536, 5)).toBe(oldKey(0, 5));
    expect(pairKey(65_536, 5)).not.toBe(pairKey(0, 5));
    expect(pairKeyStride).toBe(2 ** 26);
  });
});
