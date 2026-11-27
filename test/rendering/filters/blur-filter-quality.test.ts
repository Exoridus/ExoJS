import { describe, expect, test } from 'vitest';

import { BlurFilter } from '#rendering/filters/BlurFilter';

describe('BlurFilter quality', () => {
  test('0 returns a capped filter to the derived tap count', () => {
    const filter = new BlurFilter({ strength: 4, quality: 5 });

    expect(filter.quality).toBe(5);

    filter.quality = 0;

    expect(filter.quality).toBe(0);
  });

  test('a positive cap is clamped into the shader table', () => {
    const filter = new BlurFilter({ quality: 1000 });

    expect(filter.quality).toBe(32);
  });
});
