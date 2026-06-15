/** Construction options for {@link TimeStepper}. */
export interface TimeStepperOptions {
  /** Fixed simulation timestep in seconds. Default `1 / 60`. Must be > 0. */
  fixedDelta?: number;
  /** Maximum sub-steps consumed per `advance` call (spiral-of-death guard). Default `8`. Must be ≥ 1. */
  maxSubSteps?: number;
}

/**
 * Fixed-timestep accumulator (package-owned; no engine clock dependency). Each
 * frame, {@link advance} adds the variable frame delta to an internal
 * accumulator and reports how many whole fixed sub-steps to run
 * (`floor(accumulator / fixedDelta)`), clamped to {@link maxSubSteps}. When the
 * clamp trips, the backlog beyond the clamp is discarded so a slow frame cannot
 * cascade into an unbounded catch-up (the "spiral of death").
 *
 * {@link alpha} is the leftover fraction of a step `[0, 1)`, for interpolating
 * bound transforms between sub-steps.
 *
 * The stepper holds no mutable module-level state — two stepper instances are
 * fully independent (world isolation, gate I-1).
 */
export class TimeStepper {
  public readonly fixedDelta: number;
  public readonly maxSubSteps: number;

  private _accumulator = 0;

  public constructor(options: TimeStepperOptions = {}) {
    const fixedDelta = options.fixedDelta ?? 1 / 60;
    const maxSubSteps = options.maxSubSteps ?? 8;

    if (!Number.isFinite(fixedDelta) || fixedDelta <= 0) {
      throw new RangeError(`TimeStepper: fixedDelta must be a positive finite number, received ${fixedDelta}.`);
    }

    if (!Number.isInteger(maxSubSteps) || maxSubSteps < 1) {
      throw new RangeError(`TimeStepper: maxSubSteps must be an integer ≥ 1, received ${maxSubSteps}.`);
    }

    this.fixedDelta = fixedDelta;
    this.maxSubSteps = maxSubSteps;
  }

  /** Unconsumed accumulated time (seconds) currently held, always `< fixedDelta` after an `advance`. */
  public get accumulator(): number {
    return this._accumulator;
  }

  /** Interpolation fraction in `[0, 1)` = `accumulator / fixedDelta`. */
  public get alpha(): number {
    return Math.min(1, Math.max(0, this._accumulator / this.fixedDelta));
  }

  /**
   * Accumulate `frameDeltaSeconds` and return the number of fixed sub-steps to
   * run this frame. Non-finite or non-positive deltas contribute nothing and
   * return `0`.
   */
  public advance(frameDeltaSeconds: number): number {
    if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) {
      return 0;
    }

    this._accumulator += frameDeltaSeconds;

    let steps = Math.floor(this._accumulator / this.fixedDelta);

    if (steps <= 0) {
      return 0;
    }

    if (steps > this.maxSubSteps) {
      steps = this.maxSubSteps;
    }

    this._accumulator -= steps * this.fixedDelta;

    // Discard any backlog beyond the clamp, keeping only the sub-frame remainder.
    if (this._accumulator >= this.fixedDelta) {
      this._accumulator %= this.fixedDelta;
    }

    return steps;
  }

  /** Clear the accumulator (e.g. after a teleport or a pause). */
  public reset(): void {
    this._accumulator = 0;
  }
}
