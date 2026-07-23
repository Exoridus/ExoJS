import type { Tween } from '#animation/Tween';
import { TweenState } from '#animation/types';
import type { Application } from '#core/Application';
import type { Destroyable } from '#core/types';

/**
 * Scene-bound tween facade. Tweens created or added here are automatically
 * stopped when the owning scene ends permanently. Access via
 * {@link Scene.tweens}.
 */
export class SceneTweens implements Destroyable {
  private readonly _tweens = new Set<Tween>();
  private _suspended: Set<Tween> | null = null;

  public constructor(private readonly _app: Application) {}

  /** Create a {@link Tween} targeting `target` through the application tween manager, tracked for scene-lifetime cleanup. */
  public create<T extends object>(target: T): Tween<T> {
    const tween = this._app.tweens.create(target);
    this._tweens.add(tween);

    return tween;
  }

  /** Track an already-created {@link Tween} (e.g. built via `app.tweens.create(...)`) for scene-lifetime cleanup. Returns `this` for chaining. */
  public add(tween: Tween): this {
    this._app.tweens.add(tween);
    this._tweens.add(tween);

    return this;
  }

  /**
   * Pause every tracked tween that is currently `Active`, recording exactly
   * that set so {@link SceneTweens.resume} can restore it. Reserved for
   * retention suspension.
   * @internal
   */
  public suspend(): void {
    const running = new Set<Tween>();

    for (const tween of this._tweens) {
      if (tween.state === TweenState.Active) {
        tween.pause();
        running.add(tween);
      }
    }

    this._suspended = running;
  }

  /** Resume exactly the tweens paused by {@link SceneTweens.suspend}. @internal */
  public resume(): void {
    if (this._suspended === null) {
      return;
    }

    for (const tween of this._suspended) {
      if (tween.state === TweenState.Paused) {
        tween.resume();
      }
    }

    this._suspended = null;
  }

  public destroy(): void {
    for (const tween of this._tweens) {
      tween.stop();
    }

    this._tweens.clear();
    this._suspended = null;
  }
}
