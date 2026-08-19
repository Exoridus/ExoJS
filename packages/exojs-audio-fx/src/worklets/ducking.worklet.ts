// Ducking AudioWorkletProcessor - sidechain compressor.
//
// Built through the `?worklet` plugin (see `@codexo/exojs-build`),
// which bundles this module into the single self-contained source string
// `registerAudioWorkletProcessor` (`#audio/worklet/registerWorklet`) hands to
// `audioWorklet.addModule()` via a Blob URL.
//
// Typechecked against the AudioWorkletGlobalScope (`worklet-globals.d.ts` +
// `../../tsconfig.worklets.json`), not the DOM.
//
// Input 0 is the signal being ducked, input 1 the sidechain that drives the
// gain reduction; `DuckingEffect` wires that second input and is the only
// consumer.
class DuckingProcessor extends AudioWorkletProcessor {
  public static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      { name: 'threshold', defaultValue: -20, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
      { name: 'ratio', defaultValue: 4, minValue: 1, maxValue: 20, automationRate: 'k-rate' },
      // attack/release are one-pole smoothing coefficients (1 - exp(-1/tau)),
      // not times - their value lives in [0, 1]. A 0.001 floor clipped the
      // small coefficients of typical attack/release times (e.g. 30 ms at
      // 48 kHz ≈ 0.0007), so the browser clamped them and logged a warning.
      { name: 'attack', defaultValue: 0.03, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  private _envelope = 0;

  public override process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const main = inputs[0];
    const sidechain = inputs[1];
    const output = outputs[0];

    if (!main || main.length === 0 || !output || output.length === 0) {
      return true;
    }

    const threshold = parameters['threshold']![0]!;
    const ratio = parameters['ratio']![0]!;
    const attackCoeff = parameters['attack']![0]!;
    const releaseCoeff = parameters['release']![0]!;

    const blockLength = main[0]?.length ?? 0;
    for (let i = 0; i < blockLength; i++) {
      // Sidechain detection level: mono-mixed rectified L+R.
      let scSample = 0;
      if (sidechain && sidechain.length > 0) {
        const left = sidechain[0]?.[i] ?? 0;
        const right = sidechain[1]?.[i] ?? left;
        scSample = (Math.abs(left) + Math.abs(right)) * 0.5;
      }

      const coeff = scSample > this._envelope ? attackCoeff : releaseCoeff;
      this._envelope += (scSample - this._envelope) * coeff;

      const envDb = 20 * Math.log10(this._envelope + 1e-9);
      const overshoot = Math.max(0, envDb - threshold);
      const reduction = overshoot * (1 - 1 / ratio);
      const gain = Math.pow(10, -reduction / 20);

      for (let ch = 0; ch < main.length; ch++) {
        const mainCh = main[ch];
        const outCh = output[ch];
        if (mainCh && outCh && i < mainCh.length) {
          outCh[i] = mainCh[i]! * gain;
        }
      }
    }

    return true;
  }
}

registerProcessor('exojs-ducking', DuckingProcessor);

export {};
