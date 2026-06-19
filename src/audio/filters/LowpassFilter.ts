import { getAudioContext, isAudioContextReady, onAudioContextReady } from '#audio/audio-context';
import { AudioEffect } from '#audio/AudioEffect';

/** Construction options for {@link LowpassFilter}. */
export interface LowpassFilterOptions {
  frequency?: number;
  resonance?: number;
}

/**
 * Low-pass filter backed by a `BiquadFilterNode` in `lowpass` mode.
 * Attenuates frequencies above the cutoff and passes everything below it.
 * Useful for muffling audio (e.g., sound heard through a wall), taming
 * harsh high-frequency content, or creating underwater/telephone effects.
 * The `resonance` (Q) parameter controls the sharpness of the roll-off peak.
 */
export class LowpassFilter extends AudioEffect {
  private _node: BiquadFilterNode | null = null;
  private _frequency: number;
  private _resonance: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setup(ctx);
  };

  public constructor(options: LowpassFilterOptions = {}) {
    super();
    this._frequency = options.frequency ?? 1000;
    this._resonance = options.resonance ?? 1;
    if (isAudioContextReady()) {
      this._setup(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  public get inputNode(): AudioNode {
    if (!this._node) throw new Error('LowpassFilter not yet initialized.');
    return this._node;
  }

  public get outputNode(): AudioNode {
    if (!this._node) throw new Error('LowpassFilter not yet initialized.');
    return this._node;
  }

  /** Cutoff frequency in Hz. Signals above this frequency are attenuated. Range 20..20000, default 1000. */
  public get frequency(): number {
    return this._frequency;
  }

  public set frequency(value: number) {
    this._frequency = Math.max(20, Math.min(20000, value));
    if (this._node) {
      this._node.frequency.setTargetAtTime(this._frequency, this._node.context.currentTime, 0.01);
    }
  }

  /** Q (resonance) at the cutoff. Higher values create a sharper, resonant peak. Minimum 0.0001, default 1. */
  public get resonance(): number {
    return this._resonance;
  }

  public set resonance(value: number) {
    this._resonance = Math.max(0.0001, value);
    if (this._node) {
      this._node.Q.setTargetAtTime(this._resonance, this._node.context.currentTime, 0.01);
    }
  }

  public override destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._node?.disconnect();
    this._node = null;
  }

  private _setup(ctx: AudioContext): void {
    const node = ctx.createBiquadFilter();
    node.type = 'lowpass';
    node.frequency.setValueAtTime(this._frequency, ctx.currentTime);
    node.Q.setValueAtTime(this._resonance, ctx.currentTime);
    this._node = node;
  }
}
