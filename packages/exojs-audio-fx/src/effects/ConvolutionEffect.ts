import { AudioEffect, getAudioContext, isAudioContextReady, onAudioContextReady, Sound } from '@codexo/exojs';

/** Construction options for {@link ConvolutionEffect}. */
export interface ConvolutionEffectOptions {
  /**
   * Impulse response. Accepts a decoded `AudioBuffer` or a `Sound` (its
   * `audioBuffer` is used). If omitted the effect runs dry (passthrough) until
   * {@link ConvolutionEffect.setImpulse} is called.
   */
  impulse?: AudioBuffer | Sound;
  /**
   * Dry/wet mix, 0..1. The dry level is automatically `1 - wet`. Default 1.0.
   */
  wet?: number;
  /**
   * Maps to `ConvolverNode.normalize`. When `true` the browser applies an
   * equal-power normalization pass on the IR so different IRs play at a
   * consistent perceived loudness. Default `true` (the Web Audio spec default).
   *
   * **Note:** the Web Audio spec only respects `normalize` if it is set
   * *before* `buffer` is assigned. This class always writes `normalize` first.
   * Changing `normalize` at runtime while an IR is loaded re-assigns the
   * buffer so the new value takes effect.
   */
  normalize?: boolean;
  /**
   * Optional makeup gain multiplier applied to the wet path. Useful when the
   * IR is very quiet or very loud and `normalize` is off. Range 0..4,
   * default 1.
   */
  gain?: number;
}

interface ConvolutionEffectSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly convolver: ConvolverNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
}

/**
 * Convolution effect that convolves the input signal with a user-supplied
 * impulse response (IR). Unlike {@link ReverbEffect}, which generates a
 * procedural noise-based IR, `ConvolutionEffect` accepts a *real* decoded IR —
 * enabling convolution reverb from acoustic-space captures, cabinet/speaker
 * simulations, telephone/pipe character filtering, and any other linear
 * time-invariant transformation.
 *
 * Pass the IR as an `AudioBuffer` (typically decoded via
 * `AudioContext.decodeAudioData`) or as a `Sound` (its `audioBuffer` is used).
 * Omitting the IR leaves `convolver.buffer` as `null`, making the wet path
 * silent and the effect act as a passthrough until {@link setImpulse} is
 * called — safe to add to a bus before an IR is available.
 *
 * Node graph:
 * ```
 * input(GainNode) → dryGain → output(GainNode)
 * input           → convolver → wetGain → output
 * ```
 * Gains: `dryGain.gain = 1 - wet`; `wetGain.gain = wet × gain`.
 *
 * @example
 * ```ts
 * const hall = await loader.load(Asset.kind('sound', 'hall.wav'));
 * const reverb = new ConvolutionEffect({ impulse: hall, wet: 0.6 });
 * bus.addEffect(reverb);
 * ```
 */
export class ConvolutionEffect extends AudioEffect {
  private _setup: ConvolutionEffectSetup | null = null;
  private _wet: number;
  private _normalize: boolean;
  private _gain: number;
  private _pendingImpulse: AudioBuffer | Sound | null;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };

  public constructor(options: ConvolutionEffectOptions = {}) {
    super();
    this._wet = Math.max(0, Math.min(1, options.wet ?? 1));
    this._normalize = options.normalize ?? true;
    this._gain = Math.max(0, Math.min(4, options.gain ?? 1));
    this._pendingImpulse = options.impulse ?? null;
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
    if (!this._setup) throw new Error('ConvolutionEffect not yet initialized.');
    return this._setup.inputGain;
  }

  /**
   * The node where audio exits this effect. Throws if the audio context is
   * not yet initialized.
   */
  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('ConvolutionEffect not yet initialized.');
    return this._setup.outputGain;
  }

  /**
   * Wet (convolved) mix level, 0..1. The dry level is automatically `1 - wet`.
   * Changes are ramped smoothly via `setTargetAtTime`. Default 1.0.
   */
  public get wet(): number {
    return this._wet;
  }

  public set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    if (this._setup) {
      const ctx = this._setup.wetGain.context;
      this._setup.wetGain.gain.setTargetAtTime(this._wet * this._gain, ctx.currentTime, 0.01);
      this._setup.dryGain.gain.setTargetAtTime(1 - this._wet, ctx.currentTime, 0.01);
    }
  }

  /**
   * Whether the browser normalizes the IR for equal-power loudness. Mirrors
   * `ConvolverNode.normalize`. Default `true`.
   *
   * Changing this at runtime re-assigns the current buffer so the new value
   * takes effect (a Web Audio requirement: `normalize` is only applied on
   * buffer assignment).
   */
  public get normalize(): boolean {
    return this._normalize;
  }

  public set normalize(value: boolean) {
    this._normalize = value;
    if (this._setup) {
      const { convolver } = this._setup;
      convolver.normalize = this._normalize;
      if (convolver.buffer !== null) {
        // Re-assign so the new normalize value takes effect immediately.
        // (The Web Audio spec only applies normalize on buffer assignment.)
        const current = convolver.buffer;
        convolver.buffer = current;
      }
    }
  }

  /**
   * Makeup gain multiplier applied to the wet path. Range 0..4, default 1.
   * Adjusting this changes the wet-path amplitude without altering the
   * dry/wet balance ratio.
   */
  public get gain(): number {
    return this._gain;
  }

  public set gain(value: number) {
    this._gain = Math.max(0, Math.min(4, value));
    if (this._setup) {
      const ctx = this._setup.wetGain.context;
      this._setup.wetGain.gain.setTargetAtTime(this._wet * this._gain, ctx.currentTime, 0.01);
    }
  }

  /**
   * Set or replace the impulse response. Accepts a decoded `AudioBuffer`, a
   * `Sound` (its `audioBuffer` is used), or `null` to clear the IR (wet path
   * goes silent). Safe to call before the audio context is ready — the impulse
   * is stored and applied once nodes are created.
   *
   * **Web Audio note:** `normalize` is written to the convolver *before*
   * `buffer` is assigned, as required by the spec for the value to take effect.
   */
  public setImpulse(ir: AudioBuffer | Sound | null): void {
    const resolved = this._resolveBuffer(ir);
    if (this._setup) {
      const { convolver } = this._setup;
      convolver.normalize = this._normalize;
      convolver.buffer = resolved;
    } else {
      // Store for application in _setupNodes once the context is ready.
      this._pendingImpulse = ir;
    }
  }

  public override destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    if (this._setup) {
      this._setup.inputGain.disconnect();
      this._setup.convolver.disconnect();
      this._setup.dryGain.disconnect();
      this._setup.wetGain.disconnect();
      this._setup.outputGain.disconnect();
      this._setup = null;
    }
  }

  private _resolveBuffer(ir: AudioBuffer | Sound | null): AudioBuffer | null {
    if (ir === null) return null;
    if (ir instanceof Sound) return ir.audioBuffer;
    return ir;
  }

  private _setupNodes(ctx: AudioContext): void {
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const convolver = ctx.createConvolver();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();

    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet * this._gain, ctx.currentTime);

    // Web Audio requirement: set normalize BEFORE assigning buffer.
    convolver.normalize = this._normalize;
    if (this._pendingImpulse !== null) {
      convolver.buffer = this._resolveBuffer(this._pendingImpulse);
      this._pendingImpulse = null;
    }

    // Dry path: input → dryGain → output
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet path: input → convolver → wetGain → output
    inputGain.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(outputGain);

    this._setup = { inputGain, outputGain, convolver, dryGain, wetGain };
  }
}
