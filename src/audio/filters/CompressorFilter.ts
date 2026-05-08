import { getAudioContext, isAudioContextReady, onAudioContextReady } from '../audio-context';
import { AudioFilter } from '../AudioFilter';

/** Construction options for {@link CompressorFilter}. All values are clamped to their valid ranges on assignment. */
export interface CompressorFilterOptions {
  threshold?: number;
  knee?: number;
  ratio?: number;
  attack?: number;
  release?: number;
}

/**
 * Dynamic-range compressor backed by a Web Audio `DynamicsCompressorNode`.
 * Reduces the volume of loud signals above a threshold, evening out the
 * perceived loudness of a mix. All parameter changes are applied with a short
 * smoothing ramp so they are artifact-free during playback.
 */
export class CompressorFilter extends AudioFilter {
  private _node: DynamicsCompressorNode | null = null;
  private _threshold: number;
  private _knee: number;
  private _ratio: number;
  private _attack: number;
  private _release: number;

  public constructor(options: CompressorFilterOptions = {}) {
    super();
    this._threshold = Math.max(-100, Math.min(0, options.threshold ?? -24));
    this._knee = Math.max(0, Math.min(40, options.knee ?? 30));
    this._ratio = Math.max(1, Math.min(20, options.ratio ?? 12));
    this._attack = Math.max(0, Math.min(1, options.attack ?? 0.003));
    this._release = Math.max(0, Math.min(1, options.release ?? 0.25));
    if (isAudioContextReady()) {
      this._setup(getAudioContext());
    } else {
      onAudioContextReady.once(this._setup, this);
    }
  }

  public get inputNode(): AudioNode {
    if (!this._node) throw new Error('CompressorFilter not yet initialized.');
    return this._node;
  }

  public get outputNode(): AudioNode {
    if (!this._node) throw new Error('CompressorFilter not yet initialized.');
    return this._node;
  }

  /** Level above which compression begins, in dBFS. Range −100..0, default −24. */
  public get threshold(): number {
    return this._threshold;
  }

  public set threshold(value: number) {
    this._threshold = Math.max(-100, Math.min(0, value));
    if (this._node) {
      this._node.threshold.setTargetAtTime(this._threshold, this._node.context.currentTime, 0.01);
    }
  }

  /** Width in dB of the transition region around the threshold (soft knee). Range 0..40, default 30. */
  public get knee(): number {
    return this._knee;
  }

  public set knee(value: number) {
    this._knee = Math.max(0, Math.min(40, value));
    if (this._node) {
      this._node.knee.setTargetAtTime(this._knee, this._node.context.currentTime, 0.01);
    }
  }

  /** Input-to-output dB ratio above the threshold. Range 1..20, default 12. */
  public get ratio(): number {
    return this._ratio;
  }

  public set ratio(value: number) {
    this._ratio = Math.max(1, Math.min(20, value));
    if (this._node) {
      this._node.ratio.setTargetAtTime(this._ratio, this._node.context.currentTime, 0.01);
    }
  }

  /** Time in seconds for the compressor to engage after the signal exceeds the threshold. Range 0..1, default 0.003. */
  public get attack(): number {
    return this._attack;
  }

  public set attack(value: number) {
    this._attack = Math.max(0, Math.min(1, value));
    if (this._node) {
      this._node.attack.setTargetAtTime(this._attack, this._node.context.currentTime, 0.01);
    }
  }

  /** Time in seconds for the compressor to disengage after the signal drops below the threshold. Range 0..1, default 0.25. */
  public get release(): number {
    return this._release;
  }

  public set release(value: number) {
    this._release = Math.max(0, Math.min(1, value));
    if (this._node) {
      this._node.release.setTargetAtTime(this._release, this._node.context.currentTime, 0.01);
    }
  }

  /**
   * Live gain reduction in dB applied by the compressor right now. Always
   * `<= 0` (or `0` when the compressor isn't engaging). Read-only — drive
   * input level meters / sidechain visualisations off this value.
   *
   * Returns `0` until the underlying node has been created (before the
   * audio context is ready).
   */
  public get reduction(): number {
    return this._node?.reduction ?? 0;
  }

  public override destroy(): void {
    onAudioContextReady.clearByContext(this);
    this._node?.disconnect();
    this._node = null;
  }

  private _setup(ctx: AudioContext): void {
    const node = ctx.createDynamicsCompressor();
    node.threshold.setValueAtTime(this._threshold, ctx.currentTime);
    node.knee.setValueAtTime(this._knee, ctx.currentTime);
    node.ratio.setValueAtTime(this._ratio, ctx.currentTime);
    node.attack.setValueAtTime(this._attack, ctx.currentTime);
    node.release.setValueAtTime(this._release, ctx.currentTime);
    this._node = node;
  }
}
