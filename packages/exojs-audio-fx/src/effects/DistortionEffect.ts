import { AudioEffect, getAudioContext, isAudioContextReady, onAudioContextReady } from '@codexo/exojs';

/** Construction options for {@link DistortionEffect}. */
export interface DistortionEffectOptions {
  /**
   * Drive amount: controls the intensity of the tanh soft-clip curve.
   * Range 0..1, default 0.4. Higher values produce heavier, more saturated
   * distortion; lower values produce a milder soft-clip. Note that even at
   * drive=0 the curve is not perfectly linear — the formula
   * `tanh(x) / tanh(1)` has a gain of `1/tanh(1) ≈ 1.31` at the origin.
   */
  drive?: number;
  /**
   * Dry/wet mix, 0..1. The dry level is automatically `1 - wet`. Default 1.0.
   */
  wet?: number;
  /**
   * Oversampling mode applied by the `WaveShaperNode`. Higher oversampling
   * reduces aliasing artifacts at the cost of extra CPU. One of `'none'`,
   * `'2x'`, or `'4x'`. Default `'2x'`.
   */
  oversample?: OverSampleType;
  /**
   * Tone control: cutoff of a post-distortion low-pass filter on the wet path.
   * Mapped logarithmically from 100 Hz (tone=0, fully dark) to 20 kHz
   * (tone=1, fully open). Range 0..1, default 1.
   */
  tone?: number;
}

interface DistortionEffectSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
  readonly waveShaper: WaveShaperNode;
  readonly toneFilter: BiquadFilterNode;
}

/**
 * Distortion effect built from native Web Audio nodes — no worklet required.
 *
 * The input signal is split into a dry path and a wet path. The wet path runs
 * through a `WaveShaperNode` loaded with a tanh-based soft-clip curve, then
 * through a `BiquadFilterNode` (lowpass) acting as a tone control, before
 * being mixed back with the dry signal. The wave-shaper curve is rebuilt any
 * time `drive` changes. Oversampling is delegated directly to
 * `WaveShaperNode.oversample`.
 *
 * Node graph:
 * ```
 * input(GainNode) ──── dryGain ─────────────────────────── output(GainNode)
 * input           ──── waveShaper ── toneFilter ── wetGain ── output
 * ```
 * Gains: `dryGain.gain = 1 - wet`; `wetGain.gain = wet`.
 *
 * @example
 * ```ts
 * const dist = new DistortionEffect({ drive: 0.7, wet: 0.9, tone: 0.6 });
 * bus.addEffect(dist);
 *
 * // Soften the drive at runtime:
 * dist.drive = 0.3;
 *
 * // Open the tone filter fully:
 * dist.tone = 1;
 * ```
 */
