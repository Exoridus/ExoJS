import type { Tween } from '#animation/Tween';
import type { Application } from '#core/Application';
import type { Destroyable } from '#core/types';

/**
 * Scene-bound tween facade. Tweens created or added here are automatically
 * stopped when the owning scene ends permanently. Access via
 * {@link Scene.tweens}.
 */
export class SceneTweens implements Destroyable {
  private readonly _tweens = new Set<Tween>();

  public constructor(private readonly _app: Application) {}

  public create<T extends object>(target: T): Tween<T> {
    const tween = this._app.tweens.create(target);
    this._tweens.add(tween);

    return tween;
  }

  public add(tween: Tween): this {
    this._app.tweens.add(tween);
    this._tweens.add(tween);

    return this;
  }

  /**
   * Pause every tracked tween that is currently running, preserving its
   * progress. Reserved for retention (suspend/resume) — a later slice wires
   * this to actual suspend/restore transitions.
   * @internal
   */
  public suspend(): void {
    // Wired by a later slice alongside retained-scene suspension.
  }

  /** Resume exactly the tweens paused by {@link SceneTweens.suspend}. @internal */
  public resume(): void {
    // Wired by a later slice alongside retained-scene suspension.
  }

  public destroy(): void {
    for (const tween of this._tweens) {
      tween.stop();
    }

    this._tweens.clear();
  }
}
