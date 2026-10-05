import type { BeatFixture } from '../fixtures/beat-fixtures';
import { computeMirMetrics } from './beat-metrics';
import type { BeatMessage, StateMessage } from './beat-sandbox';

const fixture = (times: number[]): BeatFixture => ({ samples: new Float32Array(48000 * 4), beatTimesSec: times, bpm: 120, label: 'metric-contract' });
const beat = (audioTime: number, postedAt = audioTime, status: BeatMessage['status'] = 'locked'): BeatMessage => ({
  type: 'beat',
  audioTime,
  _audioTimeSec: postedAt,
  status,
  tempo: 120,
  confidence: 1,
  beatPhase: 0,
  energy: 1,
  isDownbeat: false,
  beatInBar: 1,
});

describe('MIR event metrics', () => {
  it('counts duplicate emissions once and reports precision, recall and F1', () => {
    const result = computeMirMetrics([beat(1), beat(1), beat(2)], fixture([1, 2, 3]));
    expect(result.all.matchedCount).toBe(2);
    expect(result.all.falsePositiveCount).toBe(1);
    expect(result.all.missCount).toBe(1);
    expect(result.all.precision).toBeCloseTo(2 / 3);
    expect(result.all.recall).toBeCloseTo(2 / 3);
    expect(result.all.f1).toBeCloseTo(2 / 3);
  });

  it('uses a fixed 70 ms window, independent of tempo', () => {
    const result = computeMirMetrics([beat(1.1)], fixture([1]));
    expect(result.all.f1).toBe(0);
    expect(result.all.timestampErrorMs).toBeNull();
    expect(computeMirMetrics([beat(1.1)], fixture([1]), { toleranceMs: 110 }).all.f1).toBe(1);
  });

  it('includes the tolerance boundary despite floating-point subtraction', () => {
    expect(computeMirMetrics([beat(1.07)], fixture([1])).all.f1).toBe(1);
    expect(computeMirMetrics([beat(1.070001)], fixture([1])).all.f1).toBe(0);
  });

  it('maximizes one-to-one matches before minimizing timing error', () => {
    const result = computeMirMetrics([beat(1.04), beat(1.1)], fixture([1, 1.06]));
    expect(result.all.matchedCount).toBe(2);
    expect(result.all.timestampErrorMs?.meanAbs).toBeCloseTo(40);
    expect(computeMirMetrics([beat(1.1), beat(1.04)], fixture([1.06, 1])).all).toEqual(result.all);
    expect(computeMirMetrics([beat(1.01), beat(1.05)], fixture([1])).all.timestampErrorMs?.meanAbs).toBeCloseTo(10);
  });

  it('separates backdated timestamps from block-bounded posting latency', () => {
    const result = computeMirMetrics([beat(101.01, 1.12, 'provisional')], fixture([1]), { contextStartSec: 100, blockSize: 128 });
    expect(result.all.timestampErrorMs?.signedMean).toBeCloseTo(10);
    expect(result.all.postingLatencyMs?.medianLower).toBeCloseTo(120);
    expect(result.all.postingLatencyMs?.p90Upper).toBeCloseTo(120 + 128 / 48);
    expect(result.provisional.matchedCount).toBe(1);
    expect(result.locked.emittedCount).toBe(0);
  });

  it('preserves negative posting latency for predictions instead of clamping', () => {
    const result = computeMirMetrics([beat(1, 0.98)], fixture([1]));
    expect(result.all.postingLatencyMs?.medianLower).toBeCloseTo(-20);
  });

  it('reports absent denominators and absent timing samples as null', () => {
    const result = computeMirMetrics([], fixture([]));
    expect(result.all.precision).toBeNull();
    expect(result.all.recall).toBeNull();
    expect(result.all.f1).toBeNull();
    expect(result.all.postingLatencyMs).toBeNull();
    expect(result.tempo).toEqual({ sampleCount: 0, accuracy: null, octaveTolerantAccuracy: null });
    const falseAlarm = computeMirMetrics([beat(1)], fixture([]));
    expect(falseAlarm.all.falsePositiveCount).toBe(1);
    expect(falseAlarm.all.f1).toBe(0);
    expect(falseAlarm.all.falsePositivesPerMinute).toBe(15);
    expect(computeMirMetrics([], fixture([1])).all.f1).toBe(0);
  });

  it('counts unestimated tempo as incorrect and distinguishes octave agreement', () => {
    const states = [0, 60, 120, 240, 180].map((tempo, i) => ({ type: 'state', tempo, _audioTimeSec: i * 0.5 }) as StateMessage);
    const result = computeMirMetrics(states, fixture([1, 2, 3]));
    expect(result.tempo.sampleCount).toBe(5);
    expect(result.tempo.accuracy).toBe(0.2);
    expect(result.tempo.octaveTolerantAccuracy).toBe(0.6);
    const ramp = { ...fixture([1, 2, 3]), bpm: (time: number) => 120 + time * 30 };
    expect(computeMirMetrics(states, ramp).tempo.accuracy).toBe(0.2);
  });
});
