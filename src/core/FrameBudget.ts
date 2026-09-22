import type { Seconds } from './units';

/**
 * How much of the running frame is still unspent, handed to the
 * {@link SystemMethods.postFrame} phase.
 *
 * Modelled on the platform's `IdleDeadline`, so the canonical loop is the one
 * the browser already teaches:
 *
 * ```ts
 * while (budget.timeRemaining() > 0 && queue.length > 0) {
 *   doWork();
 * }
 * ```
 *
 * The figure is advisory. JavaScript is run-to-completion, so nothing can
 * interrupt a unit of work that overruns - the budget tells work that polls it
 * when to stop, and work that ignores it is unaffected.
 */
export interface FrameBudget {
  /**
   * Time left before the current frame reaches its target duration, clamped
   * at zero. A live view of the running frame, updated in place - holding it
   * across a `yield` and reading it again in a later frame is the intended
   * pattern, not a mistake. Outside a frame it reports zero.
   */
  timeRemaining(): Seconds;
}
