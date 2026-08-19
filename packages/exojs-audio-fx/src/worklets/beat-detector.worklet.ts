// BeatDetector AudioWorkletProcessor - spectral-flux onset detection + ACF tempogram + PLL beat tracking.
//
// Built through the `?worklet` plugin (see `@codexo/exojs-config/worklet-plugin`),
// which bundles this module and everything it imports into the single
// self-contained source string `registerAudioWorkletProcessor`
// (`#audio/worklet/registerWorklet`) hands to `audioWorklet.addModule()` via a
// Blob URL. Imports are therefore resolved at build time; there is no module
// loader inside AudioWorkletGlobalScope.
//
// Typechecked against the AudioWorkletGlobalScope (`worklet-globals.d.ts` +
// `../../tsconfig.worklets.json`), not the DOM, so a stray `window`/`document`
// reference is a compile error rather than a runtime surprise on the audio thread.
//
// The DSP this file drives - FFT, mel filterbank, tempogram - lives in `../dsp/`
// and is imported, not copied. What stays here is the real-time orchestration
// around it: preallocated scratch buffers, ring-buffer bookkeeping, and the PLL
// beat tracker. The audio thread cannot allocate, so this file calls the
// out-parameter primitives (`computeAcfInto`) rather than the allocating
// convenience wrappers built on them.

import { fft } from '../dsp/fft';
import { buildMelFilterbank, computeMelBands, type MelBand } from '../dsp/mel';
import {
  acfAtLag,
  acfExtendedMinLag,
  candidateEdgeTolerance,
  combPenaltyDouble,
  combPenaltyTriple,
  combWeightFundamental,
  combWeightHalf,
  combWeightThird,
  computeAcfInto,
  defaultPriorMu,
  defaultPriorSigma,
  isOctaveRelated,
  parabolicPeakOffset,
  type TempoCandidateResult,
  tempoPrior,
} from '../dsp/tempogram';

interface UpcomingBeatInline {
  audioTime: number;
  tempo: number;
  isDownbeat: boolean;
  beatInBar: number;
}

interface BandEnergyInline {
  low: number;
  mid: number;
  high: number;
}

interface BeatDetectorProcessorOptions {
  fftSize?: number;
  hopSize?: number;
  minBpm?: number;
  maxBpm?: number;
  melBands?: number;
  minSettlingMs?: number;
  emitProvisionalBeats?: boolean;
  fastTempoWindowSec?: number;
  stableTempoWindowSec?: number;
  enableTimeSignatureDetection?: boolean;
  acfIntervalHops?: number;
}

// ---- Utility ----
// Sorts arr[0..n-1] in-place using insertion sort. Avoids creating a subarray view so
// the hot path (_detectOnset, ~93 calls/s) produces zero per-call GC pressure.
function partialSort(arr: Float32Array, n: number): void {
  for (let i = 1; i < n; i++) {
    const v = arr[i]!;
    let j = i - 1;
    while (j >= 0 && arr[j]! > v) {
      arr[j + 1] = arr[j]!;
      j--;
    }
    arr[j + 1] = v;
  }
}

// ---- Onset peak-picker: adaptive normalization + noise gate + refractory ----
// The raw spectral flux is normalised against a running median/MAD baseline so that
// soft onsets (low, broad novelty) and hard transients become comparable, then a
// rising-edge picker (upward crossing of an adaptive threshold) with a noise-floor gate
// and an IBI-derived refractory turns the novelty curve into a clean onset stream. This
// stream (per-hop strength + sub-hop onset positions) is what the PLL below anchors to.
const ONSET_NORM_WINDOW_SEC = 1.5; // running median/MAD window for novelty normalization
const ONSET_MAD_SCALE = 1.4826; // MAD → σ consistency factor (Gaussian)
const ONSET_THRESHOLD = 3; // normalized-novelty peak threshold (robust z-score)
const ONSET_NOISE_FLOOR_FRAC = 0.1; // a peak must clear this fraction of the running flux peak
const ONSET_ABS_FLOOR = 1e-4; // absolute novelty floor — kills divide-by-noise in silence
const ONSET_PEAK_DECAY = 0.999; // per-hop decay of the running flux peak (noise-floor reference)
const ONSET_MIN_REFRACTORY_SEC = 0.1; // minimum spacing between detected onsets (~100 ms)
const ONSET_REFRACTORY_IBI_FRAC = 0.4; // once locked, refractory = max(min, frac × IBI)
const ONSET_BEAT_COAST_IBI = 2; // suppress beat emission after this many IBIs without an onset
const ONSET_RING_SIZE = 16; // recent onsets retained for the PLL's nearestOnset()

// ---- PLL beat-phase tracker ----
// A bounded phase-locked loop replaces the old constant-IBI predictor + buggy snap. Each
// predicted beat is corrected toward the nearest detected onset (sub-hop precise, from the
// onset ring): a proportional phase nudge plus a small period adjustment, BOTH clamped so
// a single noisy onset can never yank the grid. Exactly one beat is emitted per predicted
// beat (the old snap double-advanced and timestamped a beat an IBI ahead). The first beat is
// bootstrapped to a real recent onset, never an arbitrary settling boundary. The gains are
// INTERNAL constants (API decision: not public). Tempo selection is untouched —
// the PLL only refines phase/period locally around the ACF-chosen tempo.
const PLL_PHASE_GAIN = 0.25; // fraction of phase error applied as a phase nudge per beat
const PLL_TEMPO_GAIN = 0.03; // fraction of phase error folded into the period per beat
const PLL_MAX_PHASE_FRAC = 0.08; // |phaseCorr| clamp, fraction of the IBI
const PLL_MAX_TEMPO_FRAC = 0.02; // |ibiCorr| clamp, fraction of the IBI
const PLL_ACCEPT_FRAC = 0.25; // an onset within ±this·IBI of the prediction is "the" beat onset
const PLL_FREERUN_FRAC = 0.25; // free-run (grid) emit once the prediction is passed by this·IBI
const PLL_RESYNC_FRAC = 0.25; // re-seed the PLL period from the ACF tempo if it drifts beyond this
const PLL_BOOTSTRAP_MAX_AGE_IBI = 2; // bootstrap anchors to the newest onset within this many IBIs

// ---- DJ-drift dual-window tracking ----
// The tracked tempo normally follows the long STABLE window (octave-safe, steady). When the
// short FAST window consistently reports a DIFFERENT, non-octave tempo over several ACF hops,
// the grid follows it — a genuine DJ drift, not noise. A single noisy hop can never move the
// grid (the persistence streak below), and octave-scale disagreements are left to the stable
// hysteresis (they are metrical ambiguity, owned by the octave guards there).
const DRIFT_MIN_FRAC = 0.012; // fast must differ from the grid by > this to count as drift (~1.2%)
const DRIFT_MAX_FRAC = 0.2; // beyond this it is a hard jump → owned by the stable hysteresis
const DRIFT_AGREE_FRAC = 0.04; // consecutive fast estimates within this keep the confirmation streak
const DRIFT_CONFIRM_HOPS = 3; // consecutive confirming ACF hops required before the grid follows

