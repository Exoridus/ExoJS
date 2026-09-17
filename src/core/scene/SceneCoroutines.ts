import type { Application } from '#core/Application';
import type { Coroutine, CoroutineBody, CoroutineOptions } from '#core/CoroutineSystem';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { SceneState } from '#core/scene/SceneState';
import type { Destroyable } from '#core/types';

/** Options accepted by every `SceneCoroutines` tracking method. */
export interface SceneCoroutineOptions extends CoroutineOptions {
  /**
   * Availability relative to {@link SceneDirector.pause}/{@link SceneDirector.resume}.
   * `'always'` (default) ignores scene pause entirely. `'active'` freezes the
   * moment the scene pauses and resumes when it resumes. `'paused'` is the
   * mirror image: advances only while the scene is paused.
   *
   * Applied only at the scene's pause/resume transitions, not re-checked at
   * creation time - an item created while the scene is already paused starts
   * advancing immediately and is only corrected at the next pause/resume cycle.
   */
  when?: SceneAvailability;
}

/**
 * Scene-bound coroutine facade over the application-wide
 * {@link CoroutineSystem} - a view onto the one queue, never a second one, so
 * priority and the frame budget keep meaning what they say. Access via
 * {@link Scene.coroutines}.
 *
 * A coroutine queued here stops advancing while the owning scope is not
 * `Active` and resumes exactly where it left off, because a suspended
 * coroutine keeps its body alive and is merely stepped past. Only the scene
 * ending, {@link Coroutine.cancel}, an aborting signal or scope destruction
 * settles it.
 */
export class SceneCoroutines implements Destroyable {
  private readonly _coroutines = new Map<Coroutine<unknown, unknown>, SceneAvailability>();
  private readonly _cold = new Set<Coroutine<unknown, unknown>>();
  private _suspended: Set<Coroutine<unknown, unknown>> | null = null;
  private _frozen: Set<Coroutine<unknown, unknown>> | null = null;
  private _thawed: Set<Coroutine<unknown, unknown>> | null = null;

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
  ) {}

  /** Coroutines this scene still owns, settled ones excluded. */
  public get pending(): number {
    let count = 0;

    for (const coroutine of this._coroutines.keys()) {
      if (!coroutine.settled) count++;
    }

    return count;
  }

  /**
   * Queue `body` on the application-wide system, tracked for scene-lifetime
   * cleanup. While the owning scope is not `Active` the coroutine is queued
   * but held, so it takes its first step on activation rather than in the
   * meantime.
   */
  public queue<T, P = void>(body: CoroutineBody<T, P> | Iterator<P, T, undefined>, options: SceneCoroutineOptions = {}): Coroutine<T, P> {
    const coroutine = this._app.coroutines.queue(body, options);

    this._track(coroutine as unknown as Coroutine<unknown, unknown>, options);

    return coroutine;
  }

  /**
   * Track an already-queued {@link Coroutine} for scene-lifetime cleanup -
   * one created through `app.coroutines.queue(...)` that should now follow
   * this scene. Returns `this` for chaining.
   */
  public add<T, P>(coroutine: Coroutine<T, P>, options: SceneCoroutineOptions = {}): this {
    this._track(coroutine as unknown as Coroutine<unknown, unknown>, options);

    return this;
  }

  /**
   * Hold every tracked coroutine that is still running, recording exactly that
   * set so {@link SceneCoroutines.restore} can release it again. Reserved for
   * retention suspension.
   * @internal
   */
  public suspend(): void {
    this._suspended = this._holdAll();
  }

  /**
   * Called by `SceneScope` whenever this scope becomes `Active`: releases
   * exactly the set {@link SceneCoroutines.suspend} held, plus everything
   * queued while the scope was dormant.
   * @internal
   */
  public restore(): void {
    if (this._suspended !== null) {
      this._release(this._suspended);
      this._suspended = null;
    }

    this._release(this._cold);
    this._cold.clear();
  }

  /**
   * Alias for {@link SceneCoroutines.restore}, used by `SceneScope.activate()`
   * for the fresh-activation edge - kept as a distinctly-named entry point so
   * call sites read naturally regardless of which transition triggered them.
   * @internal
   */
  public activate(): void {
    this.restore();
  }

  /**
   * Apply the `when` pause policy: `'active'` coroutines still advancing are
   * frozen, `'paused'` ones currently frozen are woken early. Called by
   * {@link SceneScope.pause}.
   * @internal
   */
  public pause(): void {
    const frozen = new Set<Coroutine<unknown, unknown>>();
    const thawed = new Set<Coroutine<unknown, unknown>>();

    for (const [coroutine, when] of this._coroutines) {
      if (coroutine.settled) {
        continue;
      }

      if (when === SceneAvailability.Active && !coroutine._suspended) {
        coroutine._suspended = true;
        frozen.add(coroutine);
      } else if (when === SceneAvailability.Paused && coroutine._suspended) {
        coroutine._suspended = false;
        thawed.add(coroutine);
      }
    }

    this._frozen = frozen;
    this._thawed = thawed;
  }

  /**
   * Undo {@link SceneCoroutines.pause}: releases everything it froze and
   * re-freezes everything it woke early, each only if still in the state this
   * facade left it in. Called by {@link SceneScope.resume}.
   * @internal
   */
  public resume(): void {
    if (this._frozen !== null) {
      this._release(this._frozen);
      this._frozen = null;
    }

    if (this._thawed !== null) {
      for (const coroutine of this._thawed) {
        if (!coroutine.settled && !coroutine._suspended) {
          coroutine._suspended = true;
        }
      }

      this._thawed = null;
    }
  }

  public destroy(): void {
    for (const coroutine of this._coroutines.keys()) {
      coroutine.cancel();
    }

    this._coroutines.clear();
    this._cold.clear();
    this._suspended = null;
    this._frozen = null;
    this._thawed = null;
  }

  private _track(coroutine: Coroutine<unknown, unknown>, options: SceneCoroutineOptions): void {
    this._coroutines.set(coroutine, options.when ?? SceneAvailability.Always);

    if (this._getState() !== SceneState.Active && !coroutine.settled) {
      coroutine._suspended = true;
      this._cold.add(coroutine);
    }
  }

  private _holdAll(): Set<Coroutine<unknown, unknown>> {
    const held = new Set<Coroutine<unknown, unknown>>();

    for (const coroutine of this._coroutines.keys()) {
      if (!coroutine.settled && !coroutine._suspended) {
        coroutine._suspended = true;
        held.add(coroutine);
      }
    }

    return held;
  }

  private _release(coroutines: Iterable<Coroutine<unknown, unknown>>): void {
    for (const coroutine of coroutines) {
      if (!coroutine.settled) {
        coroutine._suspended = false;
      }
    }
  }
}
