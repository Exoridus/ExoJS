import {
  type AudioBus,
  getAudioContext,
  isAudioContextReady,
  logger,
  onAudioContextReady,
  registerAudioWorkletProcessor,
  Signal,
  type Voice,
} from '@codexo/exojs';

import { AudioTap } from './AudioTap';
import type { BeatAnalysisDiscontinuity } from './BeatAnalysisDiscontinuity';
import type { BeatSchedule, UpcomingBeat } from './beatScheduleTypes';
import type { ManualMeter, MeterEstimate } from './meterTypes';
import { ReadyGate } from './ReadyGate';
import beatDetectorWorkletSource from './worklets/beat-detector.worklet.ts?worklet';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * What to analyse: a bus or voice (the usual case), a `MediaStream` such as a
 * microphone, or `null` for none yet. A raw `AudioNode` is Web Audio interop
 * for graphs built outside the engine.
 */
export type BeatDetectorSource = AudioBus | Voice | MediaStream | AudioNode | null;

export interface BeatDetectorOptions {
  /** Minimum detectable BPM. Default 50. */
  minBpm?: number;
  /** Maximum detectable BPM. Default 300. */
  maxBpm?: number;
  /** FFT size for onset detection. Default 2048. */
  fftSize?: number;
  /** Hop size in samples between successive FFTs. Default 512. */
  hopSize?: number;
  /**
   * Short tempogram window (seconds) that reacts quickly to a genuine tempo
   * change. Default 2.5. The tracked tempo follows this FAST window only when it
   * disagrees with {@link stableTempoWindowSec} consistently over several
   * analysis hops, so a real DJ drift is tracked without making a steady tempo
   * nervous.
   */
  fastTempoWindowSec?: number;
  /**
   * Long tempogram window (seconds) that holds the tempo grid steady against
   * noise and octave ambiguity. Default 8. Should be ≥ {@link fastTempoWindowSec}
   * and large enough to hold ≳ 2 periods of the slowest tempo; it also sizes the
   * internal flux ring buffer.
   */
  stableTempoWindowSec?: number;
  /**
   * Hops between successive autocorrelation (tempogram) recomputations.
   * Default 15 (~160 ms at 48 kHz with the default 512-sample hop). Lower values
   * react faster to tempo changes at the cost of more CPU.
   */
  acfIntervalHops?: number;
  /**
   * Minimum warm-up (ms) before the first beat may be emitted. Default 400.
   * The detector starts hunting a tempo once this much analysis history exists
   * instead of waiting a full slowest-tempo period, so early {@link BeatInfo}
   * beats (tagged `status: 'provisional'`) arrive with low latency for visual
   * reactivity. A beat is promoted to `status: 'locked'` only once the tempo grid
   * is trustworthy (full analysis window + sustained on-grid tracking). Replaces
   * the former `settlingMs` (default 1500).
   */
  minSettlingMs?: number;
  /**
   * When true (default), early low-confidence beats are emitted tagged
   * `status: 'provisional'` (then promoted to `'locked'`) for snappy visual
   * reactivity. Set false to suppress provisional beats entirely - {@link onBeat}
   * then fires only for `'locked'` beats, matching the pre-provisional behaviour.
   */
  emitProvisionalBeats?: boolean;
  /** Number of mel filterbank bands. Default 24. */
  melBands?: number;
  /**
   * When true (default), estimates three- or four-pulse accent cycles and leaves
   * ambiguous meter unknown. Set false for a fixed four-beat counting convention.
   */
  enableTimeSignatureDetection?: boolean;
  /** Overrides automatic meter with explicit counting context; changing it resets analysis. */
  manualMeter?: ManualMeter | null;
  /**
   * Optional initial source. Equivalent to constructing then assigning
   * `detector.source = value`; provided for ergonomic one-shot construction.
   * The setter remains usable for runtime source switches.
   */
  source?: BeatDetectorSource;
  /**
   * Half-life in seconds for the {@link BeatDetector.pulse} envelope.
   * Default 0.15 - `pulse` halves every 150ms after each beat.
   */
  pulseHalfLife?: number;
  /**
   * Half-life in seconds for the {@link BeatDetector.barPulse} envelope.
   * Default 0.3 - slower than beat pulse for downbeat-emphasized visuals.
   */
  barPulseHalfLife?: number;
  /**
   * Time window in seconds for {@link BeatDetector.justBeat}. Default 0.03
   * - true for the visual frame(s) within 30ms of a beat onset.
   */
  justBeatWindow?: number;
}

