import { WorkletEffect } from '@codexo/exojs';

import { pitchShiftWorkletSource } from '../worklets/pitch-shift.worklet';

export interface PitchShiftEffectOptions {
  /** Pitch ratio. 1.0 = no change, 0.5 = octave down, 2.0 = octave up. Default 1.0. */
  pitch?: number;
  /** Dry/wet mix, 0..1. Default 1.0 (full wet). */
  wet?: number;
  /**
   * Internal SOLA frame size in samples. Default 1024 (~21ms at 48kHz).
   * Larger = more latency but better low-frequency alignment; smaller = lower
   * latency but coarser correlation. The correlation search radius scales with it.
   */
  grainSize?: number;
}

/**
 * Real-time pitch shifter (WorkletEffect) using SOLA — synchronized
 * overlap-add. Each synthesis grain is realigned by waveform cross-correlation,
 * so grain restarts stay phase coherent and the output pitch tracks the `pitch`
 * ratio exactly across the whole 0.25x–4.0x range (a naive granular delay drifts
 * the pitch instead).
 *
 * Quality: clean, in-tune shifting for tonal material. As with any time-domain
 * method, sharp transients can smear or double slightly; for those a phase
 * vocoder would do better at the cost of much more CPU and latency.
 *
 * Latency: ~one frame + search ≈ 30ms at the default 1024-sample grain
 * (at 48kHz). Not suitable for live monitoring; fine for games / playback.
 *
 * Use cases:
 *   - Sound variation: random ±200 cent pitch on each footstep / bullet
 *   - Voice effects: chipmunk (1.5x) or demon (0.7x) for game NPCs
 *   - Detune layering: stack 0.99x and 1.01x for thick chorused sound
 */
export class PitchShiftEffect extends WorkletEffect {
  private _pitch: number;
  private _wet: number;
  private readonly _grainSize: number;

  public constructor(options: PitchShiftEffectOptions = {}) {
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
