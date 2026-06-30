import { AudioEffect, getAudioContext, isAudioContextReady, onAudioContextReady } from '@codexo/exojs';

/** Construction options for {@link TremoloEffect}. */
export interface TremoloEffectOptions {
  /**
   * LFO oscillation rate in Hz controlling the speed of the tremolo pulse.
   * Range 0..20, default 5.
   */
  rateHz?: number;
  /**
   * Modulation depth, 0..1. Determines the amplitude of the LFO that modulates
   * `tremoloGain.gain`. The base gain is `1 - depth`; adding the LFO (peak = `depth`)
   * makes the gain oscillate between `1 - 2 * depth` and `1`.
   * At 0 the effect is transparent; at 1 the signal dips to near silence. Default 0.7.
   */
  depth?: number;
  /**
   * When `true` the same LFO also drives a `StereoPannerNode.pan` (amplitude = `depth`),
   * sweeping the signal left and right in synchrony with the tremolo pulsing. This option
   * is read-only after construction. Default `false`.
   */
  autoPan?: boolean;
  /**
   * Dry/wet mix, 0..1. The dry level is automatically `1 - wet`. Default 1.
   */
  wet?: number;
}

interface TremoloEffectSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
  readonly tremoloGain: GainNode;
  readonly lfoOscillator: OscillatorNode;
  readonly lfoGain: GainNode;
  readonly panner: StereoPannerNode | null;
  readonly panGain: GainNode | null;
}

/**
 * Tremolo effect that amplitude-modulates the signal with a sine LFO using native WebAudio nodes.
 *
 * A sine-wave LFO drives a `GainNode`'s gain to produce the characteristic volume pulsing of
 * tremolo. The base gain is `1 - depth` and the LFO peak deviation is `depth`, so the gain
 * oscillates between `1 - 2 * depth` and `1`. Optionally the same LFO can drive a
 * `StereoPannerNode.pan` for a synchronized auto-pan effect.
 *
 * Node graph (`autoPan = false`):
 * ```
 * inputGain ┬── dryGain ──────────────────────────┐
 *           │                                       ├── outputGain
 *           └── tremoloGain ── wetGain ─────────────┘
 *
 * lfoOscillator ── lfoGain (depth) ── tremoloGain.gain
 * ```
 *
 * Node graph (`autoPan = true`):
 * ```
 * inputGain ┬── dryGain ──────────────────────────────────┐
 *           │                                               ├── outputGain
 *           └── tremoloGain ── panner ── wetGain ──────────┘
 *
 * lfoOscillator ── lfoGain (depth) ── tremoloGain.gain
 * lfoOscillator ── panGain (depth) ── panner.pan
 * ```
 *
 * Gains: `dryGain.gain = 1 - wet`; `wetGain.gain = wet`; `tremoloGain.gain` base = `1 - depth`.
 *
 * @example
 * ```ts
 * // Classic tremolo at 5 Hz, 70 % depth, full wet
 * const tremolo = new TremoloEffect({ rateHz: 5, depth: 0.7, wet: 1 });
 * bus.addEffect(tremolo);
 *
 * // Slow auto-pan at 0.5 Hz
 * const autopan = new TremoloEffect({ rateHz: 0.5, depth: 0.5, autoPan: true });
 * bus.addEffect(autopan);
 * ```
 */
