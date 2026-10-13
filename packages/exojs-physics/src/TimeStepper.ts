import { logger } from '@codexo/exojs';

/**
 * Relative tolerance between a host's fixed step and `fixedDelta`. A host that
 * stores its step in milliseconds hands back `1 / 60` as `(1000 / 60) / 1000`,
 * which can differ in the last bits; one part in a billion absorbs that
 * rounding at any rate while every real rate mismatch (120 Hz against 121 Hz is
 * already 0.8 %) is still refused.
 */
const hostStepTolerance = 1e-9;

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
 * The stepper holds no mutable module-level state - two stepper instances are
 * fully independent (world isolation).
 */
export class TimeStepper {
  public readonly fixedDelta: number;
  public readonly maxSubSteps: number;

  /**
   * @internal - the owning world's default blend factor: {@link alpha} while
   * the accumulator drives the world. A hosted world never moves the
   * accumulator, so reading it would pin bound nodes one step behind; the
   * latest step is presented instead.
   */
  public readonly _ownAlpha = (): number => (this._driver === 'host' ? 1 : this.alpha);

  private _accumulator = 0;
  /** What advanced the owning world last: this accumulator or a host's fixed step. */
  private _driver: 'accumulator' | 'host' | null = null;
  /** Development builds only: how often {@link _driver} changed; a second change means two drivers. */
  private _driverChanges = 0;
  /** Development builds only: whether the missing hosted alpha source was reported. */
  private _reportedHostedAlpha = false;

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

    this._track('accumulator');
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

  /**
   * @internal - accept one host fixed step for the owning world and return the
   * duration to simulate, before anything is mutated. Every consumer of a step
   * - controllers, the solver's sub-steps, sleep timing, contact events,
   * interpolation - is sized from {@link fixedDelta}, so a host running at
   * another rate would advance the simulation by the wrong amount of time per
   * host step rather than by the step it was handed.
   */
  public _hostStep(step: number): number {
    const fixedDelta = this.fixedDelta;

    if (!(step > 0) || step === Number.POSITIVE_INFINITY) {
      throw new RangeError(`PhysicsWorld.fixedUpdate: the host step must be a positive finite number of seconds, received ${step}.`);
    }

    if (Math.abs(step - fixedDelta) > fixedDelta * hostStepTolerance) {
      throw new Error(
        `PhysicsWorld.fixedUpdate: the host steps ${step} s at a time, but this world's fixedDelta is ${fixedDelta} s. ` +
          'Construct a hosted world with the host step, e.g. `new PhysicsWorld({ fixedDelta: app.fixedTimeStep })`, or step it by hand with `world.step(delta)` instead of registering it.',
      );
    }

    this._track('host');

    return fixedDelta;
  }

  /**
   * @internal - read an interpolating world's blend factor from `source`.
   * Development builds report, once, a hosted world still on the default
   * source, which has no fraction to offer.
   */
  public _readAlpha(source: () => number): number {
    if (__DEV__ && source === this._ownAlpha && this._driver === 'host' && !this._reportedHostedAlpha) {
      this._reportedHostedAlpha = true;
      logger.warn(
        'PhysicsWorld: an interpolating world stepped by its host has no frameAlphaSource, so bound nodes show the latest step without smoothing. ' +
          'Pass the host fraction: `new PhysicsWorld({ interpolation: true, frameAlphaSource: () => app.frameAlpha })`.',
        { source: 'physics' },
      );
    }

    return source();
  }

  /**
   * Record which driver advances the owning world. Development builds report
   * a driver that changes a second time: a single change is a deliberate
   * hand-over, alternating means two drivers each advancing the world.
   */
  private _track(driver: 'accumulator' | 'host'): void {
    if (this._driver === driver) {
      return;
    }

    if (__DEV__ && this._driver !== null && ++this._driverChanges === 2) {
      logger.warn(
        'PhysicsWorld: this world is advanced both by step() and by the fixedUpdate() of a system registry it is registered with. ' +
          'Each advances the simulation, so the world runs ahead of its clock. Register the world as a system or step it by hand, not both.',
        { source: 'physics' },
      );
    }

    this._driver = driver;
  }
}
