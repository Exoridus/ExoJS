import { Ease } from './Easing';
import type { TweenManager } from './TweenManager';
import type { EasingFunction, TweenLifecycleCallback, TweenUpdateCallback } from './types';
import { TweenState } from './types';

type NumericKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never;
}[keyof T];

/**
 * Animates numeric properties of `target` from their current value to a
 * configured end value over a duration in seconds. Supports easing, delay,
 * repeat (with optional yoyo), chaining, and lifecycle callbacks
 * ({@link Tween.onStart}, {@link Tween.onUpdate}, {@link Tween.onComplete},
 * {@link Tween.onRepeat}).
 *
 * Tweens are typically created via {@link TweenManager.create}, which attaches
 * them to the manager so they advance once per frame. Stand-alone usage is
 * supported by calling {@link Tween.update} manually with a frame delta.
 *
 * Start values are captured lazily on the first update after {@link Tween.start},
 * so target properties may be mutated between configuration and start without
 * affecting the captured baseline.
 *
 * Only number-typed properties on `target` are interpolated; non-number
 * properties listed in {@link Tween.to} emit a console warning and are skipped.
 *
 * @example
 * ```ts
 * app.tweens.create(sprite.position)
 *     .to({ x: 200 }, 1.5)
 *     .easing(Ease.cubicInOut)
 *     .yoyo()
 *     .repeat(-1)
 *     .start();
 * ```
 */
export class Tween<T extends object = object> {
  private readonly _target: T;
  private _state: TweenState = TweenState.Idle;

  private _properties: Partial<Record<NumericKeys<T>, number>> = {};
  private _startValues: Record<string, number> | null = null;
  private _duration = 0;
  private _delay = 0;
  private _easing: EasingFunction = Ease.linear;

  private _elapsed = 0;
  private _delayElapsed = 0;

  /**
   * Remaining repeat cycles. -1 = infinite.
   * At start this is set to _repeatTotal. Decremented on each cycle boundary.
   */
  private _repeatCount = 0;
  /** The value as configured by .repeat(). Preserved for reset. */
  private _repeatTotal = 0;
  private _yoyo = false;
  /** Current playback direction: 1 = forward, -1 = reverse. */
  private _direction: 1 | -1 = 1;

  private _onStart: TweenLifecycleCallback | null = null;
  private _onUpdate: TweenUpdateCallback | null = null;
  private _onComplete: TweenLifecycleCallback | null = null;
  private _onRepeat: TweenLifecycleCallback | null = null;

  private _chained: Tween | null = null;
  private _manager: TweenManager | null = null;

  /** Whether onStart has already fired this tween lifecycle. */
  private _startFired = false;

  public constructor(target: T) {
    this._target = target;
  }

  public get target(): T {
    return this._target;
  }

  public get state(): TweenState {
    return this._state;
  }

  /**
   * Current eased progress in 0..1. Reflects the eased t after applying the
   * easing function, not the raw elapsed/duration ratio.
   *
   * Returns `0` while the tween is in the delay phase (state is `Active` but
   * the configured delay has not yet elapsed).
   */
  public get progress(): number {
    if (this._duration === 0) return 1;
    const rawT = Math.min(this._elapsed / this._duration, 1);
    const t = this._direction === 1 ? rawT : 1 - rawT;

    return this._easing(t);
  }

  /**
   * Set target end-values and duration in seconds. Replaces any prior to().
   * The starting values are captured lazily on first update() after start(),
   * so mutating target between to() and start() is safe.
   *
   * Only numeric properties of `target` are accepted. Non-numeric keys are
   * rejected at compile time; the runtime guard in update() remains as a
   * safety net for untyped callers.
   */
  public to(properties: Partial<Record<NumericKeys<T>, number>>, duration: number): this {
    this._properties = { ...properties };
    this._duration = duration;
    this._startValues = null;

    return this;
  }

  /** Delay in seconds before the tween begins interpolating. Default 0. */
  public delay(seconds: number): this {
    this._delay = seconds;

    return this;
  }

  /** Easing function applied to the normalized time. Default Ease.linear. */
  public easing(easingFunction: EasingFunction): this {
    this._easing = easingFunction;

    return this;
  }

  /**
   * Number of additional repeat cycles. -1 = infinite. Default 0 (runs once).
   *
   * The argument counts cycles **after** the first, not the total cycle
   * count — `repeat(2)` runs the animation three times total (the initial
   * pass plus two repeats).
   *
   * @example
   * ```ts
   * tween.repeat(0);   // runs once
   * tween.repeat(1);   // runs twice
   * tween.repeat(2);   // runs three times
   * tween.repeat(-1);  // runs forever
   * ```
   */
  public repeat(count: number): this {
    this._repeatTotal = count;

    return this;
  }

  /**
   * Reverse playback direction on each repeat cycle. Only meaningful when
   * combined with repeat(). Calling yoyo() without repeat() is a no-op.
   */
  public yoyo(enabled = true): this {
    this._yoyo = enabled;

    return this;
  }

  /**
   * Register a callback fired once when the tween begins interpolating
   * (after any configured delay has elapsed). Fires only on the first
   * cycle — repeats do not re-trigger it.
   */
  public onStart(callback: TweenLifecycleCallback): this {
    this._onStart = callback;

    return this;
  }

  /**
   * Register a callback fired on every active update. Receives the eased
   * progress in 0..1 — already direction-flipped for yoyo cycles.
   */
  public onUpdate(callback: TweenUpdateCallback): this {
    this._onUpdate = callback;

    return this;
  }

  /**
   * Register a callback fired when the tween finishes naturally (all repeat
   * cycles exhausted). Does NOT fire when the tween is stopped via
   * {@link Tween.stop}.
   */
  public onComplete(callback: TweenLifecycleCallback): this {
    this._onComplete = callback;

    return this;
  }

