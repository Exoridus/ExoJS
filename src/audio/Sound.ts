import { LoadState, type LoadStateValue } from '#core/LoadState';
import { logger } from '#core/logging';
import { clamp } from '#math/utils';

import { getAudioContext, isAudioContextReady } from './audio-context';
import type { AudioBus } from './AudioBus';
import type { AudioManager } from './AudioManager';
import { NoopVoice } from './NoopVoice';
import type { Playable, PlayOptions, Voice } from './Playable';
import { SoundVoice, type SoundVoiceWindow } from './SoundVoice';
import { seedVoiceFromPlayOptions } from './spatial-options';

/**
 * Eviction strategy used when the pool is full and a new play is requested.
 *
 * At the per-Sound level all pooled instances share the same priority, so
 * `LowestPriority` degenerates to `FirstInFirstOut`. The enum is
 * forward-compatible with a future global voice manager that culls across
 * multiple Sound instances.
 */
export enum SoundPoolStrategy {
  /** Evict the oldest (first-started) source. Default. */
  FirstInFirstOut = 'fifo',
  /** Evict the source closest to its natural end (shortest remaining time). */
  LeastRecentlyUsed = 'lru',
  /**
   * Evict the source with the lowest priority.
   * Within a single Sound all instances share the same priority, so this
   * degenerates to FirstInFirstOut.
   */
  LowestPriority = 'priority',
}

interface NormalizedAudioSpriteClip {
  readonly start: number;
  readonly end: number;
  readonly loop: boolean;
}

/**
 * Named sub-region of an {@link AudioBuffer} used as an audio sprite sheet.
 * `start` / `end` are seconds into the buffer; `loop` makes the clip loop
 * indefinitely when played.
 */
export interface AudioSpriteClip {
  start: number;
  end: number;
  loop?: boolean;
}

/** Construction options for {@link Sound}. */
export interface SoundOptions {
  poolSize?: number;
  poolStrategy?: SoundPoolStrategy;
  priority?: number;
  sprites?: Readonly<Record<string, AudioSpriteClip>>;
  /** Default volume for voices created from this sound. Range [0, 1]. Default: 1. */
  volume?: number;
  /** Default loop setting. Default: false. */
  loop?: boolean;
  /** Default playback rate. Default: 1. */
  playbackRate?: number;
  /** Default muted state. Default: false. */
  muted?: boolean;
}

/** Per-call overrides for {@link AudioManager.play}. */
export interface SoundPlayOptions extends PlayOptions {
  /**
   * When `true`, all currently-playing instances of this sound are stopped
   * before the new one starts (singleton-replace mode). Useful for
   * non-overlapping playback such as UI confirmation chimes.
   *
   * Default: `false` (multi-instance / pooled mode).
   */
  replace?: boolean;
}

/** Internal record tracking an active voice for pool management. */
interface PooledVoice {
  readonly voice: SoundVoice;
  /** audioContext.currentTime when the voice was started. */
  readonly startedAt: number;
  /** Finite playback duration in seconds, or Infinity for looping. */
  readonly effectiveDuration: number;
}

/**
 * Pre-decoded short audio clip backed by an `AudioBuffer`.
 *
 * Sound is a **data descriptor** — it holds the decoded audio buffer, sprite
 * definitions, and default playback parameters but does NOT start playback
 * itself, and holds no per-playback spatial state (that lives on the
 * {@link Voice} returned by playing it). Playback is driven by
 * `AudioManager.play(sound, options)` which returns a {@link Voice} handle.
 *
 * Multiple concurrent plays of the same Sound are supported up to `poolSize`.
 * When the pool is full the configured {@link SoundPoolStrategy} decides which
 * active voice to evict.
 *
 * Use {@link AudioStream} for long-form streaming audio (single source, decoded
 * lazily) — `Sound` is best for short, frequently-triggered clips.
 */
export class Sound implements Playable {
  private _audioBuffer: AudioBuffer | null;
  /** @internal — load lifecycle, driven by the Loader's seamless pipeline. */
  public readonly _loadState = new LoadState<Sound>();
  private readonly _sprites = new Map<string, NormalizedAudioSpriteClip>();
  /**
   * Memoized sub-{@link Sound}s handed out by {@link Sound.sprite}. One per
   * name, for the lifetime of that definition: a fresh sub-Sound per call would
   * give every call its own voice pool, which makes the pool policy — the whole
   * point of pooling a frequently-triggered sprite — silently unenforceable.
   */
  private readonly _spriteSounds = new Map<string, Sound>();

