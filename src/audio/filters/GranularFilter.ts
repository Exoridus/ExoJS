import { granularWorkletSource } from '../worklets/granular.worklet';
import { WorkletFilter } from './WorkletFilter';

export interface GranularFilterOptions {
  /** Grain size in seconds. 0.005-0.5. Default 0.05 (50ms). */
  grainSize?: number;
  /** Grains per second (overlap density). 1-500. Default 50. */
  density?: number;
  /** Random offset spread, 0-1. Higher = wider time-window scatter. Default 0.5. */
  spread?: number;
  /** Minimum random pitch ratio per grain. Default 1.0. */
  pitchMin?: number;
  /** Maximum random pitch ratio per grain. Default 1.0. */
  pitchMax?: number;
  /** Dry/wet mix, 0..1. Default 1.0. */
  wet?: number;
  /** Internal circular-buffer length in seconds. Compile-time, not runtime. Default 2. */
  bufferSeconds?: number;
}

/**
 * Granular synthesis filter — slices input into small Hann-windowed grains
 * and replays them with randomized parameters. Use cases:
 *
 *   - Ambient texture: long grain (200ms+), low density (10-30/s), high
 *     spread, pitch range 0.5-1.5x. Creates evolving pad-like sounds.
 *   - Glitch: short grain (10-20ms), high density (100+/s), very high
 *     spread, pitch range 0.7-1.3x. Stuttering, lo-fi effects.
 *   - Time-stretch (low pitch with overlap): grain ~50ms, density 50/s,
 *     spread 0, pitch 1.0. Pseudo-stretches the input by buffering.
 *   - Pitch cloud: medium grain, medium density, pitchMin 0.5, pitchMax 2.0
 *     gives a "shimmer" effect of overlapping pitches.
 */
export class GranularFilter extends WorkletFilter {
  private _grainSize: number;
  private _density: number;
  private _spread: number;
  private _pitchMin: number;
  private _pitchMax: number;
  private _wet: number;
  private readonly _bufferSeconds: number;

  public constructor(options: GranularFilterOptions = {}) {
    super();
    this._grainSize = Math.max(0.005, Math.min(0.5, options.grainSize ?? 0.05));
    this._density = Math.max(1, Math.min(500, options.density ?? 50));
    this._spread = Math.max(0, Math.min(1, options.spread ?? 0.5));
    this._pitchMin = Math.max(0.25, Math.min(4, options.pitchMin ?? 1));
    this._pitchMax = Math.max(0.25, Math.min(4, options.pitchMax ?? 1));
    this._wet = Math.max(0, Math.min(1, options.wet ?? 1));
    this._bufferSeconds = options.bufferSeconds ?? 2;
  }

  protected get _workletName(): string {
    return 'exojs-granular';
  }
  protected get _workletSource(): string {
    return granularWorkletSource;
  }
  protected override get _workletOptions(): AudioWorkletNodeOptions {
    return {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: { bufferSeconds: this._bufferSeconds },
    };
  }

  protected override _onWorkletReady(): void {
    this._setAudioParam('grainSize', this._grainSize);
    this._setAudioParam('density', this._density);
    this._setAudioParam('spread', this._spread);
    this._setAudioParam('pitchMin', this._pitchMin);
    this._setAudioParam('pitchMax', this._pitchMax);
    this._setAudioParam('wet', this._wet);
  }

  /** Duration of each grain in seconds. Range 0.005..0.5, default 0.05. */
  public get grainSize(): number {
    return this._grainSize;
  }
  public set grainSize(value: number) {
    this._grainSize = Math.max(0.005, Math.min(0.5, value));
    this._setAudioParam('grainSize', this._grainSize);
  }

  /** Number of grains spawned per second. Range 1..500, default 50. */
  public get density(): number {
    return this._density;
  }
  public set density(value: number) {
    this._density = Math.max(1, Math.min(500, value));
    this._setAudioParam('density', this._density);
  }

  /** Random time-offset spread for grain start positions, 0..1. Higher values scatter grains further into the past. Default 0.5. */
  public get spread(): number {
    return this._spread;
  }
  public set spread(value: number) {
    this._spread = Math.max(0, Math.min(1, value));
    this._setAudioParam('spread', this._spread);
  }

  /** Minimum per-grain pitch ratio. Range 0.25..4, default 1.0. */
  public get pitchMin(): number {
    return this._pitchMin;
  }
  public set pitchMin(value: number) {
    this._pitchMin = Math.max(0.25, Math.min(4, value));
    this._setAudioParam('pitchMin', this._pitchMin);
  }

  /** Maximum per-grain pitch ratio. Range 0.25..4, default 1.0. */
  public get pitchMax(): number {
    return this._pitchMax;
  }
  public set pitchMax(value: number) {
    this._pitchMax = Math.max(0.25, Math.min(4, value));
    this._setAudioParam('pitchMax', this._pitchMax);
  }

  /** Wet (granular) mix level, 0..1. Default 1.0. */
  public get wet(): number {
    return this._wet;
  }
  public set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this._setAudioParam('wet', this._wet);
  }
}
