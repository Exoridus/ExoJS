/**
 * Thrown into a sequence step that waits on something that was cancelled: a
 * {@link SequenceHandle} cancelled elsewhere, or a {@link SequenceOperation}
 * that settled as `cancelled`. Left uncaught, it ends the waiting step as
 * `cancelled` rather than `failed`. It is also the abort reason of
 * {@link SequenceContext.signal}.
 */
export class SequenceCancelledError extends Error {
  public constructor(message = 'The sequence step was cancelled.') {
    super(message);
    this.name = 'SequenceCancelledError';
  }
}
