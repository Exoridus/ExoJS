import { AudioEffect, getAudioContext, isAudioContextReady, onAudioContextReady } from '@codexo/exojs';

/** Construction options for {@link RingModulatorEffect}. */
export interface RingModulatorEffectOptions {
  /**
   * Carrier oscillator frequency in Hz. Range 0..20000, default 440. Lower
   * frequencies (1–60 Hz) produce tremolo-like pulsing; mid-range values
   * (100–1000 Hz) give the characteristic robotic ring-mod sound; high values
   * shift sidebands above the audible fundamental.
   */
  frequency?: number;
  /**
   * Carrier oscillator waveform shape. Default `'sine'`. Any
   * `OscillatorType` is accepted (`'sine'`, `'square'`, `'sawtooth'`,
   * `'triangle'`). Non-sine shapes introduce additional harmonic content into
   * both sidebands.
   */
  waveform?: OscillatorType;
  /**
   * Dry/wet mix, 0..1. The dry level is automatically `1 - wet`. Default 1.0
   * (fully wet / ring-modulated). Set to 0.5 for an equal mix of dry and
   * ring-modulated signal.
   */
  wet?: number;
}

interface RingModulatorEffectSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
  readonly ringGain: GainNode;
  readonly carrierOsc: OscillatorNode;
}

/**
 * Ring modulator effect using native Web Audio nodes (no worklet required).
 *
 * A carrier `OscillatorNode` is connected directly to the `gain` AudioParam of
 * a `GainNode` whose base gain value is 0. The carrier's bipolar output (±1)
 * modulates the gain, multiplying the input signal by the instantaneous carrier
 * amplitude — the mathematical definition of ring modulation. The result
 * contains the sum and difference frequencies of the input and carrier but
 * suppresses the original carrier (unlike amplitude modulation, which retains
 * the carrier). At sub-audio carrier frequencies (< 20 Hz) the effect becomes
 * a tremolo.
 *
 * Node graph:
 * ```
 * input(GainNode) ┬── dryGain ──────────────────────────┐
 *                 │                                       ├── output(GainNode)
 *                 └── ringGain ── wetGain ────────────────┘
 *
 * carrierOsc ── ringGain.gain (AudioParam, base = 0)
 * ```
 * Gains: `dryGain.gain = 1 - wet`; `wetGain.gain = wet`;
 * `ringGain.gain` base = 0 (carrier provides the ±1 modulation).
 *
 * @example
 * ```ts
 * const ringMod = new RingModulatorEffect({ frequency: 220, wet: 0.8 });
 * bus.addEffect(ringMod);
 *
 * // Change carrier frequency at runtime:
 * ringMod.frequency = 440;
 * ```
 */
export class RingModulatorEffect extends AudioEffect {
  private _setup: RingModulatorEffectSetup | null = null;
  private _frequency: number;
  private _waveform: OscillatorType;
  private _wet: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };

  public constructor(options: RingModulatorEffectOptions = {}) {
    super();
    this._frequency = Math.max(0, Math.min(20000, options.frequency ?? 440));
    this._waveform = options.waveform ?? 'sine';
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
    if (!this._setup) throw new Error('RingModulatorEffect not yet initialized.');
    return this._setup.inputGain;
  }

  /**
   * The node where audio exits this effect. Throws if the audio context is
   * not yet initialized.
   */
  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('RingModulatorEffect not yet initialized.');
    return this._setup.outputGain;
  }

  /**
   * Carrier oscillator frequency in Hz. Range 0..20000, default 440.
   * Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get frequency(): number {
    return this._frequency;
  }

  public set frequency(value: number) {
    this._frequency = Math.max(0, Math.min(20000, value));
    if (this._setup) {
      const ctx = this._setup.inputGain.context;
      this._setup.carrierOsc.frequency.setTargetAtTime(this._frequency, ctx.currentTime, 0.01);
    }
  }

  /**
   * Carrier oscillator waveform shape. Default `'sine'`. Changes take effect
   * immediately (no smoothing; waveform transitions are instantaneous in Web
   * Audio).
   */
  public get waveform(): OscillatorType {
    return this._waveform;
  }

  public set waveform(value: OscillatorType) {
    this._waveform = value;
    if (this._setup) {
      this._setup.carrierOsc.type = this._waveform;
    }
  }

  /**
   * Wet (ring-modulated) mix level, 0..1. The dry level is automatically
   * `1 - wet`. Changes are ramped smoothly via `setTargetAtTime`. Default 1.0.
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
      this._setup.carrierOsc.stop();
      this._setup.carrierOsc.disconnect();
      this._setup.ringGain.disconnect();
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
    const ringGain = ctx.createGain();

    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);
    // Base gain is 0; the carrier oscillator provides the ±1 modulation signal
    // via AudioParam connection — the effective gain becomes exactly the carrier
    // waveform, multiplying the input: output = input × carrier(t).
    ringGain.gain.setValueAtTime(0, ctx.currentTime);

    const carrierOsc = ctx.createOscillator();
    carrierOsc.type = this._waveform;
    carrierOsc.frequency.value = this._frequency;

    // Connect carrier to ringGain's gain AudioParam. The carrier (±1) is added
    // to the base value (0), producing an effective gain in [-1, +1] — true
    // bipolar ring modulation. The `as unknown as AudioNode` cast works around
    // a TypeScript overload-resolution quirk (same pattern as ChorusEffect).
    carrierOsc.connect(ringGain.gain as unknown as AudioNode);

    // Dry path: inputGain → dryGain → outputGain
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet (ring-modulated) path: inputGain → ringGain → wetGain → outputGain
    inputGain.connect(ringGain);
    ringGain.connect(wetGain);
    wetGain.connect(outputGain);

    carrierOsc.start();

    this._setup = { inputGain, outputGain, dryGain, wetGain, ringGain, carrierOsc };
  }
}
