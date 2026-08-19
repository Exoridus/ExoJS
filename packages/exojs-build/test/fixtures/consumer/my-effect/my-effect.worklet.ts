// The processor an external consumer authors: real TypeScript, importing a
// real module. The `?worklet` transform bundles both into the single string
// `audioWorklet.addModule()` needs.
import { MY_EFFECT_PROCESSOR, saturate } from './dsp';

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

registerProcessor(MY_EFFECT_PROCESSOR, SaturatorProcessor);