// ---- Provisional vs locked beats ----
// Beats are emitted as soon as the early ACF finds ANY in-range tempo (gated at _minEmitHops,
// derived from minSettlingMs ≈ 400 ms instead of waiting the full slowest-tempo window), tagged
// status:'provisional' — this drives the low-latency "blink" visual reactivity. A beat is only
// PROMOTED to status:'locked' once the evidence matches what the detector used to wait for: the
// full stable window has filled (fluxCount ≥ maxLag+1 — one period of the slowest tempo, exactly
// the old emission gate → the AUTHORITATIVE lock) AND at least LOCK_PROMOTE_BEATS beats have since
// been emitted on that validated grid AND confidence clears a floor. (Persistence is counted as
// beats-after-authoritative-lock, not onset-MATCHED beats: on syncopated material the IBI-derived
// refractory hides the on-grid onsets so the grid legitimately free-runs — the full-window lock +
// confidence already establish trustworthiness.) The promotion latches (one provisional→locked
// transition per stable segment) and also gates the state-message tempo report, so sync-critical
// consumers and the public tempo/confidence getters only ever see post-lock (trustworthy) values
// while the visual layer still reacts early. The gains are INTERNAL constants (API decision: not
// public). When emitProvisionalBeats is false, provisional beats are suppressed (grid bookkeeping
// still runs) and only locked beats are posted — the original emission shape.
const LOCK_PROMOTE_BEATS = 3; // beats emitted after the authoritative lock before promotion to locked
const LOCK_PROMOTE_CONFIDENCE = 0.1; // confidence floor that must be cleared to promote to locked

// ---- Processor ----
class BeatDetectorProcessor extends AudioWorkletProcessor {
  private readonly _sampleRate: number;
  private readonly _fftSize: number;
  private readonly _hopSize: number;
  private readonly _minBpm: number;
  private readonly _maxBpm: number;
  private readonly _melBands: number;
  private readonly _minSettlingMs: number;
  private readonly _emitProvisionalBeats: boolean;
  private readonly _fastTempoWindowSec: number;
  private readonly _stableTempoWindowSec: number;
  private readonly _enableTsDetection: boolean;

  private readonly _real: Float32Array;
  private readonly _imag: Float32Array;
  private readonly _mag: Float32Array;
  private readonly _ringBuffer: Float32Array;
  private _ringWritePos: number;
  private _sampleCount: number;
  private _hopAccum: number;

  private readonly _melBandFilters: readonly MelBand[];
  private readonly _melOut: Float32Array;
  private readonly _fluxWindow: Float32Array;
  private readonly _linFlux: Float32Array;
  private _fluxWritePos: number;
  private _fluxCount: number;
  private readonly _stableWindowHops: number;
  private readonly _fastWindowHops: number;
  private readonly _prevMelFrames: Float32Array[];
  private _prevMelFrameIdx: number;

  private readonly _minLag: number;
  private readonly _maxLag: number;
  private readonly _acfMinLag: number;
  private readonly _acf: Float32Array;

  private _hopsSinceACF: number;
  private readonly _acfInterval: number;

  private _bestBpm: number;
  private _bestScore: number;
  private _candidates: TempoCandidateResult[];
  private _firstLockSample: number;

  private _driftBpm: number;
  private _driftHops: number;

  private _lastBeatSample: number;
  private _ibiSamples: number;
  private readonly _ibiHistory: Float32Array;
  private _ibiIdx: number;

  private readonly _posterior4: Float32Array;
  private readonly _posterior3: Float32Array;
  private _ts4Confidence: number;
  private _ts3Confidence: number;
  private _activeTs: '4/4' | '3/4';
  private _sustainCounter: number;
  private _barPosition: number;
  private _barNumber: number;
  private _beatsSinceStart: number;

  private _confidence: number;

  private readonly _stateInterval: number;
  private _hopsSinceState: number;

  private readonly _minEmitHops: number;
  private _authLocked: boolean;
  private _locked: boolean;
  private _beatsSinceAuthLock: number;

  private _lookahead: UpcomingBeatInline[];

  private _rms: number;
  private _onsetStrength: number;

  private readonly _onsetWin: Float32Array;
  private _onsetWinPos: number;
  private _onsetWinCount: number;
  private readonly _onsetSort: Float32Array;
  private readonly _onsetDev: Float32Array;
  private _fluxPeak: number;
  private _onsetPrev1: number;
  private _onsetHopCount: number;
  private _lastOnsetSample: number;
  private readonly _onsetRingSamples: Float32Array;
  private readonly _onsetRingStrengths: Float32Array;
  private _onsetRingPos: number;
  private _onsetRingCount: number;

  private readonly _lowBandEnd: number;
  private readonly _midBandEnd: number;

