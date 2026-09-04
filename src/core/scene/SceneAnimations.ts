import { SceneAvailability } from '#core/scene/SceneAvailability';
import type { Destroyable } from '#core/types';
import type { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';

/** Options accepted by every `SceneAnimations` tracking method. */
export interface SceneAnimationOptions {
  /**
   * Availability relative to {@link SceneDirector.pause}/{@link SceneDirector.resume}.
   * `'always'` (default) ignores scene pause entirely - the behavior of a
   * sprite that is not tracked here at all.
   * `'active'` freezes playback the moment the scene pauses and resumes it
   * when the scene resumes.
   * `'paused'` is the mirror image: plays only while the scene is paused.
   *
   * Applied only at the scene's pause/resume transitions, not re-checked when
   * a sprite is tracked - a sprite handed over while the scene is already
   * paused keeps the playback state it has and is only corrected at the next
   * pause/resume cycle.
   */
  when?: SceneAvailability;
}

/**
 * Scene-bound animation facade. An {@link AnimatedSprite} attached to a scene
 * tree is advanced by the application-wide {@link AnimationSystem} regardless
 * of scene pause; tracking it here binds its playback to the owning scene
 * instead - a `when` policy across pause/resume, freezing across retention,
 * and a stop when the scene ends permanently. Access via
 * {@link Scene.animations}.
 *
 * Tracking is opt-in and additive: an untracked sprite keeps playing through
 * pause and retention, which is what `when: 'always'` selects explicitly.
 */
export class SceneAnimations implements Destroyable {
  private readonly _tracked = new Map<AnimatedSprite, SceneAvailability>();
  private _suspended: Set<AnimatedSprite> | null = null;
  private _frozenByPause: Set<AnimatedSprite> | null = null;
  private _thawedByPause: Set<AnimatedSprite> | null = null;

  /**
   * Bind `sprite`'s playback to this scene and return it unchanged, so the
   * call can wrap construction. Tracking the same sprite again replaces its
   * `when` policy.
   */
  public add<T extends AnimatedSprite>(sprite: T, options?: SceneAnimationOptions): T {
    this._tracked.set(sprite, options?.when ?? SceneAvailability.Always);

    return sprite;
  }

  /**
   * Pause every tracked sprite that is currently playing, recording exactly
   * that set so {@link SceneAnimations.restore} can reinstate it. Reserved for
   * retention suspension, which freezes regardless of the `when` policy.
   * @internal
   */
  public suspend(): void {
    const playing = new Set<AnimatedSprite>();

    for (const sprite of this._live()) {
      if (sprite.playing) {
        sprite.pause();
        playing.add(sprite);
      }
    }

    this._suspended = playing;
  }

  /** Resume exactly the sprites paused by {@link SceneAnimations.suspend}. @internal */
  public restore(): void {
    if (this._suspended === null) {
      return;
    }

    for (const sprite of this._suspended) {
      if (!sprite.destroyed && !sprite.playing) {
        sprite.resume();
      }
    }

    this._suspended = null;
  }

  /**
   * Apply the `when` pause policy for every tracked sprite: `'active'` sprites
   * currently playing are frozen, `'paused'` sprites currently frozen are
   * woken up early. Called by {@link SceneScope.pause}. Does not touch a
   * `'paused'` sprite that happens to already be playing - see
   * {@link SceneAnimationOptions.when}, a documented, accepted limitation.
   * @internal
   */
  public pause(): void {
    const frozen = new Set<AnimatedSprite>();
    const thawed = new Set<AnimatedSprite>();

    for (const [sprite, when] of this._tracked) {
      if (sprite.destroyed) {
        // Deleting the current key mid-iteration is well defined for a Map and
        // keeps a long-lived scene from accumulating dead entries across pauses.
        this._tracked.delete(sprite);
        continue;
      }

      if (when === SceneAvailability.Active && sprite.playing) {
        sprite.pause();
        frozen.add(sprite);
      } else if (when === SceneAvailability.Paused && !sprite.playing) {
        sprite.resume();

        // A sprite that never had a clip selected stays stopped: recording it
        // as thawed would make resume() pause a sprite it never woke.
        if (sprite.playing) {
          thawed.add(sprite);
        }
      }
    }

    this._frozenByPause = frozen;
    this._thawedByPause = thawed;
  }

  /**
   * Undo {@link SceneAnimations.pause}: resumes everything it froze,
   * re-freezes everything it woke up early - each only if still in the state
   * this facade left it in, so a sprite the caller paused or resumed manually
   * in between is left alone. Called by {@link SceneScope.resume}.
   * @internal
   */
  public resume(): void {
    if (this._frozenByPause !== null) {
      for (const sprite of this._frozenByPause) {
        if (!sprite.destroyed && !sprite.playing) {
          sprite.resume();
        }
      }

      this._frozenByPause = null;
    }

    if (this._thawedByPause !== null) {
      for (const sprite of this._thawedByPause) {
        if (!sprite.destroyed && sprite.playing) {
          sprite.pause();
        }
      }

      this._thawedByPause = null;
    }
  }

  public destroy(): void {
    for (const sprite of this._live()) {
      sprite.stop();
    }

    this._tracked.clear();
    this._suspended = null;
    this._frozenByPause = null;
    this._thawedByPause = null;
  }

  /** Tracked sprites that are still alive, evicting the destroyed ones on the way. */
  private *_live(): Generator<AnimatedSprite> {
    for (const sprite of [...this._tracked.keys()]) {
      if (sprite.destroyed) {
        this._tracked.delete(sprite);
        continue;
      }

      yield sprite;
    }
  }
}
