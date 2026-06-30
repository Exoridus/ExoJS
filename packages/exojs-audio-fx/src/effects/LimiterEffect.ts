import { AudioEffect, getAudioContext, isAudioContextReady, onAudioContextReady } from '@codexo/exojs';

/** Construction options for {@link LimiterEffect}. */
export interface LimiterEffectOptions {
  /**
   * Threshold in dBFS above which limiting is applied. Range −60..0, default −3.
   */
  threshold?: number;
  /**
   * Time in seconds for the limiter to engage after the signal exceeds the
   * threshold. Range 0..1, default 0.003.
   */
  attack?: number;
  /**
   * Time in seconds for the limiter to release after the signal drops below the
   * threshold. Range 0..1, default 0.25.
   */
  release?: number;
  /**
   * Dry/wet mix, 0..1. The dry level is automatically `1 - wet`. Default 1.0.
   * A limiter is typically used fully wet, but exposing this allows parallel
   * processing workflows.
   */
  wet?: number;
}

interface LimiterEffectSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly compressor: DynamicsCompressorNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
}

/**
 * Brick-wall limiter backed by a Web Audio `DynamicsCompressorNode` configured
 * for hard limiting: a fixed high ratio (~20), zero knee (hard knee), and a
 * fast attack. Use it as a final-chain safety net to prevent clipping and
 * protect downstream output.
 *
 * The compressor `ratio` (20) and `knee` (0) are fixed internally and are not
 * user-configurable options. The effect exposes a dry/wet mix for API
 * consistency and parallel processing workflows, though a fully-wet signal
 * (`wet = 1`) is the typical configuration.
 *
 * Node graph:
 * ```
 * input(GainNode) → dryGain → output(GainNode)
 * input           → compressor → wetGain → output
 * ```
 * Gains: `dryGain.gain = 1 - wet`; `wetGain.gain = wet`.
 *
 * @example
 * ```ts
 * const limiter = new LimiterEffect({ threshold: -3, release: 0.1 });
 * masterBus.addEffect(limiter);
 * ```
 */
export class LimiterEffect extends AudioEffect {
  private _setup: LimiterEffectSetup | null = null;
  private _threshold: number;
  private _attack: number;
  private _release: number;
  private _wet: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };

  public constructor(options: LimiterEffectOptions = {}) {
    super();
    this._threshold = Math.max(-60, Math.min(0, options.threshold ?? -3));
    this._attack = Math.max(0, Math.min(1, options.attack ?? 0.003));
    this._release = Math.max(0, Math.min(1, options.release ?? 0.25));
    this._wet = Math.max(0, Math.min(1, options.wet ?? 1));
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
    if (!this._setup) throw new Error('LimiterEffect not yet initialized.');
    return this._setup.inputGain;
  }

  /**
   * The node where audio exits this effect. Throws if the audio context is
   * not yet initialized.
   */
  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('LimiterEffect not yet initialized.');
    return this._setup.outputGain;
  }

  /**
   * Threshold in dBFS above which limiting is applied. Range −60..0, default −3.
   * Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get threshold(): number {
    return this._threshold;
  }

  public set threshold(value: number) {
    this._threshold = Math.max(-60, Math.min(0, value));
    if (this._setup) {
      this._setup.compressor.threshold.setTargetAtTime(
        this._threshold,
        this._setup.compressor.context.currentTime,
        0.01,
      );
    }
  }

  /**
   * Attack time in seconds for the limiter to engage. Range 0..1, default 0.003.
   * Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get attack(): number {
    return this._attack;
  }

  public set attack(value: number) {
    this._attack = Math.max(0, Math.min(1, value));
    if (this._setup) {
      this._setup.compressor.attack.setTargetAtTime(
        this._attack,
        this._setup.compressor.context.currentTime,
        0.01,
      );
    }
  }

  /**
   * Release time in seconds for the limiter to disengage. Range 0..1, default 0.25.
   * Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get release(): number {
    return this._release;
  }

  public set release(value: number) {
    this._release = Math.max(0, Math.min(1, value));
    if (this._setup) {
      this._setup.compressor.release.setTargetAtTime(
        this._release,
        this._setup.compressor.context.currentTime,
        0.01,
      );
    }
  }

  /**
   * Dry/wet mix level, 0..1. The dry level is automatically `1 - wet`.
   * Changes are ramped smoothly via `setTargetAtTime`. Default 1.0.
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
      this._setup.compressor.disconnect();
      this._setup.dryGain.disconnect();
      this._setup.wetGain.disconnect();
      this._setup.outputGain.disconnect();
      this._setup = null;
    }
  }

  private _setupNodes(ctx: AudioContext): void {
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();

    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);

    // Fixed limiter settings: high ratio for brick-wall behaviour, hard knee (0).
    compressor.ratio.setValueAtTime(20, ctx.currentTime);
    compressor.knee.setValueAtTime(0, ctx.currentTime);
    compressor.threshold.setValueAtTime(this._threshold, ctx.currentTime);
    compressor.attack.setValueAtTime(this._attack, ctx.currentTime);
    compressor.release.setValueAtTime(this._release, ctx.currentTime);

    // Dry path: input → dryGain → output
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet path: input → compressor → wetGain → output
    inputGain.connect(compressor);
    compressor.connect(wetGain);
    wetGain.connect(outputGain);

    this._setup = { inputGain, outputGain, compressor, dryGain, wetGain };
  }
}
