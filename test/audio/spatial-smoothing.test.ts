/**
 * Unit tests for the shared spatial position-smoothing layer
 * (`src/audio/spatial-smoothing.ts`) that fixes AU4 zipper noise: epsilon-skip
 * for stationary emitters, teleport-snap on large jumps, and `setTargetAtTime`
 * ramping for ordinary movement.
 */

import {
  createSpatialSmoothingSettings,
  DEFAULT_SPATIAL_SMOOTHING,
  DEFAULT_TELEPORT_THRESHOLD,
  POSITION_EPSILON,
  SmoothedAudioParam,
  type SpatialSmoothingSettings,
} from '#audio/spatial-smoothing';

interface MockParam {
  setValueAtTime: MockInstance;
  setTargetAtTime: MockInstance;
  cancelScheduledValues: MockInstance;
}

const makeParam = (): MockParam => ({
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
});

describe('spatial-smoothing — defaults', () => {
  test('createSpatialSmoothingSettings() returns the documented defaults', () => {
    const settings = createSpatialSmoothingSettings();
    expect(settings.smoothing).toBe(DEFAULT_SPATIAL_SMOOTHING);
    expect(settings.teleportThreshold).toBe(DEFAULT_TELEPORT_THRESHOLD);
    expect(DEFAULT_SPATIAL_SMOOTHING).toBe(0.02);
    expect(DEFAULT_TELEPORT_THRESHOLD).toBe(400);
  });
});

describe('SmoothedAudioParam', () => {
  let settings: SpatialSmoothingSettings;

  beforeEach(() => {
    settings = createSpatialSmoothingSettings();
  });

  test('first write snaps with setValueAtTime (never a ramp)', () => {
    const p = makeParam();
    const s = new SmoothedAudioParam();

    s.write(p as unknown as AudioParam, 100, 0, settings);

    expect(p.setValueAtTime).toHaveBeenCalledWith(100, 0);
    expect(p.cancelScheduledValues).toHaveBeenCalledWith(0);
    expect(p.setTargetAtTime).not.toHaveBeenCalled();
  });

  test('a small subsequent move ramps with setTargetAtTime (no zipper)', () => {
    const p = makeParam();
    const s = new SmoothedAudioParam();

    s.write(p as unknown as AudioParam, 100, 0, settings);
    p.setValueAtTime.mockClear();
    p.setTargetAtTime.mockClear();

    s.write(p as unknown as AudioParam, 150, 0.016, settings);

    expect(p.setTargetAtTime).toHaveBeenCalledWith(150, 0.016, DEFAULT_SPATIAL_SMOOTHING);
    expect(p.setValueAtTime).not.toHaveBeenCalled();
  });

  test('a stationary value (within epsilon) is skipped entirely', () => {
    const p = makeParam();
    const s = new SmoothedAudioParam();

    s.write(p as unknown as AudioParam, 100, 0, settings);
    p.setValueAtTime.mockClear();
    p.setTargetAtTime.mockClear();
    p.cancelScheduledValues.mockClear();

    // Move by less than POSITION_EPSILON — treated as stationary.
    s.write(p as unknown as AudioParam, 100 + POSITION_EPSILON / 2, 0.016, settings);

    expect(p.setValueAtTime).not.toHaveBeenCalled();
    expect(p.setTargetAtTime).not.toHaveBeenCalled();
    expect(p.cancelScheduledValues).not.toHaveBeenCalled();
  });

  test('a jump larger than teleportThreshold snaps instead of ramping', () => {
    const p = makeParam();
    const s = new SmoothedAudioParam();

    s.write(p as unknown as AudioParam, 0, 0, settings);
    p.setValueAtTime.mockClear();
    p.setTargetAtTime.mockClear();

    s.write(p as unknown as AudioParam, DEFAULT_TELEPORT_THRESHOLD + 1, 0.016, settings);

    expect(p.setValueAtTime).toHaveBeenCalledWith(DEFAULT_TELEPORT_THRESHOLD + 1, 0.016);
    expect(p.setTargetAtTime).not.toHaveBeenCalled();
  });

  test('smoothing <= 0 disables ramping — every write snaps', () => {
    const p = makeParam();
    const s = new SmoothedAudioParam();
    settings.smoothing = 0;

    s.write(p as unknown as AudioParam, 10, 0, settings);
    s.write(p as unknown as AudioParam, 20, 0.016, settings);

    expect(p.setValueAtTime).toHaveBeenCalledTimes(2);
    expect(p.setTargetAtTime).not.toHaveBeenCalled();
  });

  test('reset() makes the next write snap again', () => {
    const p = makeParam();
    const s = new SmoothedAudioParam();

    s.write(p as unknown as AudioParam, 100, 0, settings);
    s.reset();
    p.setValueAtTime.mockClear();
    p.setTargetAtTime.mockClear();

    s.write(p as unknown as AudioParam, 110, 0.016, settings);

    expect(p.setValueAtTime).toHaveBeenCalledWith(110, 0.016);
    expect(p.setTargetAtTime).not.toHaveBeenCalled();
  });
});
