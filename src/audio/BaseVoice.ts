import { assert } from '#core/dev';
import type { SceneNode } from '#core/SceneNode';
import { Signal } from '#core/Signal';
import { clamp, degreesToRadians } from '#math/utils';
import { Vector } from '#math/Vector';

import type { AudioBus } from './AudioBus';
import type { AudioEffect } from './AudioEffect';
import { isEffectReady } from './AudioEffect';
import type { AudioManager } from './AudioManager';
import { AudioSend } from './AudioSend';
import type { DistanceModel, Spatializable, SpatialPoint, Voice } from './Playable';
import {
  createVelocitySample,
  deriveVelocity,
  POSITION_EPSILON,
  SmoothedAudioParam,
  type SpatialSmoothingSettings,
  type VelocitySample,
} from './spatial-smoothing';

/** Clamp range for the Doppler ratio applied to a voice's playback rate - a much
 * tighter range than the general [0.1, 20] `playbackRate` clamp, since a wide
 * Doppler swing alone would never sound like a desirable game-feel effect. */
const MIN_DOPPLER_RATIO = 0.1;
const MAX_DOPPLER_RATIO = 4;

/** Distance-attenuation configuration for a spatial voice. */
export interface VoiceSpatialConfig {
  distanceModel: DistanceModel;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
}

const defaultSpatialConfig: VoiceSpatialConfig = {
  distanceModel: 'linear',
  refDistance: 50,
  maxDistance: 1000,
  rolloffFactor: 1,
};

/** Construction parameters shared by every concrete voice. */
export interface BaseVoiceInit {
  audioContext: AudioContext;
  /** The voice's output gain - the last node before the bus. */
  output: GainNode;
  bus: AudioBus;
  manager: AudioManager;
  /** Initial volume, range [0, 1]. */
  volume: number;
  /**
   * Connect the output to the bus on construction. Default `true`. Pass `false`
   * for analysis-only voices (e.g. a live {@link InputVoice}) that should not be
   * audible until explicitly routed.
   */
  autoConnect?: boolean;
}

/** A voice the {@link AudioManager} ticks each frame for spatial updates. */
export interface SpatialVoice {
  readonly ended: boolean;
  _tickSpatial(): void;
}

/**
 * Shared base for the concrete voices ({@link SoundVoice},
 * {@link AudioStreamVoice}, {@link AudioGeneratorVoice}). Implements the common
 * {@link Voice} control surface - volume, fade, stop, lifecycle Signal, bus
 * routing - and the {@link Spatializable} capability via a lazily-inserted
 * `PannerNode`.
 *
 * The voice graph is `<source> → [panner] → output(gain) → bus.input`. The
 * `output` gain is always the last node (a stable tap point); the panner is
 * inserted between the source and the gain only once the voice is actually
 * spatialized. Concrete voices provide the two source-specific hooks
 * {@link BaseVoice._routeThroughPanner} and {@link BaseVoice._teardownSource}.
 *
 * @internal
 */
export abstract class BaseVoice implements Voice, SpatialVoice {
  protected readonly _audioContext: AudioContext;
  protected readonly _output: GainNode;
  protected readonly _manager: AudioManager;
  protected _bus: AudioBus;
  protected _volume: number;
  protected _ended = false;
  protected _stopTimer: ReturnType<typeof setTimeout> | null = null;

  public readonly onEnd = new Signal();

  private readonly _spatialConfig: VoiceSpatialConfig;
  protected _panner: PannerNode | null = null;
  private _position: Vector | null = null;
  private _panningModel: PanningModelType | null = null;
  private _followNode: SceneNode | null = null;
  private _spatialRegistered = false;
  private _velocity: Vector | null = null;
  private _explicitVelocity = false;
  private _elevation = 0;
  private _elevationVelocity = 0;
  private _occlusion = 0;
  /** Lowpass + attenuation for {@link BaseVoice.occlusion}; both `null` until it leaves `0`. */
  private _occlusionFilter: BiquadFilterNode | null = null;
  private _occlusionGain: GainNode | null = null;
  private readonly _sends: AudioSend[] = [];
  private readonly _velocitySample: VelocitySample = createVelocitySample();
  private readonly _smoothX = new SmoothedAudioParam();
  private readonly _smoothY = new SmoothedAudioParam();
  private readonly _smoothZ = new SmoothedAudioParam();
  private _orientation = 0;
  private _coneInnerAngle = 360;
  private _coneOuterAngle = 360;
  private _coneOuterGain = 0;
  private _dopplerActive = false;
  private readonly _smoothOrientX = new SmoothedAudioParam();
  private readonly _smoothOrientY = new SmoothedAudioParam();
  private readonly _smoothOrientZ = new SmoothedAudioParam();
  /** Unsubscribe for a deferred bus-reconnect queued while the bus was locked (AU3). */
  private _pendingBusSetup: (() => void) | null = null;

