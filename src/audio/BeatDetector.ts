import { getAudioContext, isAudioContextReady, onAudioContextReady } from '@/audio/audio-context';
import type { AudioBus } from '@/audio/AudioBus';
import type { Music } from '@/audio/Music';
import type { Sound } from '@/audio/Sound';
import { beatDetectorWorkletSource } from '@/audio/worklets/beat-detector.worklet';
import { registerWorkletProcessor } from '@/audio/worklet/registerWorklet';
import { Signal } from '@/core/Signal';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type BeatDetectorSource = AudioBus | Sound | Music | MediaStream | AudioNode | null;

export interface BeatDetectorOptions {
  /** Minimum detectable BPM. Default 50. */
  minBpm?: number;
  /** Maximum detectable BPM. Default 250. */
  maxBpm?: number;
  /** FFT size for onset detection. Default 2048. */
  fftSize?: number;
  /** Hop size in samples between successive FFTs. Default 512. */
  hopSize?: number;
  /** Sliding window duration for tempogram (seconds). Default 6. */
  tempoWindowSec?: number;
  /** Initial suppression period before beats are emitted (ms). Default 1500. */
  settlingMs?: number;
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
   * Default 0.15 — `pulse` halves every 150ms after each beat.
   */
  pulseHalfLife?: number;
  /**
   * Half-life in seconds for the {@link BeatDetector.barPulse} envelope.
   * Default 0.3 — slower than beat pulse for downbeat-emphasized visuals.
   */
  barPulseHalfLife?: number;
  /**
   * Time window in seconds for {@link BeatDetector.justBeat}. Default 0.03
   * — true for the visual frame(s) within 30ms of a beat onset.
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
 * class — receives beats, fires Signals, handles configuration and source
 * routing).
 *
 * Accepts a wide range of {@link BeatDetectorSource}s — bus, individual
 * sound/music, raw MediaStream, or any AudioNode — and exposes a Signal
 * for each notable event:
 * - {@link BeatDetector.onBeat} — every detected beat
 * - {@link BeatDetector.onDownbeat} — first beat of each bar
 * - {@link BeatDetector.onBarStart} — bar boundary
 * - {@link BeatDetector.onTempoChange} — when the tracked BPM changes
 * - {@link BeatDetector.onBeatPredicted} — look-ahead schedule notice
 *
 * Detection is delayed by `settlingMs` (default 1500 ms) after a new
 * source is attached; this prevents spurious beats during the algorithm's
 * warm-up. Time-signature detection (3/4 vs 4/4) is on by default; lock
 * to 4/4 by setting `enableTimeSignatureDetection: false`.
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
  private _source: BeatDetectorSource = null;
  private _tapSource: AudioNode | null = null;
  private _streamSource: MediaStreamAudioSourceNode | null = null;
  private _ready: Promise<void> | null = null;
  private _pendingSourceSetup: ((ctx: AudioContext) => void) | null = null;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setup(ctx);
  };

  // ---- Cached state from worklet ----
  private _tempo = 0;
  private _beatPhase = 0;
  private _nextBeatTime = 0;
  private _confidence = 0;
  private _gridStability = 0;
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
      maxBpm: options?.maxBpm ?? 250,
      fftSize: options?.fftSize ?? 2048,
      hopSize: options?.hopSize ?? 512,
      tempoWindowSec: options?.tempoWindowSec ?? 6,
      settlingMs: options?.settlingMs ?? 1500,
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
    return this._source;
  }

  public set source(value: BeatDetectorSource) {
    if (value === this._source) return;

    this._disconnectTap();
    this._source = value;

    if (value === null) return;

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
  // Ready promise
  // -----------------------------------------------------------------------

  public get ready(): Promise<void> {
    return this._ready ?? Promise.resolve();
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
  public get gridStability(): number {
    return this._gridStability;
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
  // Visual derived state — pure getters for per-frame polling
  // -----------------------------------------------------------------------

  /**
   * Seconds elapsed since the most recent beat, derived from {@link beatPhase}
   * and {@link tempo}. Returns 0 when the detector hasn't locked yet.
   */
  public get secondsSinceLastBeat(): number {
    if (this._tempo === 0) return 0;
    return this._beatPhase * (60 / this._tempo);
  }

  /**
   * 0..1 envelope, peaks at 1.0 the moment a beat fires and halves every
   * {@link pulseHalfLife} seconds. Drives "pulse on the beat" visuals
   * with a single multiplication: `sprite.scale = 1 + clock.pulse * 0.3`.
   */
  public get pulse(): number {
    if (this._tempo === 0) return 0;
    return Math.pow(0.5, this.secondsSinceLastBeat / this.pulseHalfLife);
  }