  // Playable buffer window (seconds). Full buffer by default; narrowed by clip().
  private _clipStart = 0;
  private _clipEnd = 0;

  /** Default volume applied to new voices. */
  public volume: number;
  /** Default loop flag applied to new voices. */
  public loop: boolean;
  /** Default playback rate applied to new voices. */
  public playbackRate: number;
  /** Default muted flag applied to new voices. */
  public muted: boolean;

  private _poolSize: number;
  private _poolStrategy: SoundPoolStrategy;
  private _priority: number;

  // Active voice pool — tracks concurrent voices for eviction logic.
  private readonly _activeVoices: PooledVoice[] = [];

  /**
   * The underlying decoded audio data, or `null` for a deferred handle whose
   * payload hasn't finished loading yet. Useful for sharing a single decoded
   * buffer across multiple `Sound` instances.
   */
  public get audioBuffer(): AudioBuffer | null {
    return this._audioBuffer;
  }

  /** Playable duration in seconds — the full buffer, or the clip span for a {@link Sound.clip}. */
  public get duration(): number {
    return this._clipEnd - this._clipStart;
  }

  /**
   * Load lifecycle of this sound. Directly constructed sounds are `'ready'`;
   * deferred handles returned by `loader.get('theme.ogg')` / `loader.get(Asset.type('sound', src))`
   * start `'loading'` and become `'ready'` once the payload fills in, or
   * `'failed'` when the load errors.
   */
  public get loadState(): LoadStateValue {
    return this._loadState.value;
  }

  /** Load lifecycle: `'idle' | 'loading' | 'ready' | 'failed'`. */
  public get state(): LoadStateValue {
    return this._loadState.value;
  }

  /** `true` exactly when {@link state} is `'ready'`. */
  public get ready(): boolean {
    return this._loadState.value === 'ready';
  }

  /** The error the last load failed with, or `null` outside `'failed'`. */
  public get error(): Error | null {
    return this._loadState.error;
  }

  /**
   * Promise that settles with this sound once its payload has loaded —
   * resolved immediately for `'ready'` sounds, rejected with the load error
   * for `'failed'` ones. Re-materialized when a failed load is retried, so
   * read it fresh from this getter rather than caching it across load cycles.
   */
  public get loaded(): Promise<this> {
    return this._loadState.loaded(this) as Promise<this>;
  }

  public get poolSize(): number {
    return this._poolSize;
  }

  public set poolSize(poolSize: number) {
    this.setPoolSize(poolSize);
  }

  /**
   * The eviction strategy used when the pool is at capacity.
   * @default SoundPoolStrategy.FirstInFirstOut
   */
  public get poolStrategy(): SoundPoolStrategy {
    return this._poolStrategy;
  }

  public set poolStrategy(strategy: SoundPoolStrategy) {
    this._poolStrategy = strategy;
  }

  /**
   * Sound priority. Used by the `LowestPriority` pool strategy.
   * Higher values indicate higher priority (less likely to be evicted).
   * @default 0
   */
  public get priority(): number {
    return this._priority;
  }

  public set priority(value: number) {
    this._priority = value;
  }

  public constructor(audioBuffer: AudioBuffer | null = null, options: SoundOptions = {}) {
    this._audioBuffer = audioBuffer;
    this._clipEnd = audioBuffer?.duration ?? 0;

    const { poolSize, poolStrategy, priority, sprites, volume, loop, playbackRate, muted } = options;

    this.volume = clamp(volume ?? 1, 0, 1);
    this.loop = loop ?? false;
    this.playbackRate = clamp(playbackRate ?? 1, 0.1, 20);
    this.muted = muted ?? false;

    this._poolSize = Math.max(1, Math.floor(poolSize ?? 8));
    this._poolStrategy = poolStrategy ?? SoundPoolStrategy.FirstInFirstOut;
    this._priority = priority ?? 0;

    if (sprites) {
      this.setSprites(sprites);
    }
  }

