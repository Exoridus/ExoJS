import type { SceneNode } from '#core/SceneNode';
import type { Signal } from '#core/Signal';
import type { Seconds } from '#core/units';
import type { Vector } from '#math/Vector';

import type { AudioBus } from './AudioBus';
import type { AudioEffect } from './AudioEffect';
import type { AudioSend } from './AudioSend';
import type { AudioSystem } from './AudioSystem';

/**
 * A live playback instance in the audio graph with a control surface.
 *
 * A Voice is created by playing a {@link Playable} via {@link AudioSystem.play}
 * (and, later, by opening an `AudioInput`). Each `play()` returns an independent
 * Voice, so overlapping concurrent playback of the same asset is just multiple
 * Voices.
 *
 * Concrete voices mix in the capability interfaces ({@link Seekable},
 * {@link Pausable}, {@link Loopable}, {@link RatePitched}) for whatever their
 * backing Web Audio node actually supports - narrow with a capability check
 * (`'seek' in voice`) before using one.
 *
 * {@link Spatializable} is not one of those: every voice carries it. The
 * panner is inserted lazily, so a voice that is never positioned costs
 * nothing, and {@link PlayOptions} already accepts the full spatial set at
 * play time - a returned voice must be able to keep steering what the play
 * call was allowed to start.
 */
