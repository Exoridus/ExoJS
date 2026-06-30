import { AudioEffect, getAudioContext, isAudioContextReady, onAudioContextReady } from '@codexo/exojs';

/** Construction options for {@link AutoWahEffect}. */
export interface AutoWahEffectOptions {
  /**
   * Centre frequency of the wah bandpass filter in Hz. The envelope control
   * signal sweeps the filter upward from this base. Range 50..2000, default 200.
   */
  baseFrequency?: number;
  /**
   * Envelope sensitivity: Hz of filter-frequency sweep added per unit of
   * rectified envelope amplitude. At full signal amplitude the filter shifts up
   * by this amount above `baseFrequency`. Range 0..6000, default 3000.
   */
  sensitivity?: number;
  /**
   * Q (resonance) of the bandpass wah filter. Higher values produce a narrower,
   * more pronounced peak. Range 0.1..20, default 4.
   */
  q?: number;
  /**
   * Envelope smoothing time constant in milliseconds. Longer values make the
   * wah react slowly (legato); shorter values produce a snappier attack
   * (percussive). Translated to the smoothing lowpass cutoff as
   * `1000 / (2π × responseMs)` Hz. Range 1..500, default 30.
   */
  responseMs?: number;
  /**
   * Dry/wet mix, 0..1. The dry level is automatically `1 - wet`. Default 0.7.
   */
  wet?: number;
}

interface AutoWahEffectSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
  readonly sensitivityGain: GainNode;
  readonly wahFilter: BiquadFilterNode;
  readonly smoothingLowpass: BiquadFilterNode;
  readonly rectifier: WaveShaperNode;
}

/**
 * Auto-wah effect that uses an amplitude envelope follower to modulate a
 * bandpass filter, creating the characteristic "wah" sweep driven by the
 * loudness of the input signal.
 *
 * The envelope follower is built entirely from native Web Audio nodes — no
 * `ScriptProcessor` or `AudioWorklet` required:
 *
 * 1. A `WaveShaperNode` rectifier approximates `|x|` (full-wave rectification),
 *    converting the AC audio signal to a unipolar amplitude proxy.
 * 2. A `BiquadFilterNode` (lowpass) smooths the rectified signal. The cutoff is
 *    derived from `responseMs` to control attack/release speed.
 * 3. A `GainNode` scales the smoothed envelope by `sensitivity` (Hz/unit) and
 *    connects its output directly to the wah filter's `frequency` `AudioParam`,
 *    sweeping the filter centre upward with input loudness.
 *
 * Node graph:
 * ```
 * inputGain ─┬─ dryGain ─────────────────────────────┐
 *            │                                        ├── outputGain
 *            └─ wahFilter(bandpass) ─── wetGain ──────┘
 *
 * Envelope (control) path — parallel off inputGain, sums into wahFilter.frequency:
 * inputGain → rectifier(WaveShaper,|x|) → smoothingLowpass(BiquadFilter,lowpass)
 *           → sensitivityGain → wahFilter.frequency (AudioParam)
 * ```
 *
 * Gains: `dryGain.gain = 1 - wet`; `wetGain.gain = wet`.
 *
 * @example
 * ```ts
 * const wah = new AutoWahEffect({ baseFrequency: 300, sensitivity: 2500, wet: 0.8 });
 * bus.addEffect(wah);
 * ```
 */