  public setPoolSize(poolSize: number): this {
    const normalizedPoolSize = Math.max(1, Math.floor(poolSize));

    if (this._poolSize === normalizedPoolSize) {
      return this;
    }

    this._poolSize = normalizedPoolSize;
    this._trimActiveVoices();

    return this;
  }

  /**
   * Replace the whole sprite table. Every sub-{@link Sound} previously handed
   * out by {@link Sound.sprite} is destroyed — the definitions they were
   * derived from are gone, so keeping them alive would keep stale windows (and
   * their voices) playing.
   */
  public setSprites(sprites: Readonly<Record<string, AudioSpriteClip>>): this {
    this._sprites.clear();
    this._destroySpriteSounds();

    for (const [name, clip] of Object.entries(sprites)) {
      this.defineSprite(name, clip);
    }

    return this;
  }

  /**
   * Define (or redefine) a named sub-region of the buffer. Redefining a name
   * discards the sub-{@link Sound} {@link Sound.sprite} memoized for it, so the
   * next lookup reflects the new window.
   */
  public defineSprite(name: string, clip: AudioSpriteClip): this {
    if (name.trim().length === 0) {
      throw new Error('Sound sprite names must be non-empty strings.');
    }

    const start = clip.start;
    const end = clip.end;

    if (!Number.isFinite(start) || start < 0) {
      throw new Error(`Sound sprite "${name}" has an invalid start time (${start}).`);
    }

    if (!Number.isFinite(end) || end <= start) {
      throw new Error(`Sound sprite "${name}" has an invalid end time (${end}).`);
    }

    if (end > this.duration) {
      throw new Error(`Sound sprite "${name}" ends at ${end}s, which exceeds sound duration ${this.duration}s.`);
    }

    this._sprites.set(name, {
      start,
      end,
      loop: clip.loop ?? false,
    });
    this._dropSpriteSound(name);

    return this;
  }

  public hasSprite(name: string): boolean {
    return this._sprites.has(name);
  }

  /**
   * Remove a sprite definition and destroy the sub-{@link Sound}
   * {@link Sound.sprite} memoized for it, stopping anything it still had
   * playing.
   */
  public removeSprite(name: string): this {
    this._sprites.delete(name);
    this._dropSpriteSound(name);

    return this;
  }

  /**
   * The {@link Sound} for a named sprite — the playback side of
   * {@link Sound.defineSprite}. Same concept as {@link Sound.clip}, addressed
   * by name instead of by offset: a sub-Sound over the same decoded buffer,
   * with the clip's own `loop` flag and its own voice pool.
   *
   * The result is memoized per name, so the pool is shared across every play of
   * that sprite and repeated lookups are free. It stays valid until the name is
   * redefined, removed, or this sound is destroyed.
   *
   * @throws If no sprite with that name is defined.
   *
   * @example
   * ```ts
   * sound.defineSprite('impact', { start: 0.5, end: 0.8 });
   * app.audio.play(sound.sprite('impact'));
   * ```
   */
  public sprite(name: string): Sound {
    const memoized = this._spriteSounds.get(name);

    if (memoized !== undefined) {
      return memoized;
    }

    const clip = this._sprites.get(name);

    if (clip === undefined) {
      throw new Error(`Sound sprite "${name}" is not defined.`);
    }

    const sprite = this._subSound(clip.start, clip.end, clip.loop);

    this._spriteSounds.set(name, sprite);

    return sprite;
  }

  /**
   * Return a new {@link Sound} that plays only the `[offset, offset + duration]`
   * sub-range (seconds) of this sound's buffer — an audio atlas / sprite-sheet
   * clip. The clip shares the same decoded {@link AudioBuffer} (no extra memory)
   * and inherits this sound's default playback + spatial settings, including its
   * own independent voice pool.
   */
  public clip(offset: number, duration: number): Sound {
    if (this._audioBuffer === null) {
      throw new Error('Sound.clip() is unavailable: the sound is not loaded yet.');
    }

    const start = clamp(offset, 0, this._audioBuffer.duration);
    const end = clamp(start + duration, start, this._audioBuffer.duration);

    return this._subSound(start, end, this.loop);
  }

