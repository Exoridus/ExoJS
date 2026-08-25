import type { Duration } from '#core/Time';
import type { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';

/**
 * Owns and advances the {@link AnimatedSprite}s whose frame playback is
 * currently running, driving them once per frame from {@link Application.update}
 * - the {@link SystemMethods.preUpdate} phase, at
 * {@link SystemOrder.CoreAnimation}.
 *
 * Registration is automatic and requires no user wiring: an
 * {@link AnimatedSprite} registers itself here as soon as it is both *playing*
 * and *attached* to a scene tree owned by an {@link Application}, and
 * deregisters on `stop()`/`pause()`, on clip completion, on detach from the
 * tree, and on `destroy()`. A sprite that is never attached to a tree (e.g. one
 * drawn immediate-mode via `context.render(sprite)`) is never registered, and
 * must be ticked by hand with {@link AnimatedSprite.update} - which stays
 * public exactly for that case.
 *
 * Update iteration uses a snapshot so `onFrame`/`onComplete` handlers may
 * freely play, stop, add or destroy sprites during the same frame without
 * corrupting the loop.
 * @stable
 */
export class AnimationManager {
  private _sprites = new Set<AnimatedSprite>();
  private _destroyed = false;

  /** Number of sprites currently registered for per-frame advancement. */
  public get size(): number {
    return this._sprites.size;
  }

  /**
   * Register `sprite` so it is advanced once per frame. Idempotent, and a
   * no-op for a destroyed sprite or a destroyed manager. Called automatically
   * by {@link AnimatedSprite}; there is no need to call it by hand.
   */
  public add(sprite: AnimatedSprite): this {
    if (this._destroyed || sprite.destroyed) {
      return this;
    }

    this._sprites.add(sprite);

    return this;
  }

  /** Remove `sprite` from the manager. Called automatically on stop/pause/complete/detach/destroy. */
  public remove(sprite: AnimatedSprite): this {
    this._sprites.delete(sprite);

    return this;
  }

  /** Whether `sprite` is currently registered for per-frame advancement. */
  public has(sprite: AnimatedSprite): boolean {
    return this._sprites.has(sprite);
  }

  /**
   * Advance every registered sprite by the frame `delta`, converted to seconds
   * at this single point of use. Sprites destroyed since the last frame are
   * evicted rather than ticked, so a destroyed node can never be driven after
   * teardown. Iterates a snapshot so playback callbacks that register or
   * deregister sprites do not corrupt the loop.
   */
  public preUpdate(delta: Duration): void {
    if (this._destroyed || this._sprites.size === 0) {
      return;
    }

    const deltaSeconds = delta.seconds;

    for (const sprite of [...this._sprites]) {
      if (sprite.destroyed) {
        this._sprites.delete(sprite);
        continue;
      }

      sprite.update(deltaSeconds);
    }
  }

  /**
   * Deregister every sprite immediately. Playback state is left as-is - the
   * sprites are simply no longer advanced by this manager.
   */
  public clear(): this {
    this._sprites = new Set();

    return this;
  }

  /** Tear down the manager. Deregisters every sprite and makes subsequent updates no-ops. */
  public destroy(): void {
    this.clear();
    this._destroyed = true;
  }
}
