/**
 * DSP-level acoustic contract for the GranularProcessor worklet, focused on the
 * optional normalizeGain behaviour.
 *
 * Granular RMS scales with sqrt(density * grainSize) — overlapping uncorrelated
 * grains add in power. That level dynamics is the intended expressive default
 * (normalizeGain off). With normalizeGain on, output level should stay roughly
 * constant across densities.
 *
 * Math.random is stubbed with a deterministic PRNG so the grain scheduling is
 * reproducible across runs.
 */

import { granularWorkletSource } from '../../src/worklets/granular.worklet';

const SAMPLE_RATE = 48000;
const BLOCK = 128;

interface GranularProcessorLike {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, number[]>): boolean;
}
type GranularProcessorConstructor = new (options: { processorOptions?: Record<string, unknown> }) => GranularProcessorLike;

function buildProcessorClass(): GranularProcessorConstructor {
  let klass: GranularProcessorConstructor | null = null;
  const g = globalThis as Record<string, unknown>;
  const savedSampleRate = g['sampleRate'];
  g['sampleRate'] = SAMPLE_RATE;
  g['AudioWorkletProcessor'] = class {
    constructor() {}
  };
  g['registerProcessor'] = (_name: string, cls: GranularProcessorConstructor): void => {
    klass = cls;
  };
  eval(granularWorkletSource);
  g['sampleRate'] = savedSampleRate;
  delete g['AudioWorkletProcessor'];
  delete g['registerProcessor'];
  if (!klass) throw new Error('registerProcessor was not called — worklet source malformed');
  return klass;
}

function makeSine(freq: number, amplitude: number, n: number): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return buf;
}

function rms(buf: Float32Array): number {
  let s = 0;
  for (const v of buf) s += v * v;
  return Math.sqrt(s / buf.length);
}

/** Deterministic mulberry32 PRNG so grain randomness is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('GranularProcessor normalizeGain DSP', () => {
  let Processor: GranularProcessorConstructor;
  let randomSpy: MockInstance;

  beforeAll(() => {
    Processor = buildProcessorClass();
  });

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(0x1234abcd));
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  function rmsRatio(opts: { density: number; grainSize: number; normalizeGain?: boolean }): number {
    const proc = new Processor({ processorOptions: { bufferSeconds: 2, normalizeGain: opts.normalizeGain ?? false } });
    const n = SAMPLE_RATE * 3;
    const input = makeSine(440, 0.5, n);
    const out = new Float32Array(n);
    for (let off = 0; off < n; off += BLOCK) {
      const len = Math.min(BLOCK, n - off);
      const oB = new Float32Array(len);
      proc.process([[input.subarray(off, off + len)]], [[oB]], {
        grainSize: [opts.grainSize],
        density: [opts.density],
        spread: [0.5],
        pitchMin: [1],
        pitchMax: [1],
      });
      out.set(oB, off);
    }
    return rms(out.subarray(SAMPLE_RATE)) / rms(input.subarray(SAMPLE_RATE)); // skip 1 s warmup
  }

  // ── Default (normalizeGain off) preserves the expressive density dynamics ──
  it('without normalizeGain, output level rises with density (current behaviour)', () => {
    const low = rmsRatio({ density: 50, grainSize: 0.05 });
    const high = rmsRatio({ density: 200, grainSize: 0.05 });
    expect(high).toBeGreaterThan(low * 1.5); // clearly louder at higher density
  });

  // ── normalizeGain holds the level roughly constant across densities ─────────
  it('with normalizeGain, output level stays roughly constant across densities', () => {
    const ratios = [50, 100, 200].map((density) => rmsRatio({ density, grainSize: 0.05, normalizeGain: true }));
    const max = Math.max(...ratios);
    const min = Math.min(...ratios);
    expect(max / min).toBeLessThan(1.5); // < ~3.5 dB spread
  });

  it('with normalizeGain, output level lands near unity (within ~6 dB)', () => {
    const r = rmsRatio({ density: 100, grainSize: 0.05, normalizeGain: true });
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(2.0);
  });
});
