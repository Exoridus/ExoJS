import { describe, expect, test } from 'vitest';

import { timestampsQuantized } from '../src/rendering/page/timerProbe';

const frame = (gpuPassMs: number | null) => ({ gpuPassMs });
const available = { available: true };
const unavailable = { available: false };

describe('timestampsQuantized', () => {
  test('is null when the rig is absent or unavailable', () => {
    expect(timestampsQuantized(null, [frame(0.041)])).toBeNull();
    expect(timestampsQuantized(unavailable, [frame(0.041)])).toBeNull();
  });

  test('is null when no frame resolved a render-pass timestamp', () => {
    // An empty sample set is the absence of the observation, not evidence that
    // the clock quantises.
    expect(timestampsQuantized(available, [frame(null), frame(null)])).toBeNull();
    expect(timestampsQuantized(available, [])).toBeNull();
  });

  test('is true when every resolved timestamp is a multiple of 100 microseconds (0.1 ms)', () => {
    expect(timestampsQuantized(available, [frame(0.1), frame(0.2)])).toBe(true);
  });

  test('is false when a resolved timestamp is finer than 100 microseconds', () => {
    expect(timestampsQuantized(available, [frame(0.1), frame(0.15)])).toBe(false);
    expect(timestampsQuantized(available, [frame(0.041)])).toBe(false);
  });
});
