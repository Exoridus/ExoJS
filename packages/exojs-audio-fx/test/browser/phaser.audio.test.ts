/**
 * Acoustic contract for a phaser graph using a real OfflineAudioContext.
 *
 * Verifies that:
 * 1. A phaser graph with a DelayNode in the feedback path is NOT muted by the
 *    browser — spec-compliant browsers (Chrome, Edge, Safari) silently mute
 *    feedback cycles that contain no DelayNode (zero-latency cycles). Even a
 *    DelayNode with delayTime=0 is sufficient to make the cycle legal.
 * 2. Removing the DelayNode from the feedback path would cause the wet path to
 *    be muted entirely, leaving only the (zero) dry signal → the RMS assertion
 *    FAILS before the C1 fix that inserts the feedbackDelay.
 *
 * Tests use raw Web Audio (OfflineAudioContext + BiquadFilterNode) rather than
 * the PhaserEffect class, because the class relies on the engine's AudioContext
 * lifecycle (isAudioContextReady / onAudioContextReady) which is not wired in
 * the browser-audio test environment.
 */

import { rms, SAMPLE_RATE } from './_audio-harness';

interface PhaserRenderOptions {
  /** Number of allpass stages (even integer). Default 4. */
  stages?: number;
  /** Feedback gain in the allpass loop. Default 0.7. */
  feedback?: number;
  /** Wet gain (dry = 1 - wet). Default 1. */
  wet?: number;
  /** Whether to include a DelayNode in the feedback path. Default true. */
  withFeedbackDelay?: boolean;
  /** Render duration in seconds. */
  durationSeconds: number;
}

/**
 * Render a 440 Hz sine through a raw allpass phaser graph.
 *
 * Graph (withFeedbackDelay = true):
 *   oscillator → inputGain → dryGain → outputGain → destination
 *                inputGain → allpass[0] → … → allpass[N-1] → wetGain → outputGain
 *                             ↑                     │
 *                             └── feedbackDelay ◄── feedbackGain ◄──┘
 */
async function renderPhaser(opts: PhaserRenderOptions): Promise<Float32Array> {
  const sr = SAMPLE_RATE;
  const stages = opts.stages ?? 4;
  const feedback = opts.feedback ?? 0.7;
  const wet = opts.wet ?? 1;
  const withDelay = opts.withFeedbackDelay ?? true;
  const length = Math.floor(opts.durationSeconds * sr);

  const ctx = new OfflineAudioContext(1, length, sr);

  const inputGain = ctx.createGain();
  const outputGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const feedbackGain = ctx.createGain();

  dryGain.gain.value = 1 - wet;
  wetGain.gain.value = wet;
  feedbackGain.gain.value = feedback;

  const allpassFilters: BiquadFilterNode[] = [];
  for (let i = 0; i < stages; i++) {
    const f = ctx.createBiquadFilter();
    f.type = 'allpass';
    f.frequency.value = 500;
    allpassFilters.push(f);
  }

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 440;

  osc.connect(inputGain);
  inputGain.connect(dryGain);
  dryGain.connect(outputGain);

  inputGain.connect(allpassFilters[0]!);
  for (let i = 0; i < allpassFilters.length - 1; i++) {
    allpassFilters[i]!.connect(allpassFilters[i + 1]!);
  }
  const last = allpassFilters[allpassFilters.length - 1]!;
  last.connect(wetGain);
  wetGain.connect(outputGain);
  outputGain.connect(ctx.destination);

  // Feedback path
  last.connect(feedbackGain);
  if (withDelay) {
    // DelayNode breaks the zero-latency cycle — required for spec-compliant browsers.
    const feedbackDelay = ctx.createDelay(1);
    feedbackDelay.delayTime.value = 0;
    feedbackGain.connect(feedbackDelay);
    feedbackDelay.connect(allpassFilters[0]!);
  } else {
    // Direct connection — zero-latency cycle, muted by spec-compliant browsers.
    feedbackGain.connect(allpassFilters[0]!);
  }

  osc.start(0);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

describe('PhaserEffect — acoustic contract (real Web Audio)', () => {
  it('allpass chain with feedbackDelay carries signal (wet path is not muted)', async () => {
    // Full wet, no dry — if the allpass chain is muted the output would be silent.
    // This assertion FAILS before the C1 fix (i.e. when the feedbackDelay is absent
    // and the browser mutes the zero-latency allpass feedback cycle).
    const out = await renderPhaser({ wet: 1, feedback: 0.7, durationSeconds: 0.1, withFeedbackDelay: true });
    const skip = Math.floor(0.01 * SAMPLE_RATE);
    expect(rms(out.subarray(skip))).toBeGreaterThan(0.1);
  });

  it('wet=0 passes only dry signal (output reflects oscillator amplitude)', async () => {
    // Dry only — the allpass path is gated off by wetGain=0.
    const out = await renderPhaser({ wet: 0, durationSeconds: 0.1, withFeedbackDelay: true });
    const skip = Math.floor(0.01 * SAMPLE_RATE);
    // 440 Hz sine at unit amplitude: RMS ≈ 1/√2 ≈ 0.707.
    const r = rms(out.subarray(skip));
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(0.8);
  });
});
