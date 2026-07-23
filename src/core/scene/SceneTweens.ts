import type { Tween } from '#animation/Tween';
import { type TweenSequencer, TweenSequencerState } from '#animation/TweenSequencer';
import { TweenState } from '#animation/types';
import type { Application } from '#core/Application';
import type { Destroyable } from '#core/types';

/** Availability of a tracked tween/sequencer relative to the owning scene's pause state. Default `'always'`. */
export type SceneTweenAvailability = 'active' | 'paused' | 'always';

/** Options accepted by every `SceneTweens` tracking method. */
export interface SceneTweenOptions {
  /**
   * Availability relative to {@link SceneDirector.pause}/{@link SceneDirector.resume}.
   * `'always'` (default) ignores scene pause entirely — today's behavior.
   * `'active'` freezes the moment the scene pauses, resumes when it resumes.
   * `'paused'` is the mirror image: runs only while the scene is paused.
   *
   * Applied only at the scene's pause/resume transitions, not re-checked at
   * creation time — an item created while the scene is already paused starts
   * running immediately and is only corrected at the next pause/resume cycle.
   */
  when?: SceneTweenAvailability;
}

/**
 * Scene-bound tween facade. Tweens and sequencers created or added here are
 * automatically stopped when the owning scene ends permanently. Access via
 * {@link Scene.tweens}.
 */
export class SceneTweens implements Destroyable {
  private readonly _tweens = new Map<Tween, SceneTweenAvailability>();
  private readonly _sequencers = new Map<TweenSequencer, SceneTweenAvailability>();
  private _suspendedTweens: Set<Tween> | null = null;
  private _suspendedSequencers: Set<TweenSequencer> | null = null;

  public constructor(private readonly _app: Application) {}

  /** Create a {@link Tween} targeting `target` through the application tween manager, tracked for scene-lifetime cleanup. */
  public create<T extends object>(target: T, options?: SceneTweenOptions): Tween<T> {
    const tween = this._app.tweens.create(target);
    this._tweens.set(tween, options?.when ?? 'always');

    return tween;
  }

  /** Track an already-created {@link Tween} (e.g. built via `app.tweens.create(...)`) for scene-lifetime cleanup. Returns `this` for chaining. */
  public add(tween: Tween, options?: SceneTweenOptions): this {
    this._app.tweens.add(tween);
    this._tweens.set(tween, options?.when ?? 'always');

    return this;
  }

  /**
   * Create a {@link TweenSequencer} through the application tween manager,
   * tracked for scene-lifetime cleanup exactly like {@link SceneTweens.create}
   * — auto-stopped on scene teardown and suspended/restored across retention.
   */
  public createSequencer(options?: SceneTweenOptions): TweenSequencer {
    const sequencer = this._app.tweens.createSequencer();
    this._sequencers.set(sequencer, options?.when ?? 'always');

    return sequencer;
  }

  /**
   * Pause every tracked tween/sequencer that is currently running, recording
   * exactly that set so {@link SceneTweens.restore} can reinstate it.
   * Reserved for retention suspension.
   * @internal
   */
  public suspend(): void {
    const runningTweens = new Set<Tween>();

    for (const tween of this._tweens.keys()) {
      if (tween.state === TweenState.Active) {
        tween.pause();
        runningTweens.add(tween);
      }
    }

    this._suspendedTweens = runningTweens;

    const runningSequencers = new Set<TweenSequencer>();

    for (const sequencer of this._sequencers.keys()) {
      if (sequencer.state === TweenSequencerState.Active) {
        sequencer.pause();
        runningSequencers.add(sequencer);
      }
    }

    this._suspendedSequencers = runningSequencers;
  }

  /** Restore exactly the tweens/sequencers paused by {@link SceneTweens.suspend}. @internal */
  public restore(): void {
    if (this._suspendedTweens !== null) {
      for (const tween of this._suspendedTweens) {
        if (tween.state === TweenState.Paused) {
          tween.resume();
        }
      }

      this._suspendedTweens = null;
    }

    if (this._suspendedSequencers !== null) {
      for (const sequencer of this._suspendedSequencers) {
        if (sequencer.state === TweenSequencerState.Paused) {
          sequencer.resume();
        }
      }

      this._suspendedSequencers = null;
    }
  }

  public destroy(): void {
    for (const tween of this._tweens.keys()) {
      tween.stop();
    }

    for (const sequencer of this._sequencers.keys()) {
      sequencer.stop();
    }

    this._tweens.clear();
    this._sequencers.clear();
    this._suspendedTweens = null;
    this._suspendedSequencers = null;
  }
}
