import { describe, expect, test } from 'vitest';

import { frameBackendOptions } from '../src/frameLighting';
import type { LightingHost } from '../src/LightingHost';

const host = {} as LightingHost;

describe('frameBackendOptions', () => {
  test.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY]])('rejects lightResolution %s', value => {
    expect(() => frameBackendOptions(host, { lightResolution: value }, 0.5)).toThrow(RangeError);
  });

  test('rejects a non-finite shadowResolution and clamps an extreme one', () => {
    expect(() => frameBackendOptions(host, { shadowResolution: Number.NaN }, 0.5)).toThrow(RangeError);
    expect(frameBackendOptions(host, { shadowResolution: 1e9 }, 0.5).shadowResolution).toBe(4096);
    expect(frameBackendOptions(host, { shadowResolution: 1 }, 0.5).shadowResolution).toBe(8);
  });

  test('keeps the defaults', () => {
    const options = frameBackendOptions(host, {}, 0.5);

    expect(options.resolution).toBe(0.5);
    expect(options.shadowResolution).toBe(256);
  });
});
