import { type AudioBus, WorkletEffect } from '@codexo/exojs';

import { validateVocoderBands } from '../dsp/validateVocoderBands';
import vocoderWorkletSource from '../worklets/vocoder.worklet.ts?worklet';

export interface VocoderEffectOptions {
  /** Modulator AudioBus - its output drives the spectral envelope.
   *  Typically routed from a microphone or voice sample. */
  modulator: AudioBus;
  /** Number of frequency bands. More bands = better resolution, more CPU. Default 16. */
  numBands?: number;
  /** Lowest band center frequency in Hz. Default 80. */
  minHz?: number;
  /** Highest band center frequency in Hz. Default 8000. */
  maxHz?: number;
  /** Bandpass Q factor. Higher = narrower bands. Default 4. */
  bandQ?: number;
  /** Dry/wet mix, 0..1. Default 1.0. */
  wet?: number;
  /** Envelope follower smoothing factor (one-pole coefficient).
   *  Smaller = smoother / slower. Default 0.005. */
  envelopeSmoothing?: number;
}

/**
 * Channel-vocoder effect implemented as a {@link WorkletEffect}. Analyzes
 * the spectral envelope of a `modulator` {@link AudioBus} across a bank of
 * log-spaced bandpass filters and applies that envelope to the carrier signal
 * (the main input). The result is the classic "robot voice" or talking-synth
 * effect. Band count, frequency range, and Q are compile-time parameters set
 * at construction; only `wet` and `envelopeSmoothing` are adjustable at
 * runtime.
 *
 * Band count must be a positive safe integer. Frequencies and Q must be finite,
 * with `0 < minHz <= maxHz`, a finite `maxHz / minHz`, and positive Q with a
 * finite `1 / (2 * bandQ)`. Invalid settings throw `RangeError` before creating
 * the effect's audio graph. Once the audio context is available, band centers
 * must be below its Nyquist frequency or {@link ready} rejects. A single band
 * uses `minHz` as its center.
 */
export class VocoderEffect extends WorkletEffect {
  // Declared nullable because super() may trigger _onWorkletReady before the
  // subclass constructor body runs (if construction is aborted by a throw).
  private readonly _modulator: AudioBus | null = null;
  private readonly _numBands: number;
  private readonly _minHz: number;
  private readonly _maxHz: number;
  private readonly _bandQ: number;
  private _envelopeSmoothing: number;

  public constructor(options: VocoderEffectOptions) {
    const numBands = options.numBands ?? 16;
    const minHz = options.minHz ?? 80;
    const maxHz = options.maxHz ?? 8000;
    const bandQ = options.bandQ ?? 4;

    validateVocoderBands(numBands, minHz, maxHz, bandQ);
    super();

    if (!options.modulator) {
      // The base constructor has already scheduled worklet setup, which would
      // otherwise still run for an effect nobody can reach.
      this.destroy();

      throw new Error('VocoderEffect requires a modulator AudioBus.');
    }

    this._modulator = options.modulator;
    this._numBands = numBands;
    this._minHz = minHz;
    this._maxHz = maxHz;
    this._bandQ = bandQ;
    this._envelopeSmoothing = Math.max(0.0001, Math.min(0.1, options.envelopeSmoothing ?? 0.005));
    this.wet = options.wet ?? 1;
  }

  protected get _workletName(): string {
    return 'exojs-vocoder';
  }

  protected get _workletSource(): string {
    return vocoderWorkletSource;
  }

  protected override get _workletOptions(): AudioWorkletNodeOptions {
    if ((this._numBands === 1 ? this._minHz : this._maxHz) >= this._sampleRate / 2) {
      throw new RangeError('Vocoder band centers must be below the Nyquist frequency.');
    }

    return {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      // With two inputs the output no longer follows the carrier's channel
      // count and would default to mono, collapsing a stereo carrier.
      outputChannelCount: [2],
      processorOptions: {
        numBands: this._numBands,
        minHz: this._minHz,
        maxHz: this._maxHz,
        bandQ: this._bandQ,
      },
    };
  }

  protected override _onWorkletReady(_audioContext: AudioContext): void {
    // Guard against partially-constructed instances (constructor threw after super()).
    if (!this._modulator) {
      return;
    }

    this._setAudioParam('envelopeSmoothing', this._envelopeSmoothing);

    this._connectAuxInput(this._modulator, 1);
  }

  /** One-pole envelope follower coefficient. Smaller values produce slower, smoother envelope tracking. Range 0.0001..0.1, default 0.005. */
  public get envelopeSmoothing(): number {
    return this._envelopeSmoothing;
  }

  public set envelopeSmoothing(value: number) {
    this._envelopeSmoothing = Math.max(0.0001, Math.min(0.1, value));
    this._setAudioParam('envelopeSmoothing', this._envelopeSmoothing);
  }
}
