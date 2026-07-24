import type { EasingFunction } from '#animation/Easing';
import { Ease } from '#animation/Easing';
import type { SceneTransitionEnvironment, SceneTransitionFrame, SceneTransitionRequirements, SceneTransitionSession } from '#core/SceneTransition';
import { SceneTransition } from '#core/SceneTransition';
import type { Time } from '#core/Time';
import type { RenderingContext } from '#rendering/RenderingContext';
import { Sprite } from '#rendering/sprite/Sprite';

/** Options for {@link CrossFadeSceneTransition}. */
export interface CrossFadeSceneTransitionOptions {
  /** Blend duration in ms, counted from the moment the switch commits (not from session start). Default `220`. */
  readonly duration?: number;
  /** Default {@link Ease.linear}. */
  readonly easing?: EasingFunction;
}

class CrossFadeSession implements SceneTransitionSession {
  public readonly placement = 'scene';
  private _elapsedMs = 0;
  private _done = false;

  /** Reusable sprite for the live "current" surface — the outgoing scene pre-commit, the incoming scene post-commit. */
  private readonly _currentSprite = new Sprite(null);
  /**
   * Reusable sprite for the frozen outgoing snapshot, held separately from
   * {@link _currentSprite} because the post-commit blend draws both in the
   * same frame — reusing one instance for both would have the second draw
   * overwrite the first before it renders.
   */
  private readonly _snapshotSprite = new Sprite(null);

  public constructor(
    private readonly _durationMs: number,
    private readonly _easing: EasingFunction,
    private readonly _environment: SceneTransitionEnvironment,
  ) {}

  public get done(): boolean {
    return this._done;
  }

  public update(delta: Time): void {
    if (this._done || !this._environment.committed) {
      return;
    }

    this._elapsedMs += delta.milliseconds;

    if (this._elapsedMs >= this._durationMs) {
      this._done = true;
    }
  }

  public render(context: RenderingContext, frame: SceneTransitionFrame): void {
    if (!this._environment.committed) {
      // Still the outgoing scene either way (§3.7a) — draw it once, plainly.
      if (frame.current !== null) {
        this._drawFull(context, this._currentSprite, frame.current, 1);
      }

      return;
    }

    const progress = this._durationMs > 0 ? Math.min(1, this._elapsedMs / this._durationMs) : 1;
    const alpha = this._easing(progress);

    if (frame.outgoing !== null) {
      this._drawFull(context, this._snapshotSprite, frame.outgoing, 1);
    }

    if (frame.current !== null) {
      this._drawFull(context, this._currentSprite, frame.current, alpha);
    }
  }

  public destroy(): void {
    // No owned resources — pooled textures are Director-owned (spec §3.4).
  }

  /** Draw `texture` full-frame (no offset — a crossfade only blends opacity) via `sprite` at `alpha`. */
  private _drawFull(context: RenderingContext, sprite: Sprite, texture: NonNullable<SceneTransitionFrame['current']>, alpha: number): void {
    sprite.texture = texture;
    sprite.x = 0;
    sprite.y = 0;
    sprite.tint.a = alpha;

    context.render(sprite, { view: context.screenView });
  }
}

/**
 * Continuous blend between the outgoing scene (frozen as a snapshot at
 * session start) and the incoming scene (rendered live to a pooled texture),
 * with no "exit half"/"enter half" seam — `placement: 'scene'`,
 * `outgoingFrame: 'snapshot'`, `currentFrame: 'texture'`. A full
 * `SceneTransition`, not phase-split (definition spec §3.9.2, §8).
 * @stable
 */
export class CrossFadeSceneTransition extends SceneTransition {
  public readonly duration: number;
  public readonly easing: EasingFunction;

  public constructor(options: CrossFadeSceneTransitionOptions = {}) {
    super();
    this.duration = Math.max(0, options.duration ?? 220);
    this.easing = options.easing ?? Ease.linear;
  }

  public override getRequirements(): SceneTransitionRequirements {
    return { outgoingFrame: 'snapshot', currentFrame: 'texture' };
  }

  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    // No separate "exit hold" — a crossfade has nothing to wait on visually
    // before starting to prepare the incoming scene.
    environment.commit();

    return new CrossFadeSession(this.duration, this.easing, environment);
  }
}
