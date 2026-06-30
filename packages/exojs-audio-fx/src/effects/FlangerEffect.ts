import { AudioEffect, getAudioContext, isAudioContextReady, onAudioContextReady } from '@codexo/exojs';

/** Construction options for {@link FlangerEffect}. */
export interface FlangerEffectOptions {
  /**
   * Base delay time in milliseconds. The LFO modulates the delay around this
   * centre value. Range 0.5..20, default 3.
   */
  delayMs?: number;
  /**
   * LFO modulation depth in milliseconds — the peak deviation added to and
   * subtracted from `delayMs` by the sine LFO. Range 0..10, default 2.
   */
  depthMs?: number;
  /**
   * LFO oscillation rate in Hz. Lower rates produce a slow, sweeping flange;
   * higher rates create a faster jet-plane effect. Range 0..10, default 0.25.
   */
  rateHz?: number;
  /**
   * Feedback amount — fraction of the delay output fed back to the delay input.
   * Higher values intensify the comb-filter resonance. Range 0..0.95, default 0.5.
   */
  feedback?: number;
  /**
   * Dry/wet mix, 0..1. The dry level is automatically `1 - wet`.
   * Default 0.5 (equal mix).
   */
  wet?: number;
}

interface FlangerEffectSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
  readonly feedbackGain: GainNode;
  readonly lfoGain: GainNode;
  readonly delayNode: DelayNode;
  readonly lfoOscillator: OscillatorNode;
}

/**
 * Flanger effect using native WebAudio nodes (no worklet required).
 *
 * A flanger is a very short LFO-modulated delay (1–10 ms) with a feedback
 * loop. Unlike a chorus — which uses longer delays without feedback to produce
 * thickening — the flanger's feedback reinforces phase cancellation, creating
 * the characteristic sweeping comb-filter "jet-plane" sound as notches and
 * peaks slide up and down the spectrum.
 *
 * Node graph:
 * ```
 * inputGain ┬── dryGain ─────────────────────────┐
 *           │                                     ├── outputGain
 *           └──▶ delayNode ──▶ wetGain ───────────┘
 *                  ↑    │
 *               feedbackGain ◀─┘
 *
 * lfoOscillator ── lfoGain (depth in seconds) ──▶ delayNode.delayTime
 * ```
 *
 * Gains: `dryGain.gain = 1 - wet`; `wetGain.gain = wet`;
 * `feedbackGain.gain = feedback`; `lfoGain.gain = depthMs / 1000`.
 *
 * @example
 * ```ts
 * const flanger = new FlangerEffect({ delayMs: 3, depthMs: 2, rateHz: 0.25, feedback: 0.5, wet: 0.5 });
 * bus.addEffect(flanger);
 * ```
 */
