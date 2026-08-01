/**
 * Unit tests for the shared spatial position-smoothing layer
 * (`src/audio/spatial-smoothing.ts`) that fixes AU4 zipper noise: epsilon-skip
 * for stationary emitters, teleport-snap on large jumps, and `setTargetAtTime`
 * ramping for ordinary movement.
 */

import {
  createSpatialSmoothingSettings,
  createVelocitySample,
  DEFAULT_SPATIAL_SMOOTHING,
  DEFAULT_TELEPORT_THRESHOLD,
  deriveVelocity,
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

  test('createSpatialSmoothingSettings() defaults panningModel to equalpower', () => {
    const settings = createSpatialSmoothingSettings();
    expect(settings.panningModel).toBe('equalpower');
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

describe('deriveVelocity', () => {
  test('a duplicate same-timestamp tick does not erase a just-derived velocity', () => {
    const sample = createVelocitySample();

    deriveVelocity(sample, 0, 0, 0); // first sample — seeds lastPosition, no velocity yet
    deriveVelocity(sample, 100, 0, 1); // real movement over 1 second
    expect(sample.x).toBe(100);
    expect(sample.y).toBe(0);

    // A second tick at the exact same position AND the exact same
    // AudioContext.currentTime (e.g. an explicit `voice.position = …` write
    // immediately followed by the manager's per-frame tick, both landing in
    // the same render quantum) must not stomp the velocity just derived.
    deriveVelocity(sample, 100, 0, 1);
    expect(sample.x).toBe(100);
    expect(sample.y).toBe(0);
  });

  test('a genuinely later stationary tick still zeroes the derived velocity', () => {
    const sample = createVelocitySample();

    deriveVelocity(sample, 0, 0, 0);
    deriveVelocity(sample, 100, 0, 1);
    expect(sample.x).toBe(100);

    // Same position as the last sample, but a distinctly LATER timestamp —
    // the source has genuinely stopped moving, so the derived velocity must
    // now zero out rather than keep coasting on the last non-zero value.
    deriveVelocity(sample, 100, 0, 2);
    expect(sample.x).toBe(0);
    expect(sample.y).toBe(0);
  });

  test('the very first sample seeds position with zero velocity', () => {
    const sample = createVelocitySample();
    deriveVelocity(sample, 42, -7, 5);
    expect(sample.x).toBe(0);
    expect(sample.y).toBe(0);
    expect(sample.lastPosition).toEqual({ x: 42, y: -7 });
  });
});
