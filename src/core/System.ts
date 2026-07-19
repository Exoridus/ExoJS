import type { RenderingContext } from '#rendering/RenderingContext';

import type { Time } from './Time';
import type { Destroyable } from './types';

/**
 * The three scheduler phases a {@link System} may participate in, one per
 * dispatch stage of the {@link Application} frame loop: fixed-timestep
 * simulation, variable-rate update, and rendering.
 */
export interface SystemMethods {
  /** Advance by one fixed-timestep `step` ({@link Application.fixedTimeStep}). Called zero or more times per frame, before {@link SystemMethods.update}. */
  fixedUpdate?(step: Time): void;
  /** Advance by the variable frame `delta`. Called once per frame, after fixed steps. */
  update?(delta: Time): void;
  /** Render into `context`. Called once per frame, after {@link SystemMethods.update}. */
  draw?(context: RenderingContext): void;
}

/**
 * Rewrites `T` so that at least one of `Keys` is required while the others
 * stay optional — the rest of `T`'s properties are untouched. Used to require
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
 * {@link SystemMethods.update}, or {@link SystemMethods.draw} — it participates
 * only in the phases it defines.
 *
 * ```ts
 * app.systems.add({
 *   update(delta: Time) {
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
