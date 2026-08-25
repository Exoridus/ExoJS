import type { RenderingContext } from '#rendering/RenderingContext';

import type { Duration } from './Time';
import type { Destroyable, Synchronous } from './types';

/**
 * The four scheduler phases a {@link System} may participate in, one per
 * dispatch stage of the {@link Application} frame loop: pre-simulation sync,
 * fixed-timestep simulation, variable-rate update, and rendering.
 *
 * Every phase must be synchronous. The registry dispatches them on the frame
 * path and never awaits a result, so an `async` phase is a compile error (see
 * {@link Synchronous}) and, for callers the type system cannot reach, a thrown
 * error in every build. Asynchronous work belongs in the owning scene's
 * {@link Scene.load}.
 */
export interface SystemMethods {
  /**
   * Advance by the variable frame `delta`, *before* this frame's fixed steps.
   * Called once per frame, ahead of every other phase.
   *
   * This is where per-frame state has to be brought in sync with the incoming
   * frame so the simulation sees it: the engine's own input, interaction,
   * audio, tween and rendering systems all run here. Anything that must be
   * current *before* physics runs belongs in this phase - a system reading
   * input in {@link SystemMethods.update} would see the previous frame's
   * snapshot, because `update` runs after the fixed steps.
   */
  preUpdate?(delta: Duration): Synchronous;
  /** Advance by one fixed-timestep `step` ({@link Application.fixedTimeStep}). Called zero or more times per frame, after {@link SystemMethods.preUpdate} and before {@link SystemMethods.update}. */
  fixedUpdate?(step: Duration): Synchronous;
  /** Advance by the variable frame `delta`. Called once per frame, after fixed steps. */
  update?(delta: Duration): Synchronous;
  /** Render into `context`. Called once per frame, after {@link SystemMethods.update}. */
  draw?(context: RenderingContext): Synchronous;
}

/**
 * Rewrites `T` so that at least one of `Keys` is required while the others
 * stay optional - the rest of `T`'s properties are untouched. Used to require
 * at least one {@link SystemMethods} phase without forcing all three.
 */
type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [Key in Keys]-?: Required<Pick<T, Key>> & Partial<Pick<T, Exclude<Keys, Key>>>;
  }[Keys];

/**
 * A per-frame unit of simulation or rendering, owned by a {@link SystemRegistry}
 * (`app.systems` or `scene.systems`). A system is a class instance or plain
 * object that implements at least one of {@link SystemMethods.fixedUpdate},
 * {@link SystemMethods.update}, or {@link SystemMethods.draw} - it participates
 * only in the phases it defines.
 *
 * ```ts
 * app.systems.add({
 *   update(delta: Duration) {
 *     simulation.update(delta);
 *   },
 *   draw(context: RenderingContext) {
 *     context.render(stage);
 *   },
 * });
 * ```
 *
 * `destroy()` is optional: the registry calls it, if present, exactly once
 * when the system is still registered at registry destruction.
 */
export type System = RequireAtLeastOne<SystemMethods> &
  Partial<Destroyable> & {
    /**
     * Tick order within the registry (ascending; default `0`). Systems
     * sharing an order run in insertion order. Read when the registry next
     * sorts; a {@link SystemRegistrationOptions.order} passed to `add()`
     * overrides this.
     */
    readonly order?: number;
  };