  /**
   * Build a sub-{@link Sound} over the `[start, end]` window of this sound's
   * buffer — the shared body of {@link Sound.clip} and {@link Sound.sprite}.
   * Inherits this sound's playback defaults, but takes `loop` from the caller
   * so a sprite definition's own loop flag wins over the parent's.
   */
  private _subSound(start: number, end: number, loop: boolean): Sound {
    const sub = new Sound(this._audioBuffer, {
      volume: this.volume,
      loop,
      playbackRate: this.playbackRate,
      muted: this.muted,
      poolSize: this._poolSize,
      poolStrategy: this._poolStrategy,
      priority: this._priority,
    });

    sub._clipStart = start;
    sub._clipEnd = end;

    return sub;
  }

  /** Destroy and forget the sub-{@link Sound} memoized for `name`, if any. */
  private _dropSpriteSound(name: string): void {
    const sprite = this._spriteSounds.get(name);

    if (sprite !== undefined) {
      this._spriteSounds.delete(name);
      sprite.destroy();
    }
  }

  /** Destroy and forget every memoized sprite sub-{@link Sound}. */
  private _destroySpriteSounds(): void {
    for (const sprite of this._spriteSounds.values()) {
      sprite.destroy();
    }

    this._spriteSounds.clear();
  }

  /**
   * Transplant a decoded buffer into this handle in place (seamless fill).
   * Resets the clip window to the full buffer.
   * @internal
   */
  public _setBuffer(buffer: AudioBuffer): void {
    this._audioBuffer = buffer;
    this._clipStart = 0;
    this._clipEnd = buffer.duration;
  }

  /**
   * Drop the decoded payload back to the placeholder state (refcount-0 eviction).
   * Identity is preserved; a later load heals in place.
   * @internal
   */
  public _evictBuffer(): void {
    this._audioBuffer = null;
    this._clipStart = 0;
    this._clipEnd = 0;
  }

  /**
   * Implements {@link Playable}. Called by {@link AudioManager.play}; do not
   * call directly — use `manager.play(sound, options)` instead.
   *
   * Creates one {@link SoundVoice} backed by a single `AudioBufferSourceNode`.
   * Pool limits are enforced: if the pool is full the configured eviction
   * strategy picks a victim to stop before the new voice starts.
   */
  public _createVoice(manager: AudioManager, options: SoundPlayOptions): Voice {
    const bus = options.bus ?? manager.sound;
    const notLoaded = this._notLoadedVoice(bus);

    if (notLoaded !== null) {
      return notLoaded;
    }

    const offset = this._clipStart + Math.max(0, options.time ?? 0);

    if (offset >= this._clipEnd) {
      return new NoopVoice(bus);
    }

    return this._buildVoice(manager, options, offset, {
      base: this._clipStart,
      end: this._clipEnd,
      loopStart: this._clipStart,
      loopEnd: this._clipEnd,
    });
  }

  /**
   * If the sound is not playable-loaded, return a {@link NoopVoice} with a
   * differentiated warning; otherwise return `null` so the caller builds a
   * real voice. {@link Sound._createVoice} routes through this before reaching
   * {@link Sound._buildVoice}, which covers full sounds, {@link Sound.clip}s
   * and {@link Sound.sprite}s alike — they are all just Sounds — so
   * `_buildVoice` can never be handed a `null` buffer (a sprite defined while
   * loaded, then evicted and replayed before the reload settles).
   */
  private _notLoadedVoice(bus: AudioBus): Voice | null {
    if (this._loadState.value === 'failed') {
      logger.warn('AudioManager.play() called on a sound that failed to load; playing silence.', { source: 'Sound' });
      return new NoopVoice(bus);
    }

    if (this._audioBuffer === null || this._loadState.value === 'loading') {
      logger.warn('AudioManager.play() called on a sound that is not yet loaded; playing silence. Await sound.loaded or use loader.load().', {
        source: 'Sound',
      });
      return new NoopVoice(bus);
    }

    return null;
  }

