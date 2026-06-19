import { type AudioBus, getAudioContext, isAudioContextReady, onAudioContextReady, type Voice } from '@codexo/exojs';

import { buildMelFilterbank, type MelBand } from './dsp/mel';

export type AudioAnalyserSource = AudioBus | Voice | MediaStream | AudioNode | null;

/** Construction options for {@link AudioAnalyser}. */
export interface AudioAnalyserOptions {
  /** FFT window size; must be a power of two between 32 and 32768. Default 2048. */
  fftSize?: number;
  /** Time-domain smoothing constant in 0..1 applied between successive analyses. Default 0.8. */
  smoothingTimeConstant?: number;
  /** Minimum dBFS rendered by the byte-domain spectrum getters. Default -100. */
  minDecibels?: number;
  /** Maximum dBFS rendered by the byte-domain spectrum getters. Default -30. */
  maxDecibels?: number;
  /**
   * Optional initial source. Equivalent to `analyser.source = value` after
   * construction; provided for ergonomic one-shot construction. The setter
   * remains usable for runtime source switches.
   */
  source?: AudioAnalyserSource;
}

/** Mapping options for {@link AudioAnalyser.getSpectrumMel} and {@link AudioAnalyser.getSpectrumLog}. */
export interface SpectrumMappingOptions {
  /** Number of output bands. Default 32. */
  bands?: number;
  /** Lower frequency bound in Hz. Default 20. */
  fMin?: number;
  /** Upper frequency bound in Hz. Default 20000 (clamped to nyquist at runtime). */
  fMax?: number;
}

type RequiredAnalyserOptions = Required<AudioAnalyserOptions>;

/**
 * Lightweight visualisation analyser backed by a Web Audio AnalyserNode.
 *
 * Accepts any of: AudioBus, Voice, MediaStream, AudioNode, or null. The tap is
 * a parallel branch — it does not affect the source's main routing. Tap a bus
 * for a whole submix, or an individual {@link Voice} (its `output` node) for a
 * single playing instance.
 */
