// Vocoder AudioWorkletProcessor - bandpass filterbank + envelope-follower carrier modulation.
//
// Built through the `?worklet` plugin (see `@codexo/exojs-build`),
// which bundles this module - imports included - into the single self-contained
// source string `registerAudioWorkletProcessor` (`#audio/worklet/registerWorklet`)
// hands to `audioWorklet.addModule()` via a Blob URL.
//
// Typechecked against the AudioWorkletGlobalScope (`worklet-globals.d.ts` +
// `../../tsconfig.worklets.json`), not the DOM.
//
// Consumed via `import vocoderWorkletSource from './vocoder.worklet.ts?worklet'`
// (see `../effects/VocoderEffect.ts`).

// Captured once, at module-eval time, rather than read lazily inside the class:
// deliberately NOT the same as reading the ambient `sampleRate` global directly
// inside the constructor. Test harnesses that `eval()` this source stub the
// `sampleRate` global only for the duration of that eval call (class
// definition), then restore it - an instance created later (e.g. from a test's
// `beforeAll`) would otherwise see the global's restored (unset) value. Capturing
// it here, at eval time, is what makes construction see the right value.
import { DisposableProcessor } from './disposable-processor';

const sampleRate: number = (globalThis as unknown as { sampleRate: number }).sampleRate;

interface BiquadCoef {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

class VocoderProcessor extends DisposableProcessor {
  public static get parameterDescriptors(): AudioParamDescriptor[] {
    return [{ name: 'envelopeSmoothing', defaultValue: 0.005, minValue: 0.0001, maxValue: 0.1, automationRate: 'k-rate' }];
  }

  // Log-spaced band centers + biquad coefficients
  private readonly _bands: BiquadCoef[] = [];

  // Per-band biquad state: one carrier bank per channel, one shared modulator bank.
  private readonly _carrierStates: BiquadState[][];
  private readonly _modulatorStates: BiquadState[];

  // Per-band envelope follower, derived from the mono modulator and applied
  // to every carrier channel so the stereo carrier keeps its image.
  private readonly _envelopes: Float32Array;
  private _bandSums = new Float64Array(1);
  private _activeChannels = 0;

  public constructor(options?: unknown) {
    super();
    const opts = (options as { processorOptions?: { numBands?: number; minHz?: number; maxHz?: number; bandQ?: number } } | undefined)?.processorOptions ?? {};
    const bandCount = opts.numBands ?? 16;
    const minHz = opts.minHz ?? 80;
    const maxHz = opts.maxHz ?? 8000;
    const Q = opts.bandQ ?? 4;

    for (let i = 0; i < bandCount; i++) {
      const ratio = bandCount === 1 ? 0 : i / (bandCount - 1);
      const centerHz = minHz * Math.pow(maxHz / minHz, ratio);
      const omega = (2 * Math.PI * centerHz) / sampleRate;
      const cos = Math.cos(omega);
      const sin = Math.sin(omega);
      const alpha = sin / (2 * Q);

      // Bandpass (constant 0 dB peak) biquad
      const a0 = 1 + alpha;
      const b0 = alpha / a0;
      const b1 = 0;
      const b2 = -alpha / a0;
      const a1 = (-2 * cos) / a0;
      const a2 = (1 - alpha) / a0;
      this._bands.push({ b0, b1, b2, a1, a2 });
    }

    this._carrierStates = [this._createStates()];
    this._modulatorStates = this._bands.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));

