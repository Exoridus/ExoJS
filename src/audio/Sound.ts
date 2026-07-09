import { LoadState, type LoadStateValue } from '#core/LoadState';
import { logger } from '#core/logging';
import type { PlaybackOptions } from '#core/types';
import { clamp } from '#math/utils';
import { Vector } from '#math/Vector';
import type { Asset } from '#resources/Asset';
import { _makeAsset } from '#resources/Asset';

import { getAudioContext, isAudioContextReady } from './audio-context';
import type { AudioBus } from './AudioBus';
import type { AudioManager } from './AudioManager';
import { NoopVoice } from './NoopVoice';
import type { Playable, PlayOptions, Voice } from './Playable';
import { SoundVoice, type SoundVoiceWindow } from './SoundVoice';

/**
 * Eviction strategy used when the pool is full and a new play is requested.
 *
 * At the per-Sound level all pooled instances share the same priority, so
 * `LowestPriority` degenerates to `FirstInFirstOut` in V1. The enum is
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
   * degenerates to FirstInFirstOut in V1.
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
 * `start` / `end` are seconds into the buffer; `loop` makes
 * {@link Sound.playSprite} loop the sprite indefinitely.
 */
export interface AudioSpriteClip {
  start: number;
  end: number;
  loop?: boolean;
}

/**
 * Distance-attenuation model used by spatial sounds.
 *
 * Mirrors Web Audio's `PannerNode.distanceModel`:
 * - `'linear'` — `v = 1 - rolloffFactor * (d - refDistance) / (maxDistance - refDistance)`,
 *   clamped to [0, 1]. Reaches silence at `maxDistance`.
 * - `'inverse'` — `v = refDistance / (refDistance + rolloffFactor * (d - refDistance))`.
 *   Physically realistic; never reaches absolute silence.
 * - `'exponential'` — `v = (d / refDistance) ^ -rolloffFactor`. Steepest near
 *   the listener; useful for very intimate sources.
 */
export type DistanceModel = 'linear' | 'inverse' | 'exponential';

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
  /** Distance-attenuation model. Default: `'linear'`. */
  distanceModel?: DistanceModel;
  /** Distance below which volume is at full strength. Default: `50`. */
  refDistance?: number;
  /** For the `'linear'` model: distance at which volume reaches zero. Default: `1000`. */
  maxDistance?: number;
  /** Falloff rate. Higher = steeper attenuation. Default: `1`. */
  rolloffFactor?: number;
}

