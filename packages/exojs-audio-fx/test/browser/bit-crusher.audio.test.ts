/**
 * Acoustic contract for the BitCrusher worklet in real Web Audio. Rendered
 * through a genuine OfflineAudioContext + AudioWorkletNode in headless Chromium.
 * Three invariants are asserted:
 *  1. Bit-depth reduction (bits=1) measurably raises RMS above the 16-bit reference —
 *     the sine is partially quantized toward ±1, pushing energy higher.
 *  2. Sample-rate reduction (low normFreq) still produces audible output — the
 *     held sample carries meaningful signal energy.
 *  3. normFreq=0 produces near-silence — the initial held value is 0 and never
 *     changes, so the output is a constant-zero buffer.
 */

import bitCrusherWorkletSource from '../../src/worklets/bit-crusher.worklet.ts?worklet';
import { renderWorklet, rms, tail } from './_audio-harness';

describe('BitCrusher worklet — real Web Audio', () => {
  // ── 1. Bit-depth reduction raises RMS ─────────────────────────────────────
  // A unity-amplitude sine at bits=16 is nearly transparent (RMS ≈ 0.707).
  // At bits=1 the sine is coarsely quantized: values |x| > 0.5 map to ±1 and
  // values near zero map to 0, yielding RMS ≈ √(2/3) ≈ 0.816.
  it('bits=1 raises RMS above the bits=16 reference', async () => {
    const highBits = rms(
      tail(
        await renderWorklet({
          source: bitCrusherWorkletSource,
          processorName: 'exojs-bit-crusher',
          params: { bits: 16, normFreq: 1 },
          inputFreq: 440,
          durationSeconds: 1,
        }),
        0.05,
      ),
    );

    const lowBits = rms(
      tail(
        await renderWorklet({
          source: bitCrusherWorkletSource,
          processorName: 'exojs-bit-crusher',
          params: { bits: 1, normFreq: 1 },
          inputFreq: 440,
          durationSeconds: 1,
        }),
        0.05,
      ),
    );

    // Theoretical ratio ≈ 1.155; a 5 % margin comfortably covers floating-point variance.
    expect(lowBits).toBeGreaterThan(highBits * 1.05);
  });

  // ── 2. Sample-rate reduction still produces audible output ─────────────────
  // With normFreq=0.1 the effective sample rate is ~4800 Hz. The held samples
  // carry the quantized value of the last re-latch, so energy is preserved.
  it('sample-rate reduction (normFreq=0.1) produces non-trivial output', async () => {
    const out = await renderWorklet({
      source: bitCrusherWorkletSource,
      processorName: 'exojs-bit-crusher',
      params: { bits: 8, normFreq: 0.1 },
      inputFreq: 220,
      durationSeconds: 1,
    });
    expect(rms(tail(out, 0.05))).toBeGreaterThan(0.01);
  });

  // ── 3. normFreq=0 yields silence ──────────────────────────────────────────
  // The phase accumulator never reaches 1, so the initial held value (0) is
  // output for every sample regardless of the input signal.
  it('normFreq=0 produces near-silence (held value is 0 and never changes)', async () => {
    const out = await renderWorklet({
      source: bitCrusherWorkletSource,
      processorName: 'exojs-bit-crusher',
      params: { bits: 8, normFreq: 0 },
      inputFreq: 440,
      durationSeconds: 1,
    });
    expect(rms(out)).toBeLessThan(1e-6);
  });
});
