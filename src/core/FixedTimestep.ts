/**
 * Fixed-timestep accumulator (Gaffer's "Fix Your Timestep"). Converts the
 * variable per-frame delta into a whole number of fixed-size steps, carrying the
 * sub-step remainder across frames as an interpolation {@link FixedTimestep.alpha}.
 *
 * Pure timing logic - no scene or signal coupling - so the loop can drive it and
 * tests can exercise the step/alpha maths directly. The {@link maxSteps} cap is
 * the spiral-of-death guard: when a frame is so long it would need more than
 * `maxSteps` catch-up steps, the surplus whole-step backlog is dropped rather
 * than accumulated (which would make the next frame even longer).
 *
 * @internal
 */
export class FixedTimestep {
  private _accumulatorMs = 0;

  public constructor(
    private readonly _stepMs: number,
    private readonly _maxSteps: number,
  ) {
    if (!(_stepMs > 0) || !Number.isFinite(_stepMs)) {
      throw new RangeError(`FixedTimestep: step must be a positive finite number of ms, received ${_stepMs}.`);
    }
  }

  /** The fixed step size in milliseconds. */
  public get stepMs(): number {
    return this._stepMs;
  }

  /**
   * Derives a `maxSteps` cap from a frame-delta clamp so the spiral-of-death
   * guard scales with the configured step size instead of a fixed step count.
   * Always at least 1, so even a delta clamp smaller than one step still runs.
   */
  public static deriveMaxSteps(maxDeltaMs: number, stepMs: number): number {
    return Math.max(1, Math.ceil(maxDeltaMs / stepMs));
  }

  /** Leftover fraction `[0, 1)` of a step - the render interpolation factor. */
  public get alpha(): number {
    return this._accumulatorMs / this._stepMs;
  }

  /** Add a frame's elapsed time and return how many fixed steps to run now (capped at `maxSteps`). */
  public advance(frameDeltaMs: number): number {
    this._accumulatorMs += frameDeltaMs;

    // Tolerance so an accumulator that lands a rounding-error below a whole
    // multiple of the step (e.g. 3×step) still yields that many steps.
    const epsilon = this._stepMs * 1e-9;
    let steps = 0;

    while (this._accumulatorMs >= this._stepMs - epsilon && steps < this._maxSteps) {
      this._accumulatorMs -= this._stepMs;
      steps++;
    }

    // Capped: drop the whole-step backlog, keep only the sub-step remainder so
    // alpha stays in [0, 1) and the next frame does not replay the lost time.
    // The comparison is `>=`, not `>`: a backlog that is an exact multiple of
    // the step would otherwise be left untouched at exactly one whole step and
    // report `alpha === 1`. The uncapped path never reaches here - the loop
    // only exits below `stepMs - epsilon` unless `maxSteps` stopped it.
    if (this._accumulatorMs >= this._stepMs) {
      this._accumulatorMs %= this._stepMs;
    }

    // Clamp the tiny negative the epsilon subtraction can leave.
    if (this._accumulatorMs < 0) {
      this._accumulatorMs = 0;
    }

    return steps;
  }

  /** Clear the accumulator (e.g. on start/resume so a paused gap is not caught up). */
  public reset(): void {
    this._accumulatorMs = 0;
  }
}
