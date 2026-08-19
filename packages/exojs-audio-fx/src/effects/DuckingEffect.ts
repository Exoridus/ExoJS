import { type AudioBus, WorkletEffect } from '@codexo/exojs';

import duckingWorkletSource from '../worklets/ducking.worklet.ts?worklet';

/** Construction options for {@link DuckingEffect}. `sidechain` is required. */
export interface DuckingEffectOptions {
  sidechain: AudioBus;
  threshold?: number;
  ratio?: number;
  attackMs?: number;
  releaseMs?: number;
}

/**
 * Sidechain compressor (ducker) implemented as an {@link WorkletEffect}.
 * Attenuates the main audio signal whenever the `sidechain` {@link AudioBus}
 * exceeds the threshold, then releases when it drops back down. Commonly used
 * to duck background music under dialogue or sound effects. Attack and release
 * times are expressed in milliseconds and converted internally to one-pole
 * filter coefficients.
 */
export class DuckingEffect extends WorkletEffect {
  // Declared nullable because super() may trigger _onWorkletReady before the
  // subclass constructor body runs (if construction is aborted by a throw).
  private readonly _sidechain: AudioBus | null = null;
  private _threshold: number;
  private _ratio: number;
  private _attackMs: number;
  private _releaseMs: number;

  public constructor(options: DuckingEffectOptions) {
    super();
    if (!options.sidechain) {
      throw new Error('DuckingEffect requires a sidechain AudioBus.');
    }
    this._sidechain = options.sidechain;
    this._threshold = options.threshold ?? -20;
    this._ratio = options.ratio ?? 4;
    this._attackMs = options.attackMs ?? 30;
    this._releaseMs = options.releaseMs ?? 300;
  }

  protected get _workletName(): string {
    return 'exojs-ducking';
  }

  protected get _workletSource(): string {
    return duckingWorkletSource;
  }

  protected override get _workletOptions(): AudioWorkletNodeOptions {
    return { numberOfInputs: 2, numberOfOutputs: 1 };
  }

  protected override _onWorkletReady(audioContext: AudioContext): void {
    // Guard against partially-constructed instances (constructor threw after super()).
    if (!this._sidechain) return;

    // Apply current parameter values
    this._setAudioParam('threshold', this._threshold);
    this._setAudioParam('ratio', this._ratio);
    this._setAudioParam('attack', this._msToCoeff(this._attackMs, audioContext.sampleRate));
    this._setAudioParam('release', this._msToCoeff(this._releaseMs, audioContext.sampleRate));

    // Wire sidechain to input 1 of the worklet
    const sidechain = this._sidechain;
    const sidechainOut = sidechain._getOutputNode();
    if (sidechainOut && this._workletNode) {
      sidechainOut.connect(this._workletNode, 0, 1);
    } else {
      sidechain.onceSetup(() => {
        const node = sidechain._getOutputNode();
        if (node && this._workletNode) {
          node.connect(this._workletNode, 0, 1);
        }
      });
    }
  }

  /** Convert ms time-constant to one-pole filter coefficient at given sample rate. */
  private _msToCoeff(ms: number, sampleRate: number): number {
    const tau = ms * 0.001 * sampleRate;
    return 1 - Math.exp(-1 / Math.max(1, tau));
  }

  /** Sidechain level above which the main signal is attenuated, in dBFS. Range −100..0, default −20. */
  public get threshold(): number {
    return this._threshold;
  }
  public set threshold(value: number) {
    this._threshold = Math.max(-100, Math.min(0, value));
    this._setAudioParam('threshold', this._threshold);
  }

  /** Compression ratio applied to the main signal above the threshold. Range 1..20, default 4. */
  public get ratio(): number {
    return this._ratio;
  }
  public set ratio(value: number) {
    this._ratio = Math.max(1, Math.min(20, value));
    this._setAudioParam('ratio', this._ratio);
  }

  /** Attack time in milliseconds — how quickly the ducker engages. Default 30. */
  public get attackMs(): number {
    return this._attackMs;
  }
  public set attackMs(value: number) {
    this._attackMs = Math.max(0.001, value);
    if (this._workletNode) {
      this._setAudioParam('attack', this._msToCoeff(this._attackMs, this._workletNode.context.sampleRate));
    }
  }

  /** Release time in milliseconds — how quickly the ducker disengages. Default 300. */
  public get releaseMs(): number {
    return this._releaseMs;
  }
  public set releaseMs(value: number) {
    this._releaseMs = Math.max(0.001, value);
    if (this._workletNode) {
      this._setAudioParam('release', this._msToCoeff(this._releaseMs, this._workletNode.context.sampleRate));
    }
  }
}