  /**
   * Shared voice construction for full-buffer and sprite playback. Enforces the
   * pool limit, builds the {@link SoundVoice}, seeds spatialization from the
   * play-time options, and tracks the voice for eviction.
   */
  private _buildVoice(manager: AudioManager, options: SoundPlayOptions, offset: number, window: SoundVoiceWindow): Voice {
    // @internal invariant: the buffer is non-null here. `_createVoice` routes
    // through `_notLoadedVoice` before reaching this method, so a null buffer
    // can no longer arrive through any real caller.
    const buffer = this._audioBuffer;

    if (buffer === null) {
      throw new Error('Sound._buildVoice() invariant violated: called with a null buffer.');
    }

    const loop = options.loop ?? this.loop;
    const playbackRate = clamp(options.playbackRate ?? this.playbackRate, 0.1, 20);
    const detune = options.detune ?? 0;
    const volume = clamp(options.muted ? 0 : (options.volume ?? (this.muted ? 0 : this.volume)), 0, 1);
    const bus = options.bus ?? manager.sound;

    if (options.replace === true) {
      // Singleton-replace mode: every other active voice of this sound is
      // stopped so the new one plays alone, bypassing pool eviction policy
      // entirely (there is nothing left in the pool to evict against).
      this._stopAllVoices();
    } else {
      // Pool eviction: stop the victim voice if we're at capacity.
      this._pruneEndedVoices();

      if (this._activeVoices.length >= this._poolSize) {
        const victimIndex = this._pickEvictionVictim();
        const victim = this._activeVoices[victimIndex];
        if (victim) {
          this._activeVoices.splice(victimIndex, 1);
          victim.voice.stop();
        }
      }
    }

    const audioContext = getAudioContext();
    const output = audioContext.createGain();

    const voice = new SoundVoice({
      audioContext,
      output,
      bus,
      manager,
      volume,
      buffer,
      loop,
      playbackRate,
      detune,
      offset,
      window,
    });

    seedVoiceFromPlayOptions(voice, options);

    const startedAt = audioContext.currentTime;
    const effectiveDuration = loop ? Infinity : window.end - offset;
    const pooledVoice: PooledVoice = { voice, startedAt, effectiveDuration };

    voice.onEnd.add((): void => {
      const index = this._activeVoices.indexOf(pooledVoice);
      if (index !== -1) {
        this._activeVoices.splice(index, 1);
      }
    });

    this._activeVoices.push(pooledVoice);

    return voice;
  }

  /** Stop all currently active voices (e.g. for replace mode). */
  public _stopAllVoices(): void {
    const voices = [...this._activeVoices];
    this._activeVoices.length = 0;
    for (const pv of voices) {
      pv.voice.stop();
    }
  }

  public destroy(): void {
    this._stopAllVoices();
    this._sprites.clear();
    this._destroySpriteSounds();
  }

  private _pruneEndedVoices(): void {
    for (let i = this._activeVoices.length - 1; i >= 0; i--) {
      if (this._activeVoices[i]?.voice.ended === true) {
        this._activeVoices.splice(i, 1);
      }
    }
  }

  private _pickEvictionVictim(): number {
    switch (this._poolStrategy) {
      case SoundPoolStrategy.LeastRecentlyUsed: {
        return this._pickClosestToEnd();
      }
      case SoundPoolStrategy.LowestPriority:
      // All pooled instances of this Sound share the same priority,
      // so LowestPriority degenerates to FIFO within a single Sound.
      // falls through
      case SoundPoolStrategy.FirstInFirstOut:
      default:
        return 0; // oldest
    }
  }

  private _pickClosestToEnd(): number {
    const now = isAudioContextReady() ? getAudioContext().currentTime : 0;
    let minRemaining = Infinity;
    let minIndex = 0;

    for (let i = 0; i < this._activeVoices.length; i++) {
      const src = this._activeVoices[i];
      if (src === undefined) {
        continue;
      }
      const elapsed = now - src.startedAt;
      const remaining = src.effectiveDuration - elapsed;

      if (remaining < minRemaining) {
        minRemaining = remaining;
        minIndex = i;
      }
    }

    return minIndex;
  }

  private _trimActiveVoices(): void {
    while (this._activeVoices.length > this._poolSize) {
      const victimIndex = this._pickEvictionVictim();
      const victim = this._activeVoices[victimIndex];

      if (!victim) break;

      this._activeVoices.splice(victimIndex, 1);
      victim.voice.stop();
    }
  }
}