export interface Voice extends Spatializable {
  /**
   * Stop playback and release this voice's resources. Pass `fade` to ramp the
   * volume to zero over that duration before stopping; omit (or pass `0`) to
   * stop immediately. Idempotent - calling again is a no-op.
   */
  stop(fade?: Seconds): void;
  /** Playback volume in the range [0, 1]. Bus volume (0..2) can amplify beyond this. */
  volume: number;
  /**
   * Ramp the volume to `to` (clamped to [0, 1]) over `duration` without
   * stopping. Use {@link Voice.stop} with a fade argument to fade out and stop.
   */
  fade(to: number, duration: Seconds): void;
  /** `true` once playback has ended naturally or been stopped. */
  readonly ended: boolean;
  /** Fires once when this voice ends (natural end or {@link Voice.stop}). */
  readonly onEnd: Signal;
  /**
   * The voice's output node - the last node before the {@link AudioBus}. Use it
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
  /**
   * Open a parallel send from this voice's output into `bus` at `level`
   * (default `1`).
   *
   * The dry path is untouched: the voice keeps playing into its own
   * {@link Voice.bus}, and a copy of the same signal additionally reaches `bus`.
   * Use it for shared ambience processing - one reverb serving many voices -
   * which an insert effect cannot express, because an insert replaces the signal
   * rather than duplicating it.
   *
   * The returned {@link AudioSend} is owned by this voice and torn down with it;
   * remove one early with {@link Voice.removeSend} only to change the routing.
   */
  addSend(bus: AudioBus, level?: number): AudioSend;
  /** Tear down a send opened on this voice. Idempotent; a send from another voice is ignored. */
  removeSend(send: AudioSend): this;
  /** Live view of this voice's open sends, in the order they were opened. */
  readonly sends: readonly AudioSend[];
  /**
   * Take ownership of a send opened against a different node, re-pointing it at
   * this voice's output.
   *
   * Exists for a deferred voice: a scene hands one out before the asset is ready,
   * so a send opened on it is wired to a placeholder and has to be handed over -
   * re-creating it would invalidate the handle the caller already holds.
   * @internal
   */
  _adoptSend(send: AudioSend): void;
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
 * - `'linear'` - `v = 1 - rolloffFactor * (d - refDistance) / (maxDistance - refDistance)`,
 *   clamped to [0, 1]. Reaches silence at `maxDistance`.
 * - `'inverse'` - `v = refDistance / (refDistance + rolloffFactor * (d - refDistance))`.
 *   Physically realistic; never reaches absolute silence.
 * - `'exponential'` - `v = (d / refDistance) ^ -rolloffFactor`. Steepest near
 *   the listener; useful for very intimate sources.
 */
export type DistanceModel = 'linear' | 'inverse' | 'exponential';

/**
 * A point in the audio world: the 2D world plane, plus an optional out-of-plane
 * height in the same units.
 *
 * `z` is optional everywhere it appears - a 2D game never supplies it, and a
 * scene node cannot, because the scene graph has no third axis.
 */
export interface SpatialPoint {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

/** A voice that can be positioned in space and optionally track a node. */
export interface Spatializable {
  /**
   * World-plane position of the source, or `null` when not spatialized.
   *
   * Two-dimensional, because the world plane is: the third axis lives on
   * {@link Spatializable.elevation}, which {@link Spatializable.follow} cannot
   * fill in and which most 2D games never touch.
   */
  get position(): Vector | null;
  /**
   * Accepts any `{ x, y }` point - implementations copy the values. A supplied
   * `z` is written to {@link Spatializable.elevation}, so a caller who thinks in
   * three axes can pass one point instead of two properties.
   */
  set position(value: Vector | SpatialPoint | null);
  /**
   * Height of the source above (positive) or below (negative) the world plane,
   * in world units. Default `0`.
   *
   * Independent of {@link Spatializable.position}, and preserved across a
   * position change that does not carry a `z`. It contributes to distance
   * attenuation, to the panner's own directionality, and to Doppler - a source
   * rising straight up recedes.
   */
  elevation: number;
  /**
   * How obstructed the path from this source to the listener is, in `[0, 1]`.
   * `0` (default) is a clear path; `1` is fully obstructed.
   *
   * Caller-supplied: the engine does not trace geometry, because what counts as
   * an obstruction is a game's decision (a wall, a closed door, a crowd). Write
   * an estimate as often as you like - it is ramped, not stepped, so a per-frame
   * value does not click.
   *
   * Realized as a lowpass plus an attenuation, tuned by
   * `app.audio.spatial.occlusionCutoff` / `.occlusionAttenuation`. A voice whose
   * occlusion stays `0` builds neither node.
   */
  occlusion: number;
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
  /**
   * Facing direction for cone attenuation, in degrees - same convention as
   * `SceneNode.rotation` (0° = local +X / "east", clockwise-positive on a
   * Y-down screen). Has no audible effect unless `coneInnerAngle`/
   * `coneOuterAngle` are narrowed below 360°. Default `0`.
   */
  orientation: number;
  /** Full-gain cone half-angle in degrees. Default `360` (omnidirectional - no cone). */
  coneInnerAngle: number;
  /** Falloff-to-`coneOuterGain` cone half-angle in degrees. Default `360`. */
  coneOuterAngle: number;
  /** Gain applied outside `coneOuterAngle`. Default `0`. */
  coneOuterGain: number;
  /**
   * World-space velocity of the source (world units/second), or `null`.
   * Feeds the Doppler calculation (`app.audio.spatial.dopplerFactor`) -
   * has no other effect. Explicit; when `null` and `follow(node)` is
   * active, velocity is auto-derived each frame from the tracked node's
   * position delta instead.
   */
  get velocity(): Vector | null;
  /**
   * Accepts any `{ x, y }` point - implementations copy the values. A supplied
   * `z` is written to {@link Spatializable.elevationVelocity}.
   */
  set velocity(value: Vector | SpatialPoint | null);
  /**
   * Vertical component of {@link Spatializable.velocity}, in world units per
   * second. Default `0`. Only Doppler reads it.
   */
  elevationVelocity: number;
}

/**
 * Per-play overrides passed to {@link AudioSystem.play}.
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
  /** Initial spatial position - equivalent to setting `voice.position` right after play. */
  position?: SpatialPoint | Vector;
  /** Initial height above the world plane. Default `0`. */
  elevation?: number;
  /** Initial occlusion amount in `[0, 1]`. Default `0` (clear path). */
  occlusion?: number;
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
  /** Initial cone facing direction, in degrees (`SceneNode.rotation` convention). Default `0`. */
  orientation?: number;
  /** Initial full-gain cone half-angle. Default `360` (no cone). */
  coneInnerAngle?: number;
  /** Initial falloff cone half-angle. Default `360`. */
  coneOuterAngle?: number;
  /** Initial gain outside the outer cone. Default `0`. */
  coneOuterGain?: number;
  /** Initial velocity for Doppler. See {@link Spatializable.velocity}. */
  velocity?: SpatialPoint | Vector;
  /** Initial vertical velocity for Doppler. Default `0`. */
  elevationVelocity?: number;
  /** Parallel sends to open on the voice right after play - one per bus. */
  sends?: ReadonlyArray<{ readonly bus: AudioBus; readonly level?: number }>;
}

/**
 * Implemented by audio assets ({@link Sound}, {@link AudioStream},
 * {@link AudioGenerator}) to support system-driven playback via
 * {@link AudioSystem.play}.
 *
 * Assets are **data descriptors** - they hold the audio data and default
 * playback parameters. The playback machinery lives in the {@link Voice}
 * returned by `createVoice`; the system is injected at play time, so assets
 * never reach for a global.
 *
 * `createVoice` is a low-level hook meant for asset implementations;
 * consumers should call `audioSystem.play(asset)` instead of invoking it
 * directly.
 * @advanced
 */
export interface Playable {
  /**
   * Create and start a new playback instance. Called by
   * {@link AudioSystem.play}; do not call directly.
   *
   * @param system - The owning {@link AudioSystem} (provides bus hierarchy).
   * @param options - Per-play overrides.
   * @returns A {@link Voice} handle for the new instance.
   */
  createVoice(system: AudioSystem, options: PlayOptions): Voice;
}