export class AutoWahEffect extends AudioEffect {
  private _setup: AutoWahEffectSetup | null = null;
  private _baseFrequency: number;
  private _sensitivity: number;
  private _q: number;
  private _responseMs: number;
  private _wet: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };

  public constructor(options: AutoWahEffectOptions = {}) {
    super();
    this._baseFrequency = Math.max(50, Math.min(2000, options.baseFrequency ?? 200));
    this._sensitivity = Math.max(0, Math.min(6000, options.sensitivity ?? 3000));
    this._q = Math.max(0.1, Math.min(20, options.q ?? 4));
    this._responseMs = Math.max(1, Math.min(500, options.responseMs ?? 30));
    this._wet = Math.max(0, Math.min(1, options.wet ?? 0.7));
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
    if (!this._setup) throw new Error('AutoWahEffect not yet initialized.');
    return this._setup.inputGain;
  }

  /**
   * The node where audio exits this effect. Throws if the audio context is
   * not yet initialized.
   */
  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('AutoWahEffect not yet initialized.');
    return this._setup.outputGain;
  }

  // ---------------------------------------------------------------------------
  // Getters / setters
  // ---------------------------------------------------------------------------

  /**
   * Centre frequency of the wah filter in Hz. Range 50..2000, default 200.
   * Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get baseFrequency(): number {
    return this._baseFrequency;
  }

  public set baseFrequency(value: number) {
    this._baseFrequency = Math.max(50, Math.min(2000, value));
    if (this._setup) {
      this._setup.wahFilter.frequency.setTargetAtTime(this._baseFrequency, this._setup.wahFilter.context.currentTime, 0.01);
    }
  }

  /**
   * Envelope sensitivity in Hz/unit: the maximum filter sweep above
   * `baseFrequency` when input is at full amplitude. Range 0..6000, default 3000.
   * Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get sensitivity(): number {
    return this._sensitivity;
  }

  public set sensitivity(value: number) {
    this._sensitivity = Math.max(0, Math.min(6000, value));
    if (this._setup) {
      this._setup.sensitivityGain.gain.setTargetAtTime(this._sensitivity, this._setup.sensitivityGain.context.currentTime, 0.01);
    }
  }

  /**
   * Q (resonance) of the bandpass wah filter. Range 0.1..20, default 4.
   * Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get q(): number {
    return this._q;
  }

  public set q(value: number) {
    this._q = Math.max(0.1, Math.min(20, value));
    if (this._setup) {
      this._setup.wahFilter.Q.setTargetAtTime(this._q, this._setup.wahFilter.context.currentTime, 0.01);
    }
  }

  /**
   * Envelope smoothing time constant in milliseconds. Range 1..500, default 30.
   * Updating this adjusts the smoothing lowpass cutoff immediately via
   * `setTargetAtTime`.
   */
  public get responseMs(): number {
    return this._responseMs;
  }

  public set responseMs(value: number) {
    this._responseMs = Math.max(1, Math.min(500, value));
    if (this._setup) {
      this._setup.smoothingLowpass.frequency.setTargetAtTime(
        this._smoothingCutoff(),
        this._setup.smoothingLowpass.context.currentTime,
        0.01,
      );
    }
  }

  /**
   * Wet (wah-filtered) mix level, 0..1. The dry level is automatically
   * `1 - wet`. Changes are ramped smoothly via `setTargetAtTime`. Default 0.7.
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
      this._setup.inputGain.disconnect();
      this._setup.dryGain.disconnect();
      this._setup.wetGain.disconnect();
      this._setup.sensitivityGain.disconnect();
      this._setup.wahFilter.disconnect();
      this._setup.smoothingLowpass.disconnect();
      this._setup.rectifier.disconnect();
      this._setup.outputGain.disconnect();
      this._setup = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Converts `responseMs` to a lowpass cutoff frequency using f = 1/(2π×τ). */
  private _smoothingCutoff(): number {
    return 1000 / (2 * Math.PI * this._responseMs);
  }

  /**
   * Builds a 256-point `Float32Array` curve approximating the full-wave
   * rectifier `f(x) = |x|` for use with `WaveShaperNode`.
   */
  private static _makeRectifierCurve(): Float32Array<ArrayBuffer> {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1; // maps index to -1..1
      curve[i] = Math.abs(x);
    }
    return curve;
  }

  private _setupNodes(ctx: AudioContext): void {
    // Audio-path gain nodes (createGain order: 0=inputGain, 1=outputGain,
    // 2=dryGain, 3=wetGain, 4=sensitivityGain).
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const sensitivityGain = ctx.createGain();

    // Wah filter (audio path) and smoothing filter (envelope control path)
    // (createBiquadFilter order: 0=wahFilter, 1=smoothingLowpass).
    const wahFilter = ctx.createBiquadFilter();
    const smoothingLowpass = ctx.createBiquadFilter();

    // Full-wave rectifier for the envelope follower.
    const rectifier = ctx.createWaveShaper();

    // ── Initialize values ────────────────────────────────────────────────────

    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);
    sensitivityGain.gain.setValueAtTime(this._sensitivity, ctx.currentTime);

    // Wah bandpass filter: base frequency and Q; envelope signal adds on top.
    wahFilter.type = 'bandpass';
    wahFilter.frequency.setValueAtTime(this._baseFrequency, ctx.currentTime);
    wahFilter.Q.setValueAtTime(this._q, ctx.currentTime);

    // Rectifier: full-wave |x| curve; 4× oversampling for accuracy.
    rectifier.curve = AutoWahEffect._makeRectifierCurve();
    rectifier.oversample = '4x';

    // Smoothing lowpass: cutoff derived from responseMs; low Q for no ringing.
    smoothingLowpass.type = 'lowpass';
    smoothingLowpass.frequency.setValueAtTime(this._smoothingCutoff(), ctx.currentTime);
    smoothingLowpass.Q.setValueAtTime(0.5, ctx.currentTime);

    // ── Wiring ───────────────────────────────────────────────────────────────

    // Dry path: inputGain → dryGain → outputGain
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet (audio) path: inputGain → wahFilter → wetGain → outputGain
    inputGain.connect(wahFilter);
    wahFilter.connect(wetGain);
    wetGain.connect(outputGain);

    // Envelope (control) path — parallel off inputGain, drives wahFilter.frequency.
    // The rectified+smoothed signal is scaled by sensitivityGain and summed into
    // the wahFilter frequency AudioParam, sweeping the filter with input loudness.
    inputGain.connect(rectifier);
    rectifier.connect(smoothingLowpass);
    smoothingLowpass.connect(sensitivityGain);
    sensitivityGain.connect(wahFilter.frequency as unknown as AudioNode);

    this._setup = { inputGain, outputGain, dryGain, wetGain, sensitivityGain, wahFilter, smoothingLowpass, rectifier };
  }
}
