import type { PlaybackOptions } from '#core/types';
import { clamp } from '#math/utils';
import { Vector } from '#math/Vector';

import { AbstractMedia } from './AbstractMedia';
import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audio-context';
import type { AudioBus } from './AudioBus';
import { getAudioManager } from './AudioManager';

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

interface SoundAudioSetup {
  readonly audioContext: AudioContext;
  readonly gainNode: GainNode;
}

interface QueuedPooledPlay {
  readonly offset: number;
  readonly duration?: number;
  readonly loop: boolean;
  readonly loopStart?: number;
  readonly loopEnd?: number;
  readonly playbackRate: number;
}

/** A pooled source with timing metadata for LRU eviction. */
interface PooledSource {
  readonly node: AudioBufferSourceNode;
  /** audioContext.currentTime when the source was started. */
  readonly startedAt: number;
  /** Finite playback duration in seconds, or Infinity for looping sources. */
  readonly effectiveDuration: number;
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
export interface SoundOptions extends Partial<PlaybackOptions> {
  poolSize?: number;
  poolStrategy?: SoundPoolStrategy;
  priority?: number;
  sprites?: Readonly<Record<string, AudioSpriteClip>>;
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
export interface PlayOptions extends Partial<PlaybackOptions> {
  bus?: AudioBus;
  /**
   * When `true`, all currently-playing instances of this sound are stopped
   * before the new one starts (singleton-replace mode). Useful for
   * non-overlapping playback such as UI confirmation chimes.
   *
   * Default: `false` (multi-instance / pooled mode).
   */
  replace?: boolean;
}

/**
 * Pre-decoded short audio clip backed by an `AudioBuffer`. Each
 * {@link Sound.play} call grabs a free `AudioBufferSourceNode` from the
 * pool (default size 8) so the same sound can overlap itself; when the
 * pool is full the configured {@link SoundPoolStrategy} decides which
 * source to evict.
 *
 * Supports audio-sprite playback via {@link Sound.playSprite} — name a
 * sub-region in the {@link AudioSpriteClip} options and trigger by name.
 *
 * Routes through any {@link AudioBus}; defaults to the engine's `sound`
 * bus. Calling {@link Sound.makeSpatial} attaches a panner so the sound
 * follows a {@link SceneNode} or world-space target with distance
 * attenuation handled by Web Audio.
 *
 * Use {@link Music} for long-form streaming audio (single source, decoded
 * lazily) — `Sound` is best for short, frequently-triggered clips.
 */
export class Sound extends AbstractMedia {
  private readonly _audioBuffer: AudioBuffer;
  private readonly _pooledSources: PooledSource[] = [];
  private readonly _queuedPooledPlays: QueuedPooledPlay[] = [];
  private readonly _sprites = new Map<string, NormalizedAudioSpriteClip>();

  private _audioSetup: SoundAudioSetup | null = null;
  private _paused = true;
  private _poolSize = 8;
  private _poolStrategy: SoundPoolStrategy = SoundPoolStrategy.FirstInFirstOut;
  private _priority = 0;
  private _position: Vector | null = null;
  private _velocity: Vector | null = null;
  private _pannerNode: PannerNode | null = null;
  private _distanceModel: DistanceModel = 'linear';
  private _refDistance = 50;
  private _maxDistance = 1000;
  private _rolloffFactor = 1;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this.setupWithAudioContext(ctx);
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

