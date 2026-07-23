import { Tween } from '#animation/Tween';
import { TweenSequencer } from '#animation/TweenSequencer';
import { TweenSequencerState } from '#animation/TweenSequencer';
import { TweenState } from '#animation/types';
import type { Application } from '#core/Application';
import { SceneState } from '#core/SceneState';
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
 *
 * While the owning scope is not `Active` (`Preparing`, `Ready`, or
 * `Suspended`), `create()`/`createSequencer()` construct their result
 * without attaching it to the application-wide `TweenManager` at all, so a
 * synchronous `.start()` call made while dormant produces zero
 * application-wide effect (definition §4.2) — the manager only begins
 * driving it once the scope becomes `Active` and this facade flushes it in.
 * `add()` (which may be handed an already-live tween) instead pauses it
 * immediately if needed, resuming it on activation only if it is still in
 * the exact state this left it in — the same idiom already used by
 * {@link SceneTweens.suspend}/{@link SceneTweens.restore} for retention.
 */
export class SceneTweens implements Destroyable {
  private readonly _tweens = new Map<Tween, SceneTweenAvailability>();
  private readonly _sequencers = new Map<TweenSequencer, SceneTweenAvailability>();
  private readonly _cold = new Set<Tween>();
  private readonly _coldPaused = new Set<Tween>();
  private readonly _coldSequencers = new Set<TweenSequencer>();
  private _suspendedTweens: Set<Tween> | null = null;
  private _suspendedSequencers: Set<TweenSequencer> | null = null;
  private _frozenTweens: Set<Tween> | null = null;
  private _thawedTweens: Set<Tween> | null = null;
  private _frozenSequencers: Set<TweenSequencer> | null = null;
  private _thawedSequencers: Set<TweenSequencer> | null = null;

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
  ) {}

  /**
   * Create a {@link Tween} targeting `target`, tracked for scene-lifetime
   * cleanup. While the owning scope is not `Active`, the tween is
   * constructed directly (not through `app.tweens.create`) so it is never
   * attached to the application-wide manager until activation — see the
   * class doc.
   */
  public create<T extends object>(target: T, options?: SceneTweenOptions): Tween<T> {
    const when = options?.when ?? 'always';

    if (this._getState() !== SceneState.Active) {
      const tween = new Tween(target);

      this._tweens.set(tween, when);
      this._cold.add(tween);

      return tween;
    }

    const tween = this._app.tweens.create(target);

    this._tweens.set(tween, when);

    return tween;
  }

  /**
   * Track an already-created {@link Tween} (e.g. built via
   * `app.tweens.create(...)`) for scene-lifetime cleanup. Passing a tween
   * that is already running transfers runtime ownership to this facade —
   * while the owning scope is not `Active`, that means pausing it
   * immediately (mirrors {@link SceneTweens.suspend}'s own pattern),
   * resumed on activation only if it is still in the exact state this left
   * it in. Returns `this` for chaining.
   */
  public add(tween: Tween, options?: SceneTweenOptions): this {
    const when = options?.when ?? 'always';

    this._app.tweens.add(tween);
    this._tweens.set(tween, when);

    if (this._getState() !== SceneState.Active && tween.state === TweenState.Active) {
      tween.pause();
      this._coldPaused.add(tween);
    }

    return this;
  }

  /**
   * Create a {@link TweenSequencer}, tracked for scene-lifetime cleanup
   * exactly like {@link SceneTweens.create} — auto-stopped on scene
   * teardown and suspended/restored across retention. While the owning
   * scope is not `Active`, constructed without a manager (same reasoning as
   * {@link SceneTweens.create}) and bound to the real one at activation.
   */
  public createSequencer(options?: SceneTweenOptions): TweenSequencer {
    const when = options?.when ?? 'always';

    if (this._getState() !== SceneState.Active) {
      const sequencer = new TweenSequencer();

      this._sequencers.set(sequencer, when);
      this._coldSequencers.add(sequencer);

      return sequencer;
    }

    const sequencer = this._app.tweens.createSequencer();

    this._sequencers.set(sequencer, when);

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

  /**
   * Called by `SceneScope` whenever this scope becomes `Active` — a fresh
   * activation flushing whatever was created while `Ready` (or a still-cold
   * `Suspended` registration), or a retention restore reinstating whatever
   * {@link SceneTweens.suspend} paused. Both converge on the same
   * operation: attach every cold tween/sequencer to the app-wide manager
   * (in whatever state it's currently in), then resume exactly the set
   * `suspend()` paused and exactly the set `add()` paused while dormant —
   * each only if still in the exact state this facade left it in.
   * @internal
   */
  public restore(): void {
    for (const tween of this._cold) {
      this._app.tweens.add(tween);
    }

    this._cold.clear();

    for (const sequencer of this._coldSequencers) {
      sequencer._attachManager(this._app.tweens);
    }

    this._coldSequencers.clear();

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

    for (const tween of this._coldPaused) {
      if (tween.state === TweenState.Paused) {
        tween.resume();
      }
    }

    this._coldPaused.clear();
  }

  /**
   * Alias for {@link SceneTweens.restore}, used by `SceneScope.activate()`
   * for the fresh-activation edge (`Ready`/`Suspended` → `Active`) — kept as
   * a distinctly-named entry point so call sites read naturally regardless
   * of which transition triggered them; both do the identical work. @internal
   */
  public activate(): void {
    this.restore();
  }

  /**
   * Apply the `when` pause policy for every tracked tween/sequencer:
   * `'active'` items currently running are frozen; `'paused'` items
   * currently frozen are woken up early (they exist specifically for the
   * paused state). Called by {@link SceneScope.pause}. Does not touch a
   * `'paused'` item that happens to already be running — see the `when`
   * option's own doc, a documented, accepted limitation.
   * @internal
   */
  public pause(): void {
    const frozenTweens = new Set<Tween>();
    const thawedTweens = new Set<Tween>();

    for (const [tween, when] of this._tweens) {
      if (when === 'active' && tween.state === TweenState.Active) {
        tween.pause();
        frozenTweens.add(tween);
      } else if (when === 'paused' && tween.state === TweenState.Paused) {
        tween.resume();
        thawedTweens.add(tween);
      }
    }

    this._frozenTweens = frozenTweens;
    this._thawedTweens = thawedTweens;

    const frozenSequencers = new Set<TweenSequencer>();
    const thawedSequencers = new Set<TweenSequencer>();

    for (const [sequencer, when] of this._sequencers) {
      if (when === 'active' && sequencer.state === TweenSequencerState.Active) {
        sequencer.pause();
        frozenSequencers.add(sequencer);
      } else if (when === 'paused' && sequencer.state === TweenSequencerState.Paused) {
        sequencer.resume();
        thawedSequencers.add(sequencer);
      }
    }

    this._frozenSequencers = frozenSequencers;
    this._thawedSequencers = thawedSequencers;
  }

  /**
   * Undo {@link SceneTweens.pause}: resumes everything it froze, re-freezes
   * everything it woke up early — each only if still in the state this
   * facade left it in, so a tween/sequencer the caller paused or resumed
   * manually in between is left alone. Called by {@link SceneScope.resume}.
   * @internal
   */
  public resume(): void {
    if (this._frozenTweens !== null) {
      for (const tween of this._frozenTweens) {
        if (tween.state === TweenState.Paused) {
          tween.resume();
        }
      }

      this._frozenTweens = null;
    }

    if (this._thawedTweens !== null) {
      for (const tween of this._thawedTweens) {
        if (tween.state === TweenState.Active) {
          tween.pause();
        }
      }

      this._thawedTweens = null;
    }

    if (this._frozenSequencers !== null) {
      for (const sequencer of this._frozenSequencers) {
        if (sequencer.state === TweenSequencerState.Paused) {
          sequencer.resume();
        }
      }

      this._frozenSequencers = null;
    }

    if (this._thawedSequencers !== null) {
      for (const sequencer of this._thawedSequencers) {
        if (sequencer.state === TweenSequencerState.Active) {
          sequencer.pause();
        }
      }

      this._thawedSequencers = null;
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
    this._cold.clear();
    this._coldPaused.clear();
    this._coldSequencers.clear();
    this._suspendedTweens = null;
    this._suspendedSequencers = null;
    this._frozenTweens = null;
    this._thawedTweens = null;
    this._frozenSequencers = null;
    this._thawedSequencers = null;
  }
}
