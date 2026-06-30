import { AudioEffect, getAudioContext, isAudioContextReady, onAudioContextReady } from '@codexo/exojs';

/** Construction options for {@link PhaserEffect}. */
export interface PhaserEffectOptions {
  /**
   * Number of allpass filter stages. Must be an even integer in the range
   * 2..12. Odd values are rounded up to the next even number. Default 4.
   */
  stages?: number;
  /**
   * LFO sweep rate in Hz. Range 0..20, default 0.5.
   */
  rateHz?: number;
  /**
   * Centre frequency of all allpass stages in Hz. Range 50..5000, default 500.
   */
  baseFrequency?: number;
  /**
   * LFO modulation depth as a fraction of `baseFrequency`. Range 0..1,
   * default 0.6. The LFO peak deviation equals `depth × baseFrequency` Hz,
   * so the filter frequencies sweep between
   * `baseFrequency ± depth × baseFrequency`.
   */
  depth?: number;
  /**
   * Feedback gain from the last stage back to the first stage. Range 0..0.9,
   * default 0.3. Higher values add resonance and sharpen the notch sweep.
   */
  feedback?: number;
  /**
   * Dry/wet mix, 0..1. The dry level is automatically `1 - wet`. Default 0.5.
   */
  wet?: number;
}

interface PhaserEffectSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
  readonly feedbackGain: GainNode;
  readonly lfoGain: GainNode;
  readonly allpassFilters: BiquadFilterNode[];
  readonly lfoOscillator: OscillatorNode;
}

/**
 * Phaser effect implemented with native Web Audio nodes (no worklet required).
 *
 * The wet signal passes through a cascade of allpass `BiquadFilterNode`s whose
 * centre frequencies are swept synchronously by a sine LFO. The phase shift
 * produced by each allpass stage creates sweeping notches when summed with the
 * dry signal. An optional feedback path from the last stage back to the first
 * adds resonance and sharpens the effect.
 *
 * Node graph:
 * ```
 * inputGain ┬── dryGain ───────────────────────────────────────┐
 *           │                                                   ├── outputGain
 *           └── allpass[0] ─► … ─► allpass[N-1] ── wetGain ───┘
 *                 ▲                      │
 *                 └──── feedbackGain ◄───┘
 *
 * lfoOscillator ── lfoGain (depth × baseFrequency Hz) ──► each allpass.frequency
 * ```
 * Gains: `dryGain.gain = 1 - wet`; `wetGain.gain = wet`;
 * `feedbackGain.gain = feedback`; `lfoGain.gain = depth × baseFrequency`.
 *
 * @example
 * ```ts
 * const phaser = new PhaserEffect({ stages: 6, rateHz: 0.3, depth: 0.8, wet: 0.6 });
 * bus.addEffect(phaser);
 *
 * // Automate the rate at runtime
 * phaser.rateHz = 1.2;
 * ```
 */