  /** Per-voice effect chain, inserted between the output gain and the bus. */
  private readonly _effects: AudioEffect[] = [];

  protected constructor(init: BaseVoiceInit) {
    this._audioContext = init.audioContext;
    this._output = init.output;
    this._bus = init.bus;
    this._manager = init.manager;
    this._volume = clamp(init.volume, 0, 1);
    this._spatialConfig = { ...defaultSpatialConfig };

    this._output.gain.setTargetAtTime(this._volume, this._audioContext.currentTime, 0.01);
    if (init.autoConnect !== false) {
      this._connectOutput();
    }

    // Registered here rather than in `AudioManager.play` so that every voice is
    // covered regardless of how it was constructed - `open()`, sprite playback
    // and pooled replays all go through this constructor. `_finish` deregisters.
    this._manager._registerVoice(this);
  }

  // -------------------------------------------------------------------------
  // Voice
  // -------------------------------------------------------------------------

  public get ended(): boolean {
    return this._ended;
  }

  public get output(): AudioNode {
    return this._output;
  }

  public get volume(): number {
    return this._volume;
  }

  public set volume(value: number) {
    this._volume = clamp(value, 0, 1);
    if (!this._ended) {
      this._output.gain.setTargetAtTime(this._volume, this._audioContext.currentTime, 0.01);
    }
  }

  public get bus(): AudioBus {
    return this._bus;
  }

  public set bus(bus: AudioBus) {
    if (bus === this._bus) return;
    if (this._ended) {
      this._bus = bus;
      return;
    }
    this._tail().disconnect();
    this._bus = bus;
    this._connectOutput();
  }

  /**
   * Append an effect to this voice's chain.
   *
   * Attaching the same effect twice is a caller error: the rebuilt chain would
   * wire the effect's output back into its own input, producing a feedback
   * loop. The dev build asserts; production ignores the second attach.
   */
  public addEffect(effect: AudioEffect): this {
    if (this._ended) return this;

    if (this._effects.includes(effect)) {
      assert(false, 'Voice.addEffect: this effect is already attached to the voice.');

      return this;
    }

    this._effects.push(effect);
    this._rebuildEffectChain();
    return this;
  }

  public removeEffect(effect: AudioEffect): this {
    const index = this._effects.indexOf(effect);
    if (index !== -1) {
      this._effects.splice(index, 1);
      // Detach the removed effect's output from the graph (its internal input
      // wiring is left intact so the caller can reuse it). The rebuild below
      // only touches the effects still in the chain. Skipped for an effect
      // whose own nodes have not been created yet - same probe `AudioBus`
      // uses, since `outputNode` throws on an effect still mid-setup.
      if (isEffectReady(effect)) {
        effect.outputNode.disconnect();
      }
      this._rebuildEffectChain();
    }
    return this;
  }

  public fade(to: number, ms: number): void {
    if (this._ended) return;

    const target = clamp(to, 0, 1);
    this._volume = target;

    const ctx = this._audioContext;
    const node = this._output;

    if (ms <= 0) {
      node.gain.setTargetAtTime(target, ctx.currentTime, 0.01);
      return;
    }

    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setValueAtTime(node.gain.value, ctx.currentTime);
    node.gain.linearRampToValueAtTime(target, ctx.currentTime + ms / 1000);
  }

  public stop(fadeMs?: number): void {
    if (this._ended) return;

    if (fadeMs !== undefined && fadeMs > 0) {
      const ctx = this._audioContext;
      const node = this._output;
      node.gain.cancelScheduledValues(ctx.currentTime);
      node.gain.setValueAtTime(node.gain.value, ctx.currentTime);
      node.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeMs / 1000);

      this._clearStopTimer();
      this._stopTimer = setTimeout(() => {
        this._stopTimer = null;
        this._finish();
      }, fadeMs);
      return;
    }

