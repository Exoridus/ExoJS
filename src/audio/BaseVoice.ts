import type { SceneNode } from '#core/SceneNode';
import { Signal } from '#core/Signal';
import { clamp, degreesToRadians } from '#math/utils';
import { Vector } from '#math/Vector';

import type { AudioBus } from './AudioBus';
import type { AudioEffect } from './AudioEffect';
import type { AudioManager } from './AudioManager';
import type { DistanceModel, Spatializable, Voice } from './Playable';
import { SmoothedAudioParam } from './spatial-smoothing';

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
  /** The voice's output gain — the last node before the bus. */
  output: GainNode;
  bus: AudioBus;
  manager: AudioManager;
  /** Initial volume, range [0, 1]. */
  volume: number;
  /** Spatial parameters; defaults are used for any omitted field. */
  spatial?: Partial<VoiceSpatialConfig>;
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
 * {@link Voice} control surface — volume, fade, stop, lifecycle Signal, bus
 * routing — and the {@link Spatializable} capability via a lazily-inserted
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
export abstract class BaseVoice implements Voice, Spatializable, SpatialVoice {
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
  private readonly _smoothX = new SmoothedAudioParam();
  private readonly _smoothY = new SmoothedAudioParam();
  private readonly _smoothZ = new SmoothedAudioParam();
  private _orientation = 0;
  private _coneInnerAngle = 360;
  private _coneOuterAngle = 360;
  private _coneOuterGain = 0;
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
    this._spatialConfig = { ...defaultSpatialConfig, ...init.spatial };

    this._output.gain.setTargetAtTime(this._volume, this._audioContext.currentTime, 0.01);
    if (init.autoConnect !== false) {
      this._connectOutput();
    }
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

  public addEffect(effect: AudioEffect): this {
    if (this._ended) return this;
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
      // only touches the effects still in the chain.
      effect.outputNode.disconnect();
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

  public set position(value: Vector | { x: number; y: number } | null) {
    if (this._ended) return;

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

    this._ensurePanner();
    this._tickSpatial();
  }

  /**
   * Track `node`'s position each frame and pan this voice from it (or stop
   * tracking with `null`). Reads {@link SceneNode.getWorldTransform} — the
   * TRUE world position, composed through {@link RetainedContainer}
   * transform-group boundaries — so an emitter inside a camera-panned world
   * group sounds where it is drawn.
   */
  public follow(node: SceneNode | null): void {
    if (this._ended) return;
    this._followNode = node;
    if (node !== null) {
      this._ensurePanner();
      this._tickSpatial();
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
    const clamped = Math.max(0, value);
    this._spatialConfig.refDistance = clamped;
    if (this._panner !== null) {
      this._panner.refDistance = clamped;
    }
  }

  public get maxDistance(): number {
    return this._spatialConfig.maxDistance;
  }

  public set maxDistance(value: number) {
    const clamped = Math.max(0, value);
    this._spatialConfig.maxDistance = clamped;
    if (this._panner !== null) {
      this._panner.maxDistance = clamped;
    }
  }

  public get rolloffFactor(): number {
    return this._spatialConfig.rolloffFactor;
  }

  public set rolloffFactor(value: number) {
    const clamped = Math.max(0, value);
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
    this._coneInnerAngle = value;
    if (this._panner !== null) {
      this._panner.coneInnerAngle = value;
    }
  }

  public get coneOuterAngle(): number {
    return this._coneOuterAngle;
  }

  public set coneOuterAngle(value: number) {
    this._coneOuterAngle = value;
    if (this._panner !== null) {
      this._panner.coneOuterAngle = value;
    }
  }

  public get coneOuterGain(): number {
    return this._coneOuterGain;
  }

  public set coneOuterGain(value: number) {
    this._coneOuterGain = value;
    if (this._panner !== null) {
      this._panner.coneOuterGain = value;
    }
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
    if (panner.positionX) {
      // Route through the smoothing layer (setTargetAtTime + epsilon-skip +
      // teleport-snap) to eliminate per-frame zipper noise on moving sources (AU4).
      const settings = this._manager.spatial;
      this._smoothX.write(panner.positionX, x, t, settings);
      this._smoothY.write(panner.positionY!, y, t, settings);
      this._smoothZ.write(panner.positionZ!, 0, t, settings);
    } else if (panner.setPosition) {
      // Legacy AudioParam-less API: snap only (no smoothing available).
      panner.setPosition(x, y, 0);
    }
  }

  /**
   * Convert `_orientation` (degrees, `SceneNode.rotation` convention) to a
   * unit XY vector (Z fixed at 0 — no Z axis in this engine) and write it
   * through the same smoothing layer used for position, so a fast-rotating
   * emitter's cone direction never zippers.
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

  /** The last node in the voice chain before the bus — the output gain, or the last effect. */
  protected _tail(): AudioNode {
    const lastEffect = this._effects[this._effects.length - 1];
    return lastEffect !== undefined ? lastEffect.outputNode : this._output;
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

    // Bus not set up yet (AudioContext still locked) — route to the destination
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
    for (const effect of this._effects) {
      effect.outputNode.disconnect();
    }

    let prev: AudioNode = this._output;
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

  /**
   * Called once on natural end or explicit {@link BaseVoice.stop}. Idempotent —
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
    this._output.disconnect();

    // Detach per-voice effects from the chain (the caller still owns them).
    for (const effect of this._effects) {
      effect.outputNode.disconnect();
    }
    this._effects.length = 0;

    if (this._position !== null) {
      this._position.destroy();
      this._position = null;
    }
    this._followNode = null;

    this.onEnd.dispatch();
    this.onEnd.destroy();
  }

  /**
   * Insert `panner` between the voice's source and its output gain. The source
   * is currently connected directly to {@link BaseVoice._output}; rewire it as
   * `source → panner → output`.
   */
  protected abstract _routeThroughPanner(panner: PannerNode): void;

  /** Stop and disconnect the voice's source node(s). Called once from `_finish`. */
  protected abstract _teardownSource(): void;
}
