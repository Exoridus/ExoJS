/**
 * Browser-side helpers for the acoustic-contract tests. These run in real
 * headless Chromium (the `browser-audio-chromium` vitest project), so
 * OfflineAudioContext, AudioWorkletNode, Blob and URL are the genuine Web Audio
 * APIs — not jsdom mocks. A worklet effect is loaded by turning its source
 * string into a Blob module, then rendered offline and analysed.
 */

export const SAMPLE_RATE = 48000;

interface RenderOptions {
  /** Worklet source string (the `…WorkletSource` export). */
  source: string;
  /** Processor name registered via `registerProcessor()` in the source. */
  processorName: string;
  /** AudioWorkletNode processorOptions (e.g. grainSize, bufferSeconds). */
  processorOptions?: Record<string, unknown>;
  /** k-rate AudioParam values to set (e.g. { pitch: 2, wet: 1 }). */
  params?: Record<string, number>;
  /** Frequency of the sine oscillator source, in Hz. Ignored if inputBuffer is set. */
  inputFreq?: number;
  /** Explicit source samples instead of an oscillator. */
  inputBuffer?: Float32Array;
  /** Render length in seconds. */
  durationSeconds: number;
}

/** Render a worklet effect offline and return the mono output samples. */
export async function renderWorklet(opts: RenderOptions): Promise<Float32Array> {
  const sr = SAMPLE_RATE;
  const length = Math.floor(opts.durationSeconds * sr);
  const ctx = new OfflineAudioContext(1, length, sr);

  const url = URL.createObjectURL(new Blob([opts.source], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const node = new AudioWorkletNode(ctx, opts.processorName, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: opts.processorOptions ?? {},
  });
  if (opts.params) {
    for (const [name, value] of Object.entries(opts.params)) {
      const param = node.parameters.get(name);
      if (param) param.value = value;
    }
  }

  let source: AudioScheduledSourceNode;
  if (opts.inputBuffer) {
    const buffer = ctx.createBuffer(1, opts.inputBuffer.length, sr);
    buffer.getChannelData(0).set(opts.inputBuffer);
    const bufferSource = ctx.createBufferSource();
    bufferSource.buffer = buffer;
    source = bufferSource;
  } else {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = opts.inputFreq ?? 440;
    source = osc;
  }
  source.connect(node);
  node.connect(ctx.destination);
  source.start();

  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

/**
 * Hann-windowed power spectrum via an in-place radix-2 FFT over the largest
 * power-of-two prefix of `buf`. O(N log N) — far cheaper than a per-bin DFT
 * sweep when scanning the whole spectrum.
 */
function powerSpectrum(buf: Float32Array): { mag: Float32Array; n: number } {
  let n = 1;
  while (n * 2 <= buf.length) n *= 2;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n)); // Hann reduces leakage
    re[i] = buf[i] * w;
  }
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + (len >> 1)] * cr - im[i + k + (len >> 1)] * ci;
        const bi = re[i + k + (len >> 1)] * ci + im[i + k + (len >> 1)] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + (len >> 1)] = ar - br;
        im[i + k + (len >> 1)] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  const half = n >> 1;
  const mag = new Float32Array(half);
  for (let i = 0; i < half; i++) mag[i] = re[i] * re[i] + im[i] * im[i];
  return { mag, n };
}

/** Dominant frequency via FFT peak + parabolic interpolation for sub-bin accuracy. */
export function dominantFreq(buf: Float32Array, sampleRate = SAMPLE_RATE): number {
  const { mag, n } = powerSpectrum(buf);
  let peak = 1;
  for (let i = 1; i < mag.length; i++) if (mag[i] > mag[peak]) peak = i;
  const a = mag[peak - 1] ?? 0;
  const b = mag[peak];
  const c = mag[peak + 1] ?? 0;
  const denom = a - 2 * b + c;
  const delta = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return ((peak + delta) * sampleRate) / n;
}

export function rms(buf: Float32Array): number {
  let s = 0;
  for (const v of buf) s += v * v;
  return Math.sqrt(s / buf.length);
}

/** Return the tail of `buf` starting at `fromSeconds` (drops warmup transient). */
export function tail(buf: Float32Array, fromSeconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  return buf.subarray(Math.floor(fromSeconds * sampleRate));
}
