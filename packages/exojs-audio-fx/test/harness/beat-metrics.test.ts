/**
 * Unit tests for beat-metrics.ts.
 *
 * Uses hand-built message logs with KNOWN properties to verify every metric
 * returns the analytically expected value. No worklet eval required.
 *
 * Acceptance criteria (Stage-1 plan Task 3):
 *   - Perfect log (beats at exactly GT times) → 0 offset, 0 FP, 100% recall.
 *   - Injected jitter → expected mean offset.
 *   - Injected extra beat → 1 FP.
 *   - Octave log → octave flag set.
 *   - Shuffling input message order does not change matched offsets (sort internally).
 */

import type { BeatFixture } from '../fixtures/beat-fixtures';
import { computeMetrics } from './beat-metrics';
import type { BeatMessage, StateMessage, WorkletMessage } from './beat-sandbox';

const SAMPLE_RATE = 48000;

// ── Helpers to build synthetic message logs ────────────────────────────────────

function makeBeat(
  audioTime: number,
  tempo: number,
  audioTimeSec?: number,
  status: 'provisional' | 'locked' = 'locked',
): BeatMessage {
  return {
    type: 'beat',
    _audioTimeSec: audioTimeSec ?? audioTime,
    audioTime,
    tempo,
    confidence: 0.8,
    beatPhase: 0,
    energy: 0.5,
    isDownbeat: false,
    beatInBar: 1,
    status,
  };
}

function makeState(tempo: number, timeSec: number, confidence = 0.8): StateMessage {
  return {
    type: 'state',
    _audioTimeSec: timeSec,
    tempo,
    beatPhase: 0,
    confidence,
    gridStability: confidence,
    tempoCandidates: [{ bpm: tempo, score: 0.9 }],
    rms: 0.3,
    onsetStrength: 0.5,
    bandEnergy: { low: 0.3, mid: 0.2, high: 0.1 },
    barPosition: 1,
    barLength: 4,
    timeSignature: { numerator: 4, denominator: 4 },
    lookahead: [],
    nextBeatTime: timeSec + 60 / tempo,
    nextDownbeatTime: timeSec + 4 * (60 / tempo),
  };
}

function makeFixture(beatTimesSec: number[], bpm: number, durationSec: number): BeatFixture {
  const totalSamples = Math.ceil(durationSec * SAMPLE_RATE);
  return {
    samples: new Float32Array(totalSamples),
    beatTimesSec,
    bpm,
    label: `synthetic_${bpm}bpm`,
  };
}

// ── Perfect log ───────────────────────────────────────────────────────────────

describe('computeMetrics — perfect log', () => {
  // Beat at exactly the GT times, tempo exactly correct
  const bpm = 120;
  const ibi = 60 / bpm;
  const durationSec = 10;
  const gtTimes = [2, 2.5, 3, 3.5, 4, 4.5, 5].map((_, i) => 2 + i * ibi);

  const messages: WorkletMessage[] = [
    // Settled state messages after t=1.5s
    ...Array.from({ length: 10 }, (_, i) => makeState(bpm, 2 + i * 0.5)),
    // Perfect beats: audioTime == GT time
    ...gtTimes.map((t) => makeBeat(t, bpm)),
  ];

  const fixture = makeFixture(gtTimes, bpm, durationSec);
  const m = computeMetrics(messages, fixture);

  it('beat offset mean ≈ 0 ms', () => {
    expect(m.beatOffset.meanMs).toBeCloseTo(0, 3);
  });

  it('beat offset p90 ≈ 0 ms', () => {
    expect(m.beatOffset.p90Ms).toBeCloseTo(0, 3);
  });

  it('false positive count = 0', () => {
    expect(m.fpMiss.fpCount).toBe(0);
  });

  it('recall = 100%', () => {
    expect(m.fpMiss.recall).toBeCloseTo(1.0, 6);
  });

  it('miss count = 0', () => {
    expect(m.fpMiss.missCount).toBe(0);
  });

  it('BPM error mean ≈ 0', () => {
    expect(m.bpmError.meanAbs).toBeCloseTo(0, 3);
  });

  it('no octave error', () => {
    expect(m.octaveError.halfOctave).toBe(false);
    expect(m.octaveError.doubleOctave).toBe(false);
  });
});

// ── Jittered log ──────────────────────────────────────────────────────────────

