/**
 * Single-source-of-truth guard for the beat-detector tempogram.
 *
 * The worklet runs as an `eval`'d source string and cannot import modules, so its ACF +
 * tempo-candidate logic is transliterated by hand from `src/dsp/tempogram.ts`. This test
 * drives the REAL worklet over several fixtures and asserts that the candidates it
 * produces from its internal flux window are numerically identical to running the
 * canonical `computeTempoCandidates(...)` pipeline on the same window.
 *
 * If the two ever diverge (someone edits one copy but not the other) this fails.
 */

import { computeTempoCandidates, isOctaveRelated } from '../../src/dsp/tempogram';
import { clicktrack, doubleTime, halfTime, swing } from '../fixtures/beat-fixtures';
import { buildBeatProcessor, SAMPLE_RATE } from '../harness/beat-sandbox';

// Internal shape of the eval'd processor we reach into for parity checking.
interface ParityProc {
  port: { postMessage: (m: unknown) => void };
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
  _computeACFAndCandidates(): void;
  _isOctaveRelated(ratio: number): boolean;
  _fluxWindow: Float32Array;
  _fluxWritePos: number;
  _fluxCount: number;
  _minLag: number;
  _maxLag: number;
  _minBpm: number;
  _maxBpm: number;
  _hopSize: number;
  _sampleRate: number;
  _candidates: { bpm: number; score: number; lag: number }[];
}

/** Reconstruct the worklet's flux ring buffer as a linear oldest-first array. */
function linearizeFlux(proc: ParityProc): Float32Array {
  const buf = proc._fluxWindow;
  const wp = proc._fluxWritePos;
  const n = proc._fluxCount;
  const len = buf.length;
  const lin = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    lin[t] = buf[(((wp - 1 - (n - 1 - t)) % len) + len) % len]!;
  }
  return lin;
}

function driveAndCompare(samples: Float32Array): void {
  const Ctor = buildBeatProcessor();
  const g = globalThis as Record<string, unknown>;
  const prevSR = g['sampleRate'];
  const prevCF = g['currentFrame'];
  g['sampleRate'] = SAMPLE_RATE;
  g['currentFrame'] = 0;

  const proc = new Ctor({ processorOptions: {} }) as unknown as ParityProc;
  proc.port.postMessage = () => {};

  const blockSize = 128;
  for (let off = 0; off < samples.length; off += blockSize) {
    const end = Math.min(off + blockSize, samples.length);
    proc.process([[samples.subarray(off, end)]], [], {});
  }

  g['sampleRate'] = prevSR;
  g['currentFrame'] = prevCF;

  // Recompute candidates from the CURRENT flux window so the worklet's `_candidates`
  // correspond to exactly the window we linearize below.
  proc._computeACFAndCandidates();
  const worklet = proc._candidates;

  const lin = linearizeFlux(proc);
  const expected = computeTempoCandidates(lin, proc._minLag, proc._maxLag, proc._hopSize, proc._sampleRate, {
    minBpm: proc._minBpm,
    maxBpm: proc._maxBpm,
  });

  expect(worklet.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(worklet[i]!.lag).toBe(expected[i]!.lag);
    expect(worklet[i]!.bpm).toBeCloseTo(expected[i]!.bpm, 6);
    expect(worklet[i]!.score).toBeCloseTo(expected[i]!.score, 6);
  }
}

/**
 * Builds a callable that invokes the worklet's own `_isOctaveRelated` method on a real,
 * running processor instance (via the eval sandbox). Exercising the actual method - rather
 * than pattern-matching it out of the emitted source text - keeps this parity check valid
 * regardless of minification or any other source-level transform.
 */
function buildWorkletOctaveCheck(): (bpm: number, ref: number) => boolean {
  const Ctor = buildBeatProcessor();
  const proc = new Ctor({ processorOptions: {} }) as unknown as ParityProc;
  return (bpm: number, ref: number) => proc._isOctaveRelated(bpm / ref);
}

describe('isOctaveRelated ↔ worklet inline octave check parity', () => {
  // Invoked live on a real worklet processor instance - if worklet constants drift, this fails.
  const workletIsOctave = buildWorkletOctaveCheck();

  const cases: [number, number, boolean, string][] = [
    [60, 120, true, 'ratio 0.5 (half)'],
    [120, 120, false, 'ratio 1.0 (unison — not metrical)'],
    [240, 120, true, 'ratio 2.0 (double)'],
    [360, 120, true, 'ratio 3.0 (triple)'],
    [180, 120, true, 'ratio 1.5 (3:2 dotted)'],
    [80, 120, true, 'ratio 0.667 (2:3 triple)'],
    [130, 120, false, 'ratio ~1.083 (near-miss, legitimate drift)'],
  ];

  for (const [bpm, ref, expected, label] of cases) {
    it(`${label}: isOctaveRelated and worklet agree (→ ${String(expected)})`, () => {
      expect(isOctaveRelated(bpm, ref)).toBe(expected);
      expect(workletIsOctave(bpm, ref)).toBe(expected);
    });
  }
});

describe('worklet ↔ src/dsp tempogram parity', () => {
  it('clicktrack_120 candidates match computeTempoCandidates', () => {
    driveAndCompare(clicktrack(120).samples);
  });

  it('clicktrack_180 candidates match computeTempoCandidates', () => {
    driveAndCompare(clicktrack(180).samples);
  });

  it('halfTime_64 candidates match computeTempoCandidates', () => {
    driveAndCompare(halfTime(128).samples);
  });

  it('doubleTime_128 candidates match computeTempoCandidates', () => {
    driveAndCompare(doubleTime(64).samples);
  });

  it('swing_120 candidates match computeTempoCandidates', () => {
    driveAndCompare(swing(120).samples);
  });
});
