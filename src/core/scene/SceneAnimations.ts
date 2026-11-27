import { SceneAvailability, sceneAvailabilityAllows } from '#core/scene/SceneAvailability';
import type { SceneState } from '#core/scene/SceneState';
import type { Destroyable } from '#core/types';
import type { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';

/** Options accepted by every `SceneAnimations` tracking method. */
export interface SceneAnimationOptions {
  /**
   * Availability relative to {@link SceneDirector.pause}/{@link SceneDirector.resume}.
   * `'always'` (default) ignores scene pause. `'active'` advances playback
   * only while the scene runs, `'paused'` only while it is paused.
   *
   * The policy holds from the moment the sprite is tracked, not only from
   * the next pause or resume.
   */
  when?: SceneAvailability;
}

/**
 * Scene-bound animation facade. An {@link AnimatedSprite} attached to a scene
 * tree is advanced by the application-wide {@link AnimationSystem} regardless
 * of scene pause; tracking it here binds its playback time to the owning
 * scene instead - it advances only while the scene is `Active` and its pause
 * flag permits the sprite's `when` policy, and it is stopped when the scene
 * ends permanently. Access via {@link Scene.animations}.
 *
 * The scene withholds time; it never pauses, resumes or restarts a sprite
 * itself, so {@link AnimatedSprite.playing} keeps reporting what the caller
 * asked for, and a sprite the caller paused or stopped stays that way
 * through any pause, resume, suspension or restore.
 *
 * Tracking is opt-in: an untracked sprite keeps playing through pause and
 * retention.
 */
export class SceneAnimations implements Destroyable {
  private readonly _tracked = new Map<AnimatedSprite, () => boolean>();

  public constructor(
    private readonly _getState: () => SceneState,
    private readonly _getPaused: () => boolean,
  ) {}

  /**
   * Track `sprite` under `options.when` and return it unchanged. Tracking it
   * again replaces its policy.
   */
  public add<T extends AnimatedSprite>(sprite: T, options?: SceneAnimationOptions): T {
    const when = options?.when ?? SceneAvailability.Always;

    // Pruned here rather than on a timer: a long-lived scene that keeps
    // spawning short-lived sprites must not accumulate dead entries.
    for (const tracked of this._tracked.keys()) {
      if (tracked.destroyed) {
        this._tracked.delete(tracked);
      }
    }

    const available = (): boolean => sceneAvailabilityAllows(when, this._getState(), this._getPaused());

    sprite._setAvailability(available);
    this._tracked.set(sprite, available);

    return sprite;
  }

  /** Stop every tracked sprite, except one another scene has since taken over. */
  public destroy(): void {
    for (const [sprite, available] of this._tracked) {
      if (!sprite.destroyed && sprite._isBoundTo(available)) {
        sprite.stop();
        sprite._setAvailability(null);
      }
    }

    this._tracked.clear();
  }
}
