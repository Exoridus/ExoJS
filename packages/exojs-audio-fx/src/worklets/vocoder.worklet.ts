// Vocoder AudioWorkletProcessor — bandpass filterbank + envelope-follower carrier modulation.
//
// This worklet is built through the `.worklet.ts` → `?worklet`
// build plugin (see `@codexo/exojs-config/worklet-plugin`): real, typed
// TypeScript instead of a template-string constant. It typechecks against the
// AudioWorkletGlobalScope (see `worklet-globals.d.ts` + `../../tsconfig.worklets.json`),
// NOT the DOM — this file must stay self-contained (no imports at runtime):
// `registerAudioWorkletProcessor` (`#audio/worklet/registerWorklet`) loads the
// build-inlined source via a Blob URL passed to `audioWorklet.addModule()`.
//
// Consumed via `import vocoderWorkletSource from './vocoder.worklet.ts?worklet'`
// (see `../effects/VocoderEffect.ts`) — the `?worklet` query is what routes
// this file through the transpile-to-string plugin instead of normal
// TypeScript module resolution.

// Captured once, at module-eval time, rather than read lazily inside the class:
// deliberately NOT the same as reading the ambient `sampleRate` global directly
// inside the constructor. Test harnesses that `eval()` this source stub the
// `sampleRate` global only for the duration of that eval call (class
// definition), then restore it — an instance created later (e.g. from a test's
// `beforeAll`) would otherwise see the global's restored (unset) value. Capturing
// it here, at eval time, is what makes construction see the right value.
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

class VocoderProcessor extends AudioWorkletProcessor {
  public static get parameterDescriptors(): AudioParamDescriptor[] {
    return [{ name: 'envelopeSmoothing', defaultValue: 0.005, minValue: 0.0001, maxValue: 0.1, automationRate: 'k-rate' }];
  }

  // Log-spaced band centers + biquad coefficients
  private readonly _bands: BiquadCoef[] = [];

  // Per-band biquad state (one for carrier, one for modulator)
  private readonly _carrierStates: BiquadState[];
  private readonly _modulatorStates: BiquadState[];

  // Per-band envelope follower
  private readonly _envelopes: Float32Array;

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

    this._carrierStates = this._bands.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
    this._modulatorStates = this._bands.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));

    this._envelopes = new Float32Array(bandCount);
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
    const carrier = inputs[0]?.[0];
    const modulator = inputs[1]?.[0];
    const output = outputs[0]?.[0];
    if (!carrier || !output) return true;

    const envSmoothing = parameters['envelopeSmoothing']![0]!;
    const bandCount = this._bands.length;

    for (let i = 0; i < carrier.length; i++) {
      const carrierSample = carrier[i]!;
      const modulatorSample = modulator?.[i] ?? 0;

      let bandSum = 0;
      for (let b = 0; b < bandCount; b++) {
        const coef = this._bands[b]!;

        // Modulator band → envelope follower
        const modBand = this._processBiquad(this._modulatorStates[b]!, coef, modulatorSample);
        const target = Math.abs(modBand);
        this._envelopes[b]! += (target - this._envelopes[b]!) * envSmoothing;

        // Carrier band, scaled by modulator envelope
        const carBand = this._processBiquad(this._carrierStates[b]!, coef, carrierSample);
        bandSum += carBand * this._envelopes[b]!;
      }

      // Multiply bandSum by bandCount: for a broadband carrier the energy is
      // split across N bands, so the raw product (carBand × envelope) is
      // O(1/N) of the carrier amplitude. Scaling by N restores unity gain
      // for typical broadband carrier + voice modulator inputs.
      output[i] = bandSum * bandCount;
    }
    return true;
  }
}

registerProcessor('exojs-vocoder', VocoderProcessor);

export {};