    this._envelopes = new Float32Array(bandCount);
  }

  /** Advances the modulator filter bank and envelopes by `length` samples without a carrier. */
  private _trackModulator(modulator: Float32Array[] | undefined, length: number, envSmoothing: number): void {
    const modulatorChannels = modulator?.length ?? 0;

    for (let i = 0; i < length; i++) {
      let modulatorSample = 0;
      for (let ch = 0; ch < modulatorChannels; ch++) modulatorSample += modulator![ch]![i]!;
      if (modulatorChannels > 1) modulatorSample /= modulatorChannels;

      for (let b = 0; b < this._bands.length; b++) {
        const modBand = this._processBiquad(this._modulatorStates[b]!, this._bands[b]!, modulatorSample);
        this._envelopes[b]! += (Math.abs(modBand) - this._envelopes[b]!) * envSmoothing;
      }
    }
  }

  private _createStates(): BiquadState[] {
    return this._bands.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
  }

  private _processBiquad(state: BiquadState, coef: BiquadCoef, x: number): number {
    const y = coef.b0 * x + coef.b1 * state.x1 + coef.b2 * state.x2 - coef.a1 * state.y1 - coef.a2 * state.y2;
    state.x2 = state.x1;
    state.x1 = x;
    state.y2 = state.y1;
    state.y1 = y;
    return y;
  }

  public override process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    if (this._destroyed) return false;
    const carrier = inputs[0];
    const modulator = inputs[1];
    const output = outputs[0];
    if (!carrier || !output || output.length === 0) return true;
    const channels = Math.min(carrier.length, output.length);
    if (channels === 0) {
      // The modulator envelope keeps following the modulator while no carrier
      // is connected, so a returning carrier is shaped by the modulator as it
      // is now, not by an envelope frozen when the carrier left.
      this._activeChannels = 0;
      this._trackModulator(modulator, output[0]!.length, parameters['envelopeSmoothing']![0]!);
      return true;
    }
    // Grown on a channel-count increase only, never per block.
    while (this._carrierStates.length < channels) this._carrierStates.push(this._createStates());
    // A channel that reappears after the input narrowed (stereo, then mono,
    // then stereo again) starts silent: replaying the history it had in its
    // previous activation would leak stale audio onto that side.
    for (let ch = this._activeChannels; ch < channels; ch++) {
      for (const state of this._carrierStates[ch]!) {
        state.x1 = 0;
        state.x2 = 0;
        state.y1 = 0;
        state.y2 = 0;
      }
    }
    this._activeChannels = channels;
    if (this._bandSums.length < channels) this._bandSums = new Float64Array(channels);

    const envSmoothing = parameters['envelopeSmoothing']![0]!;
    const bandCount = this._bands.length;
    const modulatorChannels = modulator?.length ?? 0;
    const bandSums = this._bandSums;
    const length = carrier[0]!.length;

    for (let i = 0; i < length; i++) {
      // Modulator analysis is mono: the envelope describes one voice, not a side.
      let modulatorSample = 0;
      for (let ch = 0; ch < modulatorChannels; ch++) modulatorSample += modulator![ch]![i]!;
      if (modulatorChannels > 1) modulatorSample /= modulatorChannels;

      bandSums.fill(0);
      for (let b = 0; b < bandCount; b++) {
        const coef = this._bands[b]!;

        // Modulator band → envelope follower
        const modBand = this._processBiquad(this._modulatorStates[b]!, coef, modulatorSample);
        const target = Math.abs(modBand);
        this._envelopes[b]! += (target - this._envelopes[b]!) * envSmoothing;

        // Carrier band, scaled by modulator envelope
        for (let ch = 0; ch < channels; ch++) {
          const carBand = this._processBiquad(this._carrierStates[ch]![b]!, coef, carrier[ch]![i]!);
          bandSums[ch]! += carBand * this._envelopes[b]!;
        }
      }

      // Multiply bandSum by bandCount: for a broadband carrier the energy is
      // split across N bands, so the raw product (carBand × envelope) is
      // O(1/N) of the carrier amplitude. Scaling by N restores unity gain
      // for typical broadband carrier + voice modulator inputs.
      for (let ch = 0; ch < channels; ch++) output[ch]![i] = bandSums[ch]! * bandCount;
    }

    // The output layout is fixed, so a mono carrier is spread onto the
    // remaining output channels the way a mono signal is upmixed anyway.
    for (let ch = channels; ch < output.length; ch++) output[ch]!.set(output[channels - 1]!);
    return true;
  }
}

registerProcessor('exojs-vocoder', VocoderProcessor);

export {};
