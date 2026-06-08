import type { PlaybackOptions } from '#core/types';
import { clamp } from '#math/utils';

import { AbstractMedia } from './AbstractMedia';
import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audio-context';
import type { AudioBus } from './AudioBus';
import { getAudioManager } from './AudioManager';
import type { Envelope } from './Envelope';
import { SoundPoolStrategy } from './Sound';

export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface OscillatorSoundOptions extends Partial<PlaybackOptions> {
  frequency?: number; // Hz, default 440 (A4)
  type?: OscillatorType; // default 'sine'
  detune?: number; // cents, default 0
  envelope?: Envelope | null; // optional envelope; default null = no envelope
  poolSize?: number; // default 8
  poolStrategy?: SoundPoolStrategy;
  priority?: number;
}

export interface OscillatorPlayOptions extends Partial<PlaybackOptions> {
  bus?: AudioBus;
  replace?: boolean;
  /** Override frequency for this play. Reverts to default for next play. */
  frequency?: number;
  /** Override type for this play. */
  type?: OscillatorType;
  /** Override detune for this play. */
  detune?: number;
}

interface PooledOscillatorSource {
  readonly oscillator: OscillatorNode;
  readonly gain: GainNode;
  readonly startedAt: number;
}

interface OscillatorAudioSetup {
  readonly audioContext: AudioContext;
  readonly gainNode: GainNode;
}

/**
 * Procedural tone generator — generates audio without an AudioBuffer asset.
 * Useful for prototyping, game-jam SFX, retro-style sound effects, music
 * apps that need synthesizer-style tones.
 *
 * Each `play()` creates a new OscillatorNode (oscillators are one-shot in
 * Web Audio). Pool semantics match `Sound`: multiple concurrent voices
 * up to `poolSize`, FIFO eviction by default.
 *
 *   const tone = new OscillatorSound({ frequency: 440, type: 'sine' });
 *   tone.play();        // plays A4 sine wave
 *   tone.frequency = 880;
 *   tone.play();        // plays A5 (in addition to A4 if pool > 1)
 *
 * For musical applications, use `setNote(midi)`:
 *
 *   tone.setNote(69);   // MIDI 69 = A4
 *   tone.setNote(60);   // C4 (middle C)
 *
 * With an envelope for smooth attack/release:
 *
 *   const synth = new OscillatorSound({
 *       frequency: 440,
 *       envelope: new Envelope({ attackMs: 50, decayMs: 100, sustainLevel: 0.7, releaseMs: 300 }),
 *   });
 *   synth.play();
 *   // ... later
 *   synth.pause();      // triggers release phase, stops after releaseMs
 */
export class OscillatorSound extends AbstractMedia {
  public frequency: number;
  public detune: number;
  public type: OscillatorType;
  public envelope: Envelope | null;

  public poolSize: number;
  public poolStrategy: SoundPoolStrategy;
  public priority: number;