export class PhaserEffect extends AudioEffect {
  private _setup: PhaserEffectSetup | null = null;
  private _stages: number;
  private _rateHz: number;
  private _baseFrequency: number;
  private _depth: number;
  private _feedback: number;
  private _wet: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };

  public constructor(options: PhaserEffectOptions = {}) {
    super();
    const rawStages = Math.max(2, Math.min(12, Math.round(options.stages ?? 4)));
    this._stages = rawStages % 2 !== 0 ? Math.min(12, rawStages + 1) : rawStages;
    this._rateHz = Math.max(0, Math.min(20, options.rateHz ?? 0.5));
    this._baseFrequency = Math.max(50, Math.min(5000, options.baseFrequency ?? 500));
    this._depth = Math.max(0, Math.min(1, options.depth ?? 0.6));
    this._feedback = Math.max(0, Math.min(0.9, options.feedback ?? 0.3));
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
    if (!this._setup) throw new Error('PhaserEffect not yet initialized.');
    return this._setup.inputGain;
  }

  /**
   * The node where audio exits this effect. Throws if the audio context is
   * not yet initialized.
   */
  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('PhaserEffect not yet initialized.');
    return this._setup.outputGain;
  }

  // ---------------------------------------------------------------------------
  // Getters / setters
  // ---------------------------------------------------------------------------

  /**
   * Number of allpass filter stages (even integer, 2..12). Set at construction
   * time only; read-only at runtime.
   */
  public get stages(): number {
    return this._stages;
  }

  /**
   * LFO sweep rate in Hz. Range 0..20, default 0.5. Changes are ramped
   * smoothly via `setTargetAtTime`.
   */
  public get rateHz(): number {
    return this._rateHz;
  }
  public set rateHz(value: number) {
    this._rateHz = Math.max(0, Math.min(20, value));
    if (this._setup) {
      this._setup.lfoOscillator.frequency.setTargetAtTime(
        this._rateHz,
        this._setup.inputGain.context.currentTime,
        0.01,
      );
    }
  }

  /**
   * Centre frequency of all allpass stages in Hz. Range 50..5000, default 500.
   * Changes are ramped smoothly and update both the filter frequencies and the
   * absolute LFO depth.
   */
  public get baseFrequency(): number {
    return this._baseFrequency;
  }
  public set baseFrequency(value: number) {
    this._baseFrequency = Math.max(50, Math.min(5000, value));
    if (this._setup) {
      const ctx = this._setup.inputGain.context;
      for (const filter of this._setup.allpassFilters) {
        filter.frequency.setTargetAtTime(this._baseFrequency, ctx.currentTime, 0.01);
      }
      this._setup.lfoGain.gain.setTargetAtTime(this._depth * this._baseFrequency, ctx.currentTime, 0.01);
    }
  }

  /**
   * LFO modulation depth as a fraction of `baseFrequency`. Range 0..1,
   * default 0.6. Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get depth(): number {
    return this._depth;
  }
  public set depth(value: number) {
    this._depth = Math.max(0, Math.min(1, value));
    if (this._setup) {
      this._setup.lfoGain.gain.setTargetAtTime(
        this._depth * this._baseFrequency,
        this._setup.inputGain.context.currentTime,
        0.01,
      );
    }
  }

  /**
   * Feedback gain from the last stage back to the first. Range 0..0.9,
   * default 0.3. Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get feedback(): number {
    return this._feedback;
  }
  public set feedback(value: number) {
    this._feedback = Math.max(0, Math.min(0.9, value));
    if (this._setup) {
      this._setup.feedbackGain.gain.setTargetAtTime(
        this._feedback,
        this._setup.inputGain.context.currentTime,
        0.01,
      );
    }
  }

  /**
   * Wet (phased) mix level, 0..1. The dry level is automatically `1 - wet`.
   * Changes are ramped smoothly via `setTargetAtTime`. Default 0.5.
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

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  public override destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    if (this._setup) {
      this._setup.lfoOscillator.stop();
      this._setup.lfoOscillator.disconnect();
      this._setup.lfoGain.disconnect();
      for (const filter of this._setup.allpassFilters) {
        filter.disconnect();
      }
      this._setup.feedbackGain.disconnect();
      this._setup.dryGain.disconnect();
      this._setup.wetGain.disconnect();
      this._setup.inputGain.disconnect();
      this._setup.outputGain.disconnect();
      this._setup = null;
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

    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);
    feedbackGain.gain.setValueAtTime(this._feedback, ctx.currentTime);
    lfoGain.gain.setValueAtTime(this._depth * this._baseFrequency, ctx.currentTime);

    // Allpass filter cascade
    const allpassFilters: BiquadFilterNode[] = [];
    for (let i = 0; i < this._stages; i++) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'allpass';
      filter.frequency.setValueAtTime(this._baseFrequency, ctx.currentTime);
      allpassFilters.push(filter);
    }

    // LFO oscillator
    const lfoOscillator = ctx.createOscillator();
    lfoOscillator.type = 'sine';
    lfoOscillator.frequency.value = this._rateHz;

    // LFO wiring: lfoOscillator → lfoGain → each allpass.frequency (AudioParam)
    lfoOscillator.connect(lfoGain);
    for (const filter of allpassFilters) {
      lfoGain.connect(filter.frequency as unknown as AudioNode);
    }

    // Dry path: inputGain → dryGain → outputGain
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet path: inputGain → allpass[0] → … → allpass[N-1] → wetGain → outputGain
    inputGain.connect(allpassFilters[0]!);
    for (let i = 0; i < allpassFilters.length - 1; i++) {
      allpassFilters[i]!.connect(allpassFilters[i + 1]!);
    }
    allpassFilters[allpassFilters.length - 1]!.connect(wetGain);
    wetGain.connect(outputGain);

    // Feedback path: allpass[N-1] → feedbackGain → allpass[0]
    allpassFilters[allpassFilters.length - 1]!.connect(feedbackGain);
    feedbackGain.connect(allpassFilters[0]!);

    lfoOscillator.start();

    this._setup = {
      inputGain,
      outputGain,
      dryGain,
      wetGain,
      feedbackGain,
      lfoGain,
      allpassFilters,
      lfoOscillator,
    };
  }
}
