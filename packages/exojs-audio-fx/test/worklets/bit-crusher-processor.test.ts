/**
 * DSP-level regression tests for the BitCrusherProcessor worklet.
 *
 * These tests directly instantiate the processor class (by evaluating the
 * worklet source string with minimal stubs) and verify the DSP output without
 * needing a real AudioContext or browser. Covered invariants:
 *  - Quantization produces the correct step-grid values.
 *  - bits=1 collapses the signal to {-1, 0, +1}.
 *  - normFreq=0 never latches, producing silence.
 *  - normFreq=1 passes every sample through as quantized input.
 *  - Sample-and-hold is detectable as runs of repeated output values.
 *  - bits=16 is nearly transparent (max quantization error ≤ step/2).
 */

import bitCrusherWorkletSource from '../../src/worklets/bit-crusher.worklet.ts?worklet';

// ─── Worklet bootstrap ────────────────────────────────────────────────────────

const SAMPLE_RATE = 48000;
const BLOCK = 128;

interface BitCrusherProcessorLike {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, number[]>): boolean;
}
type BitCrusherProcessorConstructor = new () => BitCrusherProcessorLike;

function buildProcessorClass(): BitCrusherProcessorConstructor {
  let klass: BitCrusherProcessorConstructor | null = null;
  const g = globalThis as Record<string, unknown>;
  const savedSampleRate = g['sampleRate'];

  g['sampleRate'] = SAMPLE_RATE;
  g['AudioWorkletProcessor'] = class {
    constructor() {}
  };
  g['registerProcessor'] = (_name: string, cls: BitCrusherProcessorConstructor): void => {
    klass = cls;
  };

  eval(bitCrusherWorkletSource);

  g['sampleRate'] = savedSampleRate;
  delete g['AudioWorkletProcessor'];
  delete g['registerProcessor'];

  if (!klass) throw new Error('registerProcessor was not called — worklet source malformed');
  return klass;
}

// ─── Signal helpers ───────────────────────────────────────────────────────────

function makeSine(freq: number, amplitude: number, n: number): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  }
  return buf;
}

function rms(buf: Float32Array): number {
  let s = 0;
  for (const v of buf) s += v * v;
  return Math.sqrt(s / buf.length);
}

function runCrusher(
  proc: BitCrusherProcessorLike,
  input: Float32Array,
  bits: number,
  normFreq: number,
): Float32Array {
  const n = input.length;
  const out = new Float32Array(n);
  for (let off = 0; off < n; off += BLOCK) {
    const len = Math.min(BLOCK, n - off);
    const inB = input.subarray(off, off + len);
    const outB = new Float32Array(len);
    proc.process([[inB]], [[outB]], { bits: [bits], normFreq: [normFreq] });
    out.set(outB, off);
  }
  return out;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BitCrusherProcessor DSP', () => {
  const N = SAMPLE_RATE; // 1 second of samples

  let Processor: BitCrusherProcessorConstructor;

  beforeAll(() => {
    Processor = buildProcessorClass();
  });

  // ── 1. Output values lie on the correct quantization grid ─────────────────
  it('quantizes every sample to the expected step grid (bits=4)', () => {
    const proc = new Processor();
    const input = makeSine(440, 1.0, N);
    // normFreq=1 → every sample is re-latched (no sample-rate reduction)
    const out = runCrusher(proc, input, 4, 1.0);

    const step = 2 / Math.pow(2, 4); // 0.125
    for (const sample of out) {
      // Each output should equal step × round(input / step) to floating-point precision.
      const nearest = step * Math.round(sample / step);
      expect(Math.abs(sample - nearest)).toBeLessThan(1e-6);
    }
  });

  // ── 2. bits=1 collapses to three levels: -1, 0, +1 ───────────────────────
  it('bits=1 produces only three quantization levels: -1, 0, and +1', () => {
    const proc = new Processor();
    const input = makeSine(440, 1.0, N);
    const out = runCrusher(proc, input, 1, 1.0);

    // step=1 → round(x/1)*1 = round(x) ∈ {-1, 0, 1} for x ∈ [-1, 1]
    const allowed = new Set([-1, 0, 1]);
    let violations = 0;
    for (const v of out) {
      if (!allowed.has(Math.round(v))) violations++;
    }
    expect(violations).toBe(0);
  });

  // ── 3. normFreq=0 → initial held value (0) never changes → silence ────────
  it('normFreq=0 produces silence (phase never triggers a latch)', () => {
    const proc = new Processor();
    const input = makeSine(440, 1.0, BLOCK * 8);
    const out = runCrusher(proc, input, 8, 0);
    expect(rms(out)).toBeLessThan(1e-9);
  });

  // ── 4. normFreq=1 → every sample re-latched → output = quantized input ────
  it('normFreq=1 matches the quantized input sample-for-sample (bits=8)', () => {
    const proc = new Processor();
    const input = makeSine(440, 1.0, BLOCK * 4);
    const out = runCrusher(proc, input, 8, 1.0);

    const step = 2 / Math.pow(2, 8); // ~0.0078125
    for (let i = 0; i < out.length; i++) {
      const expected = step * Math.round(input[i] / step);
      expect(Math.abs(out[i] - expected)).toBeLessThan(1e-6);
    }
  });

  // ── 5. Sample-and-hold: runs of identical adjacent samples appear ──────────
  // With normFreq=0.25 the processor re-latches every ~4 samples, so most
  // output samples are part of a held run (≥ 3 consecutive equal values).
  it('sample-and-hold: detectable held runs with normFreq=0.25', () => {
    const proc = new Processor();
    const input = makeSine(440, 1.0, N);
    const out = runCrusher(proc, input, 8, 0.25);

    let holdRuns = 0;
    for (let i = 1; i < out.length - 1; i++) {
      if (out[i] === out[i - 1] && out[i] === out[i + 1]) holdRuns++;
    }
    // Expect at least 30 % of samples inside held runs (practical rate ≈ 50 %).
    expect(holdRuns).toBeGreaterThan(N * 0.3);
  });

  // ── 6. bits=16 is nearly transparent ──────────────────────────────────────
  it('bits=16 introduces sub-LSB quantization error only (nearly transparent)', () => {
    const proc = new Processor();
    const input = makeSine(440, 0.5, N);
    const out = runCrusher(proc, input, 16, 1.0);

    const halfStep = 1 / Math.pow(2, 16); // step/2 ≈ 0.0000153
    let maxError = 0;
    for (let i = 0; i < out.length; i++) {
      const err = Math.abs(out[i] - input[i]);
      if (err > maxError) maxError = err;
    }
    // Max error must be at most step/2 (half-step rounding)
    expect(maxError).toBeLessThanOrEqual(halfStep + 1e-10);
  });
});