export interface BeatInfo {
  /** audioContext.currentTime when the beat occurred. */
  audioTime: number;
  /** BPM at this beat. */
  tempo: number;
  /** Legacy combined confidence, 0..1; not a calibrated probability. */
  confidence: number;
  /** Pulse confidence without the meter factor, 0..1 and uncalibrated. */
  beatConfidence?: number;
  /** Phase within beat (0 = start). */
  beatPhase: number;
  /** Raw spectral novelty of the emission hop, which may follow the matched onset. */
  energy: number;
  /** Matched onset novelty, or null when this beat has no associated onset. */
  onsetEnergy?: number | null;
  /** Matched onset time on the audio-context clock, or null without a match. */
  onsetAudioTime?: number | null;
  /** Is this beat the first in a bar? */
  isDownbeat: boolean;
  /** True when the cycle and its phase are available; false leaves beatInBar as display counting only. */
  meterKnown?: boolean;
  /** Beat position within the bar (1..N). */
  beatInBar: number;
  /**
   * Detection trust level:
   * - `'provisional'` - an early, low-latency beat emitted before the tempo grid
   *   is fully settled. Good for visual reactivity (a "blink"); may be revised.
   * - `'locked'` - the tempo grid passed the detector's settling heuristic.
   *   This does not establish meter accuracy or calibrated confidence.
   */
  status: 'provisional' | 'locked';
}

export interface BarInfo {
  audioTime: number;
  tempo: number;
  confidence: number;
  /** Monotonically increasing bar counter since detector start. */
  barNumber: number;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface TempoCandidate {
  bpm: number;
  /** Peak strength 0..1. */
  score: number;
}

export interface BandEnergy {
  low: number;
  mid: number;
  high: number;
}

const workletName = 'exojs-beat-detector';

const snapshotManualMeter = (value: ManualMeter | null): ManualMeter | null => {
  if (value === null) {
    return null;
  }

  const { cyclePulses } = value;
  const phasePulses = value.phasePulses ?? null;
  const denominator = value.denominator ?? null;

  if (
    !Number.isInteger(cyclePulses) ||
    cyclePulses < 1 ||
    cyclePulses > 32 ||
    (phasePulses !== null && (!Number.isInteger(phasePulses) || phasePulses < 0 || phasePulses >= cyclePulses)) ||
    (denominator !== null &&
      (!Number.isInteger(denominator) || denominator < 1 || denominator > 128 || (denominator & (denominator - 1)) !== 0))
  ) {
    throw new RangeError('Invalid manual meter cycle, phase or denominator');
  }

  return Object.freeze({ cyclePulses, phasePulses, denominator });
};

const acquiringMeter: MeterEstimate = Object.freeze({
  selected: null,
  alternatives: Object.freeze([]),
  score: 0,
  reason: 'acquiring',
  origin: 'estimated',
  evidenceThroughAudioTime: 0,
  validUntilAudioTime: 0,
});
const acquiringManualMeter: MeterEstimate = Object.freeze({ ...acquiringMeter, origin: 'manual' });
const acquiringConventionMeter: MeterEstimate = Object.freeze({ ...acquiringMeter, origin: 'convention' });

/**
 * Real-time tempo + beat tracker. Splits work between the audio-rendering
 * thread (an AudioWorklet that runs onset detection, tempogram analysis,
 * and three-/four-pulse accent-cycle estimation) and the main thread (this
 * class - receives beats, fires Signals, handles configuration and source
 * routing).
 *
 * Accepts a wide range of {@link BeatDetectorSource}s - a bus, an individual
 * {@link Voice}, a raw MediaStream, or any AudioNode - and exposes a Signal
 * for each notable event:
 * - {@link BeatDetector.onBeat} - every detected beat
 * - {@link BeatDetector.onDownbeat} - first beat of each bar
 * - {@link BeatDetector.onBarStart} - bar boundary
 * - {@link BeatDetector.onTempoChange} - when the tracked BPM changes
 * - {@link BeatDetector.onBeatPredicted} - look-ahead schedule notice
 *
 * Early beats arrive with low latency tagged `status: 'provisional'` (after a
 * short `minSettlingMs` warm-up, default 400 ms) for snappy visual reactivity,
 * then promote to `status: 'locked'` once the tempo grid is trustworthy - a
 * single {@link BeatDetector.onBeat} signal carries both via {@link BeatInfo.status}.
 * Set `emitProvisionalBeats: false` to receive only locked beats. Time-signature
 * detection is on by default; ambiguous meter leaves beats available without
 * downbeats. Use a fixed four-beat convention with
 * `enableTimeSignatureDetection: false`.
 */
export class BeatDetector {
  // ---- Signals ----
  public readonly onBeat = new Signal<[BeatInfo]>();
  public readonly onTempoChange = new Signal<[number, number]>();
  public readonly onDownbeat = new Signal<[BeatInfo]>();
  public readonly onBarStart = new Signal<[BarInfo]>();
  /**
   * Dispatched with the first future entry of each new {@link lookahead} schedule.
   *
   * Each revision is announced at most once; queued revisions are not coalesced.
   * An expired schedule or one without a future entry produces no notice.
   * A newer revision supersedes earlier predictions for the same beats.
   */
  public readonly onBeatPredicted = new Signal<[UpcomingBeat]>();

