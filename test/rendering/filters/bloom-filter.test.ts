import { describe, expect, test } from 'vitest';

import { Rectangle } from '#math/Rectangle';
import { BloomFilter } from '#rendering/filters/BloomFilter';

describe('BloomFilter bounds', () => {
  test('reaches as far as the blur, plus the spread the halving chain adds on its own', () => {
    const filter = new BloomFilter({ strength: 4, levels: 3 });
    const output = new Rectangle();

    filter.getOutputBounds(new Rectangle(100, 100, 50, 20), output);

    // 4 x 3 for the truncated Gaussian, 2^3 for the chain: 20 on every edge.
    expect([output.x, output.y, output.width, output.height]).toEqual([80, 80, 90, 60]);
    filter.destroy();
  });

  test('a glow without blur still reaches as far as its chain', () => {
    const filter = new BloomFilter({ strength: 0, levels: 1 });
    const output = new Rectangle();

    filter.getOutputBounds(new Rectangle(0, 0, 10, 10), output);

    expect([output.x, output.y, output.width, output.height]).toEqual([-2, -2, 14, 14]);
    filter.destroy();
  });
});

describe('BloomFilter options', () => {
  test('clamps the levels to a whole number of halvings between one and five', () => {
    expect(new BloomFilter({ levels: 0 }).levels).toBe(1);
    expect(new BloomFilter({ levels: 9 }).levels).toBe(5);
    expect(new BloomFilter({ levels: 2.7 }).levels).toBe(2);
    expect(new BloomFilter().levels).toBe(3);
  });

  test('clamps the threshold to the 0..1 range luminance lives in', () => {
    const filter = new BloomFilter({ threshold: 2 });

    expect(filter.threshold).toBe(1);
    filter.threshold = -1;
    expect(filter.threshold).toBe(0);
    filter.destroy();
  });

  test('refuses a negative intensity or strength', () => {
    const filter = new BloomFilter();

    filter.intensity = -3;
    expect(filter.intensity).toBe(0);
    filter.strength = -1;
    expect(filter.strength).toBe(0);
    filter.destroy();
  });

  test('carries the blur tap cap through to its own blur', () => {
    const filter = new BloomFilter({ quality: 2.7 });

    expect(filter.quality).toBe(2);
    filter.quality = 4;
    expect(filter.quality).toBe(4);
    filter.destroy();
  });

  test('defaults to a soft, visible glow over the brightest fifth of the range', () => {
    const filter = new BloomFilter();

    expect(filter.threshold).toBe(0.8);
    expect(filter.intensity).toBe(1);
    expect(filter.strength).toBe(8);
    filter.destroy();
  });
});