export class FlangerEffect extends AudioEffect {
  private _nodes: FlangerEffectSetup | null = null;
  private _delayMs: number;
  private _depthMs: number;
  private _rateHz: number;
  private _feedback: number;
  private _wet: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };

  public constructor(options: FlangerEffectOptions = {}) {
    super();
    this._delayMs = Math.max(0.5, Math.min(20, options.delayMs ?? 3));
    this._depthMs = Math.max(0, Math.min(10, options.depthMs ?? 2));
    this._rateHz = Math.max(0, Math.min(10, options.rateHz ?? 0.25));
    this._feedback = Math.max(0, Math.min(0.95, options.feedback ?? 0.5));
    this._wet = Math.max(0, Math.min(1, options.wet ?? 0.5));
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
    if (!this._nodes) throw new Error('FlangerEffect not yet initialized.');
    return this._nodes.inputGain;
  }

  /**
   * The node where audio exits this effect. Throws if the audio context is
   * not yet initialized.
   */
  public get outputNode(): AudioNode {
    if (!this._nodes) throw new Error('FlangerEffect not yet initialized.');
    return this._nodes.outputGain;
  }

  // ---------------------------------------------------------------------------
  // Getters / setters
  // ---------------------------------------------------------------------------

  /** Base delay time in milliseconds. Range 0.5..20, default 3. */
  public get delayMs(): number {
    return this._delayMs;
  }

  public set delayMs(value: number) {
    this._delayMs = Math.max(0.5, Math.min(20, value));
    if (this._nodes) {
      this._nodes.delayNode.delayTime.setTargetAtTime(
        this._delayMs / 1000,
        this._nodes.delayNode.context.currentTime,
        0.01,
      );
    }
  }

  /** LFO modulation depth in milliseconds (peak deviation from base delay). Range 0..10, default 2. */
  public get depthMs(): number {
    return this._depthMs;
  }

  public set depthMs(value: number) {
    this._depthMs = Math.max(0, Math.min(10, value));
    if (this._nodes) {
      this._nodes.lfoGain.gain.setTargetAtTime(
        this._depthMs / 1000,
        this._nodes.lfoGain.context.currentTime,
        0.01,
      );
    }
  }

  /** LFO oscillation rate in Hz. Range 0..10, default 0.25. */
  public get rateHz(): number {
    return this._rateHz;
  }

  public set rateHz(value: number) {
    this._rateHz = Math.max(0, Math.min(10, value));
    if (this._nodes) {
      this._nodes.lfoOscillator.frequency.setTargetAtTime(
        this._rateHz,
        this._nodes.inputGain.context.currentTime,
        0.01,
      );
    }
  }

  /**
   * Feedback amount — fraction of delay output fed back to delay input.
   * Range 0..0.95, default 0.5.
   */
  public get feedback(): number {
    return this._feedback;
  }

  public set feedback(value: number) {
    this._feedback = Math.max(0, Math.min(0.95, value));
    if (this._nodes) {
      this._nodes.feedbackGain.gain.setTargetAtTime(
        this._feedback,
        this._nodes.feedbackGain.context.currentTime,
        0.01,
      );
    }
  }

  /** Wet (flanged) mix level, 0..1. The dry level is automatically `1 - wet`. Default 0.5. */
  public get wet(): number {
    return this._wet;
  }

  public set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    if (this._nodes) {
      const ctx = this._nodes.wetGain.context;
      this._nodes.wetGain.gain.setTargetAtTime(this._wet, ctx.currentTime, 0.01);
      this._nodes.dryGain.gain.setTargetAtTime(1 - this._wet, ctx.currentTime, 0.01);
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  public override destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    if (this._nodes) {
      this._nodes.lfoOscillator.stop();
      this._nodes.lfoOscillator.disconnect();
      this._nodes.lfoGain.disconnect();
      this._nodes.feedbackGain.disconnect();
      this._nodes.delayNode.disconnect();
      this._nodes.dryGain.disconnect();
      this._nodes.wetGain.disconnect();
      this._nodes.inputGain.disconnect();
      this._nodes.outputGain.disconnect();
      this._nodes = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _setupNodes(ctx: AudioContext): void {
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const feedbackGain = ctx.createGain();
    const lfoGain = ctx.createGain();

    // maxDelayTime must accommodate base delay plus the full modulation depth,
    // with a safety headroom of 50 ms so the DelayNode never clips.
    const maxDelay = (this._delayMs + this._depthMs) / 1000 + 0.05;
    const delayNode = ctx.createDelay(maxDelay);

    // Initial parameter values
    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);
    feedbackGain.gain.setValueAtTime(this._feedback, ctx.currentTime);
    lfoGain.gain.setValueAtTime(this._depthMs / 1000, ctx.currentTime);
    delayNode.delayTime.setValueAtTime(this._delayMs / 1000, ctx.currentTime);

    // LFO
    const lfoOscillator = ctx.createOscillator();
    lfoOscillator.type = 'sine';
    lfoOscillator.frequency.value = this._rateHz;

    // LFO path: lfoOscillator → lfoGain → delayNode.delayTime (AudioParam)
    lfoOscillator.connect(lfoGain);
    lfoGain.connect(delayNode.delayTime as unknown as AudioNode);

    // Dry path: inputGain → dryGain → outputGain
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet path: inputGain → delayNode → wetGain → outputGain
    inputGain.connect(delayNode);
    delayNode.connect(wetGain);
    wetGain.connect(outputGain);

    // Feedback loop: delayNode → feedbackGain → delayNode
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    lfoOscillator.start();

    this._nodes = {
      inputGain,
      outputGain,
      dryGain,
      wetGain,
      feedbackGain,
      lfoGain,
      delayNode,
      lfoOscillator,
    };
  }
}
