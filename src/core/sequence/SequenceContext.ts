import type { Signal } from '#core/Signal';
import type { Seconds } from '#core/units';

import type { SequenceHandle } from './SequenceHandle';
import type { SequenceOperation } from './SequenceOperation';

declare const sequenceYieldBrand: unique symbol;

/**
 * What a sequence generator yields. Opaque: every wait is written as
 * `yield* context.wait(...)`, never as a bare `yield`, and a step that yields
 * anything else fails with a `TypeError`.
 */
export interface SequenceYield {
  readonly [sequenceYieldBrand]: true;
}

/** The generator a {@link Sequence} returns; `T` is what it returns. */
export type SequenceGenerator<T = void> = Generator<SequenceYield, T, unknown>;

/**
 * A sequence: a generator function of a {@link SequenceContext}. It is a
 * reusable definition, called anew for every {@link Sequencer.play} and every
 * branch that runs it.
 *
 * ```ts
 * const blink = function* (context: SequenceContext): SequenceGenerator {
 *   for (let i = 0; i < 3; i++) {
 *     sprite.visible = !sprite.visible;
 *     yield* context.wait(0.2);
 *   }
 * };
 * ```
 *
 * Nest a sequence inside another step's own flow with
 * `yield* blink(context)`, or run it as a branch of its own with
 * {@link SequenceContext.start}, {@link SequenceContext.all} or
 * {@link SequenceContext.race}.
 */
export type Sequence<T = void> = (context: SequenceContext) => SequenceGenerator<T>;

/** A branch for {@link SequenceContext.all} and {@link SequenceContext.race}: a sequence to start, or a handle to one already running. */
export type SequenceBranch<T = unknown> = Sequence<T> | SequenceHandle<T>;

/** What a {@link SequenceBranch} produces. */
export type SequenceBranchResult<B> = B extends SequenceHandle<infer T> ? T : B extends Sequence<infer T> ? T : never;

/**
 * What a running step can do: wait on the sequencer's clock, wait for
 * signals, conditions, handles and operations, and start branches. Each step
 * has its own context.
 *
 * Every wait is a generator, used with `yield*`; its result is the value of
 * the `yield*` expression. A step that waits resumes inside a later tick of
 * the sequencer, in the frame phase the sequencer runs in, never in a promise
 * continuation.
 */
export interface SequenceContext {
  /**
   * Seconds of the sequencer's clock between the start of this step's
   * sequence and this point of the step. A timed wait resumes the step at its
   * deadline rather than at the frame boundary that passed it, so this stays
   * exact however the frames fall.
   */
  readonly time: Seconds;
  /**
   * Aborted when this step ends, however it ends - for handing to APIs that
   * take an `AbortSignal`, such as `fetch`. The abort reason is a
   * {@link SequenceCancelledError}.
   */
  readonly signal: AbortSignal;

  /**
   * Start `sequence` as a branch owned by this step and return its handle
   * without waiting. The branch starts later in the same tick, at this step's
   * point on the clock, and runs alongside. It is cancelled if it is still
   * running when this step ends. Its failure is thrown into this step at the
   * `yield` where the step waits.
   */
  start<T>(sequence: Sequence<T>): SequenceHandle<T>;
  /**
   * Wait `duration` seconds of the sequencer's clock, counted from this
   * step's point on the clock. A step whose deadline falls inside the tick
   * that is running continues within that tick, so back-to-back waits never
   * drift. Zero and negative durations continue without waiting.
   *
   * @throws When `duration` is `NaN` or infinite, at the `yield*`.
   */
  wait(duration: Seconds | number): SequenceGenerator;
  /** Wait for the next tick of the sequencer and return its delta. */
  nextFrame(): SequenceGenerator<Seconds>;
  /**
   * Wait for the next dispatch of `signal` and return its arguments. The
   * listener is registered at the `yield*` and removed as soon as it fires
   * or the step stops waiting; the arguments are delivered on the next tick.
   */
  waitFor<Args extends unknown[]>(signal: Signal<Args>): SequenceGenerator<Args>;
  /**
   * Wait until `source` ends and return its value; its failure is thrown
   * here, and its cancellation as a {@link SequenceCancelledError}.
   *
   * - A {@link SequenceHandle}: the step continues at the point on the clock
   *   where the handle's step ended, if this sequencer ran it.
   * - A {@link SequenceOperation}: polled once per tick; cancelled if the step
   *   stops waiting first.
   * - A promise: its value is delivered on the next tick after it settles. A
   *   promise cannot be cancelled, so a step that stops waiting only stops
   *   listening.
   */
  waitFor<T>(source: SequenceHandle<T> | SequenceOperation<T> | PromiseLike<T>): SequenceGenerator<T>;
  /**
   * Wait until `condition` returns `true`, checked once per tick, first on the
   * tick after the wait began. A frame-edge flag such as an input action's
   * `pressed` therefore waits for a fresh press: a button already held when
   * the wait began does not count.
   */
  waitFor(condition: () => boolean): SequenceGenerator;
  /**
   * Run branches side by side and return all their results, in order, once
   * every one has completed. The step continues at the point on the clock
   * where the last branch ended. When a branch fails or is cancelled, the
   * branches this call started are cancelled and the failure, or a
   * {@link SequenceCancelledError}, is thrown here. Handles passed in keep
   * running.
   */
  all<const B extends readonly SequenceBranch[]>(branches: B): SequenceGenerator<{ -readonly [K in keyof B]: SequenceBranchResult<B[K]> }>;
  /**
   * Run branches side by side until the first one ends, and return its result
   * or throw its failure. Branches ending in the same tick are ordered by
   * their point on the clock. The losers this call started are cancelled;
   * handles passed in were started elsewhere and keep running.
   *
   * @throws When `branches` is empty, at the `yield*`.
   */
  race<const B extends readonly SequenceBranch[]>(branches: B): SequenceGenerator<SequenceBranchResult<B[number]>>;
}