  private _audioSetup: OscillatorAudioSetup | null = null;
  private _paused = true;
  private readonly _pooledSources: PooledOscillatorSource[] = [];
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupWithAudioContext(ctx);
  };

  public get paused(): boolean {
    return this._paused;
  }

  public set paused(paused: boolean) {
    if (paused) {
      this.pause();
    } else {
      this.play();
    }
  }

  public get analyserTarget(): GainNode | null {
    return this._audioSetup?.gainNode ?? null;
  }

  public constructor(options: OscillatorSoundOptions = {}) {
    super({
      duration: Infinity,
      volume: clamp(options.volume ?? 1, 0, 2),
      playbackRate: 1,
      loop: false,
      muted: options.muted ?? false,
    });

    this.frequency = options.frequency ?? 440;
    this.type = options.type ?? 'sine';
    this.detune = options.detune ?? 0;
    this.envelope = options.envelope ?? null;
    this.poolSize = Math.max(1, Math.floor(options.poolSize ?? 8));
    this.poolStrategy = options.poolStrategy ?? SoundPoolStrategy.FirstInFirstOut;
    this.priority = options.priority ?? 0;

    if (options.loop !== undefined) {
      this._loop = options.loop;
    }

    if (isAudioContextReady()) {
      this._setupWithAudioContext(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  public play(options: OscillatorPlayOptions = {}): this {
    if (options.bus !== undefined) {
      this.bus = options.bus;
    }

    if (options.volume !== undefined) {
      this.setVolume(options.volume);
    }

    if (options.muted !== undefined) {
      this.setMuted(options.muted);
    }

    if (options.replace) {
      this._stopAllPooled();
    }

    const frequency = options.frequency ?? this.frequency;
    const type = options.type ?? this.type;
    const detune = options.detune ?? this.detune;

    this._enqueuePooledPlay(frequency, type, detune);

    this._paused = false;
    this.onStart.dispatch();

    return this;
  }

  public pause(): this {
    if (this._paused && this._pooledSources.length === 0) {
      return this;
    }

    const wasPlaying = !this._paused || this._pooledSources.length > 0;

    this._stopAllPooled();
    this._paused = true;

    if (wasPlaying) {
      this.onStop.dispatch();
    }

    return this;
  }

  public setVolume(value: number): this {
    const volume = clamp(value, 0, 2);

    if (this._volume === volume) {
      return this;
    }

    this._volume = volume;

    if (this._audioSetup) {
      const { gainNode, audioContext } = this._audioSetup;
      gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, audioContext.currentTime, 0.01);
    }

    return this;
  }

  public setLoop(loop: boolean): this {
    this._loop = loop;
    return this;
  }

  public setPlaybackRate(value: number): this {
    this._playbackRate = clamp(value, 0.1, 20);
    return this;
  }

  public getTime(): number {
    return 0;
  }

  public setTime(_currentTime: number): this {
    return this;
  }

  public setMuted(muted: boolean): this {
    this._muted = muted;

    if (this._audioSetup) {
      const { gainNode, audioContext } = this._audioSetup;
      gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, audioContext.currentTime, 0.01);
    }

    return this;
  }

  /** Set frequency from MIDI note number. midi 69 = A4 = 440Hz. */
  public setNote(midiNote: number): this {
    this.frequency = 440 * Math.pow(2, (midiNote - 69) / 12);
    return this;
  }

  /** Returns frequency in Hz from MIDI note (without setting it). */
  public static midiToFrequency(midiNote: number): number {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  public override destroy(): void {
    super.destroy();

    onAudioContextReady.remove(this._onAudioContextReady);

    this._stopAllPooled();
    this._audioSetup?.gainNode.disconnect();
    this._audioSetup = null;
  }

  protected override _getAudioSetup(): { audioContext: AudioContext; gainNode: GainNode } | null {
    return this._audioSetup;
  }

  protected override _defaultBus(): AudioBus {
    return getAudioManager().sound;
  }

  protected override _disconnectFromBus(): void {
    if (this._audioSetup) {
      this._audioSetup.gainNode.disconnect();
    }
  }

  protected override _connectToBus(): void {
    if (this._audioSetup) {
      const inputNode = this.bus._getInputNode();
      if (inputNode) {
        this._audioSetup.gainNode.connect(inputNode);
      } else {
        this._audioSetup.gainNode.connect(this._audioSetup.audioContext.destination);
      }
    }
  }

  private _setupWithAudioContext(audioContext: AudioContext): void {
    const gainNode = audioContext.createGain();
    gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 0.01);

    const inputNode = this.bus._getInputNode();
    if (inputNode) {
      gainNode.connect(inputNode);
    } else {
      gainNode.connect(audioContext.destination);
    }

    this._audioSetup = { audioContext, gainNode };
  }

  private _enqueuePooledPlay(frequency: number, type: OscillatorType, detune: number): void {
    if (!this._audioSetup) {
      // AudioContext not yet ready; defer is not supported for oscillators
      // since each play is ephemeral — silently ignore until context is ready.
      return;
    }

    this._playPooledNow(frequency, type, detune);
  }

  private _playPooledNow(frequency: number, type: OscillatorType, detune: number): void {
    if (!this._audioSetup) return;

    const { audioContext, gainNode } = this._audioSetup;

    // Create per-voice gain node (envelope target)
    const voiceGain = audioContext.createGain();

    const busInput = this.bus._getInputNode();
    if (busInput) {
      voiceGain.connect(busInput);
    } else {
      voiceGain.connect(audioContext.destination);
    }

    // Apply volume/mute through the master gain node connection
    // The voiceGain is the envelope target; the main gainNode handles bus-level volume
    gainNode.connect(voiceGain);

    const oscillator = audioContext.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune;

    oscillator.connect(voiceGain);

    const now = audioContext.currentTime;

    if (this.envelope) {
      this.envelope.trigger(voiceGain.gain, now);
    } else {
      voiceGain.gain.value = this.muted ? 0 : this._volume;
    }

    oscillator.start(now);

    const pooledSource: PooledOscillatorSource = {
      oscillator,
      gain: voiceGain,
      startedAt: now,
    };

    oscillator.onended = (): void => {
      const index = this._pooledSources.indexOf(pooledSource);
      if (index !== -1) {
        this._pooledSources.splice(index, 1);
      }
      oscillator.disconnect();
      voiceGain.disconnect();

      if (this._pooledSources.length === 0) {
        this._paused = true;
      }
    };

    this._pooledSources.push(pooledSource);
    this._trimPooledSources();
  }

  private _pickEvictionVictim(): number {
    switch (this.poolStrategy) {
      case SoundPoolStrategy.LeastRecentlyUsed: {
        // Evict source closest to its natural end. Since oscillators
        // are infinite by default, use oldest (smallest startedAt).
        return this._pickOldestIndex();
      }
      case SoundPoolStrategy.LowestPriority:
      // All pooled instances share the same priority, degenerates to FIFO.
      // falls through
      case SoundPoolStrategy.FirstInFirstOut:
      default:
        return 0; // oldest
    }
  }

  private _pickOldestIndex(): number {
    let minTime = Infinity;
    let minIndex = 0;

    for (let i = 0; i < this._pooledSources.length; i++) {
      const src = this._pooledSources[i];
      if (src.startedAt < minTime) {
        minTime = src.startedAt;
        minIndex = i;
      }
    }

    return minIndex;
  }

  private _trimPooledSources(): void {
    while (this._pooledSources.length > this.poolSize) {
      const victimIndex = this._pickEvictionVictim();
      const victim = this._pooledSources[victimIndex];

      if (!victim) break;

      this._pooledSources.splice(victimIndex, 1);
      victim.oscillator.onended = null;
      this._stopSource(victim);
    }
  }

  private _stopAllPooled(): void {
    for (const source of this._pooledSources) {
      source.oscillator.onended = null;
      this._stopSource(source);
    }
    this._pooledSources.length = 0;
  }

  private _stopSource(source: PooledOscillatorSource): void {
    if (!this._audioSetup) {
      try {
        source.oscillator.stop(0);
      } catch {
        // already stopped
      }
      source.oscillator.disconnect();
      source.gain.disconnect();
      return;
    }

    const { audioContext } = this._audioSetup;
    const now = audioContext.currentTime;

    if (this.envelope) {
      this.envelope.release(source.gain.gain, now);
      const stopAt = now + this.envelope.releaseMs / 1000;
      try {
        source.oscillator.stop(stopAt);
      } catch {
        // already stopped
      }
    } else {
      try {
        source.oscillator.stop(now);
      } catch {
        // already stopped
      }
      source.oscillator.disconnect();
      source.gain.disconnect();
    }
  }
}