describe('computeMetrics — jittered beats', () => {
  const bpm = 120;
  const ibi = 60 / bpm;
  const durationSec = 10;
  const gtTimes = Array.from({ length: 6 }, (_, i) => 2 + i * ibi);
  const jitterMs = 20; // fixed jitter on every beat
  const jitterSec = jitterMs / 1000;

  // Each emitted beat is `jitterMs` late
  const emittedTimes = gtTimes.map((t) => t + jitterSec);
  const messages: WorkletMessage[] = [
    ...Array.from({ length: 8 }, (_, i) => makeState(bpm, 1.5 + i * 0.5)),
    ...emittedTimes.map((t) => makeBeat(t, bpm)),
  ];

  const fixture = makeFixture(gtTimes, bpm, durationSec);
  const m = computeMetrics(messages, fixture);

  it(`mean offset ≈ ${jitterMs} ms`, () => {
    expect(m.beatOffset.meanMs).toBeCloseTo(jitterMs, 1);
  });

  it('p90 offset ≈ jitterMs (all beats have same jitter)', () => {
    expect(m.beatOffset.p90Ms).toBeCloseTo(jitterMs, 1);
  });

  it('all beats matched (no FP)', () => {
    expect(m.fpMiss.fpCount).toBe(0);
    expect(m.fpMiss.recall).toBeCloseTo(1.0, 6);
  });
});

// ── Extra beat → FP ───────────────────────────────────────────────────────────

describe('computeMetrics — injected extra beat → 1 FP', () => {
  const bpm = 120;
  const ibi = 60 / bpm;
  const durationSec = 10;
  const gtTimes = Array.from({ length: 5 }, (_, i) => 2 + i * ibi);

  // Correct beats + 1 extra beat far from any GT time
  const extraBeatTime = 8.0; // far from all GT times
  const messages: WorkletMessage[] = [
    ...Array.from({ length: 8 }, (_, i) => makeState(bpm, 1.5 + i * 0.5)),
    ...gtTimes.map((t) => makeBeat(t, bpm)),
    makeBeat(extraBeatTime, bpm),
  ];

  const fixture = makeFixture(gtTimes, bpm, durationSec);
  const m = computeMetrics(messages, fixture);

  it('exactly 1 false positive', () => {
    expect(m.fpMiss.fpCount).toBe(1);
  });

  it('all GT beats are still matched', () => {
    expect(m.beatOffset.matchedCount).toBe(gtTimes.length);
    expect(m.fpMiss.recall).toBeCloseTo(1.0, 6);
  });
});

// ── Miss ──────────────────────────────────────────────────────────────────────

describe('computeMetrics — missed GT beat', () => {
  const bpm = 120;
  const ibi = 60 / bpm;
  const durationSec = 10;
  const gtTimes = Array.from({ length: 5 }, (_, i) => 2 + i * ibi);

  // Detector only emits beats for GT times 0 and 2 (misses 1, 3, 4)
  const messages: WorkletMessage[] = [
    ...Array.from({ length: 8 }, (_, i) => makeState(bpm, 1.5 + i * 0.5)),
    makeBeat(gtTimes[0], bpm),
    makeBeat(gtTimes[2], bpm),
  ];

  const fixture = makeFixture(gtTimes, bpm, durationSec);
  const m = computeMetrics(messages, fixture);

  it('miss count = 3', () => {
    expect(m.fpMiss.missCount).toBe(3);
  });

  it('recall = 2/5', () => {
    expect(m.fpMiss.recall).toBeCloseTo(2 / 5, 6);
  });
});

// ── Octave error — half-octave ────────────────────────────────────────────────

describe('computeMetrics — octave error (half-octave: detecting 0.5x trueBpm)', () => {
  const trueBpm = 120;
  const wrongBpm = 60; // 0.5× trueBpm
  const durationSec = 10;
  const gtTimes = Array.from({ length: 8 }, (_, i) => 2 + i * (60 / trueBpm));

  // All state messages report wrong (half-octave) tempo
  const messages: WorkletMessage[] = [
    ...Array.from({ length: 10 }, (_, i) => makeState(wrongBpm, 2 + i * 0.5)),
    ...gtTimes.map((t) => makeBeat(t, wrongBpm)),
  ];

  const fixture = makeFixture(gtTimes, trueBpm, durationSec);
  const m = computeMetrics(messages, fixture);

  it('halfOctave flag is set', () => {
    expect(m.octaveError.halfOctave).toBe(true);
  });

  it('doubleOctave flag is NOT set', () => {
    expect(m.octaveError.doubleOctave).toBe(false);
  });
});

describe('computeMetrics — octave error (double-octave: detecting 2x trueBpm)', () => {
  const trueBpm = 60;
  const wrongBpm = 120; // 2× trueBpm
  const durationSec = 10;
  const gtTimes = Array.from({ length: 5 }, (_, i) => 2 + i * (60 / trueBpm));

  const messages: WorkletMessage[] = [
    ...Array.from({ length: 10 }, (_, i) => makeState(wrongBpm, 2 + i * 0.5)),
    ...gtTimes.map((t) => makeBeat(t, wrongBpm)),
  ];

  const fixture = makeFixture(gtTimes, trueBpm, durationSec);
  const m = computeMetrics(messages, fixture);

  it('doubleOctave flag is set', () => {
    expect(m.octaveError.doubleOctave).toBe(true);
  });

  it('halfOctave flag is NOT set', () => {
    expect(m.octaveError.halfOctave).toBe(false);
  });
});

// ── Lock time ─────────────────────────────────────────────────────────────────