  public constructor(options?: unknown) {
    super();
    const opts = (options as { processorOptions?: BeatDetectorProcessorOptions } | undefined)?.processorOptions ?? {};
    this._sampleRate = sampleRate;
    this._fftSize = opts.fftSize || 2048;
    this._hopSize = opts.hopSize || 512;
    this._minBpm = opts.minBpm || 50;
    this._maxBpm = opts.maxBpm || 300;
    this._melBands = opts.melBands || 24;
    // Low-latency emission: minSettlingMs replaces the old settlingMs (1500). It sets the
    // EARLIEST point a (provisional) beat may be emitted - the ACF starts hunting a tempo once
    // the flux ring holds this many hops instead of waiting a full slowest-tempo period.
    this._minSettlingMs = opts.minSettlingMs !== undefined ? opts.minSettlingMs : 400;
    this._emitProvisionalBeats = opts.emitProvisionalBeats !== false; // default true
    // Dual tempo windows. The short FAST window detects a genuine tempo change quickly;
    // the long STABLE window holds the grid steady against noise/octave artefacts. A single
    // flux ring is sized to the stable window and the fast window is its most-recent sub-span.
    this._fastTempoWindowSec = opts.fastTempoWindowSec || 2.5;
    this._stableTempoWindowSec = opts.stableTempoWindowSec || 8;
    this._enableTsDetection = opts.enableTimeSignatureDetection !== false;

    const numBins = this._fftSize >> 1;
    this._real = new Float32Array(this._fftSize);
    this._imag = new Float32Array(this._fftSize);
    this._mag = new Float32Array(numBins);
    this._ringBuffer = new Float32Array(this._fftSize);
    this._ringWritePos = 0;
    this._sampleCount = 0;
    this._hopAccum = 0;

    this._melBandFilters = buildMelFilterbank(this._melBands, 80, 8000, this._fftSize, this._sampleRate);
    this._melOut = new Float32Array(this._melBands);
    const fluxWindowLen = Math.ceil((this._stableTempoWindowSec * this._sampleRate) / this._hopSize);
    this._fluxWindow = new Float32Array(fluxWindowLen);
    this._linFlux = new Float32Array(fluxWindowLen); // scratch: ring → linear (oldest first)
    this._fluxWritePos = 0;
    this._fluxCount = 0;
    // Window spans in hops. The STABLE span is the whole ring; the FAST span is its most
    // recent slice. Both still hold ≥ maxLag+1 hops so the slowest tempo stays resolvable.
    this._stableWindowHops = fluxWindowLen;
    this._fastWindowHops = Math.min(fluxWindowLen, Math.ceil((this._fastTempoWindowSec * this._sampleRate) / this._hopSize));
    const LAG_K = 3;
    this._prevMelFrames = [];
    for (let i = 0; i < LAG_K; i++) {
      this._prevMelFrames.push(new Float32Array(this._melBands));
    }
    this._prevMelFrameIdx = 0;

    // Lag range in hops for BPM range
    this._minLag = Math.max(1, Math.round((60 / this._maxBpm) * this._sampleRate / this._hopSize));
    this._maxLag = Math.round((60 / this._minBpm) * this._sampleRate / this._hopSize);
    // ACF is computed down to a shorter lag than the candidate band: high-BPM
    // fundamentals become interior peaks and the 2f/3f super-harmonic penalty can read
    // energy above maxBpm.
    this._acfMinLag = acfExtendedMinLag(this._minLag);
    this._acf = new Float32Array(this._maxLag - this._acfMinLag + 1); // scratch ACF buffer

    this._hopsSinceACF = 0;
    // ACF cadence: hops between tempogram recomputations. Configurable via acfIntervalHops
    // (default 15). Lower = faster reaction at more CPU; keep ≥ 1.
    this._acfInterval = Math.max(1, Math.round(opts.acfIntervalHops !== undefined ? opts.acfIntervalHops : 15));

    // Tempo state
    this._bestBpm = 0;
    this._bestScore = 0;
    this._candidates = [];
    this._firstLockSample = -1; // sample index of first lock (for hysteresis grace window)

    // Drift-tracking state. The fast window must point at a different, non-octave tempo
    // CONSISTENTLY (over several ACF hops) before the held grid follows it.
    this._driftBpm = 0; // tempo the fast window is currently pointing at (the streak target)
    this._driftHops = 0; // consecutive ACF hops the fast window has confirmed that target

    // Phase state
    this._lastBeatSample = -1;
    this._ibiSamples = 0; // PLL-tracked inter-beat interval (samples); seeded from ACF tempo
    this._ibiHistory = new Float32Array(4); // last 4 inter-beat intervals
    this._ibiIdx = 0;

    // Bar position state - parallel posteriors for 4/4 and 3/4
    this._posterior4 = new Float32Array([0.25, 0.25, 0.25, 0.25]);
    this._posterior3 = new Float32Array([1 / 3, 1 / 3, 1 / 3]);
    this._ts4Confidence = 0.5;
    this._ts3Confidence = 0.5;
    this._activeTs = '4/4';
    this._sustainCounter = 0;
    this._barPosition = 1; // 1-indexed
    this._barNumber = 0;
    this._beatsSinceStart = 0;

    // Confidence
    this._confidence = 0;

    // State snapshot cadence (~20 Hz)
    const STATE_INTERVAL_HOPS = Math.round(this._sampleRate / this._hopSize / 20);
    this._stateInterval = Math.max(1, STATE_INTERVAL_HOPS);
    this._hopsSinceState = 0;

    // Emission gate + provisional/locked state. _minEmitHops is the earliest hop at which
    // the ACF may run (derived from minSettlingMs); _locked latches once the full-window
    // evidence + beat persistence + confidence floor are met (see LOCK_PROMOTE_* and
    // _emitBeat). _onGridStreak counts consecutive onset-matched beats toward promotion.
    this._minEmitHops = Math.max(1, Math.round((this._minSettlingMs * 0.001 * this._sampleRate) / this._hopSize));
    // _authLocked flips true the first time the flux ring holds a full slowest-tempo period
    // (fluxCount ≥ maxLag+1) - the AUTHORITATIVE lock, identical to the original first lock.
    // Before it, any ACF tempo is an early estimate that drives provisional beats only and is
    // re-adopted every hop (never frozen). After it, the octave-aware hysteresis owns the grid.
    this._authLocked = false;
    this._locked = false;
    this._beatsSinceAuthLock = 0; // beats emitted since the authoritative lock (promotion gate)

    // Lookahead
    this._lookahead = [];

    // RMS / onset state
    this._rms = 0;
    this._onsetStrength = 0; // per-hop normalised novelty (exposed to state + the PLL)

    // ---- Onset peak-picker state ----
    const onsetWinLen = Math.max(8, Math.round((ONSET_NORM_WINDOW_SEC * this._sampleRate) / this._hopSize));
    this._onsetWin = new Float32Array(onsetWinLen); // ring of recent raw flux (normalization)
    this._onsetWinPos = 0;
    this._onsetWinCount = 0;
    this._onsetSort = new Float32Array(onsetWinLen); // scratch — sorted copy for median
    this._onsetDev = new Float32Array(onsetWinLen); // scratch — |x − median| for MAD
    this._fluxPeak = 0; // decaying running flux maximum (noise-floor reference)
    this._onsetPrev1 = 0; // normalised novelty at the previous hop (rising-edge detect)
    this._onsetHopCount = 0;
    // ---- Onset stream exposed for the PLL ----
    // _lastOnsetSample = most recent confirmed onset (sub-hop precise); the ring holds
    // the last ONSET_RING_SIZE onsets so the PLL can pick nearestOnset().
    this._lastOnsetSample = -1;
    this._onsetRingSamples = new Float32Array(ONSET_RING_SIZE);
    this._onsetRingStrengths = new Float32Array(ONSET_RING_SIZE);
    this._onsetRingPos = 0;
    this._onsetRingCount = 0;

    // Band energy (for state messages)
    const LOW_BANDS = Math.round(this._melBands * 0.25);
    const MID_BANDS = Math.round(this._melBands * 0.6);
    this._lowBandEnd = LOW_BANDS;
    this._midBandEnd = MID_BANDS;
  }

  public override process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const left = input[0] ?? new Float32Array(0);
    const right = input[1] ?? left;
    const blockLen = left.length;

    for (let s = 0; s < blockLen; s++) {
      // Mono downmix
      const mono = (left[s]! + right[s]!) * 0.5;

      // Accumulate RMS
      this._rms += mono * mono;

      // Fill ring buffer
      this._ringBuffer[this._ringWritePos] = mono;
      this._ringWritePos = (this._ringWritePos + 1) & (this._fftSize - 1);

      this._hopAccum++;
      this._sampleCount++;

      if (this._hopAccum >= this._hopSize) {
        this._hopAccum = 0;
        this._processHop();
      }
    }