  /** The underlying decoded audio data. Useful for sharing a single decoded buffer across multiple `Sound` instances. */
  public get audioBuffer(): AudioBuffer {
    return this._audioBuffer;
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
        this._teardownSpatial();
        getAudioManager()._unregisterSpatialSound(this);
      }
      return;
    }
    if (this._position === null) {
      // Becoming spatial
      this._position = new Vector(value.x, value.y);
      this._setupSpatial();
      getAudioManager()._registerSpatialSound(this);
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

  /** Distance-attenuation model. Applied immediately if a panner is already attached. */
  public get distanceModel(): DistanceModel {
    return this._distanceModel;
  }

  public set distanceModel(value: DistanceModel) {
    this._distanceModel = value;
    if (this._pannerNode !== null) {
      this._pannerNode.distanceModel = value;
    }
  }

  /** Reference distance — volume is at full strength at and below this distance. */
  public get refDistance(): number {
    return this._refDistance;
  }

  public set refDistance(value: number) {
    this._refDistance = Math.max(0, value);
    if (this._pannerNode !== null) {
      this._pannerNode.refDistance = this._refDistance;
    }
  }

  /** Maximum distance for the `'linear'` model — volume reaches zero here. */
  public get maxDistance(): number {
    return this._maxDistance;
  }

  public set maxDistance(value: number) {
    this._maxDistance = Math.max(0, value);
    if (this._pannerNode !== null) {
      this._pannerNode.maxDistance = this._maxDistance;
    }
  }

  /** Falloff steepness. Higher values attenuate faster with distance. */
  public get rolloffFactor(): number {
    return this._rolloffFactor;
  }

  public set rolloffFactor(value: number) {
    this._rolloffFactor = Math.max(0, value);
    if (this._pannerNode !== null) {
      this._pannerNode.rolloffFactor = this._rolloffFactor;
    }
  }

  public constructor(audioBuffer: AudioBuffer, options: SoundOptions = {}) {
    super({
      duration: audioBuffer.duration,
      volume: 1,
      playbackRate: 1,
      loop: false,
      muted: false,
    });

    this._audioBuffer = audioBuffer;

    const { poolSize, poolStrategy, priority, sprites, distanceModel, refDistance, maxDistance, rolloffFactor, ...playbackOptions } = options;

    this._poolSize = Math.max(1, Math.floor(poolSize ?? 8));

    if (poolStrategy !== undefined) {
      this._poolStrategy = poolStrategy;
    }

    if (priority !== undefined) {
      this._priority = priority;
    }

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

    if (Object.keys(playbackOptions).length > 0) {
      this.applyOptions(playbackOptions);
    }

    if (sprites) {
      this.setSprites(sprites);
    }

    if (isAudioContextReady()) {
      this.setupWithAudioContext(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
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

  public setTime(currentTime: number): this {
    void currentTime;
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

  public setPoolSize(poolSize: number): this {
    const normalizedPoolSize = Math.max(1, Math.floor(poolSize));

    if (this._poolSize === normalizedPoolSize) {
      return this;
    }

    this._poolSize = normalizedPoolSize;
    this._trimPooledSources();

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
   * Play this sound. By default, creates a new pooled instance allowing
   * multiple concurrent plays up to `poolSize`. Pass `{ replace: true }` to
   * stop all prior instances of this sound before starting a new one
   * (singleton-replace mode — useful for non-overlapping playback like UI
   * confirmation chimes).
   */
  public play(options?: PlayOptions): this {
    if (options?.bus !== undefined) {
      this.bus = options.bus;
    }

    const playbackRate = clamp(options?.playbackRate ?? this._playbackRate, 0.1, 20);
    const offset = Math.max(0, options?.time ?? 0);
    const loop = options?.loop ?? this._loop;

    if (options?.volume !== undefined) {
      this.setVolume(options.volume);
    }

    if (options?.muted !== undefined) {
      this.setMuted(options.muted);
    }

    if (options?.replace) {
      this._stopAllPooled();
    }

    if (offset >= this.duration) {
      return this;
    }

    const duration = loop ? undefined : this.duration - offset;

    this._enqueuePooledPlay({
      offset,
      duration,
      loop,
      loopStart: 0,
      loopEnd: this.duration,
      playbackRate,
    });

    this._paused = false;
    this.onStart.dispatch();

    return this;
  }

  public playSprite(name: string, options: Partial<PlaybackOptions> = {}): this {
    const clip = this._sprites.get(name);

    if (!clip) {
      throw new Error(`Sound sprite "${name}" is not defined.`);
    }

    const clipOffset = Math.max(0, options.time ?? 0);
    const offset = clip.start + clipOffset;

    if (offset >= clip.end) {
      throw new Error(`Sound sprite "${name}" offset (${clipOffset}s) exceeds clip duration (${clip.end - clip.start}s).`);
    }

    const loop = options.loop ?? clip.loop;
    const playbackRate = clamp(options.playbackRate ?? this._playbackRate, 0.1, 20);

    if (options.volume !== undefined) {
      this.setVolume(options.volume);
    }

    if (options.muted !== undefined) {
      this.setMuted(options.muted);
    }

    this._enqueuePooledPlay({
      offset,
      duration: loop ? undefined : clip.end - offset,
      loop,
      loopStart: clip.start,
      loopEnd: clip.end,
      playbackRate,
    });
    this.onStart.dispatch();

    return this;
  }

  public pause(options?: Partial<PlaybackOptions>): this {
    if (options) {
      this.applyOptions(options);
    }

    if (this._paused && this._pooledSources.length === 0) {
      return this;
    }

    const hadPooledSources = this._pooledSources.length > 0;
    const wasPlaying = !this._paused || hadPooledSources;

    this._stopAllPooled();
    this._queuedPooledPlays.length = 0;

    this._paused = true;

    if (wasPlaying) {
      this.onStop.dispatch();
    }

    return this;
  }

  protected override _getAudioSetup(): { audioContext: AudioContext; gainNode: GainNode } | null {
    return this._audioSetup;
  }

  protected override _defaultBus(): AudioBus {
    return getAudioManager().sound;
  }

  protected override _disconnectFromBus(): void {
    if (this._audioSetup) {
      // Disconnect the upstream node (panner if spatial, else gainNode)
      const upstream = this._pannerNode ?? this._audioSetup.gainNode;
      upstream.disconnect();
    }
  }

  protected override _connectToBus(): void {
    if (this._audioSetup) {
      const upstream = this._pannerNode ?? this._audioSetup.gainNode;
      const inputNode = this.bus._getInputNode();
      if (inputNode) {
        upstream.connect(inputNode);
      } else {
        upstream.connect(this._audioSetup.audioContext.destination);
      }
    }
  }

  public override destroy(): void {
    if (this._pannerNode !== null) {
      this._pannerNode.disconnect();
      this._pannerNode = null;
    }
    if (this._position !== null) {
      this._position.destroy();
      this._position = null;
      getAudioManager()._unregisterSpatialSound(this);
    }
    if (this._velocity !== null) {
      this._velocity.destroy();
      this._velocity = null;
    }

    super.destroy();

    onAudioContextReady.remove(this._onAudioContextReady);

    this._audioSetup?.gainNode.disconnect();
    this._stopAllPooled();

    this._queuedPooledPlays.length = 0;
    this._sprites.clear();
  }

  /** Internal: called by AudioManager.update() once per frame for spatial sounds. */
  public _tickSpatial(): void {
    if (this._pannerNode === null || this._position === null) return;
    const ctx = this._pannerNode.context;
    const t = ctx.currentTime;
    const panner = this._pannerNode as unknown as Partial<{
      positionX: AudioParam;
      positionY: AudioParam;
      positionZ: AudioParam;
      setPosition: (x: number, y: number, z: number) => void;
    }>;
    if (panner.positionX) {
      panner.positionX.setValueAtTime(this._position.x, t);
      panner.positionY!.setValueAtTime(this._position.y, t);
      panner.positionZ!.setValueAtTime(0, t);
    } else if (panner.setPosition) {
      panner.setPosition(this._position.x, this._position.y, 0);
    }
  }

  private _setupSpatial(): void {
    if (!this._audioSetup || this._pannerNode !== null) return;
    const ctx = this._audioSetup.audioContext;
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = this._distanceModel;
    panner.refDistance = this._refDistance;
    panner.maxDistance = this._maxDistance;
    panner.rolloffFactor = this._rolloffFactor;
    this._pannerNode = panner;

    // Re-route: gainNode → pannerNode → bus.inputNode
    this._audioSetup.gainNode.disconnect();
    this._audioSetup.gainNode.connect(panner);

    const busInput = this.bus._getInputNode();
    if (busInput) {
      panner.connect(busInput);
    } else {
      panner.connect(ctx.destination);
    }
  }

  private _teardownSpatial(): void {
    if (!this._audioSetup || this._pannerNode === null) return;
    this._audioSetup.gainNode.disconnect();
    this._pannerNode.disconnect();
    this._pannerNode = null;

    // Restore: gainNode → bus.inputNode
    const busInput = this.bus._getInputNode();
    if (busInput) {
      this._audioSetup.gainNode.connect(busInput);
    } else {
      this._audioSetup.gainNode.connect(this._audioSetup.audioContext.destination);
    }
  }

  private setupWithAudioContext(audioContext: AudioContext): void {
    const gainNode = audioContext.createGain();
    gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 0.01);

    const inputNode = this.bus._getInputNode();
    if (inputNode) {
      gainNode.connect(inputNode);
    } else {
      gainNode.connect(audioContext.destination);
    }

    this._audioSetup = { audioContext, gainNode };

    this._flushQueuedPooledPlays();
  }

  private _enqueuePooledPlay(play: QueuedPooledPlay): void {
    if (!this._audioSetup) {
      this._queuedPooledPlays.push(play);

      return;
    }

    this._playPooledNow(play);
  }

  private _flushQueuedPooledPlays(): void {
    if (!this._audioSetup || this._queuedPooledPlays.length === 0) {
      return;
    }

    const queued = [...this._queuedPooledPlays];

    this._queuedPooledPlays.length = 0;

    for (const play of queued) {
      this._playPooledNow(play);
    }
  }

  private _playPooledNow(play: QueuedPooledPlay): void {
    if (!this._audioSetup) {
      return;
    }

    const { audioContext } = this._audioSetup;
    const sourceNode = this._createBufferSourceNode(this._audioSetup, play);
    const startedAt = audioContext.currentTime;
    const effectiveDuration = play.loop ? Infinity : (play.duration ?? Infinity);

    const pooledSource: PooledSource = { node: sourceNode, startedAt, effectiveDuration };

    sourceNode.onended = (): void => {
      const index = this._pooledSources.indexOf(pooledSource);

      if (index !== -1) {
        this._pooledSources.splice(index, 1);
      }

      sourceNode.disconnect();

      if (this._pooledSources.length === 0 && this._queuedPooledPlays.length === 0) {
        this._paused = true;
      }
    };

    this._pooledSources.push(pooledSource);
    this._trimPooledSources();
  }

  /**
   * Pick the index within `_pooledSources` of the source to evict.
   * The returned index is always valid (0 .. length-1).
   */
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

  /**
   * Returns the index of the source with the smallest remaining playback
   * time (i.e. closest to its natural end). Used for `LeastRecentlyUsed`.
   */
  private _pickClosestToEnd(): number {
    if (!this._audioSetup) return 0;

    const now = this._audioSetup.audioContext.currentTime;
    let minRemaining = Infinity;
    let minIndex = 0;

    for (let i = 0; i < this._pooledSources.length; i++) {
      const src = this._pooledSources[i];
      const elapsed = now - src.startedAt;
      const remaining = src.effectiveDuration - elapsed;

      if (remaining < minRemaining) {
        minRemaining = remaining;
        minIndex = i;
      }
    }

    return minIndex;
  }

  private _trimPooledSources(): void {
    while (this._pooledSources.length > this._poolSize) {
      const victimIndex = this._pickEvictionVictim();
      const victim = this._pooledSources[victimIndex];

      if (!victim) {
        break;
      }

      this._pooledSources.splice(victimIndex, 1);
      victim.node.onended = null;
      this._stopSourceNode(victim.node);
    }
  }

  /** Stop all pooled sources immediately (used by `replace: true` and `pause()`). */
  private _stopAllPooled(): void {
    for (const pooledSource of this._pooledSources) {
      pooledSource.node.onended = null;
      this._stopSourceNode(pooledSource.node);
    }

    this._pooledSources.length = 0;
  }

  private _stopSourceNode(sourceNode: AudioBufferSourceNode): void {
    try {
      sourceNode.stop(0);
    } catch {
      // source nodes can only be stopped once; ignore invalid state errors
    }

    sourceNode.disconnect();
  }

  private _createBufferSourceNode(setup: SoundAudioSetup, play: QueuedPooledPlay): AudioBufferSourceNode {
    const { gainNode } = setup;
    const sourceNode = setup.audioContext.createBufferSource();

    sourceNode.buffer = this._audioBuffer;
    sourceNode.loop = play.loop;
    sourceNode.playbackRate.value = play.playbackRate;

    if (play.loop) {
      sourceNode.loopStart = play.loopStart ?? 0;
      sourceNode.loopEnd = play.loopEnd ?? this.duration;
    }

    sourceNode.connect(gainNode);

    const duration = play.duration;

    if (!play.loop && duration !== undefined && duration > 0) {
      sourceNode.start(0, play.offset, duration);
    } else {
      sourceNode.start(0, play.offset);
    }

    return sourceNode;
  }
}
