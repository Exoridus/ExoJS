import { AbstractVector } from './Vector';

export class ObservableVector extends AbstractVector {

    private _x: number;
    private _y: number;
    private readonly _callback: () => void;

    public constructor(callback: () => void, x = 0, y = 0) {
        super();

        this._x = x;
        this._y = y;
        this._callback = callback;
    }

    public get x(): number {
        return this._x;
    }

    public set x(x: number) {
        if (this._x !== x) {
            this._x = x;
            this._callback?.();
        }
    }

    public get y(): number {
        return this._y;
    }

    public set y(y: number) {
        if (this._y !== y) {
            this._y = y;
            this._callback?.();
        }
    }

    public set direction(angle: number) {
        const length = this.length;

        this.set(Math.cos(angle) * length, Math.sin(angle) * length);
    }

    public set length(magnitude: number) {
        const direction = this.direction;

        this.set(Math.cos(direction) * magnitude, Math.sin(direction) * magnitude);
    }

    public set(x: number = this._x, y: number = this._y): this {
        if (this._x !== x || this._y !== y) {
            this._x = x;
            this._y = y;
            this._callback?.();
        }

        return this;
    }

    public add(x: number, y: number = x): this {
        return this.set(this._x + x, this._y + y);
    }

    public subtract(x: number, y: number = x): this {
        return this.set(this._x - x, this._y - y);
    }

    public scale(x: number, y: number = x): this {
        return this.set(this._x * x, this._y * y);
    }

    public divide(x: number, y: number = x): this {
        if (x !== 0 && y !== 0) {
            return this.set(this._x / x, this._y / y);
        }

        return this;
    }

    public clone(): this {
        return new (this.constructor as any)(this._callback, this._x, this._y);
    }

    public copy(vector: ObservableVector): this {
        return this.set(vector.x, vector.y);
    }

    public destroy<T = ObservableVector>(): void {
        // todo - check if destroy is needed
    }
}
