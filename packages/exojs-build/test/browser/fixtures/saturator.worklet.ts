// A real, typed AudioWorklet processor that imports an ordinary TypeScript
// module. The `?worklet` transform bundles the two into one string; nothing
// resolves an import inside an AudioWorkletGlobalScope.
import { saturate } from './dsp';

const DRIVE = 4;

class SaturatorProcessor extends AudioWorkletProcessor {
  public override process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (!output) return true;

    for (let index = 0; index < output.length; index++) {
      output[index] = saturate(input?.[index] ?? 0, DRIVE);
    }

    return true;
  }
}

registerProcessor('exojs-build-saturator', SaturatorProcessor);
