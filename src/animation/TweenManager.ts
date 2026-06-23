import type { System } from '#core/System';
import type { Time } from '#core/Time';

import { Tween } from './Tween';

/**
 * Owns and advances a collection of {@link Tween} instances, driving them
 * once per frame from {@link Application.update}. Created tweens are tracked
 * automatically; manually constructed tweens can be opted in via
 * {@link TweenManager.add}.
 *
 * Update iteration uses a snapshot so callbacks may freely add or remove
 * tweens during the same frame without corrupting the loop. Completed and
 * stopped tweens are evicted automatically.
 * @stable
 */
export class TweenManager implements System {
  /** App-systems tick band — tweens after audio. @internal */
  public readonly order = 400;
  private _tweens: Tween[] = [];
  private _destroyed = false;

  /**
   * Create a new Tween targeting `target`, register it with this manager, and
   * return it. Call .to(...).start() on the result to begin animating.
   */
  public create<T extends object>(target: T): Tween<T> {
    const tween = new Tween(target);
    tween._attachManager(this);
    this._tweens.push(tween);

    return tween;
  }

  /**
   * Chain `tweens` in sequence: each tween starts automatically when the
   * previous one completes. Returns the first tween; call `.start()` on it
   * to kick off the whole sequence. All tweens are registered with this
   * manager (idempotent — already-added tweens are not double-added).
   *
   * @example
   * ```ts
   * const move = manager.create(sprite).to({ x: 400 }, 0.5);
   * const fade = manager.create(sprite).to({ alpha: 0 }, 0.3);
   * manager.sequence([move, fade]).start();
   * ```
   */
  public sequence(tweens: readonly Tween[]): Tween {
    const [first] = tweens;

    if (first === undefined) {
      throw new Error('[ExoJS] TweenManager.sequence() requires at least one tween.');
    }

    for (let i = 0; i < tweens.length - 1; i++) {
      const current = tweens[i];
      const next = tweens[i + 1];
      if (current !== undefined && next !== undefined) current.chain(next);
    }

    for (const tween of tweens) {
      this.add(tween);
    }

    return first;
  }

  /**
   * Explicitly add a stand-alone Tween (created via `new Tween(target)`)
   * to this manager so it participates in the update loop.
   */
  public add(tween: Tween): this {
    tween._attachManager(this);

    if (!this._tweens.includes(tween)) {
      this._tweens.push(tween);
    }

    return this;
  }

  /** Remove a tween from the manager. Called automatically on stop/complete. */
  public remove(tween: Tween): this {
    const index = this._tweens.indexOf(tween);

    if (index !== -1) {
      this._tweens.splice(index, 1);
    }

    return this;
  }

  /**
   * Advance all active tweens by the frame `delta` (read as seconds). Ticked
   * once per frame via {@link Application.systems}. Uses a snapshot of the list
   * so that callbacks that add or remove tweens do not corrupt mid-iteration.
   */
  public update(delta: Time): void {
    if (this._destroyed) return;

    const snapshot = [...this._tweens];

    for (const tween of snapshot) {
      tween.update(delta.seconds);
    }
  }

  /**
   * Remove all tweens immediately. No callbacks (onComplete etc.) fire.
   * The tweens' states are left as-is; they are simply evicted from the list.
   */
  public clear(): this {
    this._tweens = [];

    return this;
  }

  /** Tear down the manager. Clears tweens and makes subsequent updates no-ops. */
  public destroy(): void {
    this.clear();
    this._destroyed = true;
  }
}
