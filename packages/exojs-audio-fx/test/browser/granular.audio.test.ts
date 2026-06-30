/**
 * Acoustic contract for the Granular worklet in real Web Audio. Granular uses
 * Math.random for grain scheduling (not stubbable in-browser), so these assert
 * robust, relative properties rather than exact values: the effect renders
 * non-trivial output, and normalizeGain tames the density-driven loudness boost.
 * The exact normalizeGain math is covered deterministically in the jsdom eval
 * test (granular-processor.test.ts).
 */

import { granularWorkletSource } from '../../src/worklets/granular.worklet';
import { renderWorklet, rms, tail } from './_audio-harness';

describe('Granular worklet — real Web Audio', () => {
  async function granularRms(opts: { density: number; normalizeGain: boolean; wet?: number }): Promise<number> {
    const out = await renderWorklet({
      source: granularWorkletSource,
      processorName: 'exojs-granular',
      processorOptions: { bufferSeconds: 2, normalizeGain: opts.normalizeGain },
      params: { grainSize: 0.05, density: opts.density, spread: 0.5, pitchMin: 1, pitchMax: 1, wet: opts.wet ?? 1 },
      inputFreq: 440,
      durationSeconds: 2,
    });
    return rms(tail(out, 1.0));
  }

  it('renders non-trivial granular output', async () => {
    expect(await granularRms({ density: 100, normalizeGain: false })).toBeGreaterThan(0.05);
  });

  it('normalizeGain tames the high-density loudness boost', async () => {
    const normalized = await granularRms({ density: 200, normalizeGain: true });
    const raw = await granularRms({ density: 200, normalizeGain: false });
    expect(normalized).toBeLessThan(raw);
  });

  it('wet=0 passes the input through (level preserved)', async () => {
    const r = await granularRms({ density: 100, normalizeGain: false, wet: 0 });
    // dry 440 Hz oscillator at unit amplitude -> RMS ≈ 1/sqrt(2)
    expect(r).toBeGreaterThan(0.6);
    expect(r).toBeLessThan(0.8);
  });
});
