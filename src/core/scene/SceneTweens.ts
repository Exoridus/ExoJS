import type { Tween } from '#animation/Tween';
import type { TweenSequencer } from '#animation/TweenSequencer';
import { TweenSystem } from '#animation/TweenSystem';
import type { Application } from '#core/Application';
import { SceneAvailability, sceneAvailabilityAllows } from '#core/scene/SceneAvailability';
import type { SceneState } from '#core/scene/SceneState';
import type { Destroyable } from '#core/types';
import type { Seconds } from '#core/units';

/** Options accepted by every `SceneTweens` tracking method. */
export interface SceneTweenOptions {
  /**
   * Availability relative to {@link SceneDirector.pause}/{@link SceneDirector.resume}.
   * `'always'` (default) ignores scene pause entirely. `'active'` advances
   * only while the scene runs, `'paused'` only while it is paused.
   *
   * The policy holds from the moment the tween or sequencer is created or
   * added, not only from the next pause or resume.
   */
  when?: SceneAvailability;
}

/**
 * One availability policy's tweens: a scene-owned {@link TweenSystem} the
 * application-wide system drives as a ticker, advancing it only while the
 * scene allows the policy. Gating the time, not the tweens, is what keeps a
 * tween's own state exactly what its caller made it.
 */
class TweenLane {
  public readonly system = new TweenSystem();

  public constructor(private readonly _allowed: () => boolean) {}

  public update(delta: number): void {
    if (this._allowed()) {
      this.system.preFrame(delta as Seconds);
    }
  }

  /** Called by the application-wide system's `clear()`: stops this lane's tweens, as `clear()` promises. */
  public stop(): void {
    this.system.clear();
  }
}

/**
 * Scene-bound tween facade. Tweens and sequencers created or added here
 * advance only while the owning scene is `Active` and its pause flag permits
 * their `when` policy, and are stopped when the scene ends permanently.
 * Access via {@link Scene.tweens}.
 *
 * The scene withholds time; it never pauses, resumes or restarts a tween
 * itself. `tween.state` therefore always reports what the caller asked for: a
 * tween started while the scene is paused under `'active'` reads as active and
 * waits, and one the caller paused or stopped stays that way through any
 * pause, resume, suspension or restore. A sequencer's stage tweens run under
 * its policy. A chained tween runs in the system it was created by, so a chain
 * follows one policy only when every link was created through this scene with
 * the same `when`.
 *
 * `app.tweens.clear()` stops these tweens too; tweens created afterwards run
 * normally. Once the scene has ended, a tween it created no longer runs, even
 * if started again.
 *
 * Nothing here touches the application-wide `TweenSystem` before the scene
 * is first activated, so a `.start()` made while it is still preparing
 * produces no application-wide effect.
 */
export class SceneTweens implements Destroyable {
  private readonly _lanes = new Map<SceneAvailability, TweenLane>();
  private _activated = false;
  private _destroyed = false;

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
    private readonly _getPaused: () => boolean = () => false,
  ) {}

  /** Create a {@link Tween} targeting `target`, tracked for scene-lifetime cleanup. */
  public create<T extends object>(target: T, options?: SceneTweenOptions): Tween<T> {
    return this._lane(options?.when).system.create(target);
  }

  /**
   * Track an already-created {@link Tween} (e.g. built via
   * `app.tweens.create(...)`) for scene-lifetime cleanup. The tween moves
   * under this scene's control in whatever state it is in: a running tween
   * keeps running if the scene allows it now, and waits otherwise. Adding a
   * tween this scene already tracks moves it to the new policy. Returns
   * `this` for chaining.
   */
  public add(tween: Tween, options?: SceneTweenOptions): this {
    // Out of every list that could still tick it, so it runs under one policy only.
    this._app.tweens.remove(tween);

    for (const lane of this._lanes.values()) {
      lane.system.remove(tween);
    }

    this._lane(options?.when).system.add(tween);

    return this;
  }

  /**
   * Create a {@link TweenSequencer}, tracked for scene-lifetime cleanup
   * exactly like {@link SceneTweens.create}; its stage tweens run under the
   * same policy.
   */
  public createSequencer(options?: SceneTweenOptions): TweenSequencer {
    return this._lane(options?.when).system.createSequencer();
  }

  /**
   * Hand the lanes to the application-wide system - once, on the scope's
   * first activation. Later activations (restores) find them in place.
   * @internal
   */
  public activate(): void {
    if (this._activated || this._destroyed) {
      return;
    }

    this._activated = true;

    for (const lane of this._lanes.values()) {
      this._app.tweens.addTicker(lane);
    }
  }

  /** Stop every tracked tween and sequencer and detach from the application-wide system. */
  public destroy(): void {
    this._destroyed = true;

    for (const lane of this._lanes.values()) {
      if (this._activated) {
        this._app.tweens.removeTicker(lane);
      }

      lane.system.destroy();
    }

    this._lanes.clear();
  }

  private _lane(when: SceneAvailability = SceneAvailability.Always): TweenLane {
    let lane = this._lanes.get(when);

    if (lane === undefined) {
      lane = new TweenLane(() => sceneAvailabilityAllows(when, this._getState(), this._getPaused()));
      this._lanes.set(when, lane);
    }

    // Re-registered on every use, not only on creation: `app.tweens.clear()`
    // drops every ticker, and a lane it dropped would otherwise never tick
    // again. `addTicker` ignores a lane that is still registered.
    if (this._activated && !this._destroyed) {
      this._app.tweens.addTicker(lane);
    }

    return lane;
  }
}