  /**
   * Like {@link pulse} but resets on downbeats and decays per
   * {@link barPulseHalfLife}. Useful for emphasizing the first beat of
   * each bar (e.g. brighter flash on "1" vs "2,3,4").
   */
  public get barPulse(): number {
    if (this._tempo === 0 || this._barLength === 0) return 0;
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
    if (!Number.isFinite(division) || division <= 0) return 0;
    return (this._beatPhase * division) % 1;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  public destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);

    if (this._pendingSourceSetup !== null) {
      onAudioContextReady.remove(this._pendingSourceSetup);
      this._pendingSourceSetup = null;
    }
    this._disconnectTap();
    this._workletNode?.disconnect();
    this._workletNode = null;
    this._ready = null;
    this.onBeat.clear();
    this.onTempoChange.clear();
    this.onDownbeat.clear();
    this.onBarStart.clear();
    this.onBeatPredicted.clear();
  }

  // -----------------------------------------------------------------------
  // Private helpers — setup
  // -----------------------------------------------------------------------

  private _setup(audioContext: AudioContext): void {
    const opts = this._options;
    this._ready = registerWorkletProcessor(audioContext, workletName, beatDetectorWorkletSource).then(() => {
      const node = new AudioWorkletNode(audioContext, workletName, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        processorOptions: {
          fftSize: opts.fftSize,
          hopSize: opts.hopSize,
          minBpm: opts.minBpm,
          maxBpm: opts.maxBpm,
          melBands: opts.melBands,
          settlingMs: opts.settlingMs,
          tempoWindowSec: opts.tempoWindowSec,
          enableTimeSignatureDetection: opts.enableTimeSignatureDetection,
        },
      });

      this._workletNode = node;
      node.port.onmessage = this._onWorkletMessage.bind(this);

      // If a source was set before worklet was ready, connect it now.
      if (this._source !== null) {
        this._connectSource(this._source, audioContext);
      }
    });
  }

  private _onWorkletMessage(event: MessageEvent): void {
    const message = event.data as Record<string, unknown>;
    switch (message.type) {
      case 'state':
        this._tempo = (message.tempo as number) ?? 0;
        this._beatPhase = (message.beatPhase as number) ?? 0;
        this._nextBeatTime = (message.nextBeatTime as number) ?? 0;
        this._nextDownbeatTime = (message.nextDownbeatTime as number) ?? 0;
        this._confidence = (message.confidence as number) ?? 0;
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
            this.onBeatPredicted.dispatch(lookahead[0]);
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
        };
        this.onBeat.dispatch(bi);
        if (bi.isDownbeat) this.onDownbeat.dispatch(bi);
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
  // Private helpers — source tap
  // -----------------------------------------------------------------------

  private _connectSource(source: BeatDetectorSource, audioContext: AudioContext): void {
    if (!this._workletNode) return;

    const tap = this._resolveToAudioNode(source, audioContext);
    if (!tap) {
      this._deferConnectionViaBus(source);
      return;
    }

    this._tapSource = tap;
    tap.connect(this._workletNode, 0, 0);
  }

  private _resolveToAudioNode(source: BeatDetectorSource, audioContext: AudioContext): AudioNode | null {
    if (source === null) return null;

    // MediaStream — duck-type via getTracks
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

    // AudioBus — has _getOutputNode (checked before raw AudioNode)
    const asBus = source as Partial<{ _getOutputNode: () => AudioNode | null }>;
    if (typeof asBus._getOutputNode === 'function') {
      return asBus._getOutputNode();
    }

    // Sound / Music — has analyserTarget
    const asMedia = source as Partial<{ analyserTarget: AudioNode | null }>;
    if ('analyserTarget' in asMedia) {
      return asMedia.analyserTarget ?? null;
    }

    // Raw AudioNode — duck-type: has connect & disconnect
    const asNode = source as Partial<{ connect: unknown; disconnect: unknown }>;
    if (typeof asNode.connect === 'function' && typeof asNode.disconnect === 'function') {
      return source as unknown as AudioNode;
    }

    return null;
  }

  private _deferConnectionViaBus(source: BeatDetectorSource): void {
    const asBus = source as Partial<{ onceSetup: (callback: () => void) => void }>;
    if (typeof asBus.onceSetup === 'function') {
      asBus.onceSetup(() => {
        if (this._source === source && this._workletNode && isAudioContextReady()) {
          this._connectSource(source, getAudioContext());
        }
      });
      return;
    }

    onAudioContextReady.once(() => {
      if (this._source === source && this._workletNode && isAudioContextReady()) {
        this._connectSource(source, getAudioContext());
      }
    });
  }

  private _disconnectTap(): void {
    if (this._tapSource && this._workletNode) {
      try {
        this._tapSource.disconnect(this._workletNode);
      } catch {
        // Ignore
      }
    }
    this._tapSource = null;

    if (this._streamSource) {
      this._streamSource.disconnect();
      this._streamSource = null;
    }
  }
}
