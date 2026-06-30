/**
 * Acoustic contract for the PitchShift worklet, rendered through a REAL
 * OfflineAudioContext + AudioWorklet in headless Chromium. This is the
 * integration counterpart to the fast jsdom eval test: it proves the worklet
 * loads via addModule and shifts pitch correctly in the genuine Web Audio
 * runtime (input 440 Hz, pitch=2 -> 880 Hz), which the jsdom mock cannot do.
 */

import { pitchShiftWorkletSource } from '../../src/worklets/pitch-shift.worklet';
import { dominantFreq, renderWorklet, rms, tail } from './_audio-harness';

describe('PitchShift worklet — real Web Audio', () => {
  const INPUT = 440;

  async function shiftedFreq(pitch: number): Promise<number> {
    const out = await renderWorklet({
      source: pitchShiftWorkletSource,
      processorName: 'exojs-pitch-shift',
      processorOptions: { grainSize: 1024 },
      params: { pitch, wet: 1.0 },
      inputFreq: INPUT,
      durationSeconds: 2,
    });
    return dominantFreq(tail(out, 1.0));
  }

  it('pitch=1.0 keeps the input frequency', async () => {
    const f = await shiftedFreq(1.0);
    expect(f).toBeGreaterThan(INPUT * 0.97);
    expect(f).toBeLessThan(INPUT * 1.03);
  });

  it('pitch=1.5 shifts the frequency by 1.5x', async () => {
    const f = await shiftedFreq(1.5);
    expect(f).toBeGreaterThan(660 * 0.97);
    expect(f).toBeLessThan(660 * 1.03);
  });

  it('pitch=0.5 shifts down one octave', async () => {
    const f = await shiftedFreq(0.5);
    expect(f).toBeGreaterThan(220 * 0.97);
    expect(f).toBeLessThan(220 * 1.03);
  });

  it('pitch=2.0 shifts up one octave', async () => {
    const f = await shiftedFreq(2.0);
    expect(f).toBeGreaterThan(880 * 0.97);
    expect(f).toBeLessThan(880 * 1.03);
  });

  it('wet=0 passes the input through (level preserved)', async () => {
    const out = await renderWorklet({
      source: pitchShiftWorkletSource,
      processorName: 'exojs-pitch-shift',
      processorOptions: { grainSize: 1024 },
      params: { pitch: 2.0, wet: 0.0 },
      inputFreq: INPUT,
      durationSeconds: 1,
    });
    const meas = tail(out, 0.25);
    // dry oscillator at unit amplitude -> RMS ≈ 1/sqrt(2)
    expect(rms(meas)).toBeGreaterThan(0.6);
    const f = dominantFreq(meas);
    expect(f).toBeGreaterThan(INPUT * 0.97);
    expect(f).toBeLessThan(INPUT * 1.03);
  });
});
