import { pitchShiftWorkletSource } from '../worklets/pitch-shift.worklet';
import { WorkletFilter } from './WorkletFilter';

export interface PitchShiftFilterOptions {
  /** Pitch ratio. 1.0 = no change, 0.5 = octave down, 2.0 = octave up. Default 1.0. */
  pitch?: number;
  /** Dry/wet mix, 0..1. Default 1.0 (full wet). */
  wet?: number;
  /**
   * Internal grain size in samples. Default 1024 (~21ms at 48kHz).
   * Larger = more delay but cleaner pitch shifting.
   */
  grainSize?: number;
}

/**
 * Real-time pitch shifter via granular synthesis (WorkletFilter).
 *
 * Quality: good for ±1 octave (pitch 0.5x-2.0x). Beyond that, audible
 * artifacts (graininess, phase issues). For high-quality pitch shift,
 * a phase-vocoder approach is required and not available in V1.
 *
 * Latency: ~half-grain-size = ~10ms at default 1024-sample grains
 * (at 48kHz sample rate). Not suitable for live monitoring; fine for
 * games / playback.
 *
 * Use cases:
 *   - Sound variation: random ±200 cent pitch on each footstep / bullet
 *   - Voice effects: chipmunk (1.5x) or demon (0.7x) for game NPCs
 *   - Detune layering: stack 0.99x and 1.01x for thick chorused sound
 */
export class PitchShiftFilter extends WorkletFilter {
  private _pitch: number;
  private _wet: number;
  private readonly _grainSize: number;

  public constructor(options: PitchShiftFilterOptions = {}) {
    super();
    this._pitch = Math.max(0.25, Math.min(4, options.pitch ?? 1));
    this._wet = Math.max(0, Math.min(1, options.wet ?? 1));
    this._grainSize = options.grainSize ?? 1024;
  }

  protected get _workletName(): string {
    return 'exojs-pitch-shift';
  }

  protected get _workletSource(): string {
    return pitchShiftWorkletSource;
  }

  protected override get _workletOptions(): AudioWorkletNodeOptions {
    return {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: { grainSize: this._grainSize },
    };
  }

  protected override _onWorkletReady(): void {
    this._setAudioParam('pitch', this._pitch);
    this._setAudioParam('wet', this._wet);
  }

  /** Pitch ratio relative to the original. 1.0 = no change, 0.5 = one octave down, 2.0 = one octave up. Range 0.25..4.0, default 1.0. */
  public get pitch(): number {
    return this._pitch;
  }
  public set pitch(value: number) {
    this._pitch = Math.max(0.25, Math.min(4, value));
    this._setAudioParam('pitch', this._pitch);
  }

  /** Wet (pitch-shifted) mix level, 0..1. Default 1.0 (full wet). */
  public get wet(): number {
    return this._wet;
  }
  public set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this._setAudioParam('wet', this._wet);
  }
}