  // ---- Options ----
  // enableTimeSignatureDetection not in Required<> since it has a default; keep as full explicit type
  private readonly _options: Required<BeatDetectorOptions>;

  // ---- Audio plumbing ----
  private _workletNode: AudioWorkletNode | null = null;
  private readonly _tap = new AudioTap();
  private readonly _ready = new ReadyGate('The beat detector was destroyed before it became ready.');
  private _destroyed = false;
  private _epoch = 0;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setup(ctx);
  };

  // ---- Cached state from worklet ----
  private _tempo = 0;
  private _beatPhase = 0;
  private _nextBeatTime = 0;
  private _confidence = 0;
  private _beatConfidence = 0;
  private _phaseConfidence = 0;
  private _gridStability = 0;
  private _analysisTime = 0;
  private _analysisLatency = 0;
  private _tempoCandidates: readonly TempoCandidate[] = [];
  private _rms = 0;
  private _onsetStrength = 0;
  private _bandEnergy: BandEnergy = { low: 0, mid: 0, high: 0 };
  private _barPosition = 1;
  private _barLength = 4;
  private _timeSignature: TimeSignature = { numerator: 4, denominator: 4 };
  private _nextDownbeatTime = 0;
  private _lookahead: readonly UpcomingBeat[] = Object.freeze([]);
  private _beatOnlyLookahead: readonly UpcomingBeat[] = Object.freeze([]);
  private _lookaheadRevision = 0;
  private _scheduleBase: Omit<BeatSchedule, 'beats' | 'nextBeat' | 'nextDownbeat'> | null = null;
  private _scheduleView: BeatSchedule | null = null;
  private _stopReason: 'eof' | 'explicitPause' | null = null;
  private _predictionValidUntil = 0;
  private _meterEstimate: MeterEstimate = acquiringMeter;
  private _expiredMeterEstimate: MeterEstimate = acquiringMeter;
  private readonly _emptyTempoCandidates: readonly TempoCandidate[] = Object.freeze([]);
  private readonly _emptyLookahead: readonly UpcomingBeat[] = Object.freeze([]);

  /**
   * Half-life in seconds for the {@link pulse} envelope. Mutable; default 0.15.
   * Smaller values give a snappier pulse, larger values a longer afterglow.
   */
  public pulseHalfLife: number;

  /** Half-life for the {@link barPulse} envelope. Mutable; default 0.3. */
  public barPulseHalfLife: number;

  /** Time window for {@link justBeat}. Mutable; default 0.03 (30ms). */
  public justBeatWindow: number;