describe('computeMetrics — lock time', () => {
  const bpm = 120;
  const durationSec = 15;
  const gtTimes = Array.from({ length: 15 }, (_, i) => i * (60 / bpm));

  it('returns null when tempo never locks', () => {
    const messages: WorkletMessage[] = [
      // All state messages report wrong tempo (never within 3%)
      ...Array.from({ length: 10 }, (_, i) => makeState(200, 1 + i * 0.5)),
    ];
    const fixture = makeFixture(gtTimes, bpm, durationSec);
    const m = computeMetrics(messages, fixture);
    expect(m.lockTimeSec).toBeNull();
  });

  it('returns the first stable state message time when K consecutive correct', () => {
    const firstCorrectTime = 3.5;
    const messages: WorkletMessage[] = [
      // Two wrong, then 4 correct (K=3)
      makeState(200, 1.0),
      makeState(200, 1.5),
      makeState(bpm, firstCorrectTime),       // first correct
      makeState(bpm, firstCorrectTime + 0.5), // second
      makeState(bpm, firstCorrectTime + 1.0), // third → lock!
      makeState(bpm, firstCorrectTime + 1.5),
    ];
    const fixture = makeFixture(gtTimes, bpm, durationSec);
    const m = computeMetrics(messages, fixture);
    expect(m.lockTimeSec).toBeCloseTo(firstCorrectTime, 6);
  });
});

// ── T7 provisional/locked metrics ──────────────────────────────────────────────

describe('computeMetrics — T7 provisional/locked stats', () => {
  const bpm = 120;
  const ibi = 60 / bpm;
  const durationSec = 10;
  const gtTimes = Array.from({ length: 8 }, (_, i) => 2 + i * ibi);

  // First 3 beats provisional (emitted early, slightly late), rest locked (on grid).
  // One locked beat is a false positive (far from any GT onset).
  const beats: BeatMessage[] = [
    makeBeat(gtTimes[0] + 0.005, bpm, 2.005, 'provisional'),
    makeBeat(gtTimes[1] + 0.005, bpm, 2.505, 'provisional'),
    makeBeat(gtTimes[2] + 0.005, bpm, 3.005, 'provisional'),
    makeBeat(gtTimes[3], bpm, 3.5, 'locked'),
    makeBeat(gtTimes[4], bpm, 4.0, 'locked'),
    makeBeat(gtTimes[5], bpm, 4.5, 'locked'),
    makeBeat(8.7, bpm, 8.7, 'locked'), // locked FP far from any GT onset
  ];
  const messages: WorkletMessage[] = [
    ...Array.from({ length: 6 }, (_, i) => makeState(bpm, 3.5 + i * 0.5)),
    ...beats,
  ];
  const fixture = makeFixture(gtTimes, bpm, durationSec);
  const m = computeMetrics(messages, fixture);

  it('time-to-first-beat is the first beat emission time (any status)', () => {
    expect(m.t7.timeToFirstBeatSec).toBeCloseTo(2.005, 6);
  });

  it('time-to-first-locked-beat is the first locked emission time', () => {
    expect(m.t7.timeToFirstLockedBeatSec).toBeCloseTo(3.5, 6);
  });

  it('counts provisional and locked beats', () => {
    expect(m.t7.provisionalBeatCount).toBe(3);
    expect(m.t7.lockedBeatCount).toBe(4);
  });

  it('exactly one provisional→locked transition', () => {
    expect(m.t7.provLockedTransitions).toBe(1);
  });

  it('locked FP rate counts only the locked false positive', () => {
    expect(m.t7.lockedFpCount).toBe(1);
  });

  it('status is complete (every beat tagged)', () => {
    expect(m.t7.statusComplete).toBe(true);
  });
});

// ── Message-order independence ────────────────────────────────────────────────

describe('computeMetrics — sorting is stable (message order does not affect offsets)', () => {
  const bpm = 120;
  const ibi = 60 / bpm;
  const durationSec = 10;
  const gtTimes = Array.from({ length: 5 }, (_, i) => 2 + i * ibi);
  const jitterSec = 0.01;

  const emittedTimes = gtTimes.map((t) => t + jitterSec);
  const states = Array.from({ length: 5 }, (_, i) => makeState(bpm, 1.5 + i * 0.5));
  const beats = emittedTimes.map((t) => makeBeat(t, bpm));

  const forwardMessages: WorkletMessage[] = [...states, ...beats];
  // Reverse the beat order (simulate out-of-order delivery)
  const reverseMessages: WorkletMessage[] = [...states, ...[...beats].reverse()];

  const fixture = makeFixture(gtTimes, bpm, durationSec);
  const m1 = computeMetrics(forwardMessages, fixture);
  const m2 = computeMetrics(reverseMessages, fixture);

  it('mean offset is the same regardless of beat order in message array', () => {
    expect(m1.beatOffset.meanMs).toBeCloseTo(m2.beatOffset.meanMs, 6);
  });

  it('FP count is the same regardless of beat order', () => {
    expect(m1.fpMiss.fpCount).toBe(m2.fpMiss.fpCount);
  });
});
