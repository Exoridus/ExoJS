import type { Cloneable } from '@/core/types';

let temp: Interval | null = null;

/**
 * A closed scalar interval `[min, max]` used by the SAT collision solver to
 * represent the projection of a shape onto a separating axis.
 *
 * `Interval.temp` provides a shared scratch instance for hot paths.
 * `Interval.zero` is a read-only `[0, 0]` sentinel.
 */
export class Interval implements Cloneable {

    public min: number;
    public max: number;

    public constructor(min = 0, max = min) {
        this.min = min;
        this.max = max;
    }

    public set(min: number, max: number): this {
        this.min = min;
        this.max = max;

        return this;
    }

    public copy(interval: Interval): this {
        return this.set(interval.min, interval.max);
    }

    public clone(): this {
        return new Interval(this.min, this.max) as this;
    }

    /** Return `true` when `interval` is strictly contained within this interval (exclusive bounds). */
    public containsInterval(interval: Interval): boolean {
        return interval.min > this.min && interval.max < this.max;
    }

    /** Return `true` when `value` lies within `[min, max]` (inclusive). */
    public includes(value: number): boolean {
        return value <= this.max && value >= this.min;
    }

    /** Return `true` when this interval and `interval` share at least one point. */
    public overlaps(interval: Interval): boolean {
        return !(this.min > interval.max || interval.min > this.max);
    }

    /**
     * Return the signed overlap length between this interval and `interval`.
     * Positive when they overlap; the sign encodes which end overlaps more.
     * Used by the SAT solver to compute penetration depth.
     */
    public getOverlap(interval: Interval): number {
        return this.max < interval.max ? this.max - interval.min : interval.max - this.min;
    }

    public destroy(): void {
        // no-op — pure value class, kept for Destroyable interface conformance
    }

    public static readonly zero = new Interval(0, 0);

    public static get temp(): Interval {
        if (temp === null) {
            temp = new Interval();
        }

        return temp;
    }
}
