// PitchShift AudioWorkletProcessor - SOLA time-stretch + resample pitch shifter.
//
// Built through the `?worklet` plugin (see `@codexo/exojs-config/worklet-plugin`),
// which bundles this module - imports included - into the single self-contained
// source string `registerAudioWorkletProcessor` (`#audio/worklet/registerWorklet`)
// hands to `audioWorklet.addModule()` via a Blob URL.
//
// Typechecked against the AudioWorkletGlobalScope (`worklet-globals.d.ts` +
// `../../tsconfig.worklets.json`), not the DOM.
//
// Consumed via `import pitchShiftWorkletSource from './pitch-shift.worklet.ts?worklet'`
// (see `../effects/PitchShiftEffect.ts`).

class PitchShiftProcessor extends AudioWorkletProcessor {
  public static get parameterDescriptors(): AudioParamDescriptor[] {
    return [{ name: 'pitch', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }

  private readonly _frameLen: number; // analysis/synthesis frame
  private readonly _hop: number; // synthesis hop (50% overlap)
  private readonly _overlap: number;
  private readonly _seek: number; // correlation search radius (±)
  private readonly _win: Float32Array;

  // Input ring buffer: holds enough past input for the correlation search.
  private readonly _inLen: number;
  private readonly _inBuf: Float32Array;
  private _inCount = 0; // total input samples written

  // Stretched-stream overlap-add accumulator (also a ring).
  private readonly _outLen: number;
  private readonly _outBuf: Float32Array;
  private _synthPos = 0; // total stretched samples synthesized
  private _readPos = 0; // fractional resample read position
  private _aPos = 0; // analysis position (absolute input coords)
  private _first = true;

  // Pitch shift = SOLA time-stretch by `pitch` followed by resampling by
  // `pitch`. SOLA (synchronized overlap-add) realigns each synthesis grain by
  // cross-correlation so grain restarts stay phase coherent - this is what
  // keeps the carrier exactly at f_in * pitch. A naive granular delay drifts
  // the pitch because its grain-boundary phase jumps accumulate into a
  // frequency offset.
  public constructor(options?: unknown) {
    super();
    const grainSize = (options as { processorOptions?: { grainSize?: number } } | undefined)?.processorOptions?.grainSize ?? 1024;
    this._frameLen = grainSize;
    this._hop = grainSize >> 1;
    this._overlap = grainSize - this._hop;
    this._seek = grainSize >> 2;
    this._win = this._buildHannWindow(grainSize);

    this._inLen = grainSize * 4 + 2 * this._seek;
    this._inBuf = new Float32Array(this._inLen);

    this._outLen = grainSize * 4;
    this._outBuf = new Float32Array(this._outLen);
  }

  private _buildHannWindow(n: number): Float32Array {
    // Periodic Hann: w(p) + w(p + n/2) === 1, i.e. constant-overlap-add at
    // 50% overlap, so two adjacent grains reconstruct unity amplitude.
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
    }
    return w;
  }

  // Find the input offset (within ±seek of `nominal`) whose grain head best
  // matches the existing output overlap region - the waveform-similarity step
  // that keeps successive grains in phase.
  private _correlate(nominal: number): number {
    const ov = this._overlap;
    const ib = this._inBuf;
    const iL = this._inLen;
    const ob = this._outBuf;
    const oL = this._outLen;
    const sp = this._synthPos;
    const seek = this._seek;
    let bestD = 0;
    let bestC = -Infinity;
    for (let d = -seek; d <= seek; d++) {
      const base = nominal + d;
      if (base < 0 || base + ov > this._inCount) continue;
      let c = 0;
      for (let k = 0; k < ov; k++) c += ob[(sp + k) % oL]! * ib[(base + k) % iL]!;
      if (c > bestC) {
        bestC = c;
        bestD = d;
      }
    }
    return bestD;
  }

  // True once the input buffer covers the next analysis frame plus its search.
  private _canGenerate(): boolean {
    const nominal = Math.round(this._aPos);
    const oldest = this._inCount - this._inLen;
    return nominal >= 0 && nominal + this._frameLen + this._seek <= this._inCount && nominal - this._seek >= oldest;
  }

  // Emit one phase-aligned grain into the stretched-stream accumulator.
  private _generate(pitch: number): void {
    const F = this._frameLen;
    const H = this._hop;
    const win = this._win;
    const ib = this._inBuf;
    const iL = this._inLen;
    const ob = this._outBuf;
    const oL = this._outLen;
    const nominal = Math.round(this._aPos);
    const d = this._first ? 0 : this._correlate(nominal);
    this._first = false;
    const base = nominal + d;
    // Zero the newly exposed tail, then overlap-add the windowed grain.
    for (let j = H; j < F; j++) ob[(this._synthPos + j) % oL] = 0;
    for (let j = 0; j < F; j++) ob[(this._synthPos + j) % oL]! += ib[(base + j) % iL]! * win[j]!;
    this._synthPos += H;
    this._aPos += H / pitch; // analysis hop = synthesis hop / stretch
  }

  public override process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    const pitch = parameters['pitch']![0]!;
    const ob = this._outBuf;
    const oL = this._outLen;

    for (let i = 0; i < input.length; i++) {
      this._inBuf[this._inCount % this._inLen] = input[i]!;
      this._inCount++;

      // Pull-generate stretched samples until the read pointer has a margin.
      let guard = 0;
      while (this._synthPos < this._readPos + 2 && this._canGenerate() && guard++ < 64) {
        this._generate(pitch);
      }

      let shifted = 0;
      if (this._readPos + 1 < this._synthPos) {
        const p = this._readPos;
        const i0 = Math.floor(p);
        const frac = p - i0;
        const a = ob[((i0 % oL) + oL) % oL]!;
        const b = ob[(((i0 + 1) % oL) + oL) % oL]!;
        shifted = a + (b - a) * frac;
        this._readPos += pitch;
      }

      output[i] = shifted;
    }
    return true;
  }
}

registerProcessor('exojs-pitch-shift', PitchShiftProcessor);

export {};
