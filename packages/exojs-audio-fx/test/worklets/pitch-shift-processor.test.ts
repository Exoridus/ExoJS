/**
 * DSP-level acoustic contract for the PitchShiftProcessor worklet.
 *
 * Like vocoder-processor.test.ts these tests evaluate the worklet source string
 * with minimal stubs, drive process() in 128-sample blocks, and measure the DSP
 * output — dominant frequency, tonal purity, and loudness — without a browser or
 * AudioContext.
 *
 * The pitch shifter's job: scale the pitch of the input by `pitch`. A 440 Hz sine
 * must come out at 440*pitch Hz. These were the tests missing when the worklet
 * shipped shifting by (1+pitch) instead of pitch.
 */

import { pitchShiftWorkletSource } from '../../src/worklets/pitch-shift.worklet';

const SAMPLE_RATE = 48000;
const BLOCK = 128;

// ─── Worklet bootstrap ──────────────────────────────────────────────────────
interface PitchProcessorLike {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, number[]>): boolean;
}
type PitchProcessorConstructor = new (options: { processorOptions?: Record<string, number> }) => PitchProcessorLike;

function buildProcessorClass(): PitchProcessorConstructor {
  let klass: PitchProcessorConstructor | null = null;
  const g = globalThis as Record<string, unknown>;
  const savedSampleRate = g['sampleRate'];
  g['sampleRate'] = SAMPLE_RATE;
  g['AudioWorkletProcessor'] = class {
    constructor() {}
  };
  g['registerProcessor'] = (_name: string, cls: PitchProcessorConstructor): void => {
    klass = cls;
  };
  eval(pitchShiftWorkletSource);
  g['sampleRate'] = savedSampleRate;
  delete g['AudioWorkletProcessor'];
  delete g['registerProcessor'];
  if (!klass) throw new Error('registerProcessor was not called — worklet source malformed');
  return klass;
}

// ─── Signal helpers ─────────────────────────────────────────────────────────
function makeSine(freq: number, amplitude: number, n: number): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return buf;
}

/** Single-frequency DFT magnitude (no FFT needed for spot checks). */
function magnitudeAt(buf: Float32Array, freq: number): number {
  let re = 0, im = 0;
  const omega = (2 * Math.PI * freq) / SAMPLE_RATE;
  for (let i = 0; i < buf.length; i++) {
    re += buf[i] * Math.cos(omega * i);
    im -= buf[i] * Math.sin(omega * i);
  }
  return (2 * Math.sqrt(re * re + im * im)) / buf.length;
}

function rms(buf: Float32Array): number {
  let s = 0;
  for (const v of buf) s += v * v;
  return Math.sqrt(s / buf.length);
}

/** Dominant frequency via a coarse magnitude sweep + local refine. */
function dominantFreq(buf: Float32Array, lo = 50, hi = 4000): { freq: number; mag: number } {
  let bestF = lo, bestM = -1;
  for (let f = lo; f <= hi; f += 2) {
    const m = magnitudeAt(buf, f);
    if (m > bestM) { bestM = m; bestF = f; }
  }
  for (let f = bestF - 2; f <= bestF + 2; f += 0.25) {
    const m = magnitudeAt(buf, f);
    if (m > bestM) { bestM = m; bestF = f; }
  }
  return { freq: bestF, mag: bestM };
}

function runWorklet(
  Processor: PitchProcessorConstructor,
  input: Float32Array,
  opts: { pitch: number; grainSize: number },
): Float32Array {
  const proc = new Processor({ processorOptions: { grainSize: opts.grainSize } });
  const n = input.length;
  const out = new Float32Array(n);
  for (let off = 0; off < n; off += BLOCK) {
    const len = Math.min(BLOCK, n - off);
    const iB = input.subarray(off, off + len);
    const oB = new Float32Array(len);
    proc.process([[iB]], [[oB]], { pitch: [opts.pitch] });
    out.set(oB, off);
  }
  return out;
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('PitchShiftProcessor DSP', () => {
  const INPUT_FREQ = 440;
  const GRAIN = 1024;
  const WARMUP = GRAIN * 8; // discard fill transient
  const MEASURE = SAMPLE_RATE; // 1 s analysis window
  const TOTAL = WARMUP + MEASURE;

  let Processor: PitchProcessorConstructor;
  beforeAll(() => {
    Processor = buildProcessorClass();
  });

  function measureShift(pitch: number): { freq: number; purity: number; ratioRms: number } {
    const input = makeSine(INPUT_FREQ, 0.5, TOTAL);
    const out = runWorklet(Processor, input, { pitch, grainSize: GRAIN });
    const meas = out.subarray(WARMUP);
    const { freq, mag } = dominantFreq(meas);
    const purity = mag / (Math.SQRT2 * (rms(meas) || 1e-9));
    const ratioRms = rms(meas) / rms(input.subarray(WARMUP));
    return { freq, purity, ratioRms };
  }

  // ── Identity: pitch=1.0 must not change the pitch ──────────────────────────
  it('pitch=1.0 leaves the dominant frequency at the input frequency', () => {
    const { freq } = measureShift(1.0);
    expect(freq).toBeGreaterThan(INPUT_FREQ * 0.95);
    expect(freq).toBeLessThan(INPUT_FREQ * 1.05);
  });

  it('pitch=1.0 output is tonal, not broadband noise', () => {
    const { purity } = measureShift(1.0);
    expect(purity).toBeGreaterThan(0.7);
  });

  // ── Shift down one octave ──────────────────────────────────────────────────
  it('pitch=0.5 shifts the dominant frequency down one octave', () => {
    const { freq } = measureShift(0.5);
    const expected = INPUT_FREQ * 0.5;
    expect(freq).toBeGreaterThan(expected * 0.95);
    expect(freq).toBeLessThan(expected * 1.05);
  });

  // ── Shift up one octave ────────────────────────────────────────────────────
  it('pitch=2.0 shifts the dominant frequency up one octave', () => {
    const { freq } = measureShift(2.0);
    const expected = INPUT_FREQ * 2.0;
    expect(freq).toBeGreaterThan(expected * 0.95);
    expect(freq).toBeLessThan(expected * 1.05);
  });

  // ── Intermediate ratio ─────────────────────────────────────────────────────
  it('pitch=1.5 shifts the dominant frequency by 1.5x', () => {
    const { freq } = measureShift(1.5);
    const expected = INPUT_FREQ * 1.5;
    expect(freq).toBeGreaterThan(expected * 0.95);
    expect(freq).toBeLessThan(expected * 1.05);
  });

  // ── Loudness: a pitch shifter is roughly level-preserving ──────────────────
  it('output level stays within -12..+6 dB of input at wet=1 (pitch=2.0)', () => {
    const { ratioRms } = measureShift(2.0);
    expect(ratioRms).toBeGreaterThan(0.25); // > -12 dB
    expect(ratioRms).toBeLessThan(2.0); // < +6 dB
  });
});
