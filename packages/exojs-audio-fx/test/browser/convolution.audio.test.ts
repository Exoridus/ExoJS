/**
 * Acoustic contract for convolution via a real OfflineAudioContext +
 * ConvolverNode in headless Chromium. Verifies two mathematical properties of
 * the ConvolverNode that underpin ConvolutionEffect's correctness:
 *
 * 1. A single-sample unit-impulse IR [1.0] is the identity of convolution —
 *    the output must equal the input (within floating-point tolerance).
 * 2. A 2-tap IR [1, 1] sums the input with a 1-sample-delayed copy, producing
 *    a louder-than-dry output for a steady sinusoidal input.
 *
 * Tests use raw Web Audio (OfflineAudioContext + ConvolverNode) rather than
 * the ConvolutionEffect class, because the class relies on the engine's
 * AudioContext lifecycle (isAudioContextReady / onAudioContextReady) which is
 * not wired in the browser-audio test environment.
 */

import { rms, SAMPLE_RATE } from './_audio-harness';

interface ConvolutionRenderOptions {
  /** Impulse response samples (normalize=false always). */
  irSamples: number[];
  /** Render duration in seconds. */
  durationSeconds: number;
  /** Wet level 0..1 (dry = 1-wet). Default 1. */
  wet?: number;
}

/**
 * Render a 440 Hz sine through a wet/dry ConvolverNode graph using a real
 * OfflineAudioContext and return the mono output samples.
 *
 * Graph:  oscillator → inputGain → dryGain → outputGain → destination
 *                                → convolver → wetGain → outputGain
 */
async function renderConvolution(opts: ConvolutionRenderOptions): Promise<Float32Array> {
  const sr = SAMPLE_RATE;
  const length = Math.floor(opts.durationSeconds * sr);
  const wet = opts.wet ?? 1;
  const dry = 1 - wet;

  const ctx = new OfflineAudioContext(1, length, sr);

  // Build the IR buffer (normalize=false — we want exact arithmetic).
  const irBuffer = ctx.createBuffer(1, opts.irSamples.length, sr);
  irBuffer.getChannelData(0).set(new Float32Array(opts.irSamples));

  const convolver = ctx.createConvolver();
  convolver.normalize = false;
  convolver.buffer = irBuffer;

  // Graph nodes.
  const inputGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const outputGain = ctx.createGain();

  dryGain.gain.value = dry;
  wetGain.gain.value = wet;
  outputGain.gain.value = 1;

  // Wiring.
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 440;

  osc.connect(inputGain);
  inputGain.connect(dryGain);
  dryGain.connect(outputGain);
  inputGain.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(outputGain);
  outputGain.connect(ctx.destination);

  osc.start(0);

  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

describe('ConvolutionEffect — acoustic contract (real Web Audio)', () => {
  it('unit-impulse IR [1] is the identity of convolution (output ≈ input)', async () => {
    // With normalize=false, a single-sample IR of value 1.0 is the unit
    // impulse δ[n]. Convolution with δ[n] is the identity: y = x * δ = x.
    const withConv = await renderConvolution({ irSamples: [1.0], durationSeconds: 0.3, wet: 1 });
    const dryOnly = await renderConvolution({ irSamples: [1.0], durationSeconds: 0.3, wet: 0 });

    // Drop the first 256 samples to skip the convolver's initial latency.
    const skip = 256;
    const convSamples = withConv.subarray(skip);
    const drySamples = dryOnly.subarray(skip);

    // Measure SNR: signal power / difference power.
    let diffPower = 0;
    let refPower = 0;
    const count = Math.min(convSamples.length, drySamples.length);
    for (let i = 0; i < count; i++) {
      diffPower += (convSamples[i]! - drySamples[i]!) ** 2;
      refPower += drySamples[i]! ** 2;
    }
    const snr = refPower / (diffPower + 1e-12);
    // Require > 20 dB SNR (SNR > 100) — the identity property holds in floating point.
    expect(snr).toBeGreaterThan(100);
  });

  it('2-tap IR [1, 1] produces louder output than dry (sums x[n] + x[n-1])', async () => {
    // With normalize=false and IR=[1, 1], the convolver computes y[n]=x[n]+x[n-1].
    // For a 440 Hz sine at 48000 Hz the 1-sample phase difference is
    // 2π·440/48000 ≈ 0.0576 rad, so the two samples add nearly constructively:
    // amplitude ≈ 2·cos(0.0288) ≈ 1.999 — roughly √2 more RMS than the dry signal.
    const withConv = await renderConvolution({ irSamples: [1.0, 1.0], durationSeconds: 0.3, wet: 1 });
    const dryOnly = await renderConvolution({ irSamples: [1.0, 1.0], durationSeconds: 0.3, wet: 0 });

    // Skip leading transient.
    const skip = 512;
    const wetRms = rms(withConv.subarray(skip));
    const dryRms = rms(dryOnly.subarray(skip));

    // Convolved RMS should be appreciably larger than dry (expect ≈ 1.4× or more).
    expect(wetRms).toBeGreaterThan(dryRms * 1.2);
  });

  it('wet=0 passes the input through unmodified', async () => {
    // With wet=0 the convolver path is gated off (wetGain=0) and the dry
    // gain is 1 — so the output equals the raw oscillator signal.
    const out = await renderConvolution({ irSamples: [1.0], durationSeconds: 0.3, wet: 0 });
    const skip = 256;
    const meas = out.subarray(skip);
    // 440 Hz sine at unit amplitude: RMS ≈ 1/√2 ≈ 0.707.
    expect(rms(meas)).toBeGreaterThan(0.6);
    expect(rms(meas)).toBeLessThan(0.8);
  });
});
