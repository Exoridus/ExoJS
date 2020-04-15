export class Interval {

    public static readonly Zero = new Interval(0, 0);
    public static readonly Temp = new Interval();

    public min: number;
    public max: number;

    constructor(min = 0, max = min) {
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

    public clone(): Interval {
        return new Interval(this.min, this.max);
    }

    public contains(interval: Interval): boolean {
        return interval.min > this.min && interval.max < this.max;
    }

    public includes(value: number): boolean {
        return value <= this.max && value >= this.min;
    }

    public overlaps(interval: Interval): boolean {
        return !(this.min > interval.max || interval.min > this.max);
    }

    public getOverlap(interval: Interval): number {
        return this.max < interval.max ? this.max - interval.min : interval.max - this.min;
    }

    public destroy() {
        // todo - check if destroy is needed
    }
}
