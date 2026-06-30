/**
 * DSP-level regression tests for the VocoderProcessor worklet.
 *
 * These tests directly instantiate the processor class (by evaluating the
 * worklet source string with minimal stubs) and verify the DSP output — RMS,
 * spectral envelope shaping, and the bandCount make-up gain — without needing
 * a real AudioContext or browser.
 */

import { vocoderWorkletSource } from '../../src/worklets/vocoder.worklet';

// ─── Worklet bootstrap helpers ────────────────────────────────────────────────

const SAMPLE_RATE = 48000;
const BLOCK = 128;

// The processor constructor and class (captured via registerProcessor stub).
interface BandCoef {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
  centerHz: number;
}
interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface VocoderProcessorLike {
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, number[]>,
  ): boolean;
  getBandInfo(): BandCoef[];
  getEnvelopes(): Float32Array;
}

type VocoderProcessorConstructor = new (options: { processorOptions?: Record<string, number> }) => VocoderProcessorLike;

function buildProcessorClass(numBands: number): VocoderProcessorConstructor {
  let klass: VocoderProcessorConstructor | null = null;

  const savedSampleRate = (globalThis as Record<string, unknown>)['sampleRate'];

  // Install stubs expected by the worklet source.
  (globalThis as Record<string, unknown>)['sampleRate'] = SAMPLE_RATE;
  (globalThis as Record<string, unknown>)['AudioWorkletProcessor'] = class {
    constructor() {}
  };
  (globalThis as Record<string, unknown>)['registerProcessor'] = (_name: string, cls: VocoderProcessorConstructor): void => {
    klass = cls;
  };

  eval(vocoderWorkletSource);

  // Restore globals.
  (globalThis as Record<string, unknown>)['sampleRate'] = savedSampleRate;
  delete (globalThis as Record<string, unknown>)['AudioWorkletProcessor'];
  delete (globalThis as Record<string, unknown>)['registerProcessor'];

  if (!klass) throw new Error('registerProcessor was not called — worklet source malformed');
  return klass;
}

// ─── Signal helpers ───────────────────────────────────────────────────────────

function makeSawtooth(freq: number, amplitude: number, n: number): Float32Array {
  const buf = new Float32Array(n);
  let phase = 0;
  const inc = freq / SAMPLE_RATE;
  for (let i = 0; i < n; i++) {
    buf[i] = amplitude * (2 * phase - 1);
    phase = (phase + inc) % 1.0;
  }
  return buf;
}

function makeSine(freq: number, amplitude: number, n: number): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = amplitude * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
  }
  return buf;
}

/** Voice-like signal: three formants at 700/1200/2500 Hz, AM-modulated at 4 Hz. */
function makeVoiceLike(n: number): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * i / SAMPLE_RATE);
    buf[i] = am * (
      0.5 * Math.sin(2 * Math.PI * 700  * i / SAMPLE_RATE) +
      0.3 * Math.sin(2 * Math.PI * 1200 * i / SAMPLE_RATE) +
      0.2 * Math.sin(2 * Math.PI * 2500 * i / SAMPLE_RATE)
    );
  }
  return buf;
}

/** Discrete Fourier magnitude at a single frequency (no FFT required for spot-checks). */
function magnitudeAt(buf: Float32Array, freq: number): number {
  let re = 0, im = 0;
  const omega = 2 * Math.PI * freq / SAMPLE_RATE;
  for (let i = 0; i < buf.length; i++) {
    re += buf[i] * Math.cos(omega * i);
    im -= buf[i] * Math.sin(omega * i);
  }
  return 2 * Math.sqrt(re * re + im * im) / buf.length;
}

function rms(buf: Float32Array): number {
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.sqrt(sum / buf.length);
}

