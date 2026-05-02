import { Ease } from './Easing';
import { TweenState } from './types';
import type { EasingFunction, TweenLifecycleCallback, TweenUpdateCallback } from './types';
import type { TweenManager } from './TweenManager';

export class Tween<T extends object = object> {
    private readonly _target: T;
    private _state: TweenState = TweenState.Idle;

    private _properties: Partial<Record<keyof T, number>> = {};
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
     */
    public to(properties: Partial<Record<keyof T, number>>, duration: number): this {
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
    public easing(fn: EasingFunction): this {
        this._easing = fn;

        return this;
    }

    /**
     * Number of additional repeat cycles. -1 = infinite. Default 0 (runs once).
     * Note: repeat(2) means the animation runs 3 times total.
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

    public onStart(callback: TweenLifecycleCallback): this {
        this._onStart = callback;

        return this;
    }

    public onUpdate(callback: TweenUpdateCallback): this {
        this._onUpdate = callback;

        return this;
    }

    public onComplete(callback: TweenLifecycleCallback): this {
        this._onComplete = callback;

        return this;
    }

    public onRepeat(callback: TweenLifecycleCallback): this {
        this._onRepeat = callback;

        return this;
    }

    /**
     * Start the tween. If a manager owns this tween it is already tracked;
     * otherwise this is a stand-alone tween driven by manual update() calls.
     */
    public start(): this {
        this._state = TweenState.Active;
        this._elapsed = 0;
        this._delayElapsed = 0;
        this._startValues = null;
        this._startFired = false;
        this._direction = 1;
        this._repeatCount = this._repeatTotal;

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
                this._startFired = false; // allow onStart to re-fire next cycle? No — spec says once.
                // Actually spec says onStart fires when actual interpolation begins.
                // For repeats it fires once total at the very first cycle.
                // Re-reading spec: "onStart fires AFTER the delay (when actual interpolation begins)".
                // We'll keep it as one-shot across the full lifecycle; don't reset _startFired.
                this._startFired = true;

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
                console.warn(
                    `Tween: property "${String(key)}" is not a number on target ` +
                    `(got ${typeof val}). It will be skipped.`,
                );
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

        for (const key of keys) {
            const start = this._startValues[key]!;
            const end = this._properties[key as keyof T] as number;
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
