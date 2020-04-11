import Vector from './Vector';

export default class ObservableVector extends Vector {

    private readonly _callback: () => void;
    private readonly _context: object;

    public constructor(callback: () => void, context?: object, x: number = 0, y: number = 0) {
        super(x, y);

        this._callback = callback;
        this._context = context ?? this;
    }

    public get x(): number {
        return this._x;
    }

    public set x(x: number) {
        if (this._x !== x) {
            this._x = x;
            this._callback.call(this._context);
        }
    }

    public get y(): number {
        return this._y;
    }

    public set y(y: number) {
        if (this._y !== y) {
            this._y = y;
            this._callback.call(this._context);
        }
    }

    public set(x: number = this._x, y: number = this._y): this {
        if (this._x !== x || this._y !== y) {
            this._x = x;
            this._y = y;
            this._callback.call(this._context);
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
        return this.set(this._x / x, this._y / y);
    }

    public copy(vector: Vector | ObservableVector): this {
        return this.set(vector.x, vector.y);
    }

    public clone(): ObservableVector {
        return new ObservableVector(this._callback, this._context, this._x, this._y);
    }
}
