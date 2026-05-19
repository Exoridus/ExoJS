import { getAudioContext, isAudioContextReady, onAudioContextReady } from '../audio-context';
import { AudioFilter } from '../AudioFilter';

/** Construction options for {@link EqualizerFilter}. */
export interface EqualizerFilterOptions {
  low?: number;
  mid?: number;
  high?: number;
  lowFrequency?: number;
  midFrequency?: number;
  highFrequency?: number;
}

interface EqualizerFilterSetup {
  readonly lowShelf: BiquadFilterNode;
  readonly peaking: BiquadFilterNode;
  readonly highShelf: BiquadFilterNode;
}

/**
 * Three-band equalizer (low shelf / peaking mid / high shelf) built from a
 * series chain of `BiquadFilterNode` instances. Gain values are in dB and
 * clamped to ±40 dB. All six parameters (gains + frequencies) are
 * adjustable at runtime via the corresponding setters; gain changes use a
 * short exponential ramp to avoid clicks.
 */
export class EqualizerFilter extends AudioFilter {
  private _setup: EqualizerFilterSetup | null = null;
  private _low: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };
  private _mid: number;
  private _high: number;
  private _lowFrequency: number;
  private _midFrequency: number;
  private _highFrequency: number;

  public constructor(options: EqualizerFilterOptions = {}) {
    super();
    this._low = Math.max(-40, Math.min(40, options.low ?? 0));
    this._mid = Math.max(-40, Math.min(40, options.mid ?? 0));
    this._high = Math.max(-40, Math.min(40, options.high ?? 0));
    this._lowFrequency = options.lowFrequency ?? 250;
    this._midFrequency = options.midFrequency ?? 1500;
    this._highFrequency = options.highFrequency ?? 6000;
    if (isAudioContextReady()) {
      this._setupNodes(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  public get inputNode(): AudioNode {
    if (!this._setup) throw new Error('EqualizerFilter not yet initialized.');
    return this._setup.lowShelf;
  }

  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('EqualizerFilter not yet initialized.');
    return this._setup.highShelf;
  }

  /** Low-shelf gain in dB applied below `lowFrequency`. Range −40..40, default 0. */
  public get low(): number {
    return this._low;
  }

  public set low(value: number) {
    this._low = Math.max(-40, Math.min(40, value));
    if (this._setup) {
      this._setup.lowShelf.gain.setTargetAtTime(this._low, this._setup.lowShelf.context.currentTime, 0.01);
    }
  }

  /** Peaking mid-band gain in dB centered at `midFrequency`. Range −40..40, default 0. */
  public get mid(): number {
    return this._mid;
  }

  public set mid(value: number) {
    this._mid = Math.max(-40, Math.min(40, value));
    if (this._setup) {
      this._setup.peaking.gain.setTargetAtTime(this._mid, this._setup.peaking.context.currentTime, 0.01);
    }
  }

  /** High-shelf gain in dB applied above `highFrequency`. Range −40..40, default 0. */
  public get high(): number {
    return this._high;
  }

  public set high(value: number) {
    this._high = Math.max(-40, Math.min(40, value));
    if (this._setup) {
      this._setup.highShelf.gain.setTargetAtTime(this._high, this._setup.highShelf.context.currentTime, 0.01);
    }
  }

  /** Cutoff frequency in Hz of the low-shelf band. Default 250. */
  public get lowFrequency(): number {
    return this._lowFrequency;
  }

  public set lowFrequency(value: number) {
    this._lowFrequency = Math.max(0, value);
    if (this._setup) {
      this._setup.lowShelf.frequency.setTargetAtTime(this._lowFrequency, this._setup.lowShelf.context.currentTime, 0.01);
    }
  }

  /** Center frequency in Hz of the peaking mid band. Default 1500. */
  public get midFrequency(): number {
    return this._midFrequency;
  }

  public set midFrequency(value: number) {
    this._midFrequency = Math.max(0, value);
    if (this._setup) {
      this._setup.peaking.frequency.setTargetAtTime(this._midFrequency, this._setup.peaking.context.currentTime, 0.01);
    }
  }

  /** Cutoff frequency in Hz of the high-shelf band. Default 6000. */
  public get highFrequency(): number {
    return this._highFrequency;
  }

  public set highFrequency(value: number) {
    this._highFrequency = Math.max(0, value);
    if (this._setup) {
      this._setup.highShelf.frequency.setTargetAtTime(this._highFrequency, this._setup.highShelf.context.currentTime, 0.01);
    }
  }

  public override destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    if (this._setup) {
      this._setup.lowShelf.disconnect();
      this._setup.peaking.disconnect();
      this._setup.highShelf.disconnect();
      this._setup = null;
    }
  }

  private _setupNodes(ctx: AudioContext): void {
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.setValueAtTime(this._lowFrequency, ctx.currentTime);
    lowShelf.gain.setValueAtTime(this._low, ctx.currentTime);

    const peaking = ctx.createBiquadFilter();
    peaking.type = 'peaking';
    peaking.frequency.setValueAtTime(this._midFrequency, ctx.currentTime);
    peaking.gain.setValueAtTime(this._mid, ctx.currentTime);

    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.setValueAtTime(this._highFrequency, ctx.currentTime);
    highShelf.gain.setValueAtTime(this._high, ctx.currentTime);

    // Series chain: lowShelf → peaking → highShelf
    lowShelf.connect(peaking);
    peaking.connect(highShelf);

    this._setup = { lowShelf, peaking, highShelf };
  }
}
