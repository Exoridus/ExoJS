import type { SceneNode } from '#core/SceneNode';
import { Signal } from '#core/Signal';
import { clamp } from '#math/utils';
import { Vector } from '#math/Vector';

import type { AudioBus } from './AudioBus';
import type { AudioEffect } from './AudioEffect';
import type { AudioManager } from './AudioManager';
import type { Spatializable, Voice } from './Playable';

/** Distance-attenuation configuration for a spatial voice. */
export interface VoiceSpatialConfig {
  distanceModel: DistanceModelType;
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
  private _followNode: SceneNode | null = null;
  private _spatialRegistered = false;

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

  public follow(node: SceneNode | null): void {
    if (this._ended) return;
    this._followNode = node;
    if (node !== null) {
      this._ensurePanner();
      this._tickSpatial();
    }
  }

  /** @internal Called once per frame by {@link AudioManager.update} for spatial voices. */
  public _tickSpatial(): void {
    if (this._panner === null || this._ended) return;

    let x: number;
    let y: number;

    if (this._followNode !== null) {
      const transform = this._followNode.getGlobalTransform();
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
      panner.positionX.setValueAtTime(x, t);
      panner.positionY!.setValueAtTime(y, t);
      panner.positionZ!.setValueAtTime(0, t);
    } else if (panner.setPosition) {
      panner.setPosition(x, y, 0);
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
    // for now and reconnect to the bus once it comes online.
    tail.connect(this._audioContext.destination);
    this._bus.onceSetup((): void => {
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
    panner.panningModel = 'equalpower';
    panner.distanceModel = this._spatialConfig.distanceModel;
    panner.refDistance = this._spatialConfig.refDistance;
    panner.maxDistance = this._spatialConfig.maxDistance;
    panner.rolloffFactor = this._spatialConfig.rolloffFactor;

    this._routeThroughPanner(panner);
    this._panner = panner;

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