export class AudioAnalyser {
  private _analyser: AnalyserNode | null = null;
  private readonly _options: RequiredAnalyserOptions;
  private _source: AudioAnalyserSource = null;
  private _tapSource: AudioNode | null = null;
  private _streamSource: MediaStreamAudioSourceNode | null = null;
  private _pendingSourceSetup: ((ctx: AudioContext) => void) | null = null;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupAnalyser(ctx);
  };

  // Pre-allocated buffers
  private _byteSpectrum: Uint8Array<ArrayBuffer>;
  private _floatSpectrum: Float32Array<ArrayBuffer>;
  private _byteWaveform: Uint8Array<ArrayBuffer>;
  private _floatWaveform: Float32Array<ArrayBuffer>;

  // Cached mel/log filterbanks. Key: `${bands}|${fMin}|${fMax}|${fftSize}`.
  // Filterbank construction is non-trivial; caching avoids per-frame allocation.
  private _melCache = new Map<string, MelBand[]>();
  private _logCache = new Map<string, LogBandRange[]>();

  /**
   * Create an `AudioAnalyser` with the given options. The underlying
   * `AnalyserNode` is created immediately if the `AudioContext` is already
   * running, or deferred until {@link onAudioContextReady} fires.
   */
  public constructor(options?: AudioAnalyserOptions) {
    this._options = {
      fftSize: options?.fftSize ?? 2048,
      smoothingTimeConstant: options?.smoothingTimeConstant ?? 0.8,
      minDecibels: options?.minDecibels ?? -100,
      maxDecibels: options?.maxDecibels ?? -30,
      source: options?.source ?? null,
    };

    const binCount = this._options.fftSize >> 1;
    this._byteSpectrum = new Uint8Array(binCount);
    this._floatSpectrum = new Float32Array(binCount);
    this._byteWaveform = new Uint8Array(binCount);
    this._floatWaveform = new Float32Array(binCount);

    if (isAudioContextReady()) {
      this._setupAnalyser(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }

    if (options?.source !== undefined && options.source !== null) {
      this.source = options.source;
    }
  }

  // -----------------------------------------------------------------------
  // Source setter
  // -----------------------------------------------------------------------

  /**
   * The currently tapped audio source, or `null` if none is set.
   * Assigning a new value disconnects the previous tap and connects the new
   * source as a parallel branch without affecting the source's main routing.
   */
  public get source(): AudioAnalyserSource {
    return this._source;
  }

  public set source(value: AudioAnalyserSource) {
    if (value === this._source) return;

    // 1. Disconnect current tap
    this._disconnectTap();

    this._source = value;

    if (value === null) return;

    // 2. Resolve and connect new tap
    if (isAudioContextReady()) {
      this._pendingSourceSetup = null;
      this._connectSource(value, getAudioContext());
    } else {
      if (this._pendingSourceSetup !== null) {
        onAudioContextReady.remove(this._pendingSourceSetup);
      }

      const handler = (ctx: AudioContext): void => {
        onAudioContextReady.remove(handler);
        this._pendingSourceSetup = null;
        this._connectSource(value, ctx);
      };

      this._pendingSourceSetup = handler;
      onAudioContextReady.add(handler);
    }
  }

  // -----------------------------------------------------------------------
  // AnalyserNode property pass-throughs
  // -----------------------------------------------------------------------

  public get fftSize(): number {
    return this._options.fftSize;
  }

  /** Number of frequency bins available — half of `fftSize`. */
  public get frequencyBinCount(): number {
    return this._options.fftSize >> 1;
  }

  public get smoothingTimeConstant(): number {
    return this._analyser?.smoothingTimeConstant ?? this._options.smoothingTimeConstant;
  }

  public set smoothingTimeConstant(v: number) {
    this._options.smoothingTimeConstant = v;
    if (this._analyser) this._analyser.smoothingTimeConstant = v;
  }

  public get minDecibels(): number {
    return this._analyser?.minDecibels ?? this._options.minDecibels;
  }

  public set minDecibels(v: number) {
    this._options.minDecibels = v;
    if (this._analyser) this._analyser.minDecibels = v;
  }

  public get maxDecibels(): number {
    return this._analyser?.maxDecibels ?? this._options.maxDecibels;
  }

  public set maxDecibels(v: number) {
    this._options.maxDecibels = v;
    if (this._analyser) this._analyser.maxDecibels = v;
  }

  // -----------------------------------------------------------------------
  // Raw data
  // -----------------------------------------------------------------------

  /** Fill and return the byte frequency spectrum (0..255 per bin). */
  public getSpectrum(into?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    const buf = into ?? this._byteSpectrum;
    if (this._analyser) {
      this._analyser.getByteFrequencyData(buf);
    } else {
      buf.fill(0);
    }
    return buf;
  }

  /** Fill and return the float frequency spectrum (dB per bin). */
  public getSpectrumFloat(into?: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
    const buf = into ?? this._floatSpectrum;
    if (this._analyser) {
      this._analyser.getFloatFrequencyData(buf);
    } else {
      buf.fill(0);
    }
    return buf;
  }

  /** Fill and return the byte time-domain waveform (0..255 per sample). */
  public getWaveform(into?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    const buf = into ?? this._byteWaveform;
    if (this._analyser) {
      this._analyser.getByteTimeDomainData(buf);
    } else {
      buf.fill(0);
    }
    return buf;
  }

  /** Fill and return the float time-domain waveform (-1..1 per sample). */
  public getWaveformFloat(into?: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
    const buf = into ?? this._floatWaveform;
    if (this._analyser) {
      this._analyser.getFloatTimeDomainData(buf);
    } else {
      buf.fill(0);
    }
    return buf;
  }

  // -----------------------------------------------------------------------
  // Convenience helpers
  // -----------------------------------------------------------------------

  /**
   * Return the mean energy of frequency bins in the given Hz range, normalised 0..1.
   * Uses the byte spectrum (0..255), normalised by dividing by 255.
   */
  public getBandEnergy(fromHz: number, toHz: number): number {
    if (!this._analyser) return 0;
    const ctx = getAudioContext();
    const nyquist = ctx.sampleRate / 2;
    const binCount = this.frequencyBinCount;
    const fromBin = Math.max(0, Math.min(binCount - 1, Math.round((fromHz / nyquist) * binCount)));
    const toBin = Math.max(0, Math.min(binCount - 1, Math.round((toHz / nyquist) * binCount)));

    const lo = Math.min(fromBin, toBin);
    const hi = Math.max(fromBin, toBin);

    const spectrum = this.getSpectrum();
    let sum = 0;
    const count = hi - lo + 1;
    for (let i = lo; i <= hi; i++) {
      sum += spectrum[i];
    }
    return sum / (count * 255);
  }

  /** Return low (0-250 Hz), mid (250-2 kHz), and high (2 k-20 kHz) band energies (0..1 each). */
  public getLowMidHigh(): { low: number; mid: number; high: number } {
    return {
      low: this.getBandEnergy(0, 250),
      mid: this.getBandEnergy(250, 2000),
      high: this.getBandEnergy(2000, 20000),
    };
  }

  /** Return overall RMS energy across all bins, normalised 0..1. */
  public getRms(): number {
    if (!this._analyser) return 0;
    const ctx = getAudioContext();
    const nyquist = ctx.sampleRate / 2;
    return this.getBandEnergy(0, nyquist);
  }

  // -----------------------------------------------------------------------
  // Spectrum mapping (mel / log scaling)
  //
  // The raw FFT bins from AnalyserNode are linearly distributed across
  // 0..nyquist, which gives bass a few bins and treble hundreds. For
  // visualisations you typically want perceptually-weighted spacing.
  //
  // Both `getSpectrumMel` and `getSpectrumLog` operate on the byte-domain
  // spectrum (0..255) and produce byte output by default. The float
  // variants operate on dBFS values and produce float output.
  //
  // Filterbanks are cached on the analyser; they only rebuild when fftSize
  // or the (bands, fMin, fMax) parameters change.
  // -----------------------------------------------------------------------

  /**
   * Mel-scaled spectrum, byte domain (0..255). Output length = `bands`.
   * Each output bin is a triangular-weighted sum of the linear FFT bins
   * underneath it, mel-spaced from `fMin` to `fMax`.
   */
  public getSpectrumMel(into?: Uint8Array<ArrayBuffer>, options?: SpectrumMappingOptions): Uint8Array<ArrayBuffer> {
    const bandCount = options?.bands ?? 32;
    const out = into ?? new Uint8Array(bandCount);
    const filterbank = this._getMelFilterbank(bandCount, options?.fMin ?? 20, options?.fMax ?? 20000);

    if (!this._analyser || filterbank === null) {
      out.fill(0);
      return out;
    }

    this._analyser.getByteFrequencyData(this._byteSpectrum);
    applyFilterbank(this._byteSpectrum, filterbank, out);

    return out;
  }

  /** Mel-scaled spectrum, float domain (dBFS values). Output length = `bands`. */
  public getSpectrumMelFloat(into?: Float32Array<ArrayBuffer>, options?: SpectrumMappingOptions): Float32Array<ArrayBuffer> {
    const bandCount = options?.bands ?? 32;
    const out = into ?? new Float32Array(bandCount);
    const filterbank = this._getMelFilterbank(bandCount, options?.fMin ?? 20, options?.fMax ?? 20000);

    if (!this._analyser || filterbank === null) {
      out.fill(0);
      return out;
    }

    this._analyser.getFloatFrequencyData(this._floatSpectrum);
    applyFilterbank(this._floatSpectrum, filterbank, out);

    return out;
  }

  /**
   * Log-scaled spectrum, byte domain (0..255). Output length = `bands`.
   * Bins are spaced so each output covers an equal fraction of the
   * `log2(fMax / fMin)` octave range — useful when you want a
   * frequency-axis visualization where each octave gets the same width.
   */
  public getSpectrumLog(into?: Uint8Array<ArrayBuffer>, options?: SpectrumMappingOptions): Uint8Array<ArrayBuffer> {
    const bandCount = options?.bands ?? 32;
    const out = into ?? new Uint8Array(bandCount);
    const ranges = this._getLogRanges(bandCount, options?.fMin ?? 20, options?.fMax ?? 20000);

    if (!this._analyser || ranges === null) {
      out.fill(0);
      return out;
    }

    this._analyser.getByteFrequencyData(this._byteSpectrum);
    applyLogRanges(this._byteSpectrum, ranges, out);

    return out;
  }

  /** Log-scaled spectrum, float domain (dBFS values). Output length = `bands`. */
  public getSpectrumLogFloat(into?: Float32Array<ArrayBuffer>, options?: SpectrumMappingOptions): Float32Array<ArrayBuffer> {
    const bandCount = options?.bands ?? 32;
    const out = into ?? new Float32Array(bandCount);
    const ranges = this._getLogRanges(bandCount, options?.fMin ?? 20, options?.fMax ?? 20000);

    if (!this._analyser || ranges === null) {
      out.fill(0);
      return out;
    }

    this._analyser.getFloatFrequencyData(this._floatSpectrum);
    applyLogRanges(this._floatSpectrum, ranges, out);

    return out;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Disconnect the analyser tap, release the internal `AnalyserNode`, and
   * cancel any pending setup callbacks. Call when the analyser is no longer
   * needed to avoid memory leaks.
   */
  public destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);

    if (this._pendingSourceSetup !== null) {
      onAudioContextReady.remove(this._pendingSourceSetup);
      this._pendingSourceSetup = null;
    }
    this._disconnectTap();
    this._analyser?.disconnect();
    this._analyser = null;
    this._source = null;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private _getMelFilterbank(bands: number, fMin: number, fMax: number): MelBand[] | null {
    if (!this._analyser) return null;
    const ctx = getAudioContext();
    const fftSize = this._options.fftSize;
    const clampedFmax = Math.min(fMax, ctx.sampleRate / 2);
    const key = `${bands}|${fMin}|${clampedFmax}|${fftSize}`;

    let cached = this._melCache.get(key);
    if (cached === undefined) {
      cached = buildMelFilterbank(bands, fMin, clampedFmax, fftSize, ctx.sampleRate);
      this._melCache.set(key, cached);
    }
    return cached;
  }

  private _getLogRanges(bands: number, fMin: number, fMax: number): LogBandRange[] | null {
    if (!this._analyser) return null;
    const ctx = getAudioContext();
    const fftSize = this._options.fftSize;
    const clampedFmax = Math.min(fMax, ctx.sampleRate / 2);
    const key = `${bands}|${fMin}|${clampedFmax}|${fftSize}`;

    let cached = this._logCache.get(key);
    if (cached === undefined) {
      cached = buildLogRanges(bands, fMin, clampedFmax, fftSize, ctx.sampleRate);
      this._logCache.set(key, cached);
    }
    return cached;
  }

  private _setupAnalyser(audioContext: AudioContext): void {
    const node = audioContext.createAnalyser();
    node.fftSize = this._options.fftSize;
    node.minDecibels = this._options.minDecibels;
    node.maxDecibels = this._options.maxDecibels;
    node.smoothingTimeConstant = this._options.smoothingTimeConstant;
    this._analyser = node;

    // If a source was set before the context was ready, connect it now.
    if (this._source !== null) {
      this._connectSource(this._source, audioContext);
    }
  }

  private _connectSource(source: AudioAnalyserSource, audioContext: AudioContext): void {
    if (!this._analyser) return;

    const tap = this._resolveToAudioNode(source, audioContext);
    if (!tap) {
      // AudioBus not ready yet — defer via its onceSetup
      this._deferConnectionViaBus(source);
      return;
    }

    this._tapSource = tap;
    tap.connect(this._analyser);
  }

  private _resolveToAudioNode(source: AudioAnalyserSource, audioContext: AudioContext): AudioNode | null {
    if (source === null) return null;

    // MediaStream — detect by getTracks (duck-type, since AudioNode also doesn't exist in jsdom)
    const asStream = source as Partial<{ getTracks: unknown }>;
    if (typeof asStream.getTracks === 'function') {
      if (this._streamSource) {
        this._streamSource.disconnect();
        this._streamSource = null;
      }
      const msNode = audioContext.createMediaStreamSource(source as MediaStream);
      this._streamSource = msNode;
      return msNode;
    }

    // AudioBus — has _getOutputNode (checked first since bus nodes also have connect/disconnect)
    const asBus = source as Partial<{ _getOutputNode: () => AudioNode | null }>;
    if (typeof asBus._getOutputNode === 'function') {
      return asBus._getOutputNode();
    }

    // Voice — tap its output node
    const asVoice = source as Partial<{ output: AudioNode }>;
    if ('output' in asVoice && asVoice.output) {
      return asVoice.output;
    }

    // Raw AudioNode — duck-type: has connect & disconnect
    const asNode = source as Partial<{ connect: unknown; disconnect: unknown }>;
    if (typeof asNode.connect === 'function' && typeof asNode.disconnect === 'function') {
      return source as unknown as AudioNode;
    }

    return null;
  }

  private _deferConnectionViaBus(source: AudioAnalyserSource): void {
    // AudioBus exposes onceSetup
    const asBus = source as Partial<{ onceSetup: (callback: () => void) => void }>;
    if (typeof asBus.onceSetup === 'function') {
      asBus.onceSetup(() => {
        if (this._source === source && this._analyser && isAudioContextReady()) {
          this._connectSource(source, getAudioContext());
        }
      });
      return;
    }

    // Otherwise retry once the audioContext is ready (same signal).
    onAudioContextReady.once(() => {
      if (this._source === source && this._analyser && isAudioContextReady()) {
        this._connectSource(source, getAudioContext());
      }
    });
  }

  private _disconnectTap(): void {
    if (this._tapSource && this._analyser) {
      try {
        this._tapSource.disconnect(this._analyser);
      } catch {
        // Ignore if already disconnected
      }
    }
    this._tapSource = null;

    // Clean up cached stream source
    if (this._streamSource) {
      this._streamSource.disconnect();
      this._streamSource = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Filterbank helpers — module-private, shared between byte and float variants.
// ---------------------------------------------------------------------------

interface LogBandRange {
  /** Inclusive start FFT bin. */
  readonly startBin: number;
  /** Inclusive end FFT bin. */
  readonly endBin: number;
}

function buildLogRanges(bandCount: number, fMin: number, fMax: number, fftSize: number, sampleRate: number): LogBandRange[] {
  const binCount = fftSize >> 1;
  const nyquist = sampleRate / 2;
  const logMin = Math.log(fMin);
  const logMax = Math.log(fMax);
  const ranges: LogBandRange[] = [];

  for (let b = 0; b < bandCount; b++) {
    const lowHz = Math.exp(logMin + ((logMax - logMin) * b) / bandCount);
    const highHz = Math.exp(logMin + ((logMax - logMin) * (b + 1)) / bandCount);
    const startBin = Math.max(0, Math.min(binCount - 1, Math.floor((lowHz / nyquist) * binCount)));
    const endBin = Math.max(startBin, Math.min(binCount - 1, Math.ceil((highHz / nyquist) * binCount) - 1));
    ranges.push({ startBin, endBin });
  }

  return ranges;
}

function applyFilterbank(spectrum: Uint8Array | Float32Array, bands: MelBand[], out: Uint8Array | Float32Array): void {
  for (let b = 0; b < bands.length; b++) {
    const { startBin, weights } = bands[b];
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += spectrum[startBin + i] * weights[i];
    }
    out[b] = sum;
  }
}

function applyLogRanges(spectrum: Uint8Array | Float32Array, ranges: LogBandRange[], out: Uint8Array | Float32Array): void {
  for (let b = 0; b < ranges.length; b++) {
    const { startBin, endBin } = ranges[b];
    let sum = 0;
    const count = endBin - startBin + 1;
    for (let i = startBin; i <= endBin; i++) {
      sum += spectrum[i];
    }
    out[b] = sum / count;
  }
}