  /**
   * Register a callback fired at the boundary of each repeat cycle, after
   * the cycle counter is decremented and before the next cycle begins. Not
   * fired on the final cycle's completion (use {@link Tween.onComplete}
   * for that).
   */
  public onRepeat(callback: TweenLifecycleCallback): this {
    this._onRepeat = callback;

    return this;
  }

  /**
   * Start or restart the tween. Resets all elapsed time, the start-value
   * snapshot, playback direction, and repeat counter.
   *
   * If this tween was previously owned by a manager but was evicted after
   * natural completion or {@link Tween.stop}, it is automatically
   * re-registered so it continues to receive frame updates. Stand-alone
   * tweens (no manager) are unaffected.
   */
  public start(): this {
    this._state = TweenState.Active;
    this._elapsed = 0;
    this._delayElapsed = 0;
    this._startValues = null;
    this._startFired = false;
    this._direction = 1;
    this._repeatCount = this._repeatTotal;
    this._manager?.add(this);

    return this;
  }

  /** Pause the tween. update() calls are ignored while paused. */
  public pause(): this {
    if (this._state === TweenState.Active) {
      this._state = TweenState.Paused;
    }

    return this;
  }

  /** Resume a paused tween from where it left off. */
  public resume(): this {
    if (this._state === TweenState.Paused) {
      this._state = TweenState.Active;
    }

    return this;
  }

  /**
   * Stop the tween without finishing. Target properties stay at their
   * current interpolated values. onComplete does NOT fire. The tween is
   * removed from its manager if one is assigned.
   */
  public stop(): this {
    if (this._state === TweenState.Active || this._state === TweenState.Paused) {
      this._state = TweenState.Stopped;
      this._manager?.remove(this);
    }

    return this;
  }

  /**
   * When this tween completes naturally, automatically start `next`.
   * Returns `next` for fluent chaining:
   *   `fadeIn.chain(moveOut).start()` — note that start() here starts moveOut,
   *   so typically you only call start() on the first tween.
   */
  public chain(next: Tween): Tween {
    this._chained = next;

    return next;
  }

  /**
   * Attach this tween to a manager. Called by TweenManager.create() and
   * TweenManager.add(). Not part of the public fluent API.
   * @internal
   */
  public _attachManager(manager: TweenManager): void {
    this._manager = manager;
  }

  /**
   * Advance the tween by deltaSeconds. Called by TweenManager each frame, or
   * manually for stand-alone usage. No-ops when Paused, Stopped, or Complete.
   */
  public update(deltaSeconds: number): void {
    if (this._state !== TweenState.Active) return;

    // Handle delay phase.
    if (this._delayElapsed < this._delay) {
      this._delayElapsed += deltaSeconds;

      if (this._delayElapsed < this._delay) return;

      // Carry overflow past delay into elapsed.
      const overflow = this._delayElapsed - this._delay;
      this._delayElapsed = this._delay;
      deltaSeconds = overflow;
    }

    // Lazy snapshot of start values on the first update after delay.
    if (this._startValues === null) {
      this._captureStartValues();
    }

    // Fire onStart once.
    if (!this._startFired) {
      this._startFired = true;
      this._onStart?.();
    }

    this._elapsed += deltaSeconds;

    // Clamp to duration for this cycle.
    if (this._elapsed >= this._duration) {
      this._elapsed = this._duration;
    }

    // Apply interpolation.
    this._applyProgress();

    if (this._elapsed >= this._duration) {
      // Cycle complete.
      const hasMoreRepeats = this._repeatCount === -1 || this._repeatCount > 0;

      if (hasMoreRepeats) {
        // Decrement repeat counter (skip for infinite).
        if (this._repeatCount !== -1) {
          this._repeatCount--;
        }

        this._onRepeat?.();

        // Flip direction for yoyo.
        if (this._yoyo) {
          this._direction = this._direction === 1 ? -1 : 1;
        }

        // Reset elapsed for next cycle; carry overflow.
        const overflow = this._elapsed - this._duration;
        this._elapsed = overflow > 0 ? Math.min(overflow, this._duration) : 0;

        // Apply progress for any overflow.
        if (overflow > 0) {
          this._applyProgress();
        }
      } else {
        // All cycles done.
        this._complete();
      }
    }
  }

  private _captureStartValues(): void {
    const snap: Record<string, number> = {};
    const keys = Object.keys(this._properties) as Array<keyof T>;

    for (const key of keys) {
      const val = this._target[key];

      if (typeof val !== 'number') {
        console.warn(`Tween: property "${String(key)}" is not a number on target ` + `(got ${typeof val}). It will be skipped.`);
        continue;
      }

      snap[String(key)] = val;
    }

    this._startValues = snap;
  }

  private _applyProgress(): void {
    if (this._startValues === null) return;

    const rawT = this._duration === 0 ? 1 : Math.min(this._elapsed / this._duration, 1);
    const t = this._direction === 1 ? rawT : 1 - rawT;
    const easedT = this._easing(t);

    const keys = Object.keys(this._startValues);
    const properties = this._properties as Partial<Record<string, number>>;

    for (const key of keys) {
      const start = this._startValues[key];
      const end = properties[key];
      if (end === undefined) continue;
      (this._target as Record<string, unknown>)[key] = start + (end - start) * easedT;
    }

    this._onUpdate?.(easedT);
  }

  private _complete(): void {
    // Ensure the target is at its final interpolated position.
    this._elapsed = this._duration;
    this._applyProgress();

    this._state = TweenState.Complete;
    this._manager?.remove(this);
    this._onComplete?.();

    // Fire chained tween, if any.
    this._chained?.start();
  }
}
