// BitCrusher AudioWorkletProcessor - lo-fi bit-depth + sample-rate reduction.
//
// Built through the `?worklet` plugin (see `@codexo/exojs-build`),
// which bundles this module - imports included - into the single self-contained
// source string `registerAudioWorkletProcessor` (`#audio/worklet/registerWorklet`)
// hands to `audioWorklet.addModule()` via a Blob URL.
//
// Typechecked against the AudioWorkletGlobalScope (`worklet-globals.d.ts` +
// `../../tsconfig.worklets.json`), not the DOM.
//
// Consumed via `import bitCrusherWorkletSource from './bit-crusher.worklet.ts?worklet'`
// (see `../effects/BitCrusherEffect.ts`).
import { DisposableProcessor } from './disposable-processor';

class BitCrusherProcessor extends DisposableProcessor {
  public static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'normFreq', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  // One phase accumulator for all channels, so every channel latches on the
  // same sample and the stereo image never smears; `_held` keeps each
  // channel's last latched value.
  private _phase = 0;
  private _held = new Float32Array(2);
  private _activeChannels = 0;

  public override process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    if (this._destroyed) {
      return false;
    }

    const input = inputs[0];
    const output = outputs[0];

    if (!input || !output) {
      return true;
    }

    const channels = Math.min(input.length, output.length);

    if (channels === 0) {
      this._activeChannels = 0;

      return true;
    }

    if (this._held.length < channels) {
      const held = new Float32Array(channels);
      held.set(this._held);
      this._held = held;
    }

    // A channel that reappears after the input narrowed (stereo, then mono,
    // then stereo again) starts silent: replaying the history it had in its
    // previous activation would leak stale audio onto that side.
    for (let ch = this._activeChannels; ch < channels; ch++) {
      this._held[ch] = 0;
    }

    this._activeChannels = channels;

    const bitsParam = parameters['bits']?.[0] ?? 8;
    const normFreqParam = parameters['normFreq']?.[0] ?? 0.5;
    const bits = Math.round(Math.max(1, Math.min(16, bitsParam)));
    const normFreq = Math.max(0, Math.min(1, normFreqParam));
    // Quantization step: 2 / 2^bits (maps [-1, 1] onto 2^bits levels).
    const step = 2 / Math.pow(2, bits);
    const length = input[0]!.length;

    for (let i = 0; i < length; i++) {
      // Advance the sample-and-hold phase accumulator.
      this._phase += normFreq;
      const latch = this._phase >= 1;

      if (latch) {
        this._phase -= 1;
      }

      for (let ch = 0; ch < channels; ch++) {
        // Latch a fresh, quantized sample on wrap; emit the held sample - pure wet, no dry mixing here.
        if (latch) {
          this._held[ch] = step * Math.round(input[ch]![i]! / step);
        }

        output[ch]![i] = this._held[ch]!;
      }
    }

    return true;
  }
}

registerProcessor('exojs-bit-crusher', BitCrusherProcessor);

export {};