function runVocoder(
  proc: VocoderProcessorLike,
  carrier: Float32Array,
  modulator: Float32Array,
  envSmoothing: number,
): Float32Array {
  const n = carrier.length;
  const out = new Float32Array(n);
  for (let off = 0; off < n; off += BLOCK) {
    const len = Math.min(BLOCK, n - off);
    const cB = carrier.subarray(off, off + len);
    const mB = modulator.subarray(off, off + len);
    const oB = new Float32Array(len);
    proc.process([[cB], [mB]], [[oB]], { envelopeSmoothing: [envSmoothing] });
    out.set(oB, off);
  }
  return out;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VocoderProcessor DSP', () => {
  const NUM_BANDS   = 16;
  const WARMUP      = SAMPLE_RATE * 2; // 2 s — let envelopes converge
  const MEASURE     = SAMPLE_RATE;     // 1 s measurement window
  const TOTAL       = WARMUP + MEASURE;

  let Processor: VocoderProcessorConstructor;

  beforeAll(() => {
    Processor = buildProcessorClass(NUM_BANDS);
  });

  // ── 1. Silence without modulator ──────────────────────────────────────────
  it('outputs silence when modulator is absent', () => {
    const proc     = new Processor({ processorOptions: { numBands: NUM_BANDS, minHz: 80, maxHz: 8000, bandQ: 4 } });
    const carrier  = makeSawtooth(110, 1.0, MEASURE);
    const silence  = new Float32Array(MEASURE); // no modulator
    const out      = runVocoder(proc, carrier, silence, 0.005);
    // All envelopes are zero → bandSum = 0 → output = 0
    expect(rms(out)).toBeLessThan(1e-6);
  });

  // ── 2. Make-up gain: broadband output ≈ carrier level ─────────────────────
  // The bandCount compensation factor (multiplied in the output line) ensures
  // that a broadband carrier + broadband modulator produces output within ±6 dB
  // of the carrier RMS.  Before the fix the shortfall was –23.8 dB.
  it('output RMS is within 6 dB of carrier RMS after 2 s warmup (broadband)', () => {
    const proc     = new Processor({ processorOptions: { numBands: NUM_BANDS, minHz: 80, maxHz: 8000, bandQ: 4 } });
    const carrier  = makeSawtooth(110, 1.0, TOTAL);
    const modulator = makeVoiceLike(TOTAL);
    const out      = runVocoder(proc, carrier, modulator, 0.005);

    const rmsCarrier = rms(carrier.subarray(WARMUP));
    const rmsOut     = rms(out.subarray(WARMUP));
    const ratio      = rmsOut / rmsCarrier;

    // Allow 6 dB tolerance on either side.
    expect(ratio).toBeGreaterThan(0.5);   // > -6 dB
    expect(ratio).toBeLessThan(2.0);      // < +6 dB
  });

  // ── 3. Spectral shaping: formants from modulator appear in output ──────────
  // Compare two vocoders: one with 660 Hz formant, one with 2200 Hz formant.
  // The 660 Hz modulator should boost the 660 Hz sawtooth harmonic relative to
  // 2200 Hz; the 2200 Hz modulator should do the reverse. This is the core
  // "robot voice" spectral-shaping invariant.
  it('output energy follows modulator formant — spectral shaping works', () => {
    // Sawtooth at 110 Hz has harmonics at 660, 770, 1100, 1210, 2200 Hz etc.
    const CARRIER_FREQ = 110;
    const FORMANT_LOW  = 660;  // harmonic 6
    const FORMANT_HIGH = 2200; // harmonic 20

    function buildMod(freq: number): Float32Array {
      const buf = new Float32Array(TOTAL);
      for (let i = 0; i < TOTAL; i++) buf[i] = Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
      return buf;
    }

    const carrier    = makeSawtooth(CARRIER_FREQ, 1.0, TOTAL);
    const modLow     = buildMod(FORMANT_LOW);
    const modHigh    = buildMod(FORMANT_HIGH);

    const procLow  = new Processor({ processorOptions: { numBands: NUM_BANDS, minHz: 80, maxHz: 8000, bandQ: 4 } });
    const procHigh = new Processor({ processorOptions: { numBands: NUM_BANDS, minHz: 80, maxHz: 8000, bandQ: 4 } });

    const outLow  = runVocoder(procLow,  carrier, modLow,  0.005);
    const outHigh = runVocoder(procHigh, carrier, modHigh, 0.005);

    const measLow  = outLow.subarray(WARMUP);
    const measHigh = outHigh.subarray(WARMUP);

    // Low-formant vocoder: more energy at FORMANT_LOW than FORMANT_HIGH
    const magLow660  = magnitudeAt(measLow,  FORMANT_LOW);
    const magLow2200 = magnitudeAt(measLow,  FORMANT_HIGH);
    expect(magLow660).toBeGreaterThan(magLow2200);

    // High-formant vocoder: more energy at FORMANT_HIGH than FORMANT_LOW
    const magHigh660  = magnitudeAt(measHigh, FORMANT_LOW);
    const magHigh2200 = magnitudeAt(measHigh, FORMANT_HIGH);
    expect(magHigh2200).toBeGreaterThan(magHigh660);
  });

  // ── 4. Sine at band center: output ≈ 2/π × carrier (envelope attenuates) ──
  // When carrier = modulator = sine at exactly one band's center frequency,
  // only that band contributes meaningfully. After warmup its envelope converges
  // to ≈ 2/π × amplitude. With the bandCount make-up gain the total output
  // is bandCount × (gain_factor ≈ 2/π) × carrier_amplitude, i.e. amplified by
  // roughly N×(2/π).  The important invariant: output is NOT silence and
  // NOT greater than numBands × carrier.
  it('sine at band center produces non-trivial output (not silent, not clipping hard)', () => {
    const BAND_CENTER = 686; // band 7 center frequency
    const proc        = new Processor({ processorOptions: { numBands: NUM_BANDS, minHz: 80, maxHz: 8000, bandQ: 4 } });
    const carrier     = makeSine(BAND_CENTER, 1.0, TOTAL);
    const modulator   = makeSine(BAND_CENTER, 1.0, TOTAL);
    const out         = runVocoder(proc, carrier, modulator, 0.005);

    const rmsO = rms(out.subarray(WARMUP));
    // Must be meaningfully above silence (> 0.1 = -20 dBFS)
    expect(rmsO).toBeGreaterThan(0.1);
    // Must not wildly exceed carrier amplitude
    expect(rmsO).toBeLessThan(NUM_BANDS * 1.1);
  });

  // ── 6. processorOptions forwarded: numBands affects output level ──────────
  // The make-up gain in the output is proportional to bandCount.  So a 32-band
  // vocoder produces 2× the bandSum level of an 8-band vocoder (32/8 = 4 dB
  // louder for the same input).
  it('processorOptions.numBands affects output level (more bands = higher output)', () => {
    const carrier   = makeSawtooth(110, 1.0, TOTAL);
    const modulator = makeVoiceLike(TOTAL);

    const proc8  = new Processor({ processorOptions: { numBands: 8,  minHz: 80, maxHz: 8000, bandQ: 4 } });
    const proc32 = new Processor({ processorOptions: { numBands: 32, minHz: 80, maxHz: 8000, bandQ: 4 } });

    const out8  = runVocoder(proc8,  carrier.slice(), modulator.slice(), 0.005);
    const out32 = runVocoder(proc32, carrier.slice(), modulator.slice(), 0.005);

    const rms8  = rms(out8.subarray(WARMUP));
    const rms32 = rms(out32.subarray(WARMUP));

    // 32 bands should produce more output than 8 bands (both from wider spectral
    // coverage and the larger bandCount make-up gain).
    expect(rms32).toBeGreaterThan(rms8);
  });
});
