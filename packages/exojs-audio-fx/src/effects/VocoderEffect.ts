import { type AudioBus, WorkletEffect } from '@codexo/exojs';

import { vocoderWorkletSource } from '../worklets/vocoder.worklet';

export interface VocoderEffectOptions {
  /** Modulator AudioBus — its output drives the spectral envelope.
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
 * Phase-vocoder-style effect implemented as a {@link WorkletEffect}. Analyzes
 * the spectral envelope of a `modulator` {@link AudioBus} across a bank of
 * log-spaced bandpass filters and applies that envelope to the carrier signal
 * (the main input). The result is the classic "robot voice" or talking-synth
 * effect. Band count, frequency range, and Q are compile-time parameters set
 * at construction; only `wet` and `envelopeSmoothing` are adjustable at
 * runtime.
 */
export class VocoderEffect extends WorkletEffect {
  // Declared nullable because super() may trigger _onWorkletReady before the
  // subclass constructor body runs (if construction is aborted by a throw).
  private readonly _modulator: AudioBus | null = null;
  private readonly _numBands: number;
  private readonly _minHz: number;
  private readonly _maxHz: number;
  private readonly _bandQ: number;
  private _wet: number;
  private _envelopeSmoothing: number;

  public constructor(options: VocoderEffectOptions) {
    super();
    if (!options.modulator) {
      throw new Error('VocoderEffect requires a modulator AudioBus.');
    }
    this._modulator = options.modulator;
    this._numBands = options.numBands ?? 16;
    this._minHz = options.minHz ?? 80;
    this._maxHz = options.maxHz ?? 8000;
    this._bandQ = options.bandQ ?? 4;
    this._wet = Math.max(0, Math.min(1, options.wet ?? 1));
    this._envelopeSmoothing = Math.max(0.0001, Math.min(0.1, options.envelopeSmoothing ?? 0.005));
  }

  protected get _workletName(): string {
    return 'exojs-vocoder';
  }
  protected get _workletSource(): string {
    return vocoderWorkletSource;
  }
  protected override get _workletOptions(): AudioWorkletNodeOptions {
    return {
      numberOfInputs: 2,
      numberOfOutputs: 1,
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
    if (!this._modulator) return;

    this._setAudioParam('wet', this._wet);
    this._setAudioParam('envelopeSmoothing', this._envelopeSmoothing);

    // Wire modulator bus output to input 1 of the worklet
    const modulator = this._modulator;
    const modOutput = modulator._getOutputNode();
    if (modOutput && this._workletNode) {
      modOutput.connect(this._workletNode, 0, 1);
    } else {
      modulator.onceSetup(() => {
        const node = modulator._getOutputNode();
        if (node && this._workletNode) {
          node.connect(this._workletNode, 0, 1);
        }
      });
    }
  }

  /** Wet (vocoded) mix level, 0..1. Default 1.0. */
  public get wet(): number {
    return this._wet;
  }
  public set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this._setAudioParam('wet', this._wet);
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
