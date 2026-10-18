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
   * When true (default), the worklet runs parallel 3/4 and 4/4 posteriors and
   * switches active time signature via hysteresis. Set false to lock to 4/4.
   */
  enableTimeSignatureDetection?: boolean;
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
  /** Confidence 0..1. */
  confidence: number;
  /** Phase within beat (0 = start). */
  beatPhase: number;
  /** Novelty/onset strength at the beat. */
  energy: number;
  /** Is this beat the first in a bar? */
  isDownbeat: boolean;
  /** Beat position within the bar (1..N). */
  beatInBar: number;
  /**
   * Detection trust level:
   * - `'provisional'` - an early, low-latency beat emitted before the tempo grid
   *   is fully settled. Good for visual reactivity (a "blink"); may be revised.
   * - `'locked'` - the tempo grid is settled and trustworthy. Safe for
   *   sync-critical use. Each stable segment yields exactly one provisional→locked
   *   transition.
   */
  status: 'provisional' | 'locked';
}

export interface UpcomingBeat {
  audioTime: number;
  tempo: number;
  isDownbeat: boolean;
  beatInBar: number;
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

/**
 * Real-time tempo + beat tracker. Splits work between the audio-rendering
 * thread (an AudioWorklet that runs onset detection, tempogram analysis,
 * and parallel 3/4 and 4/4 posterior estimation) and the main thread (this
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
 * detection (3/4 vs 4/4) is on by default; lock to 4/4 by setting
 * `enableTimeSignatureDetection: false`.
 */
export class BeatDetector {
  // ---- Signals ----
  public readonly onBeat = new Signal<[BeatInfo]>();
  public readonly onTempoChange = new Signal<[number, number]>();
  public readonly onDownbeat = new Signal<[BeatInfo]>();
  public readonly onBarStart = new Signal<[BarInfo]>();
  public readonly onBeatPredicted = new Signal<[UpcomingBeat]>();

  // ---- Options ----
  // enableTimeSignatureDetection not in Required<> since it has a default; keep as full explicit type
  private readonly _options: Required<BeatDetectorOptions>;

  // ---- Audio plumbing ----
  private _workletNode: AudioWorkletNode | null = null;
  private readonly _tap = new AudioTap();
  private readonly _ready = new ReadyGate('The beat detector was destroyed before it became ready.');
  private _destroyed = false;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setup(ctx);
  };

  // ---- Cached state from worklet ----
  private _tempo = 0;
  private _beatPhase = 0;
  private _nextBeatTime = 0;
  private _confidence = 0;
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
    this._tap.source = value;
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
    return this._tempo;
  }

  public get beatPhase(): number {
    return this._beatPhase;
  }

  public get nextBeatTime(): number {
    return this._nextBeatTime;
  }

  public get confidence(): number {
    return this._confidence;
  }

  /**
   * How well recent onsets support the beat grid's phase, 0 to 1, or 0 before
   * the grid locks.
   *
   * Distinct from {@link confidence}, which reports how sure the detector is of
   * the tempo. A metronomic loop at a wrong-by-an-octave tempo reads high
   * confidence and high phase confidence; a rubato passage at a known tempo
   * reads high confidence and low phase confidence. Gate anything that must
   * land exactly on the beat - a scored hit, a quantised trigger - on this
   * rather than on {@link confidence}.
   */
  public get phaseConfidence(): number {
    return this._phaseConfidence;
  }

  public get gridStability(): number {
    return this._gridStability;
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
    return this._tempoCandidates;
  }

  // -----------------------------------------------------------------------
  // Stage 2 state accessors
  // -----------------------------------------------------------------------

  public get barPosition(): number {
    return this._barPosition;
  }

  public get barLength(): number {
    return this._barLength;
  }

  public get timeSignature(): TimeSignature {
    return this._timeSignature;
  }

  public get nextDownbeatTime(): number {
    return this._nextDownbeatTime;
  }

  public get lookahead(): readonly UpcomingBeat[] {
    return this._lookahead;
  }

  // -----------------------------------------------------------------------
  // Visual derived state - pure getters for per-frame polling
  // -----------------------------------------------------------------------

  /**
   * Seconds elapsed since the most recent beat, derived from {@link beatPhase}
   * and {@link tempo}. Returns 0 when the detector hasn't locked yet.
   */
  public get secondsSinceLastBeat(): number {
    if (this._tempo === 0) {
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
    if (this._tempo === 0) {
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
    if (this._tempo === 0 || this._barLength === 0) {
      return 0;
    }

    const secondsPerBeat = 60 / this._tempo;
    const lastDownbeat = this._nextDownbeatTime - this._barLength * secondsPerBeat;
    const elapsed = Math.max(0, getAudioContext().currentTime - lastDownbeat);

    return Math.pow(0.5, elapsed / this.barPulseHalfLife);
  }

  /**
   * True for the visual frame(s) within {@link justBeatWindow} seconds of
   * a beat onset. Use for one-shot triggers (strobe flash, particle burst,
   * sample retrigger). Default window 30ms covers a typical 60fps frame.
   */
  public get justBeat(): boolean {
    return this._tempo > 0 && this.secondsSinceLastBeat < this.justBeatWindow;
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

    return (this._beatPhase * division) % 1;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  public destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);

    this._destroyed = true;
    this._tap.destroy();
    // Disconnecting alone leaves the processor rendering every quantum until
    // the AudioContext closes; the message lets it return false and be released.
    this._workletNode?.port.postMessage({ type: 'destroy' });
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

    switch (message.type) {
      case 'state':
        this._analysisTime = (message.analysisTime as number) ?? 0;
        this._analysisLatency = Math.max(0, (this._workletNode?.context.currentTime ?? this._analysisTime) - this._analysisTime);
        this._tempo = (message.tempo as number) ?? 0;
        this._beatPhase = (message.beatPhase as number) ?? 0;
        this._nextBeatTime = (message.nextBeatTime as number) ?? 0;
        this._nextDownbeatTime = (message.nextDownbeatTime as number) ?? 0;
        this._confidence = (message.confidence as number) ?? 0;
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
          this._lookahead = Object.freeze(lookahead);

          if (lookahead.length > 0) {
            this.onBeatPredicted.dispatch(lookahead[0]!);
          }
        }

        break;

      case 'beat': {
        const bi: BeatInfo = {
          audioTime: message.audioTime as number,
          tempo: message.tempo as number,
          confidence: message.confidence as number,
          beatPhase: message.beatPhase as number,
          energy: message.energy as number,
          isDownbeat: message.isDownbeat as boolean,
          beatInBar: message.beatInBar as number,
          status: (message.status as 'provisional' | 'locked' | undefined) ?? 'locked',
        };
        this.onBeat.dispatch(bi);

        if (bi.isDownbeat) {
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

  // -----------------------------------------------------------------------
  // Private helpers - source tap
  // -----------------------------------------------------------------------
}
