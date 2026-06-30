import { AudioEffect, getAudioContext, isAudioContextReady, onAudioContextReady } from '@codexo/exojs';

/** Construction options for {@link PingPongDelayEffect}. */
export interface PingPongDelayEffectOptions {
  /**
   * Delay time per tap in seconds. Range 0.01..2, default 0.25.
   */
  delayTime?: number;
  /**
   * Cross-channel feedback fraction — the portion of each delayed tap routed
   * into the opposite channel's delay input. Range 0..0.9, default 0.4.
   */
  feedback?: number;
  /**
   * Dry/wet mix, 0..1. The dry level is automatically `1 - wet`. Default 0.4.
   */
  wet?: number;
}

interface PingPongDelayEffectSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
  readonly feedbackGainA: GainNode;
  readonly feedbackGainB: GainNode;
  readonly delayL: DelayNode;
  readonly delayR: DelayNode;
  readonly pannerL: StereoPannerNode;
  readonly pannerR: StereoPannerNode;
}

/**
 * Stereo ping-pong delay effect using two cross-fed {@link DelayNode}s that
 * bounce the signal alternately between left and right channels. The input
 * feeds only the left delay; cross-feedback (L→R and R→L) then causes the
 * signal to alternate channels on every tap, producing the characteristic L↔R
 * slapback cascade. Each tap is routed through a {@link StereoPannerNode}
 * panned hard left or right, maintaining hard-left / hard-right stereo
 * separation throughout the feedback tail.
 *
 * Node graph:
 * ```
 * input(GainNode) → dryGain ────────────────────────────────── output(GainNode)
 * input           → delayL → feedbackGainA → delayR                   ↑
 *                   delayR → feedbackGainB → delayL                   │
 * delayL          → pannerL (pan = -1, hard left)  → wetGain ─────────┘
 * delayR          → pannerR (pan = +1, hard right) → wetGain
 * ```
 * Gains: `dryGain.gain = 1 - wet`; `wetGain.gain = wet`.
 *
 * @example
 * ```ts
 * const pingPong = new PingPongDelayEffect({ delayTime: 0.3, feedback: 0.5, wet: 0.5 });
 * bus.addEffect(pingPong);
 * ```
 */
export class PingPongDelayEffect extends AudioEffect {
  private _setup: PingPongDelayEffectSetup | null = null;
  private _delayTime: number;
  private _feedback: number;
  private _wet: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };

  public constructor(options: PingPongDelayEffectOptions = {}) {
    super();
    this._delayTime = Math.max(0.01, Math.min(2, options.delayTime ?? 0.25));
    this._feedback = Math.max(0, Math.min(0.9, options.feedback ?? 0.4));
    this._wet = Math.max(0, Math.min(1, options.wet ?? 0.4));
    if (isAudioContextReady()) {
      this._setupNodes(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  /**
   * The node where audio enters this effect. Throws if the audio context is
   * not yet initialized.
   */
  public get inputNode(): AudioNode {
    if (!this._setup) throw new Error('PingPongDelayEffect not yet initialized.');
    return this._setup.inputGain;
  }

  /**
   * The node where audio exits this effect. Throws if the audio context is
   * not yet initialized.
   */
  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('PingPongDelayEffect not yet initialized.');
    return this._setup.outputGain;
  }

  /**
   * Delay time per tap in seconds. Both the left and right delay nodes share
   * the same delay time. Range 0.01..2, default 0.25.
   * Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get delayTime(): number {
    return this._delayTime;
  }

  public set delayTime(value: number) {
    this._delayTime = Math.max(0.01, Math.min(2, value));
    if (this._setup) {
      const time = this._setup.delayL.context.currentTime;
      this._setup.delayL.delayTime.setTargetAtTime(this._delayTime, time, 0.01);
      this._setup.delayR.delayTime.setTargetAtTime(this._delayTime, time, 0.01);
    }
  }

  /**
   * Cross-channel feedback fraction. Each delayed tap feeds this fraction of
   * its signal into the opposite channel's delay, sustaining the L↔R bounce.
   * Range 0..0.9, default 0.4. Changes are ramped smoothly via
   * `setTargetAtTime`.
   */
  public get feedback(): number {
    return this._feedback;
  }

  public set feedback(value: number) {
    this._feedback = Math.max(0, Math.min(0.9, value));
    if (this._setup) {
      const time = this._setup.feedbackGainA.context.currentTime;
      this._setup.feedbackGainA.gain.setTargetAtTime(this._feedback, time, 0.01);
      this._setup.feedbackGainB.gain.setTargetAtTime(this._feedback, time, 0.01);
    }
  }

  /**
   * Wet (ping-pong) mix level, 0..1. The dry level is automatically `1 - wet`.
   * Changes are ramped smoothly via `setTargetAtTime`. Default 0.4.
   */
  public get wet(): number {
    return this._wet;
  }

  public set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    if (this._setup) {
      const ctx = this._setup.wetGain.context;
      this._setup.wetGain.gain.setTargetAtTime(this._wet, ctx.currentTime, 0.01);
      this._setup.dryGain.gain.setTargetAtTime(1 - this._wet, ctx.currentTime, 0.01);
    }
  }

  public override destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    if (this._setup) {
      this._setup.inputGain.disconnect();
      this._setup.outputGain.disconnect();
      this._setup.dryGain.disconnect();
      this._setup.wetGain.disconnect();
      this._setup.feedbackGainA.disconnect();
      this._setup.feedbackGainB.disconnect();
      this._setup.delayL.disconnect();
      this._setup.delayR.disconnect();
      this._setup.pannerL.disconnect();
      this._setup.pannerR.disconnect();
      this._setup = null;
    }
  }

  private _setupNodes(ctx: AudioContext): void {
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const feedbackGainA = ctx.createGain();
    const feedbackGainB = ctx.createGain();
    const delayL = ctx.createDelay(2);
    const delayR = ctx.createDelay(2);
    const pannerL = ctx.createStereoPanner();
    const pannerR = ctx.createStereoPanner();

    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);
    feedbackGainA.gain.setValueAtTime(this._feedback, ctx.currentTime);
    feedbackGainB.gain.setValueAtTime(this._feedback, ctx.currentTime);
    delayL.delayTime.setValueAtTime(this._delayTime, ctx.currentTime);
    delayR.delayTime.setValueAtTime(this._delayTime, ctx.currentTime);

    // Hard-pan each tap to its respective stereo channel.
    pannerL.pan.value = -1;
    pannerR.pan.value = 1;

    // Dry path: input → dryGain → output
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet path: input feeds only the left delay.
    // Feeding both delays symmetrically would produce identical L/R evolution
    // (no ping-pong). The cross-feedback edges below route each tap into the
    // opposite channel's delay, creating the alternating L↔R slapback.
    inputGain.connect(delayL);

    // Cross-feedback: L → R and R → L
    delayL.connect(feedbackGainA);
    feedbackGainA.connect(delayR);
    delayR.connect(feedbackGainB);
    feedbackGainB.connect(delayL);

    // Pan taps: delayL → pannerL (hard left), delayR → pannerR (hard right)
    delayL.connect(pannerL);
    delayR.connect(pannerR);

    // Wet output: panned taps sum into wetGain → output
    pannerL.connect(wetGain);
    pannerR.connect(wetGain);
    wetGain.connect(outputGain);

    this._setup = {
      inputGain,
      outputGain,
      dryGain,
      wetGain,
      feedbackGainA,
      feedbackGainB,
      delayL,
      delayR,
      pannerL,
      pannerR,
    };
  }
}