    return true;
  }

  private _processHop(): void {
    // Read ring buffer into real[] (oldest first)
    const rb = this._ringBuffer;
    const wp = this._ringWritePos;
    const n = this._fftSize;
    for (let i = 0; i < n; i++) {
      this._real[i] = rb[(wp + i) & (n - 1)]!;
    }

    // FFT
    fft(this._real, this._imag);

    // Magnitude spectrum
    const bins = n >> 1;
    for (let i = 0; i < bins; i++) {
      this._mag[i] = Math.sqrt(this._real[i]! * this._real[i]! + this._imag[i]! * this._imag[i]!);
    }

    // RMS (from time domain, using ring buffer)
    let rmsAccum = 0;
    for (let i = 0; i < n; i++) {
      rmsAccum += rb[(wp + i) & (n - 1)]! * rb[(wp + i) & (n - 1)]!;
    }
    this._rms = Math.sqrt(rmsAccum / n);

    // Mel bands
    computeMelBands(this._mag, this._melBandFilters, this._melOut);

    // Spectral flux (SuperFlux-lite, lag k=3)
    const K = this._prevMelFrames.length;
    let flux = 0;
    for (let b = 0; b < this._melBands; b++) {
      let localMax = -Infinity;
      for (let k = 0; k < K; k++) {
        const prevVal = this._prevMelFrames[k]![b]!;
        if (prevVal > localMax) localMax = prevVal;
      }
      const diff = this._melOut[b]! - localMax;
      if (diff > 0) flux += diff;
    }

    // Store current mel frame in circular buffer
    const prevFrame = this._prevMelFrames[this._prevMelFrameIdx]!;
    for (let b = 0; b < this._melBands; b++) {
      prevFrame[b] = this._melOut[b]!;
    }
    this._prevMelFrameIdx = (this._prevMelFrameIdx + 1) % K;

    // Add flux to sliding window
    this._fluxWindow[this._fluxWritePos] = flux;
    this._fluxWritePos = (this._fluxWritePos + 1) % this._fluxWindow.length;
    if (this._fluxCount < this._fluxWindow.length) this._fluxCount++;

    // Adaptive onset normalization + peak-picking. Runs every hop (independent
    // of the ACF/tempo path, which still consumes the raw _fluxWindow above).
    this._detectOnset(flux);

    // Tempogram: compute ACF periodically. The warm-up gate is lowered from a full slowest-
    // tempo period (_maxLag+1, ~1.2 s at minBpm) to _minEmitHops (~0.4 s) so a fast/core tempo
    // can lock - and a provisional beat can fire - far earlier. The ACF over a short span only
    // resolves tempos that already have ≳1 period of evidence in it, so slow tempos still wait
    // (physically) for their period; promotion to 'locked' still requires the full window.
    this._hopsSinceACF++;
    const dueForAcf = this._hopsSinceACF >= this._acfInterval && this._fluxCount >= this._minEmitHops;
    // Force the AUTHORITATIVE compute the instant the full window first fills (independent of
    // the earlier provisional ACF cadence), so the authoritative lock + phase re-bootstrap land
    // on exactly the evidence the original detector used for its first lock. That makes every
    // LOCKED beat identical to the original output (same tempo, same grid phase).
    const firstFullWindow = !this._authLocked && this._fluxCount >= this._maxLag + 1;
    if (dueForAcf || firstFullWindow) {
      this._hopsSinceACF = 0;
      this._computeACFAndCandidates();
    }

    // Phase tracker - runs as soon as a tempo is locked. It is no longer gated on the
    // full settling window: the PLL bootstraps its phase from a real onset, so beats are
    // not lost to warm-up (the state-message tempo report still honours settling). Lock
    // itself cannot occur before the flux window holds ≥ maxLag+1 hops (~1.2 s at minBpm).
    if (this._bestBpm > 0) {
      this._tickPhase(flux);
    }

    // State snapshot
    this._hopsSinceState++;
    if (this._hopsSinceState >= this._stateInterval) {
      this._hopsSinceState = 0;
      this._sendStateMessage();
    }
  }

  // Score tempo candidates over the most-recent spanHops of the flux ring (capped at the
  // available count). Mirrors src/dsp/tempogram.computeTempoCandidates over that span: ACF →
  // positive peaks (parabola-refined interior, raw endpoints) → comb − super-harmonic penalty
  // × tempo prior → top-3 sorted by score. The STABLE span (whole ring) is the parity-checked
  // candidate set. Shares the _linFlux / _acf scratch buffers, so the caller must consume the
  // returned array before the next call.
  private _scoreSpan(spanHops: number): TempoCandidateResult[] {
    const buf = this._fluxWindow;
    const wp = this._fluxWritePos;
    const len = buf.length;
    const n = spanHops < this._fluxCount ? spanHops : this._fluxCount;
    const minLag = this._acfMinLag; // extended ACF base (see constructor)
    const maxLag = this._maxLag;
    const numLags = maxLag - minLag + 1;
    const loBpm = this._minBpm * (1 - candidateEdgeTolerance);
    const hiBpm = this._maxBpm * (1 + candidateEdgeTolerance);

    // Linearise the most-recent n hops of the flux ring (oldest first) into a scratch array
    // so the ACF operates on the same layout src/dsp/tempogram.computeAcf expects.
    const lin = this._linFlux;
    for (let t = 0; t < n; t++) {
      lin[t] = buf[(((wp - 1 - (n - 1 - t)) % len) + len) % len]!;
    }

    // ACF (mean-subtracted, biased, zero-lag normalised) - mirrors computeAcf.
    const acf = this._acf;
    computeAcfInto(lin, n, minLag, maxLag, acf);

    // Raw positive peaks (interior + endpoints) - mirrors findTempoPeaks.
    const peaks: TempoCandidateResult[] = [];
    const lastIdx = numLags - 1;
    if (numLags > 1 && acf[0]! > acf[1]! && acf[0]! > 0) {
      peaks.push({ bpm: (60 * this._sampleRate) / (minLag * this._hopSize), score: acf[0]!, lag: minLag });
    }
    for (let i = 1; i < lastIdx; i++) {
      if (acf[i]! > acf[i - 1]! && acf[i]! > acf[i + 1]! && acf[i]! > 0) {
        const lagI = minLag + i + parabolicPeakOffset(acf[i - 1]!, acf[i]!, acf[i + 1]!);
        peaks.push({ bpm: (60 * this._sampleRate) / (lagI * this._hopSize), score: acf[i]!, lag: lagI });
      }
    }
    if (numLags > 1 && acf[lastIdx]! > acf[lastIdx - 1]! && acf[lastIdx]! > 0) {
      const lagL = minLag + lastIdx;
      peaks.push({ bpm: (60 * this._sampleRate) / (lagL * this._hopSize), score: acf[lastIdx]!, lag: lagL });
    }
    peaks.sort((a, b) => b.score - a.score);

    // Filter to BPM range (with edge tolerance) - mirrors computeTempoCandidates filter.
    const inRange: TempoCandidateResult[] = [];
    for (let pf = 0; pf < peaks.length; pf++) {
      if (peaks[pf]!.bpm >= loBpm && peaks[pf]!.bpm <= hiBpm) inRange.push(peaks[pf]!);
    }

    // Comb (own sub-multiples) − super-harmonic penalty, × tempo prior.
    // Mirrors scoreTempoHypotheses. The penalty is what defeats the octave-down bias.
    // The penalty is SUBDIVISION-AWARE: a super-harmonic kf only demotes f when kf is
    // itself a plausible beat (kf <= maxBpm). Energy above maxBpm is a subdivision (hats
    // on 8ths over a 180 kick), not a competing fundamental, so it must not demote f.
    const superHi = hiBpm;
    const scored: TempoCandidateResult[] = [];
    for (let q = 0; q < inRange.length; q++) {
      const lag = inRange[q]!.lag;
      const aF = acfAtLag(acf, minLag, lag);
      const aHalf = acfAtLag(acf, minLag, lag * 2);
      const aThird = acfAtLag(acf, minLag, lag * 3);
      const aDouble = acfAtLag(acf, minLag, lag / 2);
      const aTriple = acfAtLag(acf, minLag, lag / 3);
      const support = combWeightFundamental * aF + combWeightHalf * aHalf + combWeightThird * aThird;
      const penDbl = inRange[q]!.bpm * 2 <= superHi ? combPenaltyDouble * aDouble : 0;
      const penTrip = inRange[q]!.bpm * 3 <= superHi ? combPenaltyTriple * aTriple : 0;
      let comb = support - penDbl - penTrip;
      if (comb < 0) comb = 0;
      const w = tempoPrior(inRange[q]!.bpm, defaultPriorMu, defaultPriorSigma);
      scored.push({ bpm: inRange[q]!.bpm, score: comb * w, lag });
    }
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, 3);
  }

  private _computeACFAndCandidates(): void {
    // Dual ACF windows over the SAME flux ring. The long STABLE span holds the grid (and
    // is the parity-checked candidate set the state message reports); the short FAST span
    // detects a genuine tempo change quickly. Both feed the octave-aware hysteresis below.
    const stable = this._scoreSpan(this._stableWindowHops);
    const fast = this._scoreSpan(this._fastWindowHops);

    this._candidates = stable;
    if (this._candidates.length === 0) return;

    const top = this._candidates[0]!;

    // Octave-aware hysteresis with a short first-lock grace window.
    if (!this._authLocked) {
      // Pre-authoritative (provisional) phase: the flux ring does not yet hold a full
      // slowest-tempo period, so this tempo is an EARLY, possibly under-resolved estimate
      // used only to drive provisional beats. Re-adopt the current best estimate every hop -
      // never freeze it (an under-resolved edge lock must not stick). The AUTHORITATIVE lock
      // fires the instant the full window is available; that value is identical to the original
      // first lock, so the locked grid + hysteresis (and every locked beat) are unchanged.
      this._bestBpm = top.bpm;
      this._bestScore = top.score;
      if (this._fluxCount >= this._maxLag + 1) {
        this._authLocked = true;
        this._firstLockSample = this._sampleCount;
        this._beatsSinceAuthLock = 0;
        // Re-anchor the beat phase + period to the full-window evidence, SILENTLY (no
        // re-emit → no duplicate beat next to the last provisional one). A provisional beat
        // may have anchored the grid on an early under-resolved tempo or, on syncopated
        // material, an off-beat onset; snap _lastBeatSample to the same strongest recent
        // onset the original detector locked to here so locked beats sit on the trustworthy
        // grid. If no provisional beat has run yet (_lastBeatSample < 0), leave it so
        // _tickPhase bootstraps the first beat normally.
        if (this._lastBeatSample >= 0) {
          const reIbi = (60 / this._bestBpm) * this._sampleRate;
          const reAnchor = this._bootstrapOnset(PLL_BOOTSTRAP_MAX_AGE_IBI * reIbi);
          if (reAnchor >= 0) {
            this._lastBeatSample = reAnchor;
            this._ibiSamples = reIbi;
          }
        }
      }
    } else {
      // --- Stable-window hysteresis: holds the grid against noise + octave artefacts. ---
      // Fresh score of the currently-tracked tempo from this frame.
      let currentScore = 0;
      for (let c = 0; c < this._candidates.length; c++) {
        if (Math.abs(this._candidates[c]!.bpm / this._bestBpm - 1) < 0.03) {
          if (this._candidates[c]!.score > currentScore) currentScore = this._candidates[c]!.score;
        }
      }
      if (currentScore <= 0) currentScore = this._bestScore * 0.9;

      const inGrace = this._firstLockSample >= 0 && this._sampleCount - this._firstLockSample < 2 * this._sampleRate;
      // Metrically-related = the same beat counted at another level; switching across one
      // needs the strong margin so a subdivision artefact cannot steal the lock.
      const isOctave = isOctaveRelated(top.bpm, this._bestBpm);
      let margin: number;
      if (inGrace) {
        margin = 1;
      } else if (isOctave) {
        margin = 1.5;
      } else {
        margin = 1.15;
      }
      const diff = Math.abs(top.bpm - this._bestBpm) / this._bestBpm;

      if (diff > 0.03 && top.score > currentScore * margin) {
        const oldBpm = this._bestBpm;
        this._bestBpm = top.bpm;
        this._bestScore = top.score;
        // Only fire tempoChange if > 5% different
        if (Math.abs(this._bestBpm - oldBpm) / oldBpm > 0.05) {
          this.port.postMessage({ type: 'tempoChange', newTempo: this._bestBpm, oldTempo: oldBpm });
        }
      } else {
        this._bestScore = currentScore;
      }

      // --- Fast-window drift adaptation: follows a genuine, sustained DJ drift. ---
      this._trackDrift(fast);
    }

    this._updateConfidence();
  }

  // DJ-drift adaptation. The fast window leads a genuine tempo drift that the long stable
  // window (and thus the held grid) lags. When the fast window points at a non-octave tempo a
  // small-but-meaningful distance from the grid, and keeps pointing there for DRIFT_CONFIRM_HOPS
  // consecutive ACF hops, the grid follows it. Octave-scale and hard-jump disagreements are
  // left to the stable hysteresis above (it carries the octave guards); single noisy hops are
  // filtered out by the persistence streak - so a static tempo is never made nervous.
  private _trackDrift(fast: TempoCandidateResult[]): void {
    if (fast.length === 0) {
      this._driftHops = 0;
      this._driftBpm = 0;
      return;
    }
    const fastTop = fast[0]!;
    const r = fastTop.bpm / this._bestBpm;
    const diff = r > 1 ? r - 1 : 1 - r;

    const octave = isOctaveRelated(fastTop.bpm, this._bestBpm);

    // Fast agrees with the grid, or disagrees at octave / hard-jump scale → not a drift.
    if (octave || diff <= DRIFT_MIN_FRAC || diff > DRIFT_MAX_FRAC) {
      this._driftHops = 0;
      this._driftBpm = 0;
      return;
    }

    // Diverging within the drift band - accumulate a confirmation streak on a stable target.
    if (this._driftBpm > 0 && Math.abs(fastTop.bpm / this._driftBpm - 1) < DRIFT_AGREE_FRAC) {
      this._driftHops++;
    } else {
      this._driftHops = 1;
    }
    this._driftBpm = fastTop.bpm;

    if (this._driftHops >= DRIFT_CONFIRM_HOPS) {
      const oldBpm = this._bestBpm;
      this._bestBpm = fastTop.bpm;
      this._bestScore = fastTop.score;
      this._driftHops = 0; // restart the streak; the next step must re-confirm
      if (Math.abs(this._bestBpm - oldBpm) / oldBpm > 0.05) {
        this.port.postMessage({ type: 'tempoChange', newTempo: this._bestBpm, oldTempo: oldBpm });
      }
    }
  }

  // Minimum spacing (samples) between two detected onsets. Once a tempo is locked the
  // refractory tracks the beat (a fraction of the IBI); before lock it is a fixed floor.
  private _onsetRefractorySamples(): number {
    const minR = ONSET_MIN_REFRACTORY_SEC * this._sampleRate;
    if (this._bestBpm > 0) {
      const r = ONSET_REFRACTORY_IBI_FRAC * ((60 / this._bestBpm) * this._sampleRate);
      return r > minR ? r : minR;
    }
    return minR;
  }

  // Adaptive onset detection. Normalises the raw flux against a running median/MAD
  // baseline (so soft and hard onsets are comparable), then picks onsets on the UPWARD
  // crossing of an adaptive threshold (the onset attack), gated by a noise floor and an
  // IBI-derived refractory. Updates the per-hop _onsetStrength and the detected-onset
  // stream consumed by the PLL.
  private _detectOnset(flux: number): void {
    // Decaying running flux maximum - the reference level for the noise floor.
    this._fluxPeak *= ONSET_PEAK_DECAY;
    if (flux > this._fluxPeak) this._fluxPeak = flux;

    // Push raw flux into the normalization ring.
    const W = this._onsetWin.length;
    this._onsetWin[this._onsetWinPos] = flux;
    this._onsetWinPos = (this._onsetWinPos + 1) % W;
    if (this._onsetWinCount < W) this._onsetWinCount++;
    const count = this._onsetWinCount;

    // Robust baseline: median of the window, then MAD = median(|x − median|).
    const s = this._onsetSort;
    for (let i = 0; i < count; i++) s[i] = this._onsetWin[i]!;
    partialSort(s, count);
    const median = s[count >> 1]!;
    const d = this._onsetDev;
    for (let j = 0; j < count; j++) {
      const dv = this._onsetWin[j]! - median;
      d[j] = dv < 0 ? -dv : dv;
    }
    partialSort(d, count);
    const mad = d[count >> 1]!;

    // Normalised novelty: deviation above baseline in robust-σ units, with the scale
    // floored at a fraction of the running peak so a clean (MAD≈0) clicktrack still
    // yields a finite, comparable onset strength instead of a divide-by-zero spike.
    const floorScale = ONSET_NOISE_FLOOR_FRAC * this._fluxPeak;
    const madScaled = ONSET_MAD_SCALE * mad;
    let denom = madScaled > floorScale ? madScaled : floorScale;
    if (denom < 1e-9) denom = 1e-9;
    let norm = (flux - median) / denom;
    if (norm < 0) norm = 0;
    this._onsetStrength = norm;

    // Rising-edge onset detection on the normalised novelty: fire on the UPWARD crossing
    // of the adaptive threshold - the onset attack, exactly where the old crude heuristic
    // fired, so the shipped beat-offset behaviour is preserved - gated by the noise floor
    // and an IBI-derived refractory. Zero lookahead latency.
    const noiseFloor = floorScale;
    const refractory = this._onsetRefractorySamples();
    const crossedUp = this._onsetHopCount >= 1 && this._onsetPrev1 <= ONSET_THRESHOLD && norm > ONSET_THRESHOLD;
    const aboveFloor = flux > noiseFloor && flux > ONSET_ABS_FLOOR;
    const pastRefractory = this._lastOnsetSample < 0 || this._sampleCount - this._lastOnsetSample >= refractory;
    if (crossedUp && aboveFloor && pastRefractory) {
      // Sub-hop onset position: linear-interpolate the threshold crossing between the
      // previous hop and this one (stored for the PLL; the onset detector's own grid snap uses the integer
      // hop so the shipped beat-offset numbers are preserved).
      const span = norm - this._onsetPrev1;
      let frac = span > 1e-9 ? (ONSET_THRESHOLD - this._onsetPrev1) / span : 0;
      if (frac < 0) frac = 0;
      else if (frac > 1) frac = 1;
      const onsetSample = this._sampleCount - this._hopSize + frac * this._hopSize;
      this._lastOnsetSample = onsetSample;
      this._onsetRingSamples[this._onsetRingPos] = onsetSample;
      this._onsetRingStrengths[this._onsetRingPos] = norm;
      this._onsetRingPos = (this._onsetRingPos + 1) % this._onsetRingSamples.length;
      if (this._onsetRingCount < this._onsetRingSamples.length) this._onsetRingCount++;
    }

    // Shift history for the next hop.
    this._onsetPrev1 = norm;
    this._onsetHopCount++;
  }

  // Onset CLOSEST to targetSample within ±windowSamples (sub-hop precise, from the onset ring) -
  // the PLL's nearestOnset(): the phase-error reference for the period/phase correction. Using
  // the closest (not the loudest) onset keeps the loop locked to the phase it is tracking; a
  // louder neighbour (e.g. a bright off-beat hat) must not be allowed to yank the grid.
  // Returns the onset sample, or -1 if none.
  private _nearestOnset(targetSample: number, windowSamples: number): number {
    let best = -1;
    let bestDist = windowSamples + 1;
    const cnt = this._onsetRingCount;
    for (let i = 0; i < cnt; i++) {
      const s = this._onsetRingSamples[i]!;
      if (s < 0) continue;
      let d = s - targetSample;
      if (d < 0) d = -d;
      if (d <= windowSamples && d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  // Strongest onset no older than maxAgeSamples (ties → most recent) - the phase anchor for
  // the first beat. Anchoring to the strongest recent transient, rather than merely the
  // latest, biases the bootstrap toward a real beat onset. Always a real onset - never the old
  // arbitrary settling boundary. Returns the anchor sample, or -1 if the ring is empty.
  private _bootstrapOnset(maxAgeSamples: number): number {
    let best = -1;
    let bestStrength = -1;
    const cnt = this._onsetRingCount;
    for (let i = 0; i < cnt; i++) {
      const s = this._onsetRingSamples[i]!;
      if (s < 0 || this._sampleCount - s > maxAgeSamples) continue;
      const st = this._onsetRingStrengths[i]!;
      if (st > bestStrength || (st === bestStrength && s > best)) {
        bestStrength = st;
        best = s;
      }
    }
    return best;
  }

  // Emit exactly one beat at beatSample (samples). Centralises the bar/confidence/lookahead
  // bookkeeping + the provisional→locked promotion + port messages so the PLL and the bootstrap
  // share one emission path. The grid bookkeeping ALWAYS runs (so confidence/IBI history build
  // and the bar grid stays consistent even while provisional beats are suppressed); only the port
  // messages are gated.
  private _emitBeat(beatSample: number, flux: number): void {
    const beatTime = beatSample / this._sampleRate;

    // Update IBI history with the current PLL period.
    this._ibiHistory[this._ibiIdx] = this._ibiSamples;
    this._ibiIdx = (this._ibiIdx + 1) & 3;

    this._beatsSinceStart++;
    this._updateBarPosition(flux);
    this._updateConfidence();
    this._updateLookahead(beatTime);

    // Provisional→locked promotion (latched, one transition per stable segment). Locked needs
    // the SAME evidence the old detector waited for before emitting at all - the full stable
    // window (the AUTHORITATIVE lock) - PLUS LOCK_PROMOTE_BEATS beats sustained on that grid
    // and a confidence floor, so a 'locked' beat is at least as trustworthy as a beat from the original detector.
    if (this._authLocked) {
      this._beatsSinceAuthLock++;
    }
    if (!this._locked && this._authLocked && this._beatsSinceAuthLock >= LOCK_PROMOTE_BEATS && this._confidence >= LOCK_PROMOTE_CONFIDENCE) {
      this._locked = true;
    }
    const status = this._locked ? 'locked' : 'provisional';

    // Provisional gating: when emitProvisionalBeats is false, suppress the message until the
    // beat is locked (grid bookkeeping above already ran). Locked beats always post.
    if (!this._emitProvisionalBeats && !this._locked) return;

    const isDownbeat = this._barPosition === 1;
    this.port.postMessage({
      type: 'beat',
      audioTime: beatTime,
      tempo: this._bestBpm,
      confidence: this._confidence,
      beatPhase: 0,
      energy: flux,
      isDownbeat,
      beatInBar: this._barPosition,
      status,
    });

    if (isDownbeat) {
      this.port.postMessage({
        type: 'barStart',
        audioTime: beatTime,
        tempo: this._bestBpm,
        confidence: this._confidence,
        barNumber: this._barNumber,
      });
    }
  }

  // Bounded PLL beat-phase tracker. Predicts the next beat at lastBeat + ibi, corrects
  // phase + period toward the nearest onset (clamped), and emits exactly one beat per
  // predicted beat. Free-runs on the grid when an onset is missing; coasts (advances the
  // grid but stops emitting) during sustained silence so breaks don't spawn phantom beats.
  private _tickPhase(flux: number): void {
    const acfIbi = (60 / this._bestBpm) * this._sampleRate;

    // Bootstrap: anchor the first beat to a real recent onset (never an arbitrary
    // boundary). Emit it - it is a genuine, just-detected transient - so the leading
    // on-grid beat is not lost to warm-up. If no onset has arrived yet, wait.
    if (this._lastBeatSample < 0) {
      const anchor = this._bootstrapOnset(PLL_BOOTSTRAP_MAX_AGE_IBI * acfIbi);
      if (anchor < 0) return;
      this._ibiSamples = acfIbi;
      this._lastBeatSample = anchor;
      this._emitBeat(anchor, flux);
      return;
    }

    // Keep the PLL period anchored to the ACF tempo: it may track drift within the bounded
    // tempoGain, but a large gap (octave re-lock / tempoChange) re-seeds it so the loop
    // never chases a stale interval. Tempo SELECTION is unchanged - this only refines the
    // local period the phase tracker runs on.
    if (this._ibiSamples <= 0) this._ibiSamples = acfIbi;
    if (Math.abs(this._ibiSamples - acfIbi) > PLL_RESYNC_FRAC * acfIbi) {
      this._ibiSamples = acfIbi;
    }
    const ibi = this._ibiSamples;

    const predicted = this._lastBeatSample + ibi;
    const acceptWin = PLL_ACCEPT_FRAC * ibi;

    // Still early in the beat cycle - wait until we approach the prediction.
    if (this._sampleCount < predicted - acceptWin) return;

    const onset = this._nearestOnset(predicted, acceptWin);

    let beatSample: number;
    if (onset >= 0) {
      // Bounded phase + period correction toward the matched onset.
      const error = onset - predicted;
      const maxPhase = PLL_MAX_PHASE_FRAC * ibi;
      let phaseCorr = error * PLL_PHASE_GAIN;
      if (phaseCorr > maxPhase) phaseCorr = maxPhase;
      else if (phaseCorr < -maxPhase) phaseCorr = -maxPhase;
      const maxTempo = PLL_MAX_TEMPO_FRAC * ibi;
      let ibiCorr = error * PLL_TEMPO_GAIN;
      if (ibiCorr > maxTempo) ibiCorr = maxTempo;
      else if (ibiCorr < -maxTempo) ibiCorr = -maxTempo;
      beatSample = predicted + phaseCorr;
      this._ibiSamples = ibi + ibiCorr;
    } else if (this._sampleCount >= predicted + PLL_FREERUN_FRAC * ibi) {
      // Prediction passed with no matching onset → free-run on the grid (period held).
      beatSample = predicted;
    } else {
      // Inside the accept window with no onset yet - give a late onset a chance next hop.
      return;
    }

    // Advance the grid by exactly one beat.
    this._lastBeatSample = beatSample;

    // Coast gate: after a sustained onset gap (break / silence) keep the grid
    // advancing but STOP emitting - this is what holds the breakDrop false-positive rate
    // down. Onset-rich material never trips it.
    const coasting = this._lastOnsetSample >= 0 && this._sampleCount - this._lastOnsetSample > ONSET_BEAT_COAST_IBI * ibi;
    if (coasting) return;

    this._emitBeat(beatSample, flux);
  }

  private _computeBeatLikelihood(flux: number): number {
    const count = Math.min(this._fluxCount, 32);
    const wp = this._fluxWritePos;
    const len = this._fluxWindow.length;
    let totalFlux = 0;
    for (let i = 0; i < count; i++) {
      totalFlux += this._fluxWindow[(wp - 1 - i + len) % len]!;
    }
    const mean = count > 0 ? totalFlux / count : 1;
    return Math.max(0.5, Math.min(1.5, mean > 0 ? flux / mean : 1));
  }

  private _updateBarPosition(flux: number): void {
    const likelihood = this._computeBeatLikelihood(flux);

    // --- 4/4 posterior ---
    const p4 = this._posterior4;
    const s4 = new Float32Array(4);
    s4[0] = p4[3]!;
    s4[1] = p4[0]!;
    s4[2] = p4[1]!;
    s4[3] = p4[2]!;
    let sum4 = 0;
    for (let i = 0; i < 4; i++) {
      p4[i] = s4[i]! * (likelihood + (i === 0 ? 0.3 : 0));
      sum4 += p4[i]!;
    }
    if (sum4 > 0) {
      for (let i = 0; i < 4; i++) p4[i]! /= sum4;
    }

    // --- 3/4 posterior ---
    const p3 = this._posterior3;
    const s3 = new Float32Array(3);
    s3[0] = p3[2]!;
    s3[1] = p3[0]!;
    s3[2] = p3[1]!;
    let sum3 = 0;
    for (let i = 0; i < 3; i++) {
      p3[i] = s3[i]! * (likelihood + (i === 0 ? 0.3 : 0));
      sum3 += p3[i]!;
    }
    if (sum3 > 0) {
      for (let i = 0; i < 3; i++) p3[i]! /= sum3;
    }

    // --- Update TS confidences (EMA) ---
    let max4 = 0;
    for (let i = 0; i < 4; i++) {
      if (p4[i]! > max4) max4 = p4[i]!;
    }
    let max3 = 0;
    for (let i = 0; i < 3; i++) {
      if (p3[i]! > max3) max3 = p3[i]!;
    }
    const alpha = 0.1;
    this._ts4Confidence = (1 - alpha) * this._ts4Confidence + alpha * max4;
    this._ts3Confidence = (1 - alpha) * this._ts3Confidence + alpha * max3;

    // --- Hysteresis switching ---
    if (this._enableTsDetection && this._beatsSinceStart > 8) {
      const minSwitchMargin = 1.4;
      const minSustainBeats = 12; // ~4 bars * 3 beats
      const threeFavored = this._ts3Confidence > this._ts4Confidence * minSwitchMargin;
      const fourFavored = this._ts4Confidence > this._ts3Confidence * minSwitchMargin;

      if (this._activeTs === '4/4' && threeFavored) {
        this._sustainCounter++;
        if (this._sustainCounter >= minSustainBeats) {
          this._activeTs = '3/4';
          this._sustainCounter = 0;
        }
      } else if (this._activeTs === '3/4' && fourFavored) {
        this._sustainCounter++;
        if (this._sustainCounter >= minSustainBeats + 4) {
          // 16 beats for 4/4
          this._activeTs = '4/4';
          this._sustainCounter = 0;
        }
      } else {
        this._sustainCounter = 0;
      }
    }

    // --- Determine bar position from active TS ---
    const barLen = this._activeTs === '3/4' ? 3 : 4;
    const posterior = this._activeTs === '3/4' ? p3 : p4;

    if (this._beatsSinceStart >= barLen) {
      let maxP = -1;
      let maxI = 0;
      for (let i = 0; i < barLen; i++) {
        if (posterior[i]! > maxP) {
          maxP = posterior[i]!;
          maxI = i;
        }
      }
      const newPos = maxI + 1; // 1-indexed
      if (newPos === 1 && this._barPosition !== 1) {
        this._barNumber++;
      }
      this._barPosition = newPos;
    } else {
      // Just advance sequentially
      this._barPosition = (this._barPosition % barLen) + 1;
      if (this._barPosition === 1) this._barNumber++;
    }
  }

  private _updateConfidence(): void {
    if (this._candidates.length === 0) {
      this._confidence = 0;
      return;
    }

    // Peak contrast
    const top1 = this._candidates[0] ? this._candidates[0].score : 0;
    const top2 = this._candidates[1] ? this._candidates[1].score : top1;
    const top3 = this._candidates[2] ? this._candidates[2].score : top2;
    const peakContrast = top2 + top3 > 0 ? top1 / ((top2 + top3) / 2) : 1;

    // Phase consistency from IBI variance
    let ibiMean = 0;
    for (let i = 0; i < 4; i++) ibiMean += this._ibiHistory[i]!;
    ibiMean /= 4;
    let ibiVar = 0;
    for (let i = 0; i < 4; i++) {
      const d = this._ibiHistory[i]! - ibiMean;
      ibiVar += d * d;
    }
    ibiVar /= 4;
    const phaseConsistency = ibiMean > 0 ? Math.max(0, 1 - ibiVar / (ibiMean * ibiMean)) : 0;

    // Bar consistency (use the active posterior)
    const activePosterior = this._activeTs === '3/4' ? this._posterior3 : this._posterior4;
    const activeLen = this._activeTs === '3/4' ? 3 : 4;
    let maxP = 0;
    for (let i = 0; i < activeLen; i++) {
      if (activePosterior[i]! > maxP) maxP = activePosterior[i]!;
    }
    const barConsistency = maxP;

    const c = Math.sqrt(Math.max(0, peakContrast / 2)) * Math.sqrt(Math.max(0, phaseConsistency)) * (0.5 + 0.5 * barConsistency);
    this._confidence = Math.max(0, Math.min(1, c));
  }

  private _updateLookahead(lastBeatTime: number): void {
    const lookahead: UpcomingBeatInline[] = [];
    const beatInterval = 60 / this._bestBpm;
    const barPos = this._barPosition;
    const barLen = this._activeTs === '3/4' ? 3 : 4;
    for (let i = 0; i < 8; i++) {
      const t = lastBeatTime + (i + 1) * beatInterval;
      const bp = ((barPos - 1 + i) % barLen) + 1;
      lookahead.push({
        audioTime: t,
        tempo: this._bestBpm,
        isDownbeat: bp === 1,
        beatInBar: bp,
      });
    }
    this._lookahead = lookahead;
  }

  private _computeBandEnergy(): BandEnergyInline {
    let low = 0;
    let mid = 0;
    let high = 0;
    for (let b = 0; b < this._lowBandEnd; b++) low += this._melOut[b]!;
    for (let b = this._lowBandEnd; b < this._midBandEnd; b++) mid += this._melOut[b]!;
    for (let b = this._midBandEnd; b < this._melBands; b++) high += this._melOut[b]!;
    const denom = this._lowBandEnd || 1;
    return {
      low: low / denom,
      mid: mid / Math.max(1, this._midBandEnd - this._lowBandEnd),
      high: high / Math.max(1, this._melBands - this._midBandEnd),
    };
  }

  private _sendStateMessage(): void {
    // The state tempo report honours the LOCKED latch (not the old fixed settling window).
    // Provisional early beats drive the visual layer, but tempo/confidence/tempoCandidates
    // and the sync-critical fields stay zero until the detector has a trustworthy locked grid.
    const settled = this._locked;
    const beatInterval = this._bestBpm > 0 ? 60 / this._bestBpm : 0;
    const currentTime = this._sampleCount / this._sampleRate;
    const lastBeatTime = this._lastBeatSample >= 0 ? this._lastBeatSample / this._sampleRate : 0;
    const beatPhase = beatInterval > 0 ? Math.min(1, (currentTime - lastBeatTime) / beatInterval) : 0;
    const nextBeatTime = lastBeatTime + beatInterval;

    let nextDownbeatTime = nextBeatTime;
    for (let i = 0; i < this._lookahead.length; i++) {
      if (this._lookahead[i]!.isDownbeat) {
        nextDownbeatTime = this._lookahead[i]!.audioTime;
        break;
      }
    }

    const be = this._computeBandEnergy();

    this.port.postMessage({
      type: 'state',
      tempo: settled ? this._bestBpm : 0,
      beatPhase,
      confidence: settled ? this._confidence : 0,
      gridStability: settled ? this._confidence : 0,
      tempoCandidates: settled ? this._candidates.map((c) => ({ bpm: c.bpm, score: c.score })) : [],
      rms: this._rms,
      onsetStrength: this._onsetStrength,
      bandEnergy: be,
      barPosition: this._barPosition,
      barLength: this._activeTs === '3/4' ? 3 : 4,
      timeSignature: this._activeTs === '3/4' ? { numerator: 3, denominator: 4 } : { numerator: 4, denominator: 4 },
      lookahead: this._lookahead,
      nextBeatTime: settled ? nextBeatTime : 0,
      nextDownbeatTime: settled ? nextDownbeatTime : 0,
    });
  }
}

registerProcessor('exojs-beat-detector', BeatDetectorProcessor);

export {};