    this._finish();
  }

  // -------------------------------------------------------------------------
  // Spatializable
  // -------------------------------------------------------------------------

  public get position(): Vector | null {
    return this._position;
  }

  public set position(value: Vector | SpatialPoint | null) {
    if (this._ended) return;

    if (value === null) {
      if (this._position !== null) {
        this._position.destroy();
        this._position = null;
      }
      this._disableSpatializationIfUnused();
      return;
    }

    if (this._position === null) {
      this._position = new Vector(value.x, value.y);
    } else {
      this._position.set(value.x, value.y);
    }

    // Only a supplied `z` writes elevation. A point without one leaves the
    // current height alone rather than resetting it, so `follow()` and a plain
    // `{ x, y }` write cannot silently drop a source back to the plane.
    const z = (value as SpatialPoint).z;

    if (z !== undefined) {
      this._elevation = z;
    }

    this._ensurePanner();
    this._tickSpatial();
  }

  /**
   * Track `node`'s position each frame and pan this voice from it (or stop
   * tracking with `null`). Reads {@link SceneNode.getWorldTransform} - the
   * TRUE world position, composed through {@link RetainedContainer}
   * transform-group boundaries - so an emitter inside a camera-panned world
   * group sounds where it is drawn.
   */
  public follow(node: SceneNode | null): void {
    if (this._ended) return;
    this._followNode = node;
    if (node !== null) {
      this._ensurePanner();
      this._tickSpatial();
    } else {
      this._disableSpatializationIfUnused();
    }
  }

  public get distanceModel(): DistanceModel {
    return this._spatialConfig.distanceModel;
  }

  public set distanceModel(value: DistanceModel) {
    this._spatialConfig.distanceModel = value;
    if (this._panner !== null) {
      this._panner.distanceModel = value;
    }
  }

  public get refDistance(): number {
    return this._spatialConfig.refDistance;
  }

  public set refDistance(value: number) {
    // Clamped to strictly positive - refDistance = 0 divides by zero in the
    // 'exponential' distance model, (d / refDistance) ^ -rolloffFactor. Not
    // coupled to maxDistance: forcing the two to stay ordered would silently
    // create a maxDistance === refDistance state, which divides by zero in
    // the default 'linear' model instead. An out-of-order pair is left to
    // the caller - no worse than the pre-existing possibility of setting
    // both to the same value directly.
    const safe = Number.isFinite(value) ? value : this._spatialConfig.refDistance;
    const clamped = Math.max(Number.EPSILON, safe);
    this._spatialConfig.refDistance = clamped;
    if (this._panner !== null) {
      this._panner.refDistance = clamped;
    }
  }

  public get maxDistance(): number {
    return this._spatialConfig.maxDistance;
  }

  public set maxDistance(value: number) {
    // Clamped to strictly positive per the PannerNode spec (a non-positive
    // maxDistance throws RangeError in a real browser) - independent of
    // refDistance, see the note on that setter above.
    const safe = Number.isFinite(value) ? value : this._spatialConfig.maxDistance;
    const clamped = Math.max(Number.EPSILON, safe);
    this._spatialConfig.maxDistance = clamped;
    if (this._panner !== null) {
      this._panner.maxDistance = clamped;
    }
  }

  public get rolloffFactor(): number {
    return this._spatialConfig.rolloffFactor;
  }

  public set rolloffFactor(value: number) {
    const safe = Number.isFinite(value) ? value : this._spatialConfig.rolloffFactor;
    const clamped = Math.max(0, safe);
    this._spatialConfig.rolloffFactor = clamped;
    if (this._panner !== null) {
      this._panner.rolloffFactor = clamped;
    }
  }

  public get panningModel(): PanningModelType | null {
    return this._panningModel;
  }

  public set panningModel(value: PanningModelType | null) {
    this._panningModel = value;
    if (this._panner !== null) {
      this._panner.panningModel = value ?? this._manager.spatial.panningModel;
    }
  }

  public get orientation(): number {
    return this._orientation;
  }

  public set orientation(value: number) {
    this._orientation = value;
    this._writeOrientation();
  }

  public get coneInnerAngle(): number {
    return this._coneInnerAngle;
  }

  public set coneInnerAngle(value: number) {
    const safe = Number.isFinite(value) ? value : this._coneInnerAngle;
    const clamped = clamp(safe, 0, 360);
    this._coneInnerAngle = clamped;
    if (this._panner !== null) {
      this._panner.coneInnerAngle = clamped;
    }
  }

  public get coneOuterAngle(): number {
    return this._coneOuterAngle;
  }

  public set coneOuterAngle(value: number) {
    const safe = Number.isFinite(value) ? value : this._coneOuterAngle;
    const clamped = clamp(safe, 0, 360);
    this._coneOuterAngle = clamped;
    if (this._panner !== null) {
      this._panner.coneOuterAngle = clamped;
    }
  }

  public get coneOuterGain(): number {
    return this._coneOuterGain;
  }

  public set coneOuterGain(value: number) {
    const safe = Number.isFinite(value) ? value : this._coneOuterGain;
    const clamped = clamp(safe, 0, 1);
    this._coneOuterGain = clamped;
    if (this._panner !== null) {
      this._panner.coneOuterGain = clamped;
    }
  }

  public get velocity(): Vector | null {
    return this._velocity;
  }

  public set velocity(value: Vector | SpatialPoint | null) {
    if (this._ended) return;

    if (value === null) {
      if (this._velocity !== null) {
        this._velocity.destroy();
        this._velocity = null;
      }
      this._explicitVelocity = false;
      return;
    }

    // Reject a non-finite component outright (no partial write) - an
    // explicit NaN/±Infinity velocity would otherwise feed straight into the
    // Doppler ratio calculation. Keep whatever velocity was in effect before.
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return;

    if (this._velocity === null) {
      this._velocity = new Vector(value.x, value.y);
    } else {
      this._velocity.set(value.x, value.y);
    }

    const z = (value as SpatialPoint).z;

    if (z !== undefined) {
      this._elevationVelocity = z;
    }

    this._explicitVelocity = true;
  }

  public get elevation(): number {
    return this._elevation;
  }

  public set elevation(value: number) {
    if (!Number.isFinite(value) || value === this._elevation) {
      return;
    }

    this._elevation = value;
    // A voice positioned only by elevation is still spatial - without this a
    // caller who sets height before position would get no panner at all.
    this._ensurePanner();
    this._tickSpatial();
  }

  public get elevationVelocity(): number {
    return this._elevationVelocity;
  }

  public set elevationVelocity(value: number) {
    if (!Number.isFinite(value)) {
      return;
    }

    this._elevationVelocity = value;
    this._explicitVelocity = true;
  }

  public get occlusion(): number {
    return this._occlusion;
  }

  public set occlusion(value: number) {
    const clamped = clamp(Number.isFinite(value) ? value : 0, 0, 1);

    if (clamped === this._occlusion) {
      return;
    }

    const wasClear = this._occlusion === 0;

    this._occlusion = clamped;

    if (this._ended) {
      return;
    }

    // Nothing is built for a voice that stays clear, and nothing is torn down
    // when it returns to clear: the two nodes are cheap to leave in place and
    // rebuilding the chain on every threshold crossing would be audible.
    if (wasClear && this._occlusionFilter === null) {
      this._buildOcclusionStage();
    }

    this._writeOcclusion();
  }

  public get sends(): readonly AudioSend[] {
    return this._sends;
  }

  public addSend(bus: AudioBus, level = 1): AudioSend {
    const send = new AudioSend(this._audioContext, this._output, bus, level);

    this._sends.push(send);

    // A send on an already-finished voice is legal but pointless; destroying it
    // straight away keeps the invariant that a voice's sends never outlive it.
    if (this._ended) {
      send.destroy();
    }

    return send;
  }

  /**
   * Take ownership of a send opened elsewhere against this voice's output, so it
   * is torn down with this voice like any other.
   *
   * Used by the deferred voice a scene hands out: the send exists before the real
   * voice does, and re-creating it at flush would invalidate the handle the
   * caller already holds.
   * @internal
   */
  public _adoptSend(send: AudioSend): void {
    if (this._sends.includes(send)) {
      return;
    }

    send._retarget(this._output);
    this._sends.push(send);

    if (this._ended) {
      send.destroy();
    }
  }

  public removeSend(send: AudioSend): this {
    const index = this._sends.indexOf(send);

    if (index !== -1) {
      this._sends.splice(index, 1);
      send.destroy();
    }

    return this;
  }

  /** @internal Called once per frame by {@link AudioManager.update} for spatial voices. */
  public _tickSpatial(): void {
    if (this._panner === null || this._ended) return;

    let x: number;
    let y: number;

    if (this._followNode !== null) {
      // World transform, NOT the global one: getGlobalTransform is
      // group-RELATIVE under a RetainedContainer boundary, which would pan
      // the sound with the group's local origin instead of its on-screen
      // world position (AU1).
      const transform = this._followNode.getWorldTransform();
      x = transform.x;
      y = transform.y;
    } else if (this._position !== null) {
      x = this._position.x;
      y = this._position.y;
    } else {
      return;
    }

    const panner = this._panner as unknown as Partial<{
      positionX: AudioParam;
      positionY: AudioParam;
      positionZ: AudioParam;
      setPosition: (x: number, y: number, z: number) => void;
    }>;
    const t = this._audioContext.currentTime;
    const settings = this._manager.spatial;

    // Written RELATIVE to this manager's own listener, which is virtual - the
    // real `AudioContext.listener` is process-wide and stays pinned at the
    // origin, so two Applications cannot fight over it (see
    // {@link AudioListener}). With the listener at the origin the offset vector
    // is all a panner needs: distance, attenuation and the distance model come
    // out mathematically identical to writing absolute positions.
    const listener = this._manager.listener;
    const listenerPosition = listener.position;
    const relativeX = x - listenerPosition.x;
    const relativeY = y - listenerPosition.y;
    const relativeZ = this._elevation - listener.elevation;

    if (panner.positionX) {
      // Route through the smoothing layer (setTargetAtTime + epsilon-skip +
      // teleport-snap) to eliminate per-frame zipper noise on moving sources (AU4).
      // This now also carries listener motion, which used to be smoothed once
      // centrally on the listener's own params.
      this._smoothX.write(panner.positionX, relativeX, t, settings);
      this._smoothY.write(panner.positionY!, relativeY, t, settings);
      this._smoothZ.write(panner.positionZ!, relativeZ, t, settings);
    } else if (panner.setPosition) {
      // Legacy AudioParam-less API: snap only (no smoothing available).
      panner.setPosition(relativeX, relativeY, relativeZ);
    }

    this._writeOrientation();
    // Doppler stays in ABSOLUTE world coordinates: it projects both velocities
    // onto the true line of sight and never touches a panner position param.
    this._tickDoppler(x, y, this._elevation, t, settings);
  }

  /**
   * Resolve this tick's effective velocity (explicit {@link BaseVoice.velocity},
   * else auto-derived from the position delta since the last tick), then
   * compute and apply the Doppler ratio against the listener. No-op entirely
   * when `dopplerFactor` is `0` (the default) - genuinely zero cost when the
   * feature is unused.
   *
   * Ratio formula: classic Doppler is
   * `f' = f * (c + v_listener_toward_source) / (c + v_source_away_from_listener)`.
   * For game-scale velocities (which are typically small relative to the
   * tunable {@link SpatialSmoothingSettings.speedOfSound} reference) this is
   * linearized to
   * `ratio = 1 + dopplerFactor * (listenerApproachSpeed - sourceRecedeSpeed) / speedOfSound`
   * - a first-order Taylor approximation of the physical ratio around 1 that
   * stays numerically well-behaved (no risk of a negative or exploding
   * denominator) and lets `dopplerFactor` scale linearly as an exaggeration
   * knob, then the result is clamped to a sane, tight positive range (see
   * {@link MIN_DOPPLER_RATIO}/{@link MAX_DOPPLER_RATIO}) - a source or
   * listener closing at or above `speedOfSound` pushes the *linearized* ratio
   * arbitrarily high/low, so the clamp is what actually keeps that case sane,
   * not the formula itself.
   */
  private _tickDoppler(x: number, y: number, z: number, now: number, settings: SpatialSmoothingSettings): void {
    if (settings.dopplerFactor <= 0) {
      this._setDopplerRatio(1);
      return;
    }

    let vx: number;
    let vy: number;
    // Only ever explicit: a derived velocity comes from the tracked position,
    // and nothing tracks elevation - `follow()` reads a 2D scene node.
    const vz = this._explicitVelocity ? this._elevationVelocity : 0;

    if (this._explicitVelocity && this._velocity !== null) {
      vx = this._velocity.x;
      vy = this._velocity.y;
    } else {
      deriveVelocity(this._velocitySample, x, y, now);
      vx = this._velocitySample.x;
      vy = this._velocitySample.y;
    }

    const listener = this._manager.listener;
    const dx = x - listener.position.x;
    const dy = y - listener.position.y;
    const dz = z - listener.elevation;
    const distance = Math.hypot(dx, dy, dz);
    // Coincident with the listener - no defined line of sight to project onto.
    if (distance < POSITION_EPSILON) {
      this._setDopplerRatio(1);
      return;
    }

    const ux = dx / distance;
    const uy = dy / distance;
    const uz = dz / distance;

    // Positive = source moving away from the listener along the line of sight.
    const sourceRecedeSpeed = vx * ux + vy * uy + vz * uz;
    const listenerVelocity = listener.velocity;
    // Positive = listener moving toward the source along the same line.
    const listenerApproachSpeed = listenerVelocity.x * ux + listenerVelocity.y * uy + listener.elevationVelocity * uz;

    const speedOfSound = Math.max(POSITION_EPSILON, settings.speedOfSound);
    const rawRatio = 1 + settings.dopplerFactor * ((listenerApproachSpeed - sourceRecedeSpeed) / speedOfSound);
    this._setDopplerRatio(clamp(rawRatio, MIN_DOPPLER_RATIO, MAX_DOPPLER_RATIO));
  }

  private _setDopplerRatio(ratio: number): void {
    // A single backstop against every possible NaN source feeding the ratio
    // calculation (explicit or derived velocity, a NaN/zero `speedOfSound` on
    // the shared settings object, ...) - falls back to the neutral ratio
    // rather than ever writing a non-finite value to a live AudioParam.
    const safeRatio = Number.isFinite(ratio) ? ratio : 1;
    if (safeRatio === 1 && !this._dopplerActive) return;
    this._dopplerActive = safeRatio !== 1;
    this._applyDopplerRate(safeRatio);
  }

  /**
   * Convert `_orientation` (degrees, `SceneNode.rotation` convention) to a
   * unit XY vector and write it through the same smoothing layer used for
   * position, so a fast-rotating emitter's cone direction never zippers.
   *
   * Z stays 0 even for an elevated source: `orientation` is a single in-plane
   * angle, so a cone always points along the world plane. Tilting one would need
   * a second angle, which no caller can supply today.
   */
  private _writeOrientation(): void {
    if (this._panner === null || this._ended) return;

    const radians = degreesToRadians(this._orientation);
    const x = Math.cos(radians);
    const y = Math.sin(radians);

    const panner = this._panner as unknown as Partial<{
      orientationX: AudioParam;
      orientationY: AudioParam;
      orientationZ: AudioParam;
      setOrientation: (x: number, y: number, z: number) => void;
    }>;
    const t = this._audioContext.currentTime;
    const settings = this._manager.spatial;

    if (panner.orientationX) {
      this._smoothOrientX.write(panner.orientationX, x, t, settings);
      this._smoothOrientY.write(panner.orientationY!, y, t, settings);
      this._smoothOrientZ.write(panner.orientationZ!, 0, t, settings);
    } else if (panner.setOrientation) {
      panner.setOrientation(x, y, 0);
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** The last node in the voice chain before the bus - the output gain, the occlusion stage, or the last effect. */
  protected _tail(): AudioNode {
    const lastEffect = this._effects[this._effects.length - 1];

    if (lastEffect !== undefined) {
      return lastEffect.outputNode;
    }

    return this._occlusionGain ?? this._output;
  }

  /**
   * Create the occlusion lowpass and attenuation and splice them in as
   * `output -> lowpass -> gain -> [effects] -> bus`.
   *
   * Before the caller's own effect chain on purpose: occlusion describes the path
   * from the source to the listener, so it belongs with the source, and an insert
   * the caller added is meant to hear what the listener would.
   */
  private _buildOcclusionStage(): void {
    const filter = this._audioContext.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.value = this._openCutoff();
    filter.Q.value = 0.7071;

    const gain = this._audioContext.createGain();

    gain.gain.value = 1;

    this._occlusionFilter = filter;
    this._occlusionGain = gain;
    this._rebuildEffectChain();
  }

  /** Highest cutoff the context can express - a lowpass above Nyquist is a no-op, not an error. */
  private _openCutoff(): number {
    return this._audioContext.sampleRate / 2;
  }

  /**
   * Write the current occlusion amount onto the lowpass and the attenuation.
   *
   * The cutoff sweeps LOGARITHMICALLY between the open value and
   * `spatial.occlusionCutoff`. A linear sweep spends most of its range in the
   * inaudible top octaves, so half the parameter would do almost nothing.
   */
  private _writeOcclusion(): void {
    const filter = this._occlusionFilter;
    const gain = this._occlusionGain;

    if (filter === null || gain === null) {
      return;
    }

    const settings = this._manager.spatial;
    const now = this._audioContext.currentTime;
    const open = this._openCutoff();
    const closed = clamp(settings.occlusionCutoff, 20, open);
    const cutoff = open * (closed / open) ** this._occlusion;
    const attenuated = clamp(settings.occlusionAttenuation, 0, 1);
    const timeConstant = Math.max(settings.smoothing, POSITION_EPSILON);

    filter.frequency.setTargetAtTime(cutoff, now, timeConstant);
    gain.gain.setTargetAtTime(1 + (attenuated - 1) * this._occlusion, now, timeConstant);
  }

  protected _connectOutput(): void {
    this._connectTail(this._tail());
  }

  /** Connect `tail` to the bus input, or to the destination with a deferred reroute while the bus is still locked. */
  private _connectTail(tail: AudioNode): void {
    const input = this._bus._getInputNode();
    if (input !== null) {
      tail.connect(input);
      return;
    }

    // Bus not set up yet (AudioContext still locked) - route to the destination
    // for now and reconnect to the bus once it comes online. Keep the disposer
    // and drop any previous pending reconnect so a voice deferring repeatedly
    // (or ending) before the first gesture never leaves stale callbacks queued
    // on the bus (AU3).
    tail.connect(this._audioContext.destination);
    this._pendingBusSetup?.();
    this._pendingBusSetup = this._bus.onceSetup((): void => {
      this._pendingBusSetup = null;
      if (this._ended) return;
      const node = this._bus._getInputNode();
      if (node !== null) {
        const current = this._tail();
        current.disconnect();
        current.connect(node);
      }
    });
  }

  /** Rewire `output → [effects...] → bus` after the per-voice effect chain changes. */
  private _rebuildEffectChain(): void {
    if (this._ended) return;

    this._output.disconnect();
    this._occlusionFilter?.disconnect();
    this._occlusionGain?.disconnect();
    for (const effect of this._effects) {
      effect.outputNode.disconnect();
    }

    let prev: AudioNode = this._output;

    if (this._occlusionFilter !== null && this._occlusionGain !== null) {
      prev.connect(this._occlusionFilter);
      this._occlusionFilter.connect(this._occlusionGain);
      prev = this._occlusionGain;
    }

    for (const effect of this._effects) {
      prev.connect(effect.inputNode);
      prev = effect.outputNode;
    }
    this._connectTail(prev);
  }

  protected _clearStopTimer(): void {
    if (this._stopTimer !== null) {
      clearTimeout(this._stopTimer);
      this._stopTimer = null;
    }
  }

  private _ensurePanner(): void {
    if (this._panner !== null || this._ended) return;

    const panner = this._audioContext.createPanner();
    panner.panningModel = this._panningModel ?? this._manager.spatial.panningModel;
    panner.distanceModel = this._spatialConfig.distanceModel;
    panner.refDistance = this._spatialConfig.refDistance;
    panner.maxDistance = this._spatialConfig.maxDistance;
    panner.rolloffFactor = this._spatialConfig.rolloffFactor;
    panner.coneInnerAngle = this._coneInnerAngle;
    panner.coneOuterAngle = this._coneOuterAngle;
    panner.coneOuterGain = this._coneOuterGain;

    this._routeThroughPanner(panner);
    this._panner = panner;
    this._writeOrientation();

    if (!this._spatialRegistered) {
      this._spatialRegistered = true;
      this._manager._registerSpatial(this);
    }
  }

  private _disableSpatializationIfUnused(): void {
    if (this._position !== null || this._followNode !== null || this._panner === null) return;
    const panner = this._panner;
    this._routeDirect();
    panner.disconnect();
    this._panner = null;
    this._setDopplerRatio(1);
    this._velocitySample.lastPosition = null;
    this._velocitySample.lastTime = 0;
    this._velocitySample.x = 0;
    this._velocitySample.y = 0;
    this._smoothX.reset();
    this._smoothY.reset();
    this._smoothZ.reset();
    // Also forget the last-written orientation so a future panner (a distinct
    // AudioParam instance) gets a fresh snap instead of a skipped write that
    // happens to match this smoother's stale `_last` from the old panner.
    this._smoothOrientX.reset();
    this._smoothOrientY.reset();
    this._smoothOrientZ.reset();
    if (this._spatialRegistered) {
      this._spatialRegistered = false;
      this._manager._unregisterSpatial(this);
    }
  }

  /**
   * Called once on natural end or explicit {@link BaseVoice.stop}. Idempotent -
   * subsequent calls are no-ops once `_ended` is set.
   */
  protected _finish(): void {
    if (this._ended) return;
    this._ended = true;
    this._clearStopTimer();

    // Drop a still-pending deferred bus reconnect so it doesn't linger on the
    // bus (or fire) after this voice ends pre-unlock (AU3).
    this._pendingBusSetup?.();
    this._pendingBusSetup = null;

    this._teardownSource();
    this._panner?.disconnect();
    // Sends read `_output`, so they go before it is disconnected - the shared
    // bus each one feeds must not be left with a live tap on a dead voice.
    for (const send of this._sends) {
      send.destroy();
    }
    this._sends.length = 0;
    this._output.disconnect();
    this._occlusionFilter?.disconnect();
    this._occlusionGain?.disconnect();
    this._occlusionFilter = null;
    this._occlusionGain = null;

    // Detach per-voice effects from the chain (the caller still owns them).
    // Skipped for an effect whose own nodes have not been created yet - same
    // probe `AudioBus.destroy` uses, since `outputNode` throws on an effect
    // still mid-setup.
    for (const effect of this._effects) {
      if (isEffectReady(effect)) {
        effect.outputNode.disconnect();
      }
    }
    this._effects.length = 0;

    if (this._position !== null) {
      this._position.destroy();
      this._position = null;
    }
    if (this._velocity !== null) {
      this._velocity.destroy();
      this._velocity = null;
    }
    this._followNode = null;

    if (this._spatialRegistered) {
      this._spatialRegistered = false;
      this._manager._unregisterSpatial(this);
    }

    this._manager._unregisterVoice(this);

    this.onEnd.dispatch();
    this.onEnd.destroy();
  }

  /**
   * Insert `panner` between the voice's source and its output gain. The source
   * is currently connected directly to {@link BaseVoice._output}; rewire it as
   * `source → panner → output`.
   */
  protected abstract _routeThroughPanner(panner: PannerNode): void;

  /** Restore the direct source-to-output route. */
  protected abstract _routeDirect(): void;

  /** Stop and disconnect the voice's source node(s). Called once from `_finish`. */
  protected abstract _teardownSource(): void;

  /**
   * Apply a Doppler pitch-shift multiplier on top of whatever playback rate
   * the voice already has (never overwrite the user's own explicit rate -
   * multiply it). Default no-op: voice types with no meaningful, live
   * rate parameter (`AudioGeneratorVoice`'s rate is documented as inert;
   * `InputVoice`/`NoopVoice` have no source to modulate) simply don't
   * override this. Overridden by {@link SoundVoice} and
   * {@link AudioStreamVoice}.
   */
  protected _applyDopplerRate(_ratio: number): void {
    // no-op default
  }
}