/** Per-call overrides for {@link Sound.play} and {@link Sound.playSprite}. */
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
 * definitions, default playback parameters, and spatial configuration but does
 * NOT start playback itself. Playback is driven by
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
  /**
   * Annotation descriptor for a sound asset, for `Assets.from({...})` /
   * `loader.get(...)` / `loader.load(...)` (asset-system v2 §5). Prefer a bare
   * `'x.ogg'` string when the suffix is unambiguous; use `Sound.of(...)` for
   * dynamic paths, ambiguous suffixes, or per-asset options.
   */
  public static of(
    source: string,
    options?: { playbackOptions?: Partial<PlaybackOptions>; poolSize?: number; sprites?: Readonly<Record<string, AudioSpriteClip>> },
  ): Asset<Sound> {
    return _makeAsset('sound', source, options);
  }

  private _audioBuffer: AudioBuffer | null;
  /** @internal — load lifecycle, driven by the Loader's seamless pipeline. */
  public readonly _loadState = new LoadState<Sound>();
  private readonly _sprites = new Map<string, NormalizedAudioSpriteClip>();

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

  // Spatial descriptor params — read by _createVoice to configure the PannerNode.
  private _position: Vector | null = null;
  private _velocity: Vector | null = null;
  private _distanceModel: DistanceModel = 'linear';
  private _refDistance = 50;
  private _maxDistance = 1000;
  private _rolloffFactor = 1;

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
   * deferred handles returned by `loader.get(Sound, …)` start `'loading'` and
   * become `'ready'` once the payload fills in, or `'failed'` when the load
   * errors.
   */
  public get loadState(): LoadStateValue {
    return this._loadState.value;
  }

  /** Load lifecycle: `'loading' | 'ready' | 'failed'` (asset-system v2 §6). */
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

  public get position(): Vector | null {
    return this._position;
  }

  public set position(value: { x: number; y: number } | Vector | null) {
    if (value === null) {
      if (this._position !== null) {
        this._position.destroy();
        this._position = null;
      }
      return;
    }
    if (this._position === null) {
      this._position = new Vector(value.x, value.y);
    } else {
      this._position.set(value.x, value.y);
    }
  }

  public get velocity(): Vector | null {
    return this._velocity;
  }

  public set velocity(value: { x: number; y: number } | Vector | null) {
    if (value === null) {
      if (this._velocity !== null) {
        this._velocity.destroy();
        this._velocity = null;
      }
    } else {
      if (this._velocity === null) {
        this._velocity = new Vector(value.x, value.y);
      } else {
        this._velocity.set(value.x, value.y);
      }
    }
  }

  /** Distance-attenuation model. */
  public get distanceModel(): DistanceModel {
    return this._distanceModel;
  }

  public set distanceModel(value: DistanceModel) {
    this._distanceModel = value;
  }

  /** Reference distance — volume is at full strength at and below this distance. */
  public get refDistance(): number {
    return this._refDistance;
  }

  public set refDistance(value: number) {
    this._refDistance = Math.max(0, value);
  }

  /** Maximum distance for the `'linear'` model — volume reaches zero here. */
  public get maxDistance(): number {
    return this._maxDistance;
  }

  public set maxDistance(value: number) {
    this._maxDistance = Math.max(0, value);
  }

  /** Falloff steepness. Higher values attenuate faster with distance. */
  public get rolloffFactor(): number {
    return this._rolloffFactor;
  }

  public set rolloffFactor(value: number) {
    this._rolloffFactor = Math.max(0, value);
  }

  public constructor(audioBuffer: AudioBuffer | null = null, options: SoundOptions = {}) {
    this._audioBuffer = audioBuffer;
    this._clipEnd = audioBuffer?.duration ?? 0;

    const { poolSize, poolStrategy, priority, sprites, volume, loop, playbackRate, muted, distanceModel, refDistance, maxDistance, rolloffFactor } = options;

    this.volume = clamp(volume ?? 1, 0, 1);
    this.loop = loop ?? false;
    this.playbackRate = clamp(playbackRate ?? 1, 0.1, 20);
    this.muted = muted ?? false;

    this._poolSize = Math.max(1, Math.floor(poolSize ?? 8));
    this._poolStrategy = poolStrategy ?? SoundPoolStrategy.FirstInFirstOut;
    this._priority = priority ?? 0;

    if (distanceModel !== undefined) {
      this._distanceModel = distanceModel;
    }
    if (refDistance !== undefined) {
      this._refDistance = Math.max(0, refDistance);
    }
    if (maxDistance !== undefined) {
      this._maxDistance = Math.max(0, maxDistance);
    }
    if (rolloffFactor !== undefined) {
      this._rolloffFactor = Math.max(0, rolloffFactor);
    }

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

  public setSprites(sprites: Readonly<Record<string, AudioSpriteClip>>): this {
    this._sprites.clear();

    for (const [name, clip] of Object.entries(sprites)) {
      this.defineSprite(name, clip);
    }

    return this;
  }

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

    return this;
  }

  public hasSprite(name: string): boolean {
    return this._sprites.has(name);
  }

  public removeSprite(name: string): this {
    this._sprites.delete(name);

    return this;
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

    const clip = new Sound(this._audioBuffer, {
      volume: this.volume,
      loop: this.loop,
      playbackRate: this.playbackRate,
      muted: this.muted,
      poolSize: this._poolSize,
      poolStrategy: this._poolStrategy,
      priority: this._priority,
      distanceModel: this._distanceModel,
      refDistance: this._refDistance,
      maxDistance: this._maxDistance,
      rolloffFactor: this._rolloffFactor,
    });
    clip._clipStart = start;
    clip._clipEnd = end;

    return clip;
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
  public _createVoice(manager: AudioManager, options: PlayOptions): Voice {
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
   * Create a voice for a named sprite clip.
   * @internal Used by managers that want sprite-level playback.
   */
  public _createSpriteVoice(manager: AudioManager, name: string, options: PlayOptions = {}): Voice {
    const clip = this._sprites.get(name);

    if (!clip) {
      throw new Error(`Sound sprite "${name}" is not defined.`);
    }

    const bus = options.bus ?? manager.sound;
    const notLoaded = this._notLoadedVoice(bus);

    if (notLoaded !== null) {
      return notLoaded;
    }

    const clipOffset = Math.max(0, options.time ?? 0);
    const offset = clip.start + clipOffset;

    if (offset >= clip.end) {
      throw new Error(`Sound sprite "${name}" offset (${clipOffset}s) exceeds clip duration (${clip.end - clip.start}s).`);
    }

    const loop = options.loop ?? clip.loop;

    return this._buildVoice(manager, { ...options, loop }, offset, {
      base: clip.start,
      end: clip.end,
      loopStart: clip.start,
      loopEnd: clip.end,
    });
  }

  /**
   * If the sound is not playable-loaded, return a {@link NoopVoice} with a
   * differentiated warning; otherwise return `null` so the caller builds a
   * real voice. Both the main path ({@link Sound._createVoice}) and the sprite
   * path ({@link Sound._createSpriteVoice}) route through this before reaching
   * {@link Sound._buildVoice} — after eviction the sprite path can otherwise
   * hand `_buildVoice` a `null` buffer (a sprite defined while loaded, then
   * evicted and replayed before the reload settles).
   */
  private _notLoadedVoice(bus: AudioBus): Voice | null {
    if (this._loadState.value === 'failed') {
      logger.warn('Sound.play() called on a sound that failed to load; playing silence.', { source: 'Sound' });
      return new NoopVoice(bus);
    }

    if (this._audioBuffer === null || this._loadState.value === 'loading') {
      logger.warn('Sound.play() called on a sound that is not yet loaded; playing silence. Await sound.loaded or use loader.load().', { source: 'Sound' });
      return new NoopVoice(bus);
    }

    return null;
  }

  /**
   * Shared voice construction for full-buffer and sprite playback. Enforces the
   * pool limit, builds the {@link SoundVoice}, seeds spatialization from the
   * descriptor's position, and tracks the voice for eviction.
   */
  private _buildVoice(manager: AudioManager, options: PlayOptions, offset: number, window: SoundVoiceWindow): Voice {
    // @internal invariant: the buffer is non-null here. Both `_createVoice` and
    // `_createSpriteVoice` route through `_notLoadedVoice` before reaching this
    // method, so a null buffer can no longer arrive through any real caller.
    const buffer = this._audioBuffer;

    if (buffer === null) {
      throw new Error('Sound._buildVoice() invariant violated: called with a null buffer.');
    }

    const loop = options.loop ?? this.loop;
    const playbackRate = clamp(options.playbackRate ?? this.playbackRate, 0.1, 20);
    const detune = options.detune ?? 0;
    const volume = clamp(options.muted ? 0 : (options.volume ?? (this.muted ? 0 : this.volume)), 0, 1);
    const bus = options.bus ?? manager.sound;

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

    const audioContext = getAudioContext();
    const output = audioContext.createGain();

    const voice = new SoundVoice({
      audioContext,
      output,
      bus,
      manager,
      volume,
      spatial: {
        distanceModel: this._distanceModel,
        refDistance: this._refDistance,
        maxDistance: this._maxDistance,
        rolloffFactor: this._rolloffFactor,
      },
      buffer,
      loop,
      playbackRate,
      detune,
      offset,
      window,
    });

    // Seed spatialization from the descriptor's position (initial value only;
    // move a live voice via `voice.position` or `voice.follow(node)`).
    if (this._position !== null) {
      voice.position = this._position;
    }

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

    if (this._position !== null) {
      this._position.destroy();
      this._position = null;
    }

    if (this._velocity !== null) {
      this._velocity.destroy();
      this._velocity = null;
    }
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
      // so LowestPriority degenerates to FIFO within a single Sound (V1).
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
