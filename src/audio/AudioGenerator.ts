import { clamp } from '#math/utils';

import { getAudioContext, isAudioContextReady } from './audio-context';
import { AudioGeneratorVoice } from './AudioGeneratorVoice';
import type { AudioManager } from './AudioManager';
import type { Envelope } from './Envelope';
import { NoopVoice } from './NoopVoice';
import type { Playable, PlayOptions, Voice } from './Playable';
import { SoundPoolStrategy } from './Sound';

export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle';

/** Construction options for {@link AudioGenerator}. */
export interface AudioGeneratorOptions {
  /** Oscillator frequency in Hz. Default 440 (A4). */
  frequency?: number;
  /** Oscillator waveform. Default `'sine'`. */
  type?: OscillatorType;
  /** Pitch detune in cents. Default 0. */
  detune?: number;
  /** Optional ADSR envelope. Default `null` (no envelope). */
  envelope?: Envelope | null;
  /** Default volume applied to new voices. Range [0, 1]. Default 1. */
  volume?: number;
  /** Default muted flag (starts a voice at volume 0). Default false. */
  muted?: boolean;
  /** Maximum concurrent voices. Default 8. */
  poolSize?: number;
  /** Eviction strategy when the pool is full. Default `FirstInFirstOut`. */
  poolStrategy?: SoundPoolStrategy;
  /** Priority for the `LowestPriority` strategy. Default 0. */
  priority?: number;
}

/** Internal record tracking an active voice for pool management. */
interface PooledGeneratorVoice {
  readonly voice: AudioGeneratorVoice;
  readonly startedAt: number;
}

/**
 * Procedural tone generator — produces audio from an `OscillatorNode` without
 * any decoded asset. Good for prototyping, game-jam SFX, retro bleeps, and
 * synth-style tones.
 *
 * `AudioGenerator` is a **data descriptor**: it holds the current synth settings
 * (`frequency`, `type`, `detune`, `envelope`) and default playback parameters.
 * Each `AudioManager.play(generator, options)` snapshots those settings into a
 * fresh {@link AudioGeneratorVoice} and returns it. For per-note playback, set
 * `generator.frequency` (or use {@link AudioGenerator.setNote}) before playing:
 *
 * ```ts
 * generator.setNote(69);            // A4
 * const voice = app.audio.play(generator);
 * // ...later
 * voice.frequency = 880;            // retune the live voice
 * voice.stop();                     // triggers the envelope release, if any
 * ```
 *
 * Routes through the manager's `sound` bus by default.
 */
export class AudioGenerator implements Playable {
  /** Current oscillator frequency in Hz. Snapshotted into each new voice. */
  public frequency: number;
  /** Current oscillator waveform. */
  public type: OscillatorType;
  /** Current pitch detune in cents. */
  public detune: number;
  /** Optional ADSR envelope applied to each voice. */
  public envelope: Envelope | null;
  /** Default volume for new voices. Range [0, 1]. */
  public volume: number;
  /** Default muted flag (starts a voice at volume 0). */
  public muted: boolean;

  private _poolSize: number;
  private _poolStrategy: SoundPoolStrategy;
  /** Priority for the `LowestPriority` eviction strategy. */
  public priority: number;

  private readonly _activeVoices: PooledGeneratorVoice[] = [];

  public get poolSize(): number {
    return this._poolSize;
  }

  public set poolSize(value: number) {
    this._poolSize = Math.max(1, Math.floor(value));
  }

  public get poolStrategy(): SoundPoolStrategy {
    return this._poolStrategy;
  }

  public set poolStrategy(value: SoundPoolStrategy) {
    this._poolStrategy = value;
  }

  public constructor(options: AudioGeneratorOptions = {}) {
    this.frequency = options.frequency ?? 440;
    this.type = options.type ?? 'sine';
    this.detune = options.detune ?? 0;
    this.envelope = options.envelope ?? null;
    this.volume = clamp(options.volume ?? 1, 0, 1);
    this.muted = options.muted ?? false;

    this._poolSize = Math.max(1, Math.floor(options.poolSize ?? 8));
    this._poolStrategy = options.poolStrategy ?? SoundPoolStrategy.FirstInFirstOut;
    this.priority = options.priority ?? 0;
  }

  /** Set {@link AudioGenerator.frequency} from a MIDI note number (69 = A4 = 440 Hz). */
  public setNote(midiNote: number): this {
    this.frequency = AudioGenerator.midiToFrequency(midiNote);
    return this;
  }

  /** Frequency in Hz for a MIDI note number, without mutating the generator. */
  public static midiToFrequency(midiNote: number): number {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Implements {@link Playable}. Called by {@link AudioManager.play}.
   *
   * Snapshots the current synth settings into a new {@link AudioGeneratorVoice}.
   * Returns an already-ended {@link NoopVoice} when the `AudioContext` is still
   * locked by the autoplay policy — oscillators are ephemeral and cannot be
   * deferred.
   */
  public _createVoice(manager: AudioManager, options: PlayOptions): Voice {
    const bus = options.bus ?? manager.sound;

    if (!isAudioContextReady()) {
      return new NoopVoice(bus);
    }

    this._pruneEndedVoices();

    if (this._activeVoices.length >= this._poolSize) {
      const victimIndex = this._pickEvictionVictim();
      const victim = this._activeVoices[victimIndex];
      if (victim) {
        this._activeVoices.splice(victimIndex, 1);
        victim.voice.stop();
      }
    }

    const audioContext = getAudioContext();
    const output = audioContext.createGain();
    const detune = options.detune ?? this.detune;
    const volume = clamp(options.muted ? 0 : (options.volume ?? (this.muted ? 0 : this.volume)), 0, 1);

    const voice = new AudioGeneratorVoice({
      audioContext,
      output,
      bus,
      manager,
      volume,
      frequency: this.frequency,
      type: this.type,
      detune,
      envelope: this.envelope,
    });

    const pooled: PooledGeneratorVoice = { voice, startedAt: audioContext.currentTime };
    voice.onEnd.add((): void => {
      const index = this._activeVoices.indexOf(pooled);
      if (index !== -1) {
        this._activeVoices.splice(index, 1);
      }
    });
    this._activeVoices.push(pooled);

    return voice;
  }

  /** Stop every currently active voice from this generator. */
  public stopAll(): this {
    const voices = [...this._activeVoices];
    this._activeVoices.length = 0;
    for (const pooled of voices) {
      pooled.voice.stop();
    }
    return this;
  }

  /** Stop all active voices. */
  public destroy(): void {
    this.stopAll();
  }

  private _pruneEndedVoices(): void {
    for (let i = this._activeVoices.length - 1; i >= 0; i--) {
      if (this._activeVoices[i]?.voice.ended === true) {
        this._activeVoices.splice(i, 1);
      }
    }
  }

  private _pickEvictionVictim(): number {
    if (this._poolStrategy === SoundPoolStrategy.LeastRecentlyUsed) {
      // Oscillators are open-ended, so "closest to end" degenerates to oldest.
      let oldest = 0;
      let oldestTime = Infinity;
      for (let i = 0; i < this._activeVoices.length; i++) {
        const pooled = this._activeVoices[i];
        if (pooled !== undefined && pooled.startedAt < oldestTime) {
          oldestTime = pooled.startedAt;
          oldest = i;
        }
      }
      return oldest;
    }
    // FirstInFirstOut and LowestPriority (shared priority) → oldest.
    return 0;
  }
}
