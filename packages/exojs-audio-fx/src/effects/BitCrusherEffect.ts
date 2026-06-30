import { WorkletEffect } from '@codexo/exojs';

import { bitCrusherWorkletSource } from '../worklets/bit-crusher.worklet';

export interface BitCrusherEffectOptions {
  /**
   * Bit depth for sample quantization. Lower values produce coarser steps and
   * more distortion. Range 1..16, default 8.
   */
  bits?: number;
  /**
   * Fraction of the sample rate retained (sample-and-hold). A value of 1 means
   * every sample is re-latched (no rate reduction). A value of 0.5 halves the
   * effective sample rate, introducing aliasing. Range 0..1, default 0.5.
   * Maps directly to the worklet `normFreq` AudioParam.
   */
  frequencyReduction?: number;
  /** Dry/wet mix, 0..1. Default 1. */
  wet?: number;
}

/**
 * Lo-fi bit-crusher effect implemented as a {@link WorkletEffect}. Applies two
 * classic degradation stages in series:
 *
 * 1. **Bit-depth reduction** — each sample is quantized to `2^bits` discrete
 *    levels, adding harmonic distortion characteristic of low-resolution audio.
 * 2. **Sample-rate reduction** — a phase-accumulator sample-and-hold circuit
 *    re-latches the (quantized) input only `normFreq` times per input sample on
 *    average, producing aliasing artefacts reminiscent of early digital hardware.
 *
 * The worklet emits a pure wet signal; dry/wet mixing is handled by the base
 * class.
 *
 * @example
 * ```ts
 * const bus = engine.createBus();
 * const crusher = new BitCrusherEffect({ bits: 4, frequencyReduction: 0.3, wet: 0.8 });
 * bus.addEffect(crusher);
 *
 * // Adjust at runtime:
 * crusher.bits = 2;                  // extreme quantization crunch
 * crusher.frequencyReduction = 0.1;  // heavy downsampling aliasing
 * crusher.wet = 0.5;                 // blend with dry signal
 * ```
 */
export class BitCrusherEffect extends WorkletEffect {
  private _bits: number;
  private _frequencyReduction: number;

  public constructor(options: BitCrusherEffectOptions = {}) {
    super();
    this._bits = Math.round(Math.max(1, Math.min(16, options.bits ?? 8)));
    this._frequencyReduction = Math.max(0, Math.min(1, options.frequencyReduction ?? 0.5));
    this.wet = options.wet ?? 1;
  }

  protected get _workletName(): string {
    return 'exojs-bit-crusher';
  }
  protected get _workletSource(): string {
    return bitCrusherWorkletSource;
  }

  protected override _onWorkletReady(): void {
    this._setAudioParam('bits', this._bits);
    this._setAudioParam('normFreq', this._frequencyReduction);
  }

  /**
   * Bit depth for sample quantization. Lower values produce more distortion.
   * Range 1..16, default 8.
   */
  public get bits(): number {
    return this._bits;
  }
  public set bits(value: number) {
    this._bits = Math.round(Math.max(1, Math.min(16, value)));
    this._setAudioParam('bits', this._bits);
  }

  /**
   * Fraction of the sample rate retained (0 = never re-latch, 1 = every sample).
   * Lower values create more aliasing artefacts. Maps to the worklet `normFreq`
   * AudioParam. Range 0..1, default 0.5.
   */
  public get frequencyReduction(): number {
    return this._frequencyReduction;
  }
  public set frequencyReduction(value: number) {
    this._frequencyReduction = Math.max(0, Math.min(1, value));
    this._setAudioParam('normFreq', this._frequencyReduction);
  }
}
