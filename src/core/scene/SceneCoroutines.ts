import type { Application } from '#core/Application';
import type { Coroutine, CoroutineBody, CoroutineOptions } from '#core/CoroutineSystem';
import { SceneAvailability, sceneAvailabilityAllows } from '#core/scene/SceneAvailability';
import type { SceneState } from '#core/scene/SceneState';
import type { Destroyable } from '#core/types';

/** Options accepted by every `SceneCoroutines` tracking method. */
export interface SceneCoroutineOptions extends CoroutineOptions {
  /**
   * Availability relative to {@link SceneDirector.pause}/{@link SceneDirector.resume}.
   * `'always'` (default) ignores scene pause entirely. `'active'` advances
   * only while the scene runs, `'paused'` only while it is paused. The policy
   * holds from the moment the coroutine is queued or added, not only from the
   * next pause or resume.
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
 *
 * A paused scene is still `Active`, so pause alone does not stop a coroutine:
 * the default availability is `'always'`. Pass
 * {@link SceneCoroutineOptions.when | `when: 'active'`} for work that should
 * freeze while the scene is paused.
 */
export class SceneCoroutines implements Destroyable {
  private readonly _coroutines = new Map<Coroutine<unknown, unknown>, SceneAvailability>();

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
    private readonly _getPaused: () => boolean = () => false,
  ) {}

  /** Coroutines this scene still owns, settled ones excluded. */
  public get pending(): number {
    let count = 0;

    for (const coroutine of this._coroutines.keys()) {
      if (!coroutine.settled) {
        count++;
      }
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
   * Hold or release every tracked coroutine according to the scope's current
   * state and pause flag. Called on every scope transition that can change
   * what a policy allows.
   * @internal
   */
  public _sync(): void {
    for (const [coroutine, when] of this._coroutines) {
      if (coroutine.settled) {
        this._coroutines.delete(coroutine);
        continue;
      }

      coroutine._suspended = !sceneAvailabilityAllows(when, this._getState(), this._getPaused());
    }
  }

  public destroy(): void {
    for (const coroutine of this._coroutines.keys()) {
      coroutine.cancel();
    }

    this._coroutines.clear();
  }

  private _track(coroutine: Coroutine<unknown, unknown>, options: SceneCoroutineOptions): void {
    const when = options.when ?? SceneAvailability.Always;

    this._coroutines.set(coroutine, when);

    if (!coroutine.settled) {
      coroutine._suspended = !sceneAvailabilityAllows(when, this._getState(), this._getPaused());
    }
  }
}