export class TremoloEffect extends AudioEffect {
  private _setup: TremoloEffectSetup | null = null;
  private _rateHz: number;
  private _depth: number;
  private readonly _autoPan: boolean;
  private _wet: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };

  public constructor(options: TremoloEffectOptions = {}) {
    super();
    this._rateHz = Math.max(0, Math.min(20, options.rateHz ?? 5));
    this._depth = Math.max(0, Math.min(1, options.depth ?? 0.7));
    this._autoPan = options.autoPan ?? false;
    this._wet = Math.max(0, Math.min(1, options.wet ?? 1));
    if (isAudioContextReady()) {
      this._setupNodes(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  /**
   * The node where audio enters this effect. Throws if the audio context is not yet initialized.
   */
  public get inputNode(): AudioNode {
    if (!this._setup) throw new Error('TremoloEffect not yet initialized.');
    return this._setup.inputGain;
  }

  /**
   * The node where audio exits this effect. Throws if the audio context is not yet initialized.
   */
  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('TremoloEffect not yet initialized.');
    return this._setup.outputGain;
  }

  /**
   * LFO oscillation rate in Hz. Range 0..20, default 5.
   * Ramped via `setTargetAtTime` when changed at runtime.
   */
  public get rateHz(): number {
    return this._rateHz;
  }

  public set rateHz(value: number) {
    this._rateHz = Math.max(0, Math.min(20, value));
    if (this._setup) {
      this._setup.lfoOscillator.frequency.setTargetAtTime(this._rateHz, this._setup.inputGain.context.currentTime, 0.01);
    }
  }

  /**
   * Modulation depth, 0..1. At 0 the effect is transparent; at 1 the signal dips to
   * near silence at the LFO trough. Default 0.7. Ramped via `setTargetAtTime`.
   */
  public get depth(): number {
    return this._depth;
  }

  public set depth(value: number) {
    this._depth = Math.max(0, Math.min(1, value));
    if (this._setup) {
      const t = this._setup.inputGain.context.currentTime;
      this._setup.lfoGain.gain.setTargetAtTime(this._depth, t, 0.01);
      this._setup.tremoloGain.gain.setTargetAtTime(1 - this._depth, t, 0.01);
      if (this._setup.panGain) {
        this._setup.panGain.gain.setTargetAtTime(this._depth, t, 0.01);
      }
    }
  }

  /**
   * Whether auto-pan is enabled. Set at construction time via {@link TremoloEffectOptions.autoPan};
   * read-only at runtime. Default `false`.
   */
  public get autoPan(): boolean {
    return this._autoPan;
  }

  /**
   * Wet (tremolo) mix level, 0..1. The dry level is automatically `1 - wet`. Default 1.
   * Ramped via `setTargetAtTime` when changed at runtime.
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
      this._setup.lfoOscillator.stop();
      this._setup.lfoOscillator.disconnect();
      this._setup.lfoGain.disconnect();
      this._setup.tremoloGain.disconnect();
      if (this._setup.panner) this._setup.panner.disconnect();
      if (this._setup.panGain) this._setup.panGain.disconnect();
      this._setup.dryGain.disconnect();
      this._setup.wetGain.disconnect();
      this._setup.inputGain.disconnect();
      this._setup.outputGain.disconnect();
      this._setup = null;
    }
  }

  private _setupNodes(ctx: AudioContext): void {
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const tremoloGain = ctx.createGain();
    const lfoGain = ctx.createGain();

    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);
    // Base gain = 1 - depth; the LFO (amplitude = depth) is added on top via AudioParam
    // modulation, making the effective gain oscillate in [1 - 2*depth, 1].
    tremoloGain.gain.setValueAtTime(1 - this._depth, ctx.currentTime);
    lfoGain.gain.setValueAtTime(this._depth, ctx.currentTime);

    const lfoOscillator = ctx.createOscillator();
    lfoOscillator.type = 'sine';
    lfoOscillator.frequency.value = this._rateHz;

    // LFO → lfoGain → tremoloGain.gain (AudioParam modulation)
    lfoOscillator.connect(lfoGain);
    lfoGain.connect(tremoloGain.gain as unknown as AudioNode);

    // Dry path: inputGain → dryGain → outputGain
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    let panner: StereoPannerNode | null = null;
    let panGain: GainNode | null = null;

    if (this._autoPan) {
      panner = ctx.createStereoPanner();
      panGain = ctx.createGain();
      panGain.gain.setValueAtTime(this._depth, ctx.currentTime);

      // LFO → panGain → panner.pan (AudioParam modulation)
      lfoOscillator.connect(panGain);
      panGain.connect(panner.pan as unknown as AudioNode);

      // Wet path: inputGain → tremoloGain → panner → wetGain → outputGain
      inputGain.connect(tremoloGain);
      tremoloGain.connect(panner);
      panner.connect(wetGain);
      wetGain.connect(outputGain);
    } else {
      // Wet path: inputGain → tremoloGain → wetGain → outputGain
      inputGain.connect(tremoloGain);
      tremoloGain.connect(wetGain);
      wetGain.connect(outputGain);
    }

    lfoOscillator.start();

    this._setup = { inputGain, outputGain, dryGain, wetGain, tremoloGain, lfoOscillator, lfoGain, panner, panGain };
  }
}
