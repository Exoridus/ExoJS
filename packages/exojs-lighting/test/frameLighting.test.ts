import { describe, expect, test } from 'vitest';

import { frameBackendOptions } from '../src/frameLighting';
import type { LightingHost } from '../src/LightingHost';

const host = {} as LightingHost;

describe('frameBackendOptions', () => {
  test.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY]])('rejects lightResolution %s', value => {
    expect(() => frameBackendOptions({ lightResolution: value }, 0.5)(host)).toThrow(RangeError);
  });

  test('rejects a non-finite shadowResolution and clamps an extreme one', () => {
    expect(() => frameBackendOptions({ shadowResolution: Number.NaN }, 0.5)(host)).toThrow(RangeError);
    expect(frameBackendOptions({ shadowResolution: 1e9 }, 0.5)(host).shadowResolution).toBe(4096);
    expect(frameBackendOptions({ shadowResolution: 1 }, 0.5)(host).shadowResolution).toBe(8);
  });

  test('keeps the defaults', () => {
    const options = frameBackendOptions({}, 0.5)(host);

    expect(options.resolution).toBe(0.5);
    expect(options.shadowResolution).toBe(256);
  });
});
