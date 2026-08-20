import type { SceneNode } from '#core/SceneNode';
import { Vector } from '#math/Vector';
import type { View } from '#rendering/View';

import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audio-context';
import { createSpatialSmoothingSettings, createVelocitySample, deriveVelocity, type SpatialSmoothingSettings, type VelocitySample } from './spatial-smoothing';

/**
 * Anything {@link AudioListener.target} can be set to. The listener reads
 * its world-space position from the target each frame:
 * - {@link SceneNode}: uses `getWorldTransform()` translation (true world
 *   space, composed through RetainedContainer transform-group boundaries)
 * - {@link View}: uses `view.center`
 * - Plain `{ x, y }` object: read directly
 * - `null`: no automatic tracking - set `position` manually.
 */
export type AudioListenerTarget = SceneNode | View | { x: number; y: number } | null;

/**
 * Observer position that spatial voices of one {@link Application} are panned
 * against. Read each frame from {@link AudioListener.target} when one is set,
 * else written directly via {@link AudioListener.position}.
 *
 * **Virtual, not the WebAudio listener.** `AudioContext.listener` belongs to
 * the process-wide context, so it is a single global object - two Applications
 * writing their own world position into it every frame would simply overwrite
 * each other, and both mixes would pan against whichever ticked last. This
 * class therefore pins the real WebAudio listener at the origin (orientation
 * forward = -Z, up = +Y for 2D scenes, identical for every app) and each
 * spatial {@link BaseVoice} writes its panner position **relative** to its own
 * manager's listener (`source − listener`). Distance, attenuation and the
 * distance model are unaffected: only the offset vector matters to a panner
 * whose listener sits at the origin.
 *
 * A consequence worth knowing: listener motion used to be smoothed once,
 * centrally, on the listener's own `AudioParam`s. It is now folded into each
 * voice's relative position and smoothed per voice by the same
 * {@link SpatialSmoothingSettings}. The audible result is the same ramp, but
 * {@link SpatialSmoothingSettings.teleportThreshold} is now evaluated against
 * the *relative* jump - a listener warp snaps every voice individually rather
 * than snapping the listener once - and a moving listener costs one
 * `setTargetAtTime` per spatial voice per frame instead of three in total.
 *
 * Owned by {@link AudioManager}; one instance per Application. `velocity` feeds
 * the Doppler calculation on every spatial {@link BaseVoice} - explicit when
 * set, else auto-derived each frame from the listener's own position delta
 * (same fallback {@link BaseVoice.velocity} uses). That path is unaffected by
 * the virtualization: it has always worked in absolute world coordinates in JS.
 */
export class AudioListener {
  public readonly position: Vector = new Vector(0, 0);
  public target: AudioListenerTarget = null;

  private readonly _velocity: Vector = new Vector(0, 0);
  private _explicitVelocity = false;
  private readonly _velocitySample: VelocitySample = createVelocitySample();
  private _ctx: AudioContext | null = null;
  private readonly _settings: SpatialSmoothingSettings;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setup(ctx);
  };

  /**
   * @param settings - Shared position-smoothing settings (normally
   *   `app.audio.spatial`, supplied by {@link AudioManager}). Defaults to a
   *   fresh settings object with the standard 20 ms time constant when omitted.
   */
  public constructor(settings: SpatialSmoothingSettings = createSpatialSmoothingSettings()) {
    this._settings = settings;
    if (isAudioContextReady()) {
      this._setup(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  public get velocity(): Vector {
    return this._velocity;
  }

  public set velocity(value: { x: number; y: number } | Vector) {
    this._velocity.set(value.x, value.y);
    this._explicitVelocity = true;
  }

  /**
   * Internal: called by AudioManager.update() once per frame. Refreshes
   * {@link AudioListener.position} (and the derived velocity) from
   * {@link AudioListener.target}. Deliberately writes nothing to the WebAudio
   * listener - that one is global and stays pinned at the origin; the voices
   * pan relative to this position instead. See the class docs.
   */
  public _tick(): void {
    if (this.target === null) {
      return;
    }

    this._readTargetPosition();

    if (!this._explicitVelocity && this._ctx !== null && this._settings.dopplerFactor !== 0) {
      deriveVelocity(this._velocitySample, this.position.x, this.position.y, this._ctx.currentTime);
      this._velocity.set(this._velocitySample.x, this._velocitySample.y);
    }
  }

  public destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    this.position.destroy();
    this.velocity.destroy();
    this.target = null;
    this._ctx = null;
  }

  private _readTargetPosition(): void {
    const target = this.target;
    if (target === null) return;

    // Check for SceneNode (has getWorldTransform). World - not global - so a
    // node inside a RetainedContainer transform group reports its true
    // on-screen position (AU1).
    const asSceneNode = target as Partial<SceneNode>;
    if (typeof asSceneNode.getWorldTransform === 'function') {
      const m = asSceneNode.getWorldTransform();
      this.position.set(m.x, m.y);
      return;
    }

    // Check for View (has center with x/y)
    const asView = target as Partial<View & { center: { x: number; y: number } }>;
    if (asView.center !== undefined && typeof asView.center === 'object') {
      this.position.set(asView.center.x, asView.center.y);
      return;
    }

    // Plain { x, y } object
    const plain = target as { x: number; y: number };
    this.position.set(plain.x, plain.y);
  }

  private _setup(ctx: AudioContext): void {
    this._ctx = ctx;
    const t = ctx.currentTime;
    const listener = ctx.listener as unknown as Partial<{
      forwardX: AudioParam;
      forwardY: AudioParam;
      forwardZ: AudioParam;
      upX: AudioParam;
      upY: AudioParam;
      upZ: AudioParam;
      positionX: AudioParam;
      positionY: AudioParam;
      positionZ: AudioParam;
      setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      setPosition: (x: number, y: number, z: number) => void;
    }>;

    // Set 2D orientation: forward = -Z (into screen), up = +Y (screen up).
    // Identical for every Application, so writing it from each one is harmless.
    if (listener.forwardX && listener.forwardY && listener.forwardZ && listener.upX && listener.upY && listener.upZ) {
      listener.forwardX.setValueAtTime(0, t);
      listener.forwardY.setValueAtTime(0, t);
      listener.forwardZ.setValueAtTime(-1, t);
      listener.upX.setValueAtTime(0, t);
      listener.upY.setValueAtTime(1, t);
      listener.upZ.setValueAtTime(0, t);
    } else if (listener.setOrientation) {
      listener.setOrientation(0, 0, -1, 0, 1, 0);
    }

    // Pin the global listener at the origin, once. Voices supply their position
    // relative to their own manager's listener, so this never moves again - and
    // a second Application writing the same zeroes here cannot disturb the first.
    if (listener.positionX && listener.positionY && listener.positionZ) {
      listener.positionX.setValueAtTime(0, t);
      listener.positionY.setValueAtTime(0, t);
      listener.positionZ.setValueAtTime(0, t);
    } else if (listener.setPosition) {
      listener.setPosition(0, 0, 0);
    }
  }
}
