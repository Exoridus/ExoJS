import type { Seconds } from '#core/units';

/**
 * How a {@link SequenceOperation} or a {@link SequenceHandle} ended: completed
 * with a value, cancelled, or failed with an error.
 */
export type SequenceSettlement<T> =
  | { readonly status: 'completed'; readonly value: T }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly error: unknown };

/**
 * Structural contract for work a sequence step can wait on and own: anything
 * with a `poll` method, waited on with `yield* context.waitFor(operation)`.
 * Adapting a native action takes a function that returns such an object, not
 * a class; {@link tweenOperation} is the adapter for a {@link Tween}.
 *
 * ```ts
 * const voiceEnded = (voice: Voice): SequenceOperation => {
 *   let ended = false;
 *   const onEnd = (): void => { ended = true; };
 *
 *   voice.onEnd.add(onEnd);
 *
 *   return {
 *     poll: () => (ended ? { status: 'completed', value: undefined } : undefined),
 *     cancel: () => { voice.onEnd.remove(onEnd); voice.stop(); },
 *   };
 * };
 * ```
 */
export interface SequenceOperation<T = void> {
  /**
   * Report whether the work has ended. Called once per tick of the sequencer
   * while a step waits, first on the tick after the wait began, with that
   * tick's delta. Return `undefined` while the work is still running. A
   * `cancelled` settlement throws a {@link SequenceCancelledError} into the
   * waiting step, a `failed` one throws its error, and a throwing `poll`
   * counts as failed.
   */
  poll(delta: Seconds): SequenceSettlement<T> | undefined;
  /**
   * Stop the work. Called at most once, synchronously, when the waiting step
   * stops waiting before `poll` reported a settlement: the step was
   * cancelled, lost a race, failed through one of its branches, or its
   * sequencer was torn down. Never called after a settlement.
   */
  cancel?(): void;
}
