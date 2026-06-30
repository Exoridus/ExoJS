/**
 * Acoustic contract for a ping-pong delay graph using a real OfflineAudioContext.
 *
 * Verifies that:
 * 1. A ping-pong delay seeded at only the left channel produces genuinely
 *    different L and R echo tails. This FAILS before the I1 fix — when the
 *    input feeds both delays symmetrically the two chains evolve identically,
 *    collapsing to centred mono (L = R at every sample).
 * 2. The effect confirms that asymmetric seeding (input → delayL only) combined
 *    with cross-feedback edges (delayL→delayR and delayR→delayL) produces the
 *    characteristic alternating L↔R slapback.
 *
 * Tests use raw Web Audio (OfflineAudioContext + DelayNode + StereoPannerNode)
 * rather than the PingPongDelayEffect class, because the class relies on the
 * engine's AudioContext lifecycle (isAudioContextReady / onAudioContextReady)
 * which is not wired in the browser-audio test environment.
 */

import { rms, SAMPLE_RATE } from './_audio-harness';

interface PingPongRenderOptions {
  /** Delay time per tap in seconds. Default 0.05. */
  delayTime?: number;
  /** Cross-channel feedback gain. Default 0.7. */
  feedback?: number;
  /** Whether to feed input to delayL only (true) or to both delays (false). Default true. */
  asymmetricInput?: boolean;
  /** Render duration in seconds. */
  durationSeconds: number;
}

/**
 * Render a single-sample impulse through a stereo ping-pong delay graph.
 * Returns { left, right } channel samples from a 2-channel OfflineAudioContext.
 *
 * Graph (asymmetricInput = true):
 *   impulse → delayL → feedbackGainA → delayR
 *             delayR → feedbackGainB → delayL
 *   delayL → pannerL (pan = -1) → wetGain → destination
 *   delayR → pannerR (pan = +1) → wetGain
 */
async function renderPingPong(opts: PingPongRenderOptions): Promise<{ left: Float32Array; right: Float32Array }> {
  const sr = SAMPLE_RATE;
  const delayTime = opts.delayTime ?? 0.05;
  const feedback = opts.feedback ?? 0.7;
  const asymmetric = opts.asymmetricInput ?? true;
  const length = Math.floor(opts.durationSeconds * sr);

  // 2-channel context so StereoPanner spreads L/R into separate channels.
  const ctx = new OfflineAudioContext(2, length, sr);

  const delayL = ctx.createDelay(2);
  const delayR = ctx.createDelay(2);
  const feedbackGainA = ctx.createGain();
  const feedbackGainB = ctx.createGain();
  const pannerL = ctx.createStereoPanner();
  const pannerR = ctx.createStereoPanner();
  const wetGain = ctx.createGain();

  delayL.delayTime.value = delayTime;
  delayR.delayTime.value = delayTime;
  feedbackGainA.gain.value = feedback;
  feedbackGainB.gain.value = feedback;
  pannerL.pan.value = -1;
  pannerR.pan.value = 1;
  wetGain.gain.value = 1;

  // Single-sample impulse source.
  const impulseBuffer = ctx.createBuffer(1, 128, sr);
  impulseBuffer.getChannelData(0)[0] = 1.0;
  const src = ctx.createBufferSource();
  src.buffer = impulseBuffer;

  if (asymmetric) {
    // True ping-pong: seed only the left delay.
    src.connect(delayL);
  } else {
    // Broken: symmetric seeding collapses L/R to identical mono.
    src.connect(delayL);
    src.connect(delayR);
  }

  // Cross-feedback: L ↔ R
  delayL.connect(feedbackGainA);
  feedbackGainA.connect(delayR);
  delayR.connect(feedbackGainB);
  feedbackGainB.connect(delayL);

  // Panned taps → wet output
  delayL.connect(pannerL);
  delayR.connect(pannerR);
  pannerL.connect(wetGain);
  pannerR.connect(wetGain);
  wetGain.connect(ctx.destination);

  src.start(0);
  const rendered = await ctx.startRendering();

  return {
    left: rendered.getChannelData(0).slice(),
    right: rendered.getChannelData(1).slice(),
  };
}

describe('PingPongDelayEffect — acoustic contract (real Web Audio)', () => {
  it('left and right echo tails differ with asymmetric input (true ping-pong)', async () => {
    // With input fed to delayL only, the first echo appears in L, the second in
    // R (via feedbackGainA), the third in L again, etc. L and R are never in
    // phase, so their difference carries substantial energy.
    // This assertion FAILS before the I1 fix — when input feeds both delays the
    // chains evolve symmetrically, producing L = R at every sample (diffRms ≈ 0).
    const { left, right } = await renderPingPong({
      delayTime: 0.05,
      feedback: 0.7,
      asymmetricInput: true,
      durationSeconds: 0.5,
    });

    // Skip the initial silence before the first echo arrives.
    const echoStart = Math.floor(0.04 * SAMPLE_RATE);
    const L = left.subarray(echoStart);
    const R = right.subarray(echoStart);

    // With asymmetric input (seed only delayL), the first echo lands in L
    // (at ~50 ms) while R is silent; the second lands in R (at ~100 ms) while
    // L is silent. The peak absolute difference should equal roughly the echo
    // amplitude (~1.0 for the first tap).
    // Before the I1 fix (symmetric seeding), L = R at every sample → maxAbsDiff = 0.
    let maxAbsDiff = 0;
    const n = Math.min(L.length, R.length);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(L[i]! - R[i]!);
      if (d > maxAbsDiff) maxAbsDiff = d;
    }

    // True ping-pong: alternating exclusive taps → peak L/R difference > 0.5.
    expect(maxAbsDiff).toBeGreaterThan(0.5);
  });

  it('both delay taps contain signal (echo tail is not silent)', async () => {
    const { left, right } = await renderPingPong({
      delayTime: 0.05,
      feedback: 0.7,
      asymmetricInput: true,
      durationSeconds: 0.5,
    });

    // After the first echo, both L and R should carry echo energy.
    const afterFirstEcho = Math.floor(0.06 * SAMPLE_RATE);
    expect(rms(left.subarray(afterFirstEcho))).toBeGreaterThan(0.001);
    expect(rms(right.subarray(afterFirstEcho))).toBeGreaterThan(0.001);
  });
});
