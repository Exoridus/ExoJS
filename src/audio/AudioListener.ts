import type { SceneNode } from '#core/SceneNode';
import { Vector } from '#math/Vector';
import type { View } from '#rendering/View';

import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audio-context';

/**
 * Anything {@link AudioListener.target} can be set to. The listener reads
 * its world-space position from the target each frame:
 * - {@link SceneNode}: uses `getGlobalTransform()` translation
 * - {@link View}: uses `view.center`
 * - Plain `{ x, y }` object: read directly
 * - `null`: no automatic tracking — set `position` manually.
 */
export type AudioListenerTarget = SceneNode | View | { x: number; y: number } | null;

// Type alias to avoid name collision with the class itself (both our class and
// WebAudio's built-in interface are named "AudioListener").
type WebAudioListener = globalThis.AudioListener;

/**
 * Singleton observer position fed to the Web Audio panner nodes used by
 * spatial sounds. Sets the listener orientation once at setup (forward = -Z,
 * up = +Y for 2D scenes) and updates `positionX/Y/Z` (or legacy
 * `setPosition`) every frame from {@link AudioListener.position} —
 * which is in turn read from {@link AudioListener.target} when one is set.
 *
 * Owned by {@link AudioManager}; one instance per engine. `velocity` is a
 * placeholder for future Doppler support (currently not piped to the Web
 * Audio listener).
 */
export class AudioListener {
  public readonly position: Vector = new Vector(0, 0);
  public readonly velocity: Vector = new Vector(0, 0);
  public target: AudioListenerTarget = null;

  private _audioListener: WebAudioListener | null = null;
  private _ctx: AudioContext | null = null;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setup(ctx);
  };

  public constructor() {
    if (isAudioContextReady()) {
      this._setup(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  /** Internal: called by AudioManager.update() once per frame. */
  public _tick(): void {
    if (this.target !== null) {
      this._readTargetPosition();
    }
    if (this._audioListener !== null && this._ctx !== null) {
      const t = this._ctx.currentTime;
      const listener = this._audioListener as unknown as Partial<{
        positionX: AudioParam;
        positionY: AudioParam;
        positionZ: AudioParam;
        setPosition: (x: number, y: number, z: number) => void;
      }>;
      if (listener.positionX && listener.positionY && listener.positionZ) {
        listener.positionX.setValueAtTime(this.position.x, t);
        listener.positionY.setValueAtTime(this.position.y, t);
        listener.positionZ.setValueAtTime(0, t);
      } else if (listener.setPosition) {
        listener.setPosition(this.position.x, this.position.y, 0);
      }
    }
  }

  public destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    this.position.destroy();
    this.velocity.destroy();
    this.target = null;
    this._audioListener = null;
    this._ctx = null;
  }

  private _readTargetPosition(): void {
    const target = this.target;
    if (target === null) return;

    // Check for SceneNode (has getGlobalTransform)
    const asSceneNode = target as Partial<SceneNode>;
    if (typeof asSceneNode.getGlobalTransform === 'function') {
      const m = asSceneNode.getGlobalTransform();
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
    this._audioListener = ctx.listener;
    const t = ctx.currentTime;
    const listener = ctx.listener as unknown as Partial<{
      forwardX: AudioParam;
      forwardY: AudioParam;
      forwardZ: AudioParam;
      upX: AudioParam;
      upY: AudioParam;
      upZ: AudioParam;
      setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
    }>;

    // Set 2D orientation: forward = -Z (into screen), up = +Y (screen up)
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
  }
}