export class DistortionEffect extends AudioEffect {
  private _setup: DistortionEffectSetup | null = null;
  private _drive: number;
  private _wet: number;
  private _oversample: OverSampleType;
  private _tone: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };

  public constructor(options: DistortionEffectOptions = {}) {
    super();
    this._drive = Math.max(0, Math.min(1, options.drive ?? 0.4));
    this._wet = Math.max(0, Math.min(1, options.wet ?? 1));
    this._oversample = options.oversample ?? '2x';
    this._tone = Math.max(0, Math.min(1, options.tone ?? 1));
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
    if (!this._setup) throw new Error('DistortionEffect not yet initialized.');
    return this._setup.inputGain;
  }

  /**
   * The node where audio exits this effect. Throws if the audio context is
   * not yet initialized.
   */
  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('DistortionEffect not yet initialized.');
    return this._setup.outputGain;
  }

  /**
   * Drive amount controlling the soft-clip intensity. Range 0..1, default 0.4.
   * Changing this rebuilds the wave-shaper curve immediately (sample-accurate
   * on the next render quantum).
   */
  public get drive(): number {
    return this._drive;
  }

  public set drive(value: number) {
    this._drive = Math.max(0, Math.min(1, value));
    if (this._setup) {
      this._setup.waveShaper.curve = DistortionEffect._buildCurve(this._drive);
    }
  }

  /**
   * Wet (distorted) mix level, 0..1. The dry level is automatically `1 - wet`.
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

  /**
   * Oversampling mode for the `WaveShaperNode`. One of `'none'`, `'2x'`, or
   * `'4x'`. Higher values reduce aliasing but increase CPU usage. Default `'2x'`.
   */
  public get oversample(): OverSampleType {
    return this._oversample;
  }

  public set oversample(value: OverSampleType) {
    this._oversample = value;
    if (this._setup) {
      this._setup.waveShaper.oversample = this._oversample;
    }
  }

  /**
   * Tone control: low-pass cutoff on the wet path. 0 = fully dark (~100 Hz),
   * 1 = fully open (~20 kHz). Mapped logarithmically. Default 1.
   * Changes are ramped smoothly via `setTargetAtTime`.
   */
  public get tone(): number {
    return this._tone;
  }

  public set tone(value: number) {
    this._tone = Math.max(0, Math.min(1, value));
    if (this._setup) {
      const ctx = this._setup.toneFilter.context;
      this._setup.toneFilter.frequency.setTargetAtTime(
        DistortionEffect._toneToFrequency(this._tone),
        ctx.currentTime,
        0.01,
      );
    }
  }

  public override destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    if (this._setup) {
      this._setup.inputGain.disconnect();
      this._setup.waveShaper.disconnect();
      this._setup.toneFilter.disconnect();
      this._setup.dryGain.disconnect();
      this._setup.wetGain.disconnect();
      this._setup.outputGain.disconnect();
      this._setup = null;
    }
  }

  /**
   * Build a 256-point tanh-based soft-clip curve for the given drive (0..1).
   *
   * Maps drive to a distortion amount `a = drive * 400 + 1`, then fills the
   * curve with `tanh(x * a) / tanh(a)` so that the output is always bounded
   * to [-1, 1]. At drive=0, `a = 1` and the curve is `tanh(x) / tanh(1)`,
   * which has a small-signal gain of `1/tanh(1) ≈ 1.31` — not perfectly
   * linear. At drive=1, `a = 401` and the curve approximates a hard-clipper.
   */
  private static _buildCurve(drive: number): Float32Array<ArrayBuffer> {
    const n = 256;
    const curve: Float32Array<ArrayBuffer> = new Float32Array(n);
    // drive=0 → amount=1 (mild curve: gain ≈ 1/tanh(1) ≈ 1.31 at origin); drive=1 → amount=401 (near hard-clip)
    const amount = drive * 400 + 1;
    const norm = Math.tanh(amount);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(x * amount) / norm;
    }
    return curve;
  }

  /**
   * Map tone (0..1) to a low-pass cutoff frequency in Hz.
   * Logarithmic scale: 100 Hz at tone=0, 20 000 Hz at tone=1.
   */
  private static _toneToFrequency(tone: number): number {
    // 100 * 200^tone: 100 Hz at 0, 20 000 Hz at 1
    return 100 * Math.pow(200, tone);
  }

  private _setupNodes(ctx: AudioContext): void {
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const waveShaper = ctx.createWaveShaper();
    const toneFilter = ctx.createBiquadFilter();

    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);

    waveShaper.curve = DistortionEffect._buildCurve(this._drive);
    waveShaper.oversample = this._oversample;

    toneFilter.type = 'lowpass';
    toneFilter.frequency.setValueAtTime(DistortionEffect._toneToFrequency(this._tone), ctx.currentTime);

    // Dry path: input → dryGain → output
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet path: input → waveShaper → toneFilter → wetGain → output
    inputGain.connect(waveShaper);
    waveShaper.connect(toneFilter);
    toneFilter.connect(wetGain);
    wetGain.connect(outputGain);

    this._setup = { inputGain, outputGain, dryGain, wetGain, waveShaper, toneFilter };
  }
}
