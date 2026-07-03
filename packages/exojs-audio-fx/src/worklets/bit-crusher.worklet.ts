// BitCrusher AudioWorkletProcessor — lo-fi bit-depth + sample-rate reduction.
//
// This is the Phase-1 proof-of-concept for the `.worklet.ts` → `?worklet`
// build plugin (see `@codexo/exojs-config/worklet-plugin`): real, typed
// TypeScript instead of a template-string constant. It typechecks against the
// AudioWorkletGlobalScope (see `worklet-globals.d.ts` + `../../tsconfig.worklets.json`),
// NOT the DOM — this file must stay self-contained (no imports at runtime):
// `registerAudioWorkletProcessor` (`#audio/worklet/registerWorklet`) loads the
// build-inlined source via a Blob URL passed to `audioWorklet.addModule()`.
//
// Consumed via `import bitCrusherWorkletSource from './bit-crusher.worklet.ts?worklet'`
// (see `../effects/BitCrusherEffect.ts`) — the `?worklet` query is what routes
// this file through the transpile-to-string plugin instead of normal
// TypeScript module resolution.
class BitCrusherProcessor extends AudioWorkletProcessor {
  public static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'normFreq', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  // Phase accumulator for sample-and-hold; `_held` keeps the last latched value.
  private _phase = 0;
  private _held = 0;

  public override process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    const bitsParam = parameters['bits']?.[0] ?? 8;
    const normFreqParam = parameters['normFreq']?.[0] ?? 0.5;
    const bits = Math.round(Math.max(1, Math.min(16, bitsParam)));
    const normFreq = Math.max(0, Math.min(1, normFreqParam));
    // Quantization step: 2 / 2^bits (maps [-1, 1] onto 2^bits levels).
    const step = 2 / Math.pow(2, bits);

    for (let i = 0; i < input.length; i++) {
      // Advance the sample-and-hold phase accumulator.
      this._phase += normFreq;
      if (this._phase >= 1) {
        // Wrap phase and latch a fresh, quantized sample.
        this._phase -= 1;
        this._held = step * Math.round(input[i]! / step);
      }
      // Emit the held (quantized) sample — pure wet, no dry mixing here.
      output[i] = this._held;
    }
    return true;
  }
}

registerProcessor('exojs-bit-crusher', BitCrusherProcessor);

export {};
