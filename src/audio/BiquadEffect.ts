import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audio-context';
import { AudioEffect } from './AudioEffect';

/** Construction options for {@link BiquadEffect}. */
export interface BiquadEffectOptions {
  /** Filter response. Default `'lowpass'`. */
  type?: BiquadFilterType;
  /** Center / cutoff frequency in Hz. Range 0..nyquist. Default 1000. */
  frequency?: number;
  /** Quality factor (resonance / bandwidth). Default 1. */
  resonance?: number;
  /** Gain in dB — only used by `peaking`, `lowshelf`, `highshelf`. Default 0. */
  gain?: number;
  /** Fine frequency offset in cents. Default 0. */
  detune?: number;
}

/**
 * Native biquad filter effect backed by a single `BiquadFilterNode` — the most
 * common audio-shaping need, covering `lowpass` / `highpass` / `bandpass` /
 * `notch` / `peaking` / `lowshelf` / `highshelf` / `allpass` via one `type`
 * parameter. Insert it on an {@link AudioBus} (`bus.addEffect`) or a
 * {@link Voice} (`voice.addEffect`).
 *
 * The single node serves as both {@link inputNode} and {@link outputNode}.
 */
export class BiquadEffect extends AudioEffect {
  private _node: BiquadFilterNode | null = null;
  private _type: BiquadFilterType;
  private _frequency: number;
  private _resonance: number;
  private _gain: number;
  private _detune: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setup(ctx);
  };

  public constructor(options: BiquadEffectOptions = {}) {
    super();
    this._type = options.type ?? 'lowpass';
    this._frequency = options.frequency ?? 1000;
    this._resonance = options.resonance ?? 1;
    this._gain = options.gain ?? 0;
    this._detune = options.detune ?? 0;

    if (isAudioContextReady()) {
      this._setup(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  public get inputNode(): AudioNode {
    if (!this._node) throw new Error('BiquadEffect not yet initialized.');
    return this._node;
  }

  public get outputNode(): AudioNode {
    if (!this._node) throw new Error('BiquadEffect not yet initialized.');
    return this._node;
  }

  /** Filter response type. */
  public get type(): BiquadFilterType {
    return this._type;
  }

  public set type(value: BiquadFilterType) {
    this._type = value;
    if (this._node) this._node.type = value;
  }

  /** Center / cutoff frequency in Hz. */
  public get frequency(): number {
    return this._frequency;
  }

  public set frequency(value: number) {
    this._frequency = value;
    if (this._node) this._node.frequency.setTargetAtTime(value, this._node.context.currentTime, 0.01);
  }

  /** Quality factor (resonance / bandwidth). */
  public get resonance(): number {
    return this._resonance;
  }

  public set resonance(value: number) {
    this._resonance = value;
    if (this._node) this._node.Q.setTargetAtTime(value, this._node.context.currentTime, 0.01);
  }

  /** Gain in dB — applies to `peaking`, `lowshelf`, and `highshelf` types. */
  public get gain(): number {
    return this._gain;
  }

  public set gain(value: number) {
    this._gain = value;
    if (this._node) this._node.gain.setTargetAtTime(value, this._node.context.currentTime, 0.01);
  }

  /** Fine frequency offset in cents. */
  public get detune(): number {
    return this._detune;
  }

  public set detune(value: number) {
    this._detune = value;
    if (this._node) this._node.detune.setTargetAtTime(value, this._node.context.currentTime, 0.01);
  }

  public override destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._node?.disconnect();
    this._node = null;
  }

  private _setup(ctx: AudioContext): void {
    const node = ctx.createBiquadFilter();
    node.type = this._type;
    node.frequency.setValueAtTime(this._frequency, ctx.currentTime);
    node.Q.setValueAtTime(this._resonance, ctx.currentTime);
    node.gain.setValueAtTime(this._gain, ctx.currentTime);
    node.detune.setValueAtTime(this._detune, ctx.currentTime);
    this._node = node;
  }
}