  public constructor(options?: BeatDetectorOptions) {
    this._options = {
      minBpm: options?.minBpm ?? 50,
      maxBpm: options?.maxBpm ?? 300,
      fftSize: options?.fftSize ?? 2048,
      hopSize: options?.hopSize ?? 512,
      fastTempoWindowSec: options?.fastTempoWindowSec ?? 2.5,
      stableTempoWindowSec: options?.stableTempoWindowSec ?? 8,
      acfIntervalHops: options?.acfIntervalHops ?? 15,
      minSettlingMs: options?.minSettlingMs ?? 400,
      emitProvisionalBeats: options?.emitProvisionalBeats ?? true,
      melBands: options?.melBands ?? 24,
      enableTimeSignatureDetection: options?.enableTimeSignatureDetection ?? true,
      manualMeter: snapshotManualMeter(options?.manualMeter ?? null),
      // Visual-state options aren't part of worklet config; cached in the public
      // fields below but kept in the Required<> shape for type completeness.
      source: options?.source ?? null,
      pulseHalfLife: options?.pulseHalfLife ?? 0.15,
      barPulseHalfLife: options?.barPulseHalfLife ?? 0.3,
      justBeatWindow: options?.justBeatWindow ?? 0.03,
    };

    this.pulseHalfLife = this._options.pulseHalfLife;
    this.barPulseHalfLife = this._options.barPulseHalfLife;
    this.justBeatWindow = this._options.justBeatWindow;
    this._clearState();

    if (isAudioContextReady()) {
      this._setup(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }

    if (options?.source !== undefined && options.source !== null) {
      this.source = options.source;
    }
  }

  // -----------------------------------------------------------------------
  // Source setter (polymorphic tap)
  // -----------------------------------------------------------------------

  public get source(): BeatDetectorSource {
    return this._tap.source;
  }

  public set source(value: BeatDetectorSource) {
    if (this._destroyed || value === this._tap.source) {
      return;
    }

    this.notifyDiscontinuity('sourceChange');
    this._tap.source = value;
  }

  public get manualMeter(): ManualMeter | null {
    return this._options.manualMeter;
  }

  /** Snapshots the value and resets analysis. An identical context preserves continuity. */
  public set manualMeter(value: ManualMeter | null) {
    if (this._destroyed) {
      return;
    }

    const next = snapshotManualMeter(value);
    const current = this._options.manualMeter;

    if (
      next?.cyclePulses === current?.cyclePulses &&
      next?.phasePulses === current?.phasePulses &&
      next?.denominator === current?.denominator
    ) {
      return;
    }

    this._options.manualMeter = next;
    this.notifyDiscontinuity(this._stopReason ?? 'reset');
  }

  // -----------------------------------------------------------------------
  // Ready promise
  // -----------------------------------------------------------------------

  /**
   * Resolves once the analysis worklet is loaded and listening. Stays pending
   * while the shared AudioContext is locked. Rejects with the load error when
   * the worklet cannot load, and with an `AbortError` when the detector is
   * destroyed before it became ready.
   */
  public get ready(): Promise<void> {
    return this._ready.promise;
  }

  // -----------------------------------------------------------------------
  // Stage 1 state accessors
  // -----------------------------------------------------------------------

  public get tempo(): number {
    return this._predictionsValid() ? this._tempo : 0;
  }

  public get beatPhase(): number {
    return this._predictionsValid() ? this._beatPhase : 0;
  }

  /** Next predicted future beat on the audio-context clock, or 0 without a valid prediction. */
  public get nextBeatTime(): number {
    if (this._nextBeatTime <= 0 || !this._predictionsValid()) {
      return 0;
    }

    const now = getAudioContext().currentTime;

    return this._nextBeatTime > now ? this._nextBeatTime : (this._lookahead.find(beat => beat.audioTime > now)?.audioTime ?? 0);
  }

  public get confidence(): number {
    return this._predictionsValid() ? this._confidence : 0;
  }

  /**
   * Pulse-grid confidence without the legacy meter factor, 0..1, or 0 without
   * current support. Available during provisional tracking and uncalibrated;
   * it does not change the legacy lock threshold or establish meter accuracy.
   */
  public get beatConfidence(): number {
    return this._predictionsValid() ? this._beatConfidence : 0;
  }

  /** Current onset support for the tracked phase, 0..1 and uncalibrated. */
  public get phaseConfidence(): number {
    return this._predictionsValid() ? this._phaseConfidence : 0;
  }

  /** Legacy alias of confidence, not an independent measure of phase stability. */
  public get gridStability(): number {
    return this._predictionsValid() ? this._gridStability : 0;
  }

  /**
   * The `AudioContext.currentTime` of the newest sample the current state
   * describes. 0 until the first state message arrives.
   *
   * Every timestamp this detector reports - this one, {@link BeatInfo.audioTime},
   * {@link nextBeatTime}, {@link lookahead} - is on the audio context's clock,
   * so `AudioOutputClock` converts them to the `performance.now()` timeline
   * without further correction.
   */
  public get analysisTime(): number {
    return this._analysisTime;
  }

  /**
   * Seconds between {@link analysisTime} and the moment the main thread
   * received that state, measured rather than assumed.
   *
   * Covers the analysis hop and the worklet-to-main-thread delivery together,
   * and is quantised to the context's render-quantum boundary, so treat it as
   * a budget figure rather than an exact age. It says nothing about the output
   * path: what a listener hears lags the analysed audio by the output latency
   * on top, which `AudioOutputClock` reports.
   */
  public get analysisLatency(): number {
    return this._analysisLatency;
  }

  public get rms(): number {
    return this._rms;
  }

  public get onsetStrength(): number {
    return this._onsetStrength;
  }

  public get bandEnergy(): BandEnergy {
    return this._bandEnergy;
  }

  public get tempoCandidates(): readonly TempoCandidate[] {
    return this._predictionsValid() ? this._tempoCandidates : this._emptyTempoCandidates;
  }

  // -----------------------------------------------------------------------
  // Stage 2 state accessors
  // -----------------------------------------------------------------------

  /** Display counting only while {@link meterKnown} is false. */
  public get barPosition(): number {
    return this._barPosition;
  }

  /** Display cycle length; use {@link meterEstimate} for an available estimate. */
  public get barLength(): number {
    return this._barLength;
  }

  /** Legacy display counting; the denominator is manual or defaults to the convention 4. */
  public get timeSignature(): TimeSignature {
    return this._timeSignature;
  }

  /**
   * Immutable interpretation view, including reasons and competing models while
   * abstaining. A null selected model means no cycle; a null selected phase
   * means no downbeat anchor. The notated denominator is never inferred.
   */
  public get meterEstimate(): MeterEstimate {
    const estimate = this._meterEstimate;

    return estimate.validUntilAudioTime > 0 && (!this._predictionsValid() || estimate.validUntilAudioTime <= getAudioContext().currentTime)
      ? this._expiredMeterEstimate
      : estimate;
  }

  public get meterKnown(): boolean {
    const selected = this.meterEstimate.selected;

    return selected !== null && selected.phasePulses !== null;
  }

  /** Current immutable conditional forecast, or null after expiry/reset. Future entries are checked at access time. */
  public get schedule(): BeatSchedule | null {
    if (!this._predictionsValid() || !this._scheduleBase) {
      return null;
    }

    const beats = this.lookahead;
    const now = getAudioContext().currentTime;
    const nextBeat = beats.find(beat => beat.audioTime > now) ?? null;
    const nextDownbeat = beats.find(beat => beat.isDownbeat && beat.audioTime > now) ?? null;
    const validUntilAudioTime = this.meterKnown
      ? Math.min(this._scheduleBase.validUntilAudioTime, this.meterEstimate.validUntilAudioTime)
      : this._scheduleBase.validUntilAudioTime;
    const view = this._scheduleView;

    if (view?.beats === beats && view.nextBeat === nextBeat && view.nextDownbeat === nextDownbeat) {
      return view;
    }

    this._scheduleView = Object.freeze({ ...this._scheduleBase, validUntilAudioTime, beats, nextBeat, nextDownbeat });

    return this._scheduleView;
  }

  /** Next predicted future bar start on the audio-context clock, or 0 when unavailable. */
  public get nextDownbeatTime(): number {
    if (this._nextDownbeatTime <= 0 || !this.meterKnown) {
      return 0;
    }

    const now = getAudioContext().currentTime;

    return this._nextDownbeatTime > now
      ? this._nextDownbeatTime
      : (this._lookahead.find(beat => beat.isDownbeat && beat.audioTime > now)?.audioTime ?? 0);
  }

  /**
   * Audio-context time when the current prediction schedule must be discarded.
   * Returns 0 without a current schedule. Later extrapolated beat times remain
   * conditional on the rhythm continuing; this is not a delivery deadline.
   */
  public get predictionValidUntil(): number {
    return this._predictionsValid() ? this._predictionValidUntil : 0;
  }

  /**
   * The next eight beats, extrapolated from the last tracked beat at the current
   * tempo and numbered from the bar position that follows it. Entries may have
   * passed since delivery. Predictions are conditional on the rhythm continuing;
   * a tempo change or break is not anticipated. Empty after prediction expiry.
   * Unknown or expired meter clears downbeat flags while retaining beat times.
   */
  public get lookahead(): readonly UpcomingBeat[] {
    if (!this._predictionsValid()) {
      return this._emptyLookahead;
    }

    return this.meterKnown ? this._lookahead : this._beatOnlyLookahead;
  }

  // -----------------------------------------------------------------------
  // Visual derived state - pure getters for per-frame polling
  // -----------------------------------------------------------------------

  /**
   * Seconds elapsed since the most recent beat, derived from {@link beatPhase}
   * and {@link tempo}. Returns 0 when the detector hasn't locked yet.
   */
  public get secondsSinceLastBeat(): number {
    if (this.tempo === 0) {
      return 0;
    }

    return this._beatPhase * (60 / this._tempo);
  }

  /**
   * 0..1 envelope, peaks at 1.0 the moment a beat fires and halves every
   * {@link pulseHalfLife} seconds. Drives "pulse on the beat" visuals
   * with a single multiplication: `sprite.scale = 1 + clock.pulse * 0.3`.
   */
  public get pulse(): number {
    if (this.tempo === 0) {
      return 0;
    }

    return Math.pow(0.5, this.secondsSinceLastBeat / this.pulseHalfLife);
  }

  /**
   * Like {@link pulse} but resets on downbeats and decays per
   * {@link barPulseHalfLife}. Useful for emphasizing the first beat of
   * each bar (e.g. brighter flash on "1" vs "2,3,4").
   */
  public get barPulse(): number {
    const selected = this.meterEstimate.selected;

    if (this.tempo === 0 || selected?.phasePulses == null || this._nextBeatTime <= 0) {
      return 0;
    }

    const lastDownbeat = this._nextBeatTime - (selected.phasePulses + 1) * selected.pulsePeriodSeconds;
    const elapsed = Math.max(0, getAudioContext().currentTime - lastDownbeat);

    return Math.pow(0.5, elapsed / this.barPulseHalfLife);
  }

  /**
   * True for the visual frame(s) within {@link justBeatWindow} seconds of
   * a beat onset. Use for one-shot triggers (strobe flash, particle burst,
   * sample retrigger). Default window 30ms covers a typical 60fps frame.
   */
  public get justBeat(): boolean {
    return this.tempo > 0 && this.secondsSinceLastBeat < this.justBeatWindow;
  }

  /**
   * Phase 0..1 within a subdivision of the current beat. `division` is the
   * number of subdivisions per beat: 2 for 8th notes, 4 for 16th notes,
   * 3 for triplets. Use to drive sub-beat-resolution effects:
   *
   *   const sixteenth = clock.subdivisionPhase(4);
   *   if (sixteenth < 0.05) flash();
   */
  public subdivisionPhase(division: number): number {
    if (!Number.isFinite(division) || division <= 0) {
      return 0;
    }

    return (this.beatPhase * division) % 1;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Discards rhythm history and pending predictions. Call after a seek, loop
   * discontinuity or explicit playback interruption on the same source.
   * Assigning a different source resets automatically.
   */
  public reset(): void {
    this.notifyDiscontinuity('reset');
  }

  /**
   * Discards current rhythm evidence immediately. EOF and explicit pause stop
   * analysis until resume, reset or a source identity change. Loops reset phase.
   * Manual configuration persists; the next epoch establishes a new anchor.
   */
  public notifyDiscontinuity(reason: BeatAnalysisDiscontinuity): void {
    if (this._destroyed) {
      return;
    }

    this._epoch++;

    if (reason === 'eof' || reason === 'explicitPause') {
      this._stopReason = reason;
    } else if (reason === 'resume' || reason === 'reset' || reason === 'sourceChange') {
      this._stopReason = null;
    }

    this._clearState();
    this._workletNode?.port.postMessage({
      type: 'reset',
      epoch: this._epoch,
      manualMeter: this._options.manualMeter,
      stopped: this._stopReason !== null,
    });
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    onAudioContextReady.remove(this._onAudioContextReady);

    this._destroyed = true;
    this._clearState();
    this._tap.destroy();
    // Disconnecting alone leaves the processor rendering every quantum until
    // the AudioContext closes; the message lets it return false and be released.
    this._workletNode?.port.postMessage({ type: 'destroy' });

    if (this._workletNode) {
      this._workletNode.port.onmessage = null;
    }

    this._workletNode?.disconnect();
    this._workletNode = null;
    this._ready.abort();
    this.onBeat.clear();
    this.onTempoChange.clear();
    this.onDownbeat.clear();
    this.onBarStart.clear();
    this.onBeatPredicted.clear();
  }

  // -----------------------------------------------------------------------
  // Private helpers - setup
  // -----------------------------------------------------------------------

  private _setup(audioContext: AudioContext): void {
    const opts = this._options;
    // Not stored: the gate turns the outcome into `ready` on demand, so a load
    // failure nobody awaits raises no unhandled rejection.
    void registerAudioWorkletProcessor(audioContext, workletName, beatDetectorWorkletSource).then(
      () => {
        // Destroyed while the module loaded: a node created now would never be released.
        if (this._destroyed) {
          return;
        }

        const node = new AudioWorkletNode(audioContext, workletName, {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          processorOptions: {
            epoch: this._epoch,
            fftSize: opts.fftSize,
            hopSize: opts.hopSize,
            minBpm: opts.minBpm,
            maxBpm: opts.maxBpm,
            melBands: opts.melBands,
            minSettlingMs: opts.minSettlingMs,
            emitProvisionalBeats: opts.emitProvisionalBeats,
            fastTempoWindowSec: opts.fastTempoWindowSec,
            stableTempoWindowSec: opts.stableTempoWindowSec,
            acfIntervalHops: opts.acfIntervalHops,
            enableTimeSignatureDetection: opts.enableTimeSignatureDetection,
            manualMeter: opts.manualMeter,
            stopped: this._stopReason !== null,
          },
        });

        this._workletNode = node;
        node.port.onmessage = this._onWorkletMessage.bind(this);

        this._tap.attach(node, audioContext);
        this._ready.resolve();
      },
      (error: unknown) => {
        logger.warn(`BeatDetector: the analysis worklet "${workletName}" failed to load; no beats will be detected.`, {
          source: 'BeatDetector',
          once: `beatdetector-load-failed:${workletName}`,
          ...(error instanceof Error && { error }),
        });
        this._ready.fail(error);
      },
    );
  }

  private _onWorkletMessage(event: MessageEvent): void {
    const message = event.data as Record<string, unknown>;
    const epoch = (message.epoch as number | undefined) ?? 0;

    if (this._destroyed || epoch !== this._epoch || (this._stopReason !== null && message.type !== 'reset')) {
      return;
    }

    switch (message.type) {
      case 'reset':
        this._clearState();
        break;

      case 'state':
        this._predictionValidUntil = (message.predictionValidUntil as number) ?? 0;

        if (message.meterEstimate) {
          const estimate = message.meterEstimate as MeterEstimate;
          this._meterEstimate = Object.freeze({
            ...estimate,
            selected: estimate.selected ? Object.freeze(estimate.selected) : null,
            alternatives: Object.freeze(
              estimate.alternatives.map(candidate => Object.freeze({ ...candidate, model: Object.freeze(candidate.model) })),
            ),
          });
          this._expiredMeterEstimate = Object.freeze({
            ...this._meterEstimate,
            selected: null,
            alternatives: acquiringMeter.alternatives,
            score: 0,
            reason: 'expired',
          });
        } else {
          this._meterEstimate = acquiringMeter;
          this._expiredMeterEstimate = acquiringMeter;
        }

        this._analysisTime = (message.analysisTime as number) ?? 0;
        this._analysisLatency = Math.max(0, (this._workletNode?.context.currentTime ?? this._analysisTime) - this._analysisTime);
        this._tempo = (message.tempo as number) ?? 0;
        this._beatPhase = (message.beatPhase as number) ?? 0;
        this._nextBeatTime = (message.nextBeatTime as number) ?? 0;
        this._nextDownbeatTime = (message.nextDownbeatTime as number) ?? 0;
        this._confidence = (message.confidence as number) ?? 0;
        this._beatConfidence = (message.beatConfidence as number) ?? 0;
        this._phaseConfidence = (message.phaseConfidence as number) ?? 0;
        this._gridStability = (message.gridStability as number) ?? 0;
        this._tempoCandidates = Object.freeze((message.tempoCandidates as TempoCandidate[]) ?? []);
        this._rms = (message.rms as number) ?? 0;
        this._onsetStrength = (message.onsetStrength as number) ?? 0;
        this._bandEnergy = (message.bandEnergy as BandEnergy) ?? { low: 0, mid: 0, high: 0 };
        this._barPosition = (message.barPosition as number) ?? 1;
        this._barLength = (message.barLength as number) ?? 4;
        this._timeSignature = (message.timeSignature as TimeSignature) ?? { numerator: 4, denominator: 4 };

        {
          const lookahead = (message.lookahead as UpcomingBeat[]) ?? [];
          const revision = (message.lookaheadRevision as number) ?? 0;
          this._lookahead = Object.freeze(lookahead.map(beat => Object.freeze(beat)));
          this._beatOnlyLookahead = Object.freeze(lookahead.map(beat => Object.freeze({ ...beat, isDownbeat: false, meterKnown: false })));
          this._scheduleBase = {
            epoch,
            revision,
            generatedAtAudioTime: (message.predictionGeneratedAtAudioTime as number) ?? this._analysisTime,
            evidenceThroughAudioTime: (message.predictionEvidenceThroughAudioTime as number) ?? this._analysisTime,
            validUntilAudioTime: this._predictionValidUntil,
            horizonAudioTime: lookahead.at(-1)?.audioTime ?? 0,
            pulsePeriodSeconds: (message.predictionPulsePeriodSeconds as number) ?? 0,
            status: (message.predictionStatus as BeatSchedule['status']) ?? 'provisional',
          };
          this._scheduleView = null;

          if (revision !== this._lookaheadRevision) {
            this._lookaheadRevision = revision;
            const upcoming = this.lookahead.find(beat => beat.audioTime > getAudioContext().currentTime);

            if (upcoming) {
              this.onBeatPredicted.dispatch(upcoming);
            }
          }
        }

        break;

      case 'beat': {
        const bi: BeatInfo = {
          audioTime: message.audioTime as number,
          tempo: message.tempo as number,
          confidence: message.confidence as number,
          beatConfidence: (message.beatConfidence as number) ?? 0,
          onsetEnergy: (message.onsetEnergy as number | null) ?? null,
          onsetAudioTime: (message.onsetAudioTime as number | null) ?? null,
          beatPhase: message.beatPhase as number,
          energy: message.energy as number,
          meterKnown: (message.meterKnown as boolean | undefined) ?? false,
          isDownbeat: message.isDownbeat as boolean,
          beatInBar: message.beatInBar as number,
          status: (message.status as 'provisional' | 'locked' | undefined) ?? 'locked',
        };
        this.onBeat.dispatch(bi);

        if (bi.isDownbeat && !this._destroyed && epoch === this._epoch) {
          this.onDownbeat.dispatch(bi);
        }

        break;
      }

      case 'tempoChange':
        this.onTempoChange.dispatch(message.newTempo as number, message.oldTempo as number);
        break;

      case 'barStart': {
        const info: BarInfo = {
          audioTime: message.audioTime as number,
          tempo: message.tempo as number,
          confidence: message.confidence as number,
          barNumber: message.barNumber as number,
        };
        this.onBarStart.dispatch(info);
        break;
      }
    }
  }

  private _clearState(): void {
    this._meterEstimate = acquiringMeter;

    if (this._options.manualMeter) {
      this._meterEstimate = acquiringManualMeter;
    } else if (!this._options.enableTimeSignatureDetection) {
      this._meterEstimate = acquiringConventionMeter;
    }

    this._expiredMeterEstimate = this._meterEstimate;
    this._predictionValidUntil = 0;
    this._tempo = 0;
    this._beatPhase = 0;
    this._nextBeatTime = 0;
    this._nextDownbeatTime = 0;
    this._confidence = 0;
    this._beatConfidence = 0;
    this._phaseConfidence = 0;
    this._gridStability = 0;
    this._analysisTime = 0;
    this._analysisLatency = 0;
    this._tempoCandidates = [];
    this._rms = 0;
    this._onsetStrength = 0;
    this._bandEnergy = { low: 0, mid: 0, high: 0 };
    this._barPosition = 1;
    this._barLength = 4;
    this._timeSignature = { numerator: 4, denominator: 4 };
    this._lookahead = [];
    this._beatOnlyLookahead = [];
    this._lookaheadRevision = 0;
    this._scheduleBase = null;
    this._scheduleView = null;
  }

  private _predictionsValid(): boolean {
    return !this._destroyed && this._predictionValidUntil > 0 && this._predictionValidUntil > getAudioContext().currentTime;
  }

  // -----------------------------------------------------------------------
  // Private helpers - source tap
  // -----------------------------------------------------------------------
}
