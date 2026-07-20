import type { SceneNode } from '#core/SceneNode';
import type { Signal } from '#core/Signal';
import type { Vector } from '#math/Vector';

import type { AudioBus } from './AudioBus';
import type { AudioEffect } from './AudioEffect';
import type { AudioManager } from './AudioManager';

/**
 * A live playback instance in the audio graph with a control surface.
 *
 * A Voice is created by playing a {@link Playable} via {@link AudioManager.play}
 * (and, later, by opening an `AudioInput`). Each `play()` returns an independent
 * Voice, so overlapping concurrent playback of the same asset is just multiple
 * Voices.
 *
 * Concrete voices mix in the capability interfaces ({@link Seekable},
 * {@link Pausable}, {@link Loopable}, {@link RatePitched}, {@link Spatializable})
 * for whatever their backing Web Audio node actually supports — narrow with a
 * capability check (`'seek' in voice`) before using one.
 */
export interface Voice {
  /**
   * Stop playback and release this voice's resources. Pass `fadeMs` to ramp
   * the volume to zero over that many milliseconds before stopping; omit (or
   * pass `0`) to stop immediately. Idempotent — calling again is a no-op.
   */
  stop(fadeMs?: number): void;
  /** Playback volume in the range [0, 1]. Bus volume (0..2) can amplify beyond this. */
  volume: number;
  /**
   * Ramp the volume to `to` (clamped to [0, 1]) over `ms` milliseconds without
   * stopping. Use {@link Voice.stop} with a fade argument to fade out and stop.
   */
  fade(to: number, ms: number): void;
  /** `true` once playback has ended naturally or been stopped. */
  readonly ended: boolean;
  /** Fires once when this voice ends (natural end or {@link Voice.stop}). */
  readonly onEnd: Signal;
  /**
   * The voice's output node — the last node before the {@link AudioBus}. Use it
   * as a parallel tap for an analyser, or (later) as the insertion point for
   * per-voice effects.
   */
  readonly output: AudioNode;
  /** The {@link AudioBus} this voice routes into. Reassign to reroute live. */
  bus: AudioBus;
  /**
   * Insert a per-voice {@link AudioEffect} into this voice's output chain
   * (after the volume gain, before the bus). Effects are applied in insertion
   * order.
   */
  addEffect(effect: AudioEffect): this;
  /** Remove a previously added per-voice effect. The caller still owns it and must `destroy()` it. */
  removeEffect(effect: AudioEffect): this;
}

/** A voice whose playhead can be read and moved. */
export interface Seekable {
  /** Current playback position in seconds. */
  time: number;
  /** Total duration in seconds (`Infinity` for open-ended sources). */
  readonly duration: number;
  /** Move the playhead to `t` seconds. */
  seek(t: number): void;
}

/** A voice that can be paused and resumed in place. */
export interface Pausable {
  pause(): void;
  resume(): void;
  readonly paused: boolean;
}

/** A voice whose source can loop. */
export interface Loopable {
  loop: boolean;
}

/** A voice with rate / pitch controls. */
export interface RatePitched {
  /** Playback rate multiplier (1 = normal). */
  playbackRate: number;
  /** Fine pitch offset in cents. */
  detune: number;
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

/** A voice that can be positioned in 2D space and optionally track a node. */
export interface Spatializable {
  /** World-space position of the source, or `null` when not spatialized. */
  get position(): Vector | null;
  /** Accepts any `{ x, y }` point — implementations copy the values. */
  set position(value: Vector | { x: number; y: number } | null);
  /**
   * Track a {@link SceneNode}: the voice reads the node's global translation
   * each frame. Pass `null` to stop following and fall back to
   * {@link Spatializable.position}.
   */
  follow(node: SceneNode | null): void;
  /** Distance-attenuation model. Default `'linear'`. */
  distanceModel: DistanceModel;
  /** Distance below which volume is at full strength. Default `50`. */
  refDistance: number;
  /** For the `'linear'` model: distance at which volume reaches zero. Default `1000`. */
  maxDistance: number;
  /** Falloff rate. Higher = steeper attenuation. Default `1`. */
  rolloffFactor: number;
  /**
   * Per-voice panning model override. `null` (default) inherits the
   * app-wide default from `app.audio.spatial.panningModel`.
   */
  panningModel: PanningModelType | null;
}

/**
 * Per-play overrides passed to {@link AudioManager.play}.
 */
export interface PlayOptions {
  /** Route this play through a specific {@link AudioBus}. */
  bus?: AudioBus;
  /** Override volume for this play instance. Range [0, 1]. */
  volume?: number;
  /** Override looping for this play instance. */
  loop?: boolean;
  /** Override playback rate for this play instance. */
  playbackRate?: number;
  /** Override pitch detune (cents) for this play instance. */
  detune?: number;
  /** Seek offset in seconds before starting playback. */
  time?: number;
  /** Start muted (volume 0). */
  muted?: boolean;
  /** Initial spatial position — equivalent to setting `voice.position` right after play. */
  position?: { x: number; y: number } | Vector;
  /** Initial distance-attenuation model. Default `'linear'`. */
  distanceModel?: DistanceModel;
  /** Initial reference distance. Default `50`. */
  refDistance?: number;
  /** Initial max distance (`'linear'` model only). Default `1000`. */
  maxDistance?: number;
  /** Initial rolloff factor. Default `1`. */
  rolloffFactor?: number;
  /** Per-play panning model override. Omit to inherit the app-wide default. */
  panningModel?: PanningModelType;
}

/**
 * Implemented by audio assets ({@link Sound}, {@link AudioStream},
 * {@link AudioGenerator}) to support manager-driven playback via
 * {@link AudioManager.play}.
 *
 * Assets are **data descriptors** — they hold the audio data and default
 * playback parameters. The playback machinery lives in the {@link Voice}
 * returned by `_createVoice`; the manager is injected at play time, so assets
 * never reach for a global.
 *
 * @internal - `_createVoice` is a low-level hook; consumers should call
 * `audioManager.play(asset)` instead of calling `_createVoice` directly.
 */
export interface Playable {
  /**
   * Create and start a new playback instance. Called by
   * {@link AudioManager.play}; do not call directly.
   *
   * @param manager - The owning {@link AudioManager} (provides bus hierarchy).
   * @param options - Per-play overrides.
   * @returns A {@link Voice} handle for the new instance.
   */
  _createVoice(manager: AudioManager, options: PlayOptions): Voice;
}
