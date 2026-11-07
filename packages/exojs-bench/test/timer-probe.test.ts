import { afterEach, describe, expect, test, vi } from 'vitest';

import { createTimestampRig, timestampsQuantized } from '../src/rendering/page/timerProbe';

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

describe('createTimestampRig', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('times every encoder up to the declared encoder budget', () => {
    vi.stubGlobal('GPUBufferUsage', { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 });
    const device = {
      features: new Set(['timestamp-query']),
      createQuerySet: () => ({}),
      createBuffer: () => ({}),
      createCommandEncoder: () => ({
        beginRenderPass: (_descriptor: object) => ({}),
        finish: () => ({}),
        resolveQuerySet: () => undefined,
      }),
    };
    const rig = createTimestampRig(device as never);

    rig.beginFrame(0);

    for (let i = 0; i < 512; i++) {
      const encoder = device.createCommandEncoder();

      encoder.beginRenderPass({});
      encoder.finish();
    }

    expect(rig.notes).toEqual([]);
  });
});
