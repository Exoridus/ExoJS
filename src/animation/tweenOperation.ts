import type { SequenceOperation, SequenceSettlement } from '#core/sequence/SequenceOperation';

import type { Tween } from './Tween';
import { TweenState } from './types';

const completed: SequenceSettlement<void> = Object.freeze({ status: 'completed', value: undefined });
const cancelled: SequenceSettlement<void> = Object.freeze({ status: 'cancelled' });

/**
 * Adapt `tween` for a sequence to wait on and own:
 * `yield* context.waitFor(tweenOperation(tween))`.
 *
 * Starts the tween if it is idle. The wait completes when the tween
 * completes and throws a {@link SequenceCancelledError} when something else
 * stops it; a step that stops waiting first - cancelled, a lost race, the
 * sequencer's teardown - stops the tween where it is. A tween that repeats
 * forever never completes, so race it against a bound.
 */
export const tweenOperation = <T extends object>(tween: Tween<T>): SequenceOperation => {
  if (tween.state === TweenState.Idle) {
    tween.start();
  }

  return {
    poll: () => {
      if (tween.state === TweenState.Complete) {
        return completed;
      }

      return tween.state === TweenState.Stopped ? cancelled : undefined;
    },
    cancel: () => {
      tween.stop();
    },
  };
};
